const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3005;

// In-memory / file-backed comments store
const commentsFilePath = path.join(__dirname, 'comments.json');
const validationsFilePath = path.join(__dirname, 'validations.json');
const documentsFilePath = path.join(__dirname, 'documents.json');
const mobilhomesFilePath = path.join(__dirname, 'mobilhomes.json');
const covoitFilePath = path.join(__dirname, 'covoit.json');

function getCovoitForUser(username) {
    try {
        if (fs.existsSync(covoitFilePath)) {
            const all = JSON.parse(fs.readFileSync(covoitFilePath, 'utf8') || '{}');
            return all[username.toLowerCase()] || null;
        }
    } catch (e) {}
    return null;
}

function saveCovoitForUser(username, data) {
    try {
        let all = {};
        if (fs.existsSync(covoitFilePath)) {
            all = JSON.parse(fs.readFileSync(covoitFilePath, 'utf8') || '{}');
        }
        all[username.toLowerCase()] = data;
        fs.writeFileSync(covoitFilePath, JSON.stringify(all, null, 2), 'utf8');
        return data;
    } catch (e) {
        console.error('Error saving covoit:', e);
        return data;
    }
}

function getAllCovoit() {
    try {
        if (fs.existsSync(covoitFilePath)) {
            return JSON.parse(fs.readFileSync(covoitFilePath, 'utf8') || '{}');
        }
    } catch (e) {}
    return {};
}

function getMobilhomePrefs(username) {
    try {
        if (fs.existsSync(mobilhomesFilePath)) {
            const all = JSON.parse(fs.readFileSync(mobilhomesFilePath, 'utf8') || '{}');
            return all[username.toLowerCase()] || null;
        }
    } catch (e) {}
    return null;
}

function saveMobilhomePrefs(username, prefs) {
    try {
        let all = {};
        if (fs.existsSync(mobilhomesFilePath)) {
            all = JSON.parse(fs.readFileSync(mobilhomesFilePath, 'utf8') || '{}');
        }
        all[username.toLowerCase()] = prefs;
        fs.writeFileSync(mobilhomesFilePath, JSON.stringify(all, null, 2), 'utf8');
        return prefs;
    } catch (e) {
        console.error('Error saving mobilhome prefs:', e);
        return prefs;
    }
}

function getAllMobilhomePrefs() {
    try {
        if (fs.existsSync(mobilhomesFilePath)) {
            return JSON.parse(fs.readFileSync(mobilhomesFilePath, 'utf8') || '{}');
        }
    } catch (e) {}
    return {};
}

function getCommentsForUser(username) {
    try {
        if (fs.existsSync(commentsFilePath)) {
            const allComments = JSON.parse(fs.readFileSync(commentsFilePath, 'utf8') || '{}');
            return allComments[username.toLowerCase()] || getDefaultComments(username);
        }
    } catch (e) {
        console.error('Error reading comments:', e);
    }
    return getDefaultComments(username);
}

function saveCommentForUser(username, comment) {
    try {
        let allComments = {};
        if (fs.existsSync(commentsFilePath)) {
            allComments = JSON.parse(fs.readFileSync(commentsFilePath, 'utf8') || '{}');
        }
        const userKey = username.toLowerCase();
        if (!allComments[userKey]) {
            allComments[userKey] = getDefaultComments(username);
        }
        allComments[userKey].push(comment);
        fs.writeFileSync(commentsFilePath, JSON.stringify(allComments, null, 2), 'utf8');
        return allComments[userKey];
    } catch (e) {
        console.error('Error saving comment:', e);
        return [comment];
    }
}

function getDefaultComments(username) {
    return [
        {
            id: 'c-welcome-1',
            author: 'BDE MMI Wave (Orga WEI)',
            role: 'orga',
            date: 'Message officiel',
            text: `Bonjour ! Tes informations du formulaire ont bien été synchronisées avec ton espace participant. Tu peux nous poser tes questions ou nous laisser une note ici.`
        }
    ];
}

function getValidationForUser(username) {
    try {
        if (fs.existsSync(validationsFilePath)) {
            const vals = JSON.parse(fs.readFileSync(validationsFilePath, 'utf8') || '{}');
            return vals[username.toLowerCase()] === true;
        }
    } catch (e) {
        console.error('Error reading validations:', e);
    }
    return false;
}

