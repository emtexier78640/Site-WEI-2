// Serverless function for Vercel (api/login.js)
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
    }

    const uClean = username.trim().toLowerCase();
    const pClean = password.trim();

    // 1. Special BDE Staff login check
    if (uClean === 'bde' && (pClean === 'bde2026' || pClean === 'bde' || pClean === 'mmiwave' || pClean === 'admin')) {
        return res.status(200).json({
            success: true,
            isBde: true,
            user: {
                id: 'bde-admin',
                username: 'bde',
                fullName: 'BDE MMI Wave (Staff Orga)',
                role: 'orga',
                ticketId: 'STAFF-ORGA-WEI',
                isBde: true
            }
        });
    }

    try {
        const payload = {
            source: {
                type: 'collection',
                id: '3d12d719-3466-8024-aab4-000b300660b8',
                spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966'
            },
            collectionView: {
                id: '3d12d719-3466-806f-b56e-000c16439ebf',
                spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966'
            },
            loader: {
                type: 'reducer',
                reducers: {
                    collection_group_results: {
                        type: 'results',
                        limit: 150
                    }
                },
                sort: [],
                searchQuery: '',
                userTimeZone: 'Europe/Paris'
            }
        };

        const response = await fetch('https://www.notion.so/api/v3/queryCollection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Erreur de communication avec la base Notion');
        }

        const data = await response.json();
        const blocks = data?.recordMap?.block || {};

        let foundUser = null;
        let matchedBlock = null;

        for (const [id, block] of Object.entries(blocks)) {
            const val = block?.value?.value || {};
            if (val.type === 'page' && val.properties) {
                const rowUsername = val.properties['title']?.[0]?.[0]?.trim();
                const rowPassword = val.properties['wrz=']?.[0]?.[0]?.trim();

                if (rowUsername && rowPassword) {
                    if (rowUsername.toLowerCase() === uClean && rowPassword === pClean) {
                        let hash = 0;
                        for (let i = 0; i < id.length; i++) {
                            hash = (hash << 5) - hash + id.charCodeAt(i);
                            hash |= 0;
                        }
                        foundUser = {
                            id,
                            username: rowUsername,
                            ticketId: 'WEIGO-' + (Math.abs(hash) % 900000 + 100000)
                        };
                        matchedBlock = val;
                        break;
                    }
                }
            }
        }

        if (foundUser) {
            // Fetch participant details linked via questionnaire relation
            const participant = await fetchParticipantData(matchedBlock, foundUser.username);
            foundUser.participant = participant;
            foundUser.comments = [
                {
                    id: 'c-welcome-1',
                    author: 'BDE MMI Wave (Orga WEI)',
                    role: 'orga',
                    date: 'Message officiel',
                    text: 'Bonjour ! Tes informations du questionnaire ont bien été synchronisées avec ton espace. Tu peux échanger avec l\'équipe organisatrice ci-dessous.'
                }
            ];

            return res.status(200).json({
                success: true,
                isBde: false,
                message: 'Connexion réussie',
                user: foundUser
            });
        } else {
            return res.status(401).json({
                success: false,
                error: 'Identifiant ou mot de passe incorrect. Assure-toi d’avoir d’abord rempli le formulaire de première inscription.'
            });
        }
    } catch (err) {
        console.error('Erreur API login:', err);
        return res.status(500).json({
            success: false,
            error: 'Impossible de joindre la base Notion pour le moment.'
        });
    }
}

