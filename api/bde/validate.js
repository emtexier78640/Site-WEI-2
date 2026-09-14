// api/bde/validate.js — Vercel Serverless Function
// Le BDE valide ou invalide le dossier d'un participant
// Variables d'env : NOTION_TOKEN, NOTION_VALIDATIONS_DB_ID

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const DB_ID = process.env.NOTION_VALIDATIONS_DB_ID;

    if (!NOTION_TOKEN || !DB_ID) {
        return res.status(500).json({ error: 'Config Notion manquante (NOTION_TOKEN / NOTION_VALIDATIONS_DB_ID)' });
    }

    const { username, validated } = req.body || {};
    if (!username) return res.status(400).json({ error: 'username requis' });

    const uClean = username.toLowerCase();
    const headers = {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
    };

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
            'Titre': { title: [{ text: { content: uClean } }] },
            'Username': { rich_text: [{ text: { content: uClean } }] },
            'Validé': { checkbox: Boolean(validated) }
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

        return res.status(200).json({ success: true, username: uClean, validated: Boolean(validated) });
    } catch (e) {
        return res.status(500).json({ error: 'Erreur Notion: ' + e.message });
    }
}