function setValidationForUser(username, isValid) {
    try {
        let vals = {};
        if (fs.existsSync(validationsFilePath)) {
            vals = JSON.parse(fs.readFileSync(validationsFilePath, 'utf8') || '{}');
        }
        vals[username.toLowerCase()] = Boolean(isValid);
        fs.writeFileSync(validationsFilePath, JSON.stringify(vals, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Error saving validation:', e);
        return false;
    }
}

function getDocumentsForUser(username) {
    try {
        if (fs.existsSync(documentsFilePath)) {
            const allDocs = JSON.parse(fs.readFileSync(documentsFilePath, 'utf8') || '{}');
            return allDocs[username.toLowerCase()] || [];
        }
    } catch (e) {
        console.error('Error reading documents:', e);
    }
    return [];
}

function saveDocumentForUser(username, doc) {
    try {
        let allDocs = {};
        if (fs.existsSync(documentsFilePath)) {
            allDocs = JSON.parse(fs.readFileSync(documentsFilePath, 'utf8') || '{}');
        }
        const uKey = username.toLowerCase();
        if (!allDocs[uKey]) {
            allDocs[uKey] = [];
        }
        allDocs[uKey].unshift(doc);
        fs.writeFileSync(documentsFilePath, JSON.stringify(allDocs, null, 2), 'utf8');
        return allDocs[uKey];
    } catch (e) {
        console.error('Error saving document:', e);
        return [doc];
    }
}

function deleteDocumentForUser(username, docId) {
    try {
        let allDocs = {};
        if (fs.existsSync(documentsFilePath)) {
            allDocs = JSON.parse(fs.readFileSync(documentsFilePath, 'utf8') || '{}');
        }
        const uKey = username.toLowerCase();
        if (allDocs[uKey]) {
            allDocs[uKey] = allDocs[uKey].filter(d => d.id !== docId);
            fs.writeFileSync(documentsFilePath, JSON.stringify(allDocs, null, 2), 'utf8');
            return allDocs[uKey];
        }
    } catch (e) {
        console.error('Error deleting document:', e);
    }
    return [];
}

async function fetchParticipantData(identBlock, username) {
    let participantPageId = null;
    let participantProps = null;

    // 1. Check direct relation in Identifiants (property wE`<)
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

    // If relation page ID found, sync that block
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
        } catch (err) {
            console.error('Error syncing relation block:', err);
        }
    }

    // 2. If not found via relation, fallback search in collection 'Liste des participants'
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
        } catch (err) {
            console.error('Error querying participants collection:', err);
        }
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

        // Validation logic: check if any property in participantProps or identBlock has "Oui" / "Validé"
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

        const localVal = getValidationForUser(username);
        const isValidated = localVal || notionValidated;

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
            isValidated,
            validationStatus: isValidated ? 'Validé' : 'En attente',
            notionValidated,
            notionUrl: `https://succinct-baseball-fca.notion.site/${participantPageId ? participantPageId.replace(/-/g, '') : ''}`
        };
    }

    // Even if questionnaire profile not yet matched, check local validation
    const localVal = getValidationForUser(username);
    return {
        fullName: username,
        nom: '',
        prenom: username,
        statut: 'Inscrit(e)',
        mobilhome: 'Non spécifié',
        voiture: 'Non',
        covoiturage: 'Non',
        hasDecharge: false,
        hasAttestation: false,
        isValidated: localVal,
        validationStatus: localVal ? 'Validé' : 'En attente',
        notionValidated: false
    };
}

async function checkNotionCredentials(username, password) {
    const uClean = username.trim().toLowerCase();
    const pClean = password.trim();

    // 1. Special BDE Staff login check
    if (uClean === 'bde' && (pClean === 'bde2026' || pClean === 'bde' || pClean === 'mmiwave' || pClean === 'admin')) {
        return {
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
        };
    }

    // 2. Regular Participant Notion query
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

    const res = await fetch('https://www.notion.so/api/v3/queryCollection', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        throw new Error('Erreur Notion: ' + res.statusText);
    }

    const data = await res.json();
    const blocks = data?.recordMap?.block || {};

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

                    // Fetch participant info linked via questionnaire relation
                    const participant = await fetchParticipantData(val, rowUsername);
                    const comments = getCommentsForUser(rowUsername);
                    const documents = getDocumentsForUser(rowUsername);

                    return {
                        success: true,
                        isBde: false,
                        user: {
                            id,
                            username: rowUsername,
                            ticketId: 'WEIGO-' + (Math.abs(hash) % 900000 + 100000),
                            participant,
                            comments,
                            documents
                        }
                    };
                }
            }
        }
    }
    return { success: false, error: 'Identifiant ou mot de passe incorrect' };
}