async function fetchParticipantData(identBlock, username) {
    let participantPageId = null;
    let participantProps = null;

    const relProp = identBlock?.properties?.['wE`<'];
    if (relProp && Array.isArray(relProp)) {
        for (const item of relProp) {
            if (item && item[1] && Array.isArray(item[1])) {
                for (const sub of item[1]) {
                    if (sub[0] === 'p' && sub[1]) {
                        participantPageId = sub[1];
                        break;
                    }
                }
            }
        }
    }

    if (participantPageId) {
        try {
            const syncRes = await fetch('https://www.notion.so/api/v3/syncRecordValues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                body: JSON.stringify({
                    requests: [{ table: 'block', id: participantPageId, version: -1 }]
                })
            });
            const syncData = await syncRes.json();
            participantProps = syncData?.recordMap?.block?.[participantPageId]?.value?.value?.properties;
        } catch (err) {}
    }

    if (!participantProps) {
        try {
            const partRes = await fetch('https://www.notion.so/api/v3/queryCollection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                body: JSON.stringify({
                    source: {
                        type: 'collection',
                        id: '3ca2d719-3466-80b4-9e93-000b570ca7f5',
                        spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966'
                    },
                    collectionView: {
                        id: '3ca2d719-3466-806b-b0d9-000c214c5b3d',
                        spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966'
                    },
                    loader: {
                        type: 'reducer',
                        reducers: { collection_group_results: { type: 'results', limit: 100 } },
                        sort: [], searchQuery: '', userTimeZone: 'Europe/Paris'
                    }
                })
            });
            const pData = await partRes.json();
            for (const [id, blk] of Object.entries(pData?.recordMap?.block || {})) {
                const v = blk?.value?.value;
                if (v?.type === 'page' && v?.properties) {
                    const nom = v.properties['title']?.[0]?.[0]?.trim() || '';
                    const prenom = v.properties['XnSG']?.[0]?.[0]?.trim() || '';
                    const combined = (prenom + nom).toLowerCase();
                    const u = username.toLowerCase();
                    if (combined.includes(u) || u.includes(nom.toLowerCase()) || nom.toLowerCase().includes(u)) {
                        participantPageId = id;
                        participantProps = v.properties;
                        break;
                    }
                }
            }
        } catch (err) {}
    }

    if (participantProps) {
        const nom = participantProps['title']?.[0]?.[0]?.trim() || '';
        const prenom = participantProps['XnSG']?.[0]?.[0]?.trim() || '';
        const statut = participantProps['uJq<']?.[0]?.[0]?.trim() || 'Inscrit(e)';
        const mobilhome = participantProps['u]hf']?.[0]?.[0]?.trim() || 'Non spécifié';
        const voiture = participantProps['UzhH']?.[0]?.[0]?.trim() || 'Non';
        const covoiturage = participantProps['Iu>@']?.[0]?.[0]?.trim() || 'Non';
        
        let dateNaissance = '';
        const dateRaw = participantProps['NuL{'];
        if (dateRaw && dateRaw[0] && dateRaw[0][1] && dateRaw[0][1][0] && dateRaw[0][1][0][1]?.start_date) {
            dateNaissance = dateRaw[0][1][0][1].start_date;
        } else if (dateRaw && dateRaw[0] && dateRaw[0][0]) {
            dateNaissance = dateRaw[0][0];
        }

        const hasDecharge = Boolean(participantProps['Hb{P'] && participantProps['Hb{P'].length);
        const hasAttestation = Boolean(participantProps['U:Hf'] && participantProps['U:Hf'].length);

        let notionValidated = false;
        for (const [k, v] of Object.entries(participantProps)) {
            if (['title', 'XnSG', 'NuL{', 'uJq<', 'u]hf', 'UzhH', 'Iu>@', 'Hb{P', 'U:Hf'].includes(k)) continue;
            const txt = (v?.[0]?.[0] || '').toString().trim().toLowerCase();
            if (txt === 'oui' || txt === 'validé' || txt === 'valide' || txt === 'true') {
                notionValidated = true;
                break;
            }
        }

        if (!notionValidated && identBlock?.properties) {
            for (const [k, v] of Object.entries(identBlock.properties)) {
                if (['title', 'wrz=', 'wE`<'].includes(k)) continue;
                const txt = (v?.[0]?.[0] || '').toString().trim().toLowerCase();
                if (txt === 'oui' || txt === 'validé' || txt === 'valide' || txt === 'true') {
                    notionValidated = true;
                    break;
                }
            }
        }

        return {
            pageId: participantPageId,
            nom,
            prenom,
            fullName: `${prenom} ${nom}`.trim() || username,
            statut,
            dateNaissance,
            mobilhome,
            voiture,
            covoiturage,
            hasDecharge,
            hasAttestation,
            isValidated: notionValidated,
            validationStatus: notionValidated ? 'Validé' : 'En attente',
            notionValidated,
            notionUrl: `https://succinct-baseball-fca.notion.site/${participantPageId ? participantPageId.replace(/-/g, '') : ''}`
        };
    }
    return null;
}
