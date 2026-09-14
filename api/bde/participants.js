// api/bde/participants.js — Vercel Serverless Function
// Renvoie tous les participants pour l'espace BDE
// Lit depuis Notion (identifiants + questionnaire) + base Comments + base Validations
// Variables d'env : NOTION_TOKEN, NOTION_COMMENTS_DB_ID, NOTION_VALIDATIONS_DB_ID

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const COMMENTS_DB = process.env.NOTION_COMMENTS_DB_ID;
    const VALIDATIONS_DB = process.env.NOTION_VALIDATIONS_DB_ID;

    // ── 1. Fetch identifiants depuis Notion (API non-officielle) ─────────────
    let identList = [];
    try {
        const r = await fetch('https://www.notion.so/api/v3/queryCollection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({
                source: { type: 'collection', id: '3d12d719-3466-8024-aab4-000b300660b8', spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966' },
                collectionView: { id: '3d12d719-3466-806f-b56e-000c16439ebf', spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966' },
                loader: { type: 'reducer', reducers: { collection_group_results: { type: 'results', limit: 150 } }, sort: [], searchQuery: '', userTimeZone: 'Europe/Paris' }
            })
        });
        const data = await r.json();
        for (const [id, blk] of Object.entries(data?.recordMap?.block || {})) {
            const v = blk?.value?.value;
            if (v?.type === 'page' && v?.properties) {
                const u = v.properties['title']?.[0]?.[0]?.trim();
                if (u && u.toLowerCase() !== 'connexion') {
                    identList.push({ id, username: u, raw: v });
                }
            }
        }
    } catch (e) { console.error('identList error:', e); }

    // ── 2. Fetch questionnaire participants (API non-officielle) ─────────────
    let partMap = {};
    try {
        const r = await fetch('https://www.notion.so/api/v3/queryCollection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({
                source: { type: 'collection', id: '3ca2d719-3466-80b4-9e93-000b570ca7f5', spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966' },
                collectionView: { id: '3ca2d719-3466-806b-b0d9-000c214c5b3d', spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966' },
                loader: { type: 'reducer', reducers: { collection_group_results: { type: 'results', limit: 150 } }, sort: [], searchQuery: '', userTimeZone: 'Europe/Paris' }
            })
        });
        const data = await r.json();
        for (const [id, blk] of Object.entries(data?.recordMap?.block || {})) {
            const v = blk?.value?.value;
            if (v?.type === 'page' && v?.properties) {
                const nom = v.properties['title']?.[0]?.[0]?.trim() || '';
                if (nom && nom.toLowerCase() !== 'participants') partMap[id] = v.properties;
            }
        }
    } catch (e) { console.error('partMap error:', e); }

    // ── 3. Fetch comments depuis Notion (API officielle) ─────────────────────
    let allComments = {}; // { username: [{ author, role, text, date }] }
    if (NOTION_TOKEN && COMMENTS_DB) {
        try {
            const r = await fetch(`https://api.notion.com/v1/databases/${COMMENTS_DB}/query`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
                body: JSON.stringify({ sorts: [{ property: 'Date', direction: 'ascending' }] })
            });
            const data = await r.json();
            for (const page of (data.results || [])) {
                const uRaw = page.properties['Username']?.rich_text?.[0]?.plain_text || '';
                const u = uRaw.toLowerCase();
                if (!u) continue;
                if (!allComments[u]) allComments[u] = [];
                allComments[u].push({
                    id: page.id,
                    author: page.properties['Author']?.rich_text?.[0]?.plain_text || '',
                    role: page.properties['Role']?.select?.name || 'student',
                    text: page.properties['Text']?.rich_text?.[0]?.plain_text || '',
                    date: page.properties['Date']?.date?.start || ''
                });
            }
        } catch (e) { console.error('comments error:', e); }
    }

    // ── 4. Fetch validations depuis Notion (API officielle) ──────────────────
    let validations = {}; // { username: true/false }
    if (NOTION_TOKEN && VALIDATIONS_DB) {
        try {
            const r = await fetch(`https://api.notion.com/v1/databases/${VALIDATIONS_DB}/query`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
                body: JSON.stringify({})
            });
            const data = await r.json();
            for (const page of (data.results || [])) {
                const u = (page.properties['Username']?.rich_text?.[0]?.plain_text || '').toLowerCase();
                if (u) validations[u] = page.properties['Validé']?.checkbox === true;
            }
        } catch (e) { console.error('validations error:', e); }
    }

    // ── 5. Jointure identifiants + questionnaire ─────────────────────────────
    const participants = [];
    const seenUsernames = new Set();

    for (const item of identList) {
        const u = item.username;
        const uLower = u.toLowerCase();
        if (seenUsernames.has(uLower)) continue;
        seenUsernames.add(uLower);

        // Trouver les props questionnaire (relation Notion d'abord, puis matching nom)
        let pProps = null;
        const rel = item.raw.properties?.['wE`<'];
        if (rel && Array.isArray(rel)) {
            for (const sub of rel) {
                if (sub?.[1]?.[0]?.[1] && partMap[sub[1][0][1]]) {
                    pProps = partMap[sub[1][0][1]];
                    break;
                }
            }
        }
        if (!pProps) {
            for (const props of Object.values(partMap)) {
                const nom = props['title']?.[0]?.[0]?.trim() || '';
                const prenom = props['XnSG']?.[0]?.[0]?.trim() || '';
                const comb = (prenom + nom).toLowerCase();
                if (comb.includes(uLower) || uLower.includes(nom.toLowerCase())) {
                    pProps = props;
                    break;
                }
            }
        }

        // Validation Notion (champ questionnaire)
        let notionValidated = false;
        if (pProps) {
            for (const [k, v] of Object.entries(pProps)) {
                if (['title', 'XnSG', 'NuL{', 'uJq<', 'u]hf', 'UzhH', 'Iu>@', 'Hb{P', 'U:Hf'].includes(k)) continue;
                const txt = (v?.[0]?.[0] || '').toString().trim().toLowerCase();
                if (txt === 'oui' || txt === 'validé' || txt === 'valide' || txt === 'true') { notionValidated = true; break; }
            }
        }
        if (!notionValidated && item.raw.properties) {
            for (const [k, v] of Object.entries(item.raw.properties)) {
                if (['title', 'wrz=', 'wE`<'].includes(k)) continue;
                const txt = (v?.[0]?.[0] || '').toString().trim().toLowerCase();
                if (txt === 'oui' || txt === 'validé' || txt === 'valide' || txt === 'true') { notionValidated = true; break; }
            }
        }

        const localVal = validations[uLower] !== undefined ? validations[uLower] : null;
        const isValidated = localVal !== null ? localVal : notionValidated;

        const nom = pProps?.['title']?.[0]?.[0]?.trim() || '';
        const prenom = pProps?.['XnSG']?.[0]?.[0]?.trim() || '';
        const statut = pProps?.['uJq<']?.[0]?.[0]?.trim() || 'Inscrit(e)';
        const mobilhome = pProps?.['u]hf']?.[0]?.[0]?.trim() || 'Non spécifié';
        const voiture = pProps?.['UzhH']?.[0]?.[0]?.trim() || 'Non';
        const covoiturage = pProps?.['Iu>@']?.[0]?.[0]?.trim() || 'Non';
        const hasDecharge = Boolean(pProps?.['Hb{P']?.length);
        const hasAttestation = Boolean(pProps?.['U:Hf']?.length);

        let dateNaissance = '';
        const dateRaw = pProps?.['NuL{'];
        if (dateRaw?.[0]?.[1]?.[0]?.[1]?.start_date) dateNaissance = dateRaw[0][1][0][1].start_date;
        else if (dateRaw?.[0]?.[0]) dateNaissance = dateRaw[0][0];

        const comments = allComments[uLower] || [{
            id: 'welcome-1',
            author: 'BDE MMI Wave (Orga WEI)',
            role: 'orga',
            date: 'Message officiel',
            text: "Bonjour ! Tes informations du questionnaire ont bien été synchronisées avec ton espace. Tu peux échanger avec l'équipe organisatrice ci-dessous."
        }];
        const lastComment = comments.length ? comments[comments.length - 1] : null;

        participants.push({
            username: u,
            fullName: (prenom + ' ' + nom).trim() || u,
            nom, prenom, statut, dateNaissance,
            mobilhome, voiture, covoiturage,
            isValidated, notionValidated,
            hasDecharge, hasAttestation,
            documents: [],
            mobilhomePrefs: null,
            covoitData: null,
            comments,
            lastComment
        });
    }

    return res.status(200).json({ success: true, participants });
}