async function getAllParticipantsForBde() {
    let allComments = {};
    try {
        if (fs.existsSync(commentsFilePath)) {
            allComments = JSON.parse(fs.readFileSync(commentsFilePath, 'utf8') || '{}');
        }
    } catch (e) {}

    let validations = {};
    try {
        if (fs.existsSync(validationsFilePath)) {
            validations = JSON.parse(fs.readFileSync(validationsFilePath, 'utf8') || '{}');
        }
    } catch (e) {}

    let allDocs = {};
    try {
        if (fs.existsSync(documentsFilePath)) {
            allDocs = JSON.parse(fs.readFileSync(documentsFilePath, 'utf8') || '{}');
        }
    } catch (e) {}

    let allMobilhomes = {};
    try {
        if (fs.existsSync(mobilhomesFilePath)) {
            allMobilhomes = JSON.parse(fs.readFileSync(mobilhomesFilePath, 'utf8') || '{}');
        }
    } catch (e) {}

    let allCovoit = {};
    try {
        if (fs.existsSync(covoitFilePath)) {
            allCovoit = JSON.parse(fs.readFileSync(covoitFilePath, 'utf8') || '{}');
        }
    } catch (e) {}

    let identList = [];
    let partMap = {};

    try {
        const resIdent = await fetch('https://www.notion.so/api/v3/queryCollection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({
                source: { type: 'collection', id: '3d12d719-3466-8024-aab4-000b300660b8', spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966' },
                collectionView: { id: '3d12d719-3466-806f-b56e-000c16439ebf', spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966' },
                loader: { type: 'reducer', reducers: { collection_group_results: { type: 'results', limit: 150 } }, sort: [], searchQuery: '', userTimeZone: 'Europe/Paris' }
            })
        });
        const dataIdent = await resIdent.json();
        for (const [id, blk] of Object.entries(dataIdent?.recordMap?.block || {})) {
            const v = blk?.value?.value;
            if (v?.type === 'page' && v?.properties) {
                const u = v.properties['title']?.[0]?.[0]?.trim();
                if (u && u.toLowerCase() !== 'connexion') {
                    identList.push({ id, username: u, raw: v });
                }
            }
        }
    } catch (err) {
        console.error('Error fetching idents:', err);
    }

    try {
        const resPart = await fetch('https://www.notion.so/api/v3/queryCollection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({
                source: { type: 'collection', id: '3ca2d719-3466-80b4-9e93-000b570ca7f5', spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966' },
                collectionView: { id: '3ca2d719-3466-806b-b0d9-000c214c5b3d', spaceId: '15424385-c5b0-4eb8-a516-f3fc954fc966' },
                loader: { type: 'reducer', reducers: { collection_group_results: { type: 'results', limit: 150 } }, sort: [], searchQuery: '', userTimeZone: 'Europe/Paris' }
            })
        });
        const dataPart = await resPart.json();
        for (const [id, blk] of Object.entries(dataPart?.recordMap?.block || {})) {
            const v = blk?.value?.value;
            if (v?.type === 'page' && v?.properties) {
                const nom = v.properties['title']?.[0]?.[0]?.trim() || '';
                if (nom && nom.toLowerCase() !== 'participants') {
                    partMap[id] = v.properties;
                }
            }
        }
    } catch (err) {
        console.error('Error fetching parts:', err);
    }

    const participants = [];
    const seenUsernames = new Set();

    for (const item of identList) {
        const u = item.username;
        const uLower = u.toLowerCase();
        if (seenUsernames.has(uLower)) continue;
        seenUsernames.add(uLower);

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

        let notionValidated = false;
        if (pProps) {
            for (const [k, v] of Object.entries(pProps)) {
                if (['title', 'XnSG', 'NuL{', 'uJq<', 'u]hf', 'UzhH', 'Iu>@', 'Hb{P', 'U:Hf'].includes(k)) continue;
                const txt = (v?.[0]?.[0] || '').toString().trim().toLowerCase();
                if (txt === 'oui' || txt === 'validé' || txt === 'valide' || txt === 'true') {
                    notionValidated = true;
                    break;
                }
            }
        }

        if (!notionValidated && item.raw.properties) {
            for (const [k, v] of Object.entries(item.raw.properties)) {
                if (['title', 'wrz=', 'wE`<'].includes(k)) continue;
                const txt = (v?.[0]?.[0] || '').toString().trim().toLowerCase();
                if (txt === 'oui' || txt === 'validé' || txt === 'valide' || txt === 'true') {
                    notionValidated = true;
                    break;
                }
            }
        }

        const localVal = validations[uLower] !== undefined ? Boolean(validations[uLower]) : null;
        const isValidated = localVal !== null ? localVal : notionValidated;

        const nom = pProps ? (pProps['title']?.[0]?.[0]?.trim() || '') : '';
        const prenom = pProps ? (pProps['XnSG']?.[0]?.[0]?.trim() || '') : '';
        const fullName = (prenom + ' ' + nom).trim() || u;
        const statut = pProps ? (pProps['uJq<']?.[0]?.[0]?.trim() || 'Inscrit(e)') : 'Inscrit(e)';
        const mobilhome = pProps ? (pProps['u]hf']?.[0]?.[0]?.trim() || 'Non spécifié') : 'Non spécifié';
        const voiture = pProps ? (pProps['UzhH']?.[0]?.[0]?.trim() || 'Non') : 'Non';
        const covoiturage = pProps ? (pProps['Iu>@']?.[0]?.[0]?.trim() || 'Non') : 'Non';

        const comments = allComments[uLower] || getDefaultComments(u);
        const lastComment = comments.length ? comments[comments.length - 1] : null;
        const docs = allDocs[uLower] || [];
        const mobilhomePrefs = allMobilhomes[uLower] || null;
        const covoitData = allCovoit[uLower] || null;
        const hasDecharge = pProps ? Boolean(pProps['Hb{P'] && pProps['Hb{P'].length) : false;
        const hasAttestation = pProps ? Boolean(pProps['U:Hf'] && pProps['U:Hf'].length) : false;

        participants.push({
            username: u,
            fullName,
            nom,
            prenom,
            statut,
            mobilhome,
            voiture,
            covoiturage,
            isValidated,
            notionValidated,
            hasDecharge,
            hasAttestation,
            documents: docs,
            mobilhomePrefs,
            covoitData,
            comments,
            lastComment
        });
    }

    for (const [uKey, cList] of Object.entries(allComments)) {
        if (!seenUsernames.has(uKey) && uKey !== 'bde') {
            seenUsernames.add(uKey);
            const localVal = validations[uKey] !== undefined ? Boolean(validations[uKey]) : false;
            participants.push({
                username: uKey,
                fullName: uKey.charAt(0).toUpperCase() + uKey.slice(1),
                nom: '',
                prenom: uKey,
                statut: 'Inscrit(e)',
                mobilhome: 'Non spécifié',
                voiture: 'Non',
                covoiturage: 'Non',
                isValidated: localVal,
                notionValidated: false,
                hasDecharge: false,
                hasAttestation: false,
                documents: allDocs[uKey] || [],
                comments: cList,
                lastComment: cList.length ? cList[cList.length - 1] : null
            });
        }
    }

    return participants;
}

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    // API Login endpoint
    if (parsedUrl.pathname === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { username, password } = JSON.parse(body || '{}');
                if (!username || !password) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Identifiant et mot de passe requis' }));
                }

                const result = await checkNotionCredentials(username, password);
                if (result.success) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify(result));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify(result));
                }
            } catch (err) {
                console.error(err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Erreur serveur Notion' }));
            }
        });
        return;
    }

    // API BDE: Get all participants with their comments & validation
    if (parsedUrl.pathname === '/api/bde/participants' && req.method === 'GET') {
        try {
            const participants = await getAllParticipantsForBde();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, participants }));
        } catch (err) {
            console.error('Error in /api/bde/participants:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Erreur récupération des participants' }));
        }
    }

    // API BDE: Toggle or set validation status
    if (parsedUrl.pathname === '/api/bde/validate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { username, validated } = JSON.parse(body || '{}');
                if (!username) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Paramètre username requis' }));
                }
                const isVal = Boolean(validated);
                setValidationForUser(username, isVal);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, username, validated: isVal }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Erreur mise à jour validation' }));
            }
        });
        return;
    }

    // API Comments endpoint (GET & POST)
    if (parsedUrl.pathname === '/api/comments') {
        if (req.method === 'GET') {
            const user = parsedUrl.searchParams.get('user');
            if (!user) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Paramètre user manquant' }));
            }
            const comments = getCommentsForUser(user);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, comments }));
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { username, author, text, role } = JSON.parse(body || '{}');
                    if (!username || !text) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'Username et texte requis' }));
                    }
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                    const newComment = {
                        id: 'c-' + Date.now(),
                        author: author || (role === 'orga' ? 'BDE MMI Wave (Orga WEI)' : username),
                        role: role || 'student',
                        date: dateStr,
                        text: text.trim()
                    };
                    const updatedComments = saveCommentForUser(username, newComment);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, comments: updatedComments }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Erreur ajout commentaire' }));
                }
            });
            return;
        }
    }

    // API Documents endpoint (GET, POST, DELETE)
    if (parsedUrl.pathname === '/api/documents') {
        if (req.method === 'GET') {
            const user = parsedUrl.searchParams.get('user');
            if (!user) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Paramètre user manquant' }));
            }
            const docs = getDocumentsForUser(user);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, documents: docs }));
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { username, name, type, label, size, fileData, note } = JSON.parse(body || '{}');
                    if (!username || !name) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'Username et nom de fichier requis' }));
                    }
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                    const newDoc = {
                        id: 'doc-' + Date.now(),
                        name: name.trim(),
                        type: type || 'autre',
                        label: label || 'Document justificatif',
                        size: size || 'Inconnu',
                        date: dateStr,
                        status: 'reçu',
                        fileData: fileData || null,
                        note: (note || '').trim()
                    };
                    const updatedDocs = saveDocumentForUser(username, newDoc);

                    // Add an informative notification in the discussion thread
                    const docNotification = {
                        id: 'c-' + Date.now(),
                        author: username,
                        role: 'student',
                        date: dateStr,
                        text: `📎 Document ajouté au dossier : ${newDoc.label} (${newDoc.name})`
                    };
                    saveCommentForUser(username, docNotification);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, document: newDoc, documents: updatedDocs }));
                } catch (err) {
                    console.error('Error saving document:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Erreur enregistrement document' }));
                }
            });
            return;
        }

        if (req.method === 'DELETE') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { username, documentId } = JSON.parse(body || '{}');
                    if (!username || !documentId) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'Username et documentId requis' }));
                    }
                    const updatedDocs = deleteDocumentForUser(username, documentId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, documents: updatedDocs }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Erreur suppression document' }));
                }
            });
            return;
        }
    }

    // API Mobilhome preferences
    if (parsedUrl.pathname === '/api/mobilhome') {
        if (req.method === 'GET') {
            const user = parsedUrl.searchParams.get('user');
            if (!user) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Paramètre user manquant' }));
            }
            const prefs = getMobilhomePrefs(user);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, prefs }));
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { username, membres, note } = JSON.parse(body || '{}');
                    if (!username) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'Username requis' }));
                    }
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                    const prefs = {
                        membres: (membres || '').trim(),
                        note: (note || '').trim(),
                        submittedAt: dateStr
                    };
                    saveMobilhomePrefs(username, prefs);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, prefs }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Erreur sauvegarde' }));
                }
            });
            return;
        }

        // GET all prefs (BDE only)
        if (req.method === 'OPTIONS') {
            const all = getAllMobilhomePrefs();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, all }));
        }
    }

    // API Covoiturage
    if (parsedUrl.pathname === '/api/covoit') {
        if (req.method === 'GET') {
            const user = parsedUrl.searchParams.get('user');
            if (!user) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Param\u00e8tre user manquant' }));
            }
            const data = getCovoitForUser(user);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, covoit: data }));
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { username, role, placesDispos, note, besoin } = JSON.parse(body || '{}');
                    if (!username) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'Username requis' }));
                    }
                    const now = new Date();
                    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                    const data = {
                        role, // 'conducteur' | 'passager'
                        placesDispos: placesDispos || null,
                        note: (note || '').trim(),
                        besoin: besoin || null,
                        submittedAt: dateStr,
                        chauffeurAssigne: null // filled by BDE
                    };
                    saveCovoitForUser(username, data);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, covoit: data }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Erreur sauvegarde' }));
                }
            });
            return;
        }

        // BDE: assign a driver to a passenger
        if (req.method === 'PUT') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { passengerUsername, chauffeurAssigne } = JSON.parse(body || '{}');
                    if (!passengerUsername) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'passengerUsername requis' }));
                    }
                    let existing = getCovoitForUser(passengerUsername) || { role: 'passager' };
                    existing.chauffeurAssigne = chauffeurAssigne;
                    saveCovoitForUser(passengerUsername, existing);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, covoit: existing }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Erreur assignation' }));
                }
            });
            return;
        }
    }

    // Static file serving
    let filePath = path.join(__dirname, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                fs.readFile(path.join(__dirname, 'index.html'), (e, fallback) => {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(fallback);
                });
            } else {
                res.writeHead(500);
                res.end('Server error: ' + err.code);
            }
        } else {
            let ext = path.extname(filePath);
            let contentType = 'text/html; charset=utf-8';
            if (ext === '.js') contentType = 'text/javascript';
            if (ext === '.css') contentType = 'text/css';
            if (ext === '.json') contentType = 'application/json';
            if (ext === '.svg') contentType = 'image/svg+xml';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`WEIGO server running on http://localhost:${PORT}`);
});
