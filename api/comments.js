// api/comments.js — Vercel Serverless Function
// Gère les messages entre participants et BDE
// Variables d'env : NOTION_TOKEN, NOTION_COMMENTS_DB_ID

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DB_ID = process.env.NOTION_COMMENTS_DB_ID;

    if (!NOTION_TOKEN || !DB_ID) {
        return res.status(500).json({ error: 'Config Notion manquante (NOTION_TOKEN / NOTION_COMMENTS_DB_ID)' });
    }

    const headers = {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
    };

    // ── GET : récupérer les messages d'un utilisateur ─────────────────────────
    if (req.method === 'GET') {
        const user = req.query?.user || new URL(req.url, 'http://x').searchParams.get('user');
        if (!user) return res.status(400).json({ error: 'Paramètre user manquant' });

        try {
            const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    filter: { property: 'Username', rich_text: { equals: user.toLowerCase() } },
                    sorts: [{ property: 'Date', direction: 'ascending' }]
                })
            });
            const data = await r.json();
            const comments = (data.results || []).map(page => ({
                id: page.id,
                author: page.properties['Author']?.rich_text?.[0]?.plain_text || '',
                role: page.properties['Role']?.select?.name || 'student',
                text: page.properties['Text']?.rich_text?.[0]?.plain_text || '',
                date: page.properties['Date']?.date?.start || ''
            }));
            return res.status(200).json({ success: true, comments });
        } catch (e) {
            return res.status(500).json({ error: 'Erreur Notion: ' + e.message });
        }
    }

    // ── POST : enregistrer un nouveau message ─────────────────────────────────
    if (req.method === 'POST') {
        const { username, author, role, text } = req.body || {};
        if (!username || !text) return res.status(400).json({ error: 'username et text requis' });

        const now = new Date().toISOString();
        const uClean = username.toLowerCase();
        const dateLabel = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

        try {
            // Créer la page dans la DB Comments
            await fetch('https://api.notion.com/v1/pages', {
                method: 'POST', headers,
                body: JSON.stringify({
                    parent: { database_id: DB_ID },
                    properties: {
                        'Titre': { title: [{ text: { content: `${uClean} — ${dateLabel}` } }] },
                        'Username': { rich_text: [{ text: { content: uClean } }] },
                        'Author': { rich_text: [{ text: { content: (author || username).trim() } }] },
                        'Role': { select: { name: role === 'orga' ? 'orga' : 'student' } },
                        'Text': { rich_text: [{ text: { content: text.trim() } }] },
                        'Date': { date: { start: now } }
                    }
                })
            });

            // Refetch tous les messages pour cet utilisateur et les renvoyer
            const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    filter: { property: 'Username', rich_text: { equals: uClean } },
                    sorts: [{ property: 'Date', direction: 'ascending' }]
                })
            });
            const data = await r.json();
            const comments = (data.results || []).map(page => ({
                id: page.id,
                author: page.properties['Author']?.rich_text?.[0]?.plain_text || '',
                role: page.properties['Role']?.select?.name || 'student',
                text: page.properties['Text']?.rich_text?.[0]?.plain_text || '',
                date: page.properties['Date']?.date?.start || ''
            }));

            return res.status(200).json({ success: true, comments });
        } catch (e) {
            return res.status(500).json({ error: 'Erreur Notion: ' + e.message });
        }
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
}
