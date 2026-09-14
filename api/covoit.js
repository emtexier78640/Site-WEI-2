// api/covoit.js — Vercel Serverless Function
// Stocke les demandes de covoiturage dans une base Notion
// Variable d'env requise: NOTION_TOKEN, NOTION_COVOIT_DB_ID

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DB_ID = process.env.NOTION_COVOIT_DB_ID;

    if (!NOTION_TOKEN || !DB_ID) {
        return res.status(500).json({ error: 'Config Notion manquante (NOTION_TOKEN / NOTION_COVOIT_DB_ID)' });
    }

    const headers = {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
    };

    // ── GET : récupérer la demande covoit d'un utilisateur ────────────────────
    if (req.method === 'GET') {
        const user = req.query?.user || new URL(req.url, 'http://x').searchParams.get('user');
        if (!user) return res.status(400).json({ error: 'Paramètre user manquant' });

        try {
            const queryRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    filter: { property: 'Username', rich_text: { equals: user.toLowerCase() } }
                })
            });
            const data = await queryRes.json();
            const page = data.results?.[0];
            if (!page) return res.status(200).json({ success: true, covoit: null });

            const covoit = {
                role: page.properties['Rôle']?.select?.name || null,
                placesDispos: page.properties['Places dispo']?.number || null,
                besoin: page.properties['Besoin']?.number || null,
                note: page.properties['Note']?.rich_text?.[0]?.plain_text || '',
                chauffeurAssigne: page.properties['Chauffeur assigné']?.rich_text?.[0]?.plain_text || null,
                submittedAt: page.properties['Date']?.date?.start || ''
            };
            return res.status(200).json({ success: true, covoit });
        } catch (e) {
            return res.status(500).json({ error: 'Erreur Notion: ' + e.message });
        }
    }

    // ── POST : enregistrer une demande de covoiturage ─────────────────────────
    if (req.method === 'POST') {
        const { username, role, placesDispos, note, besoin } = req.body || {};
        if (!username) return res.status(400).json({ error: 'Username requis' });

        const uClean = username.toLowerCase();
        const now = new Date().toISOString().split('T')[0];

        try {
            const queryRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    filter: { property: 'Username', rich_text: { equals: uClean } }
                })
            });
            const queryData = await queryRes.json();
            const existing = queryData.results?.[0];

            const properties = {
                'Titre': { title: [{ text: { content: uClean } }] },
                'Username': { rich_text: [{ text: { content: uClean } }] },
                'Rôle': { select: { name: role || 'passager' } },
                'Places dispo': { number: placesDispos ? Number(placesDispos) : null },
                'Besoin': { number: besoin ? Number(besoin) : null },
                'Note': { rich_text: [{ text: { content: (note || '').trim() } }] },
                'Date': { date: { start: now } },
                'Chauffeur assigné': { rich_text: [{ text: { content: '' } }] }
            };

            if (existing) {
                await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
                    method: 'PATCH', headers,
                    body: JSON.stringify({ properties })
                });
            } else {
                await fetch('https://api.notion.com/v1/pages', {
                    method: 'POST', headers,
                    body: JSON.stringify({ parent: { database_id: DB_ID }, properties })
                });
            }

            const covoit = { role, placesDispos, note: (note || '').trim(), besoin, submittedAt: now, chauffeurAssigne: null };
            return res.status(200).json({ success: true, covoit });
        } catch (e) {
            return res.status(500).json({ error: 'Erreur Notion: ' + e.message });
        }
    }

    // ── PUT : BDE assigne un chauffeur à un passager ──────────────────────────
    if (req.method === 'PUT') {
        const { passengerUsername, chauffeurAssigne } = req.body || {};
        if (!passengerUsername) return res.status(400).json({ error: 'passengerUsername requis' });

        try {
            const queryRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    filter: { property: 'Username', rich_text: { equals: passengerUsername.toLowerCase() } }
                })
            });
            const queryData = await queryRes.json();
            const existing = queryData.results?.[0];
            if (!existing) return res.status(404).json({ error: 'Passager non trouvé' });

            await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
                method: 'PATCH', headers,
                body: JSON.stringify({
                    properties: {
                        'Chauffeur assigné': { rich_text: [{ text: { content: chauffeurAssigne || '' } }] }
                    }
                })
            });
            return res.status(200).json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: 'Erreur Notion: ' + e.message });
        }
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
}
