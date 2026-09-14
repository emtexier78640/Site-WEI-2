// api/mobilhome.js — Vercel Serverless Function
// Stocke les préférences de mobilhome dans une base Notion
// Variable d'env requise: NOTION_TOKEN, NOTION_MOBILHOME_DB_ID

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DB_ID = process.env.NOTION_MOBILHOME_DB_ID;

    if (!NOTION_TOKEN || !DB_ID) {
        return res.status(500).json({ error: 'Config Notion manquante (NOTION_TOKEN / NOTION_MOBILHOME_DB_ID)' });
    }

    const headers = {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
    };

    // ── GET : récupérer les préférences d'un utilisateur ──────────────────────
    if (req.method === 'GET') {
        const user = req.query?.user || new URL(req.url, 'http://x').searchParams.get('user');
        if (!user) return res.status(400).json({ error: 'Paramètre user manquant' });

        try {
            const queryRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    filter: {
                        property: 'Username',
                        rich_text: { equals: user.toLowerCase() }
                    }
                })
            });
            const data = await queryRes.json();
            const page = data.results?.[0];
            if (!page) return res.status(200).json({ success: true, prefs: null });

            const prefs = {
                membres: page.properties['Membres']?.rich_text?.[0]?.plain_text || '',
                note: page.properties['Note']?.rich_text?.[0]?.plain_text || '',
                submittedAt: page.properties['Date']?.date?.start || ''
            };
            return res.status(200).json({ success: true, prefs });
        } catch (e) {
            return res.status(500).json({ error: 'Erreur Notion: ' + e.message });
        }
    }

    // ── POST : enregistrer / mettre à jour les préférences ────────────────────
    if (req.method === 'POST') {
        const { username, membres, note } = req.body || {};
        if (!username) return res.status(400).json({ error: 'Username requis' });

        const uClean = username.toLowerCase();
        const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        try {
            // Vérifier si une entrée existe déjà pour cet utilisateur
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
                'Username': { rich_text: [{ text: { content: uClean } }] },
                'Membres': { rich_text: [{ text: { content: (membres || '').trim() } }] },
                'Note': { rich_text: [{ text: { content: (note || '').trim() } }] },
                'Date': { date: { start: now } },
                'Titre': { title: [{ text: { content: uClean } }] }
            };

            if (existing) {
                // Mettre à jour
                await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({ properties })
                });
            } else {
                // Créer
                await fetch('https://api.notion.com/v1/pages', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ parent: { database_id: DB_ID }, properties })
                });
            }

            const prefs = { membres: (membres || '').trim(), note: (note || '').trim(), submittedAt: now };
            return res.status(200).json({ success: true, prefs });
        } catch (e) {
            return res.status(500).json({ error: 'Erreur Notion: ' + e.message });
        }
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
}
