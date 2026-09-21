// api/comments.js — fil de discussion participant <-> BDE (Postgres)
// L'utilisateur vient toujours du token de session, jamais du corps de requête.
import { json, methods, readBody, errorResponse } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { validate } from './_lib/validate.js';

const ORGA_AUTHOR = 'BDE MMI Wave (Orga WEI)';
const WELCOME = {
    id: 'c-welcome-1',
    author: ORGA_AUTHOR,
    role: 'orga',
    date: 'Message officiel',
    text: 'Bonjour ! Ton espace participant est prêt. Tu peux échanger avec l’équipe organisatrice ci-dessous.'
};

function serialize(row) {
    const fullName = `${row.prenom || ''} ${row.nom || ''}`.trim();
    return {
        id: row.id,
        author: row.role === 'orga' ? ORGA_AUTHOR : (fullName || 'Participant'),
        role: row.role === 'orga' ? 'orga' : 'student',
        text: row.text,
        date: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || '')
    };
}

async function loadThread(userId) {
    const rows = await sql`
        SELECT c.id, c.role, c.text, c.created_at, u.prenom, u.nom
        FROM comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        WHERE c.user_id = ${userId}
        ORDER BY c.created_at ASC, c.id ASC`;
    if (!rows.length) return [WELCOME];
    return rows.map(serialize);
}

export default async function handler(req, res) {
    if (!methods(req, res, ['GET', 'POST'])) return;
    const me = requireUser(req, res);
    if (!me) return;

    try {
        if (req.method === 'GET') {
            let targetId = me.id;
            const wanted = typeof req.query?.user === 'string' ? req.query.user.trim() : '';
            if (me.role === 'admin' && wanted) {
                const found = await sql`SELECT id FROM users WHERE username = ${wanted} LIMIT 1`;
                if (!found.length) return json(res, 404, { error: 'Participant introuvable' });
                targetId = found[0].id;
            }
            return json(res, 200, { success: true, comments: await loadThread(targetId) });
        }

        // POST — nouveau message dans mon propre fil
        const body = readBody(req, res);
        if (!body) return;
        const v = validate(body, { text: { type: 'string', required: true, min: 1, max: 2000 } });
        if (!v.ok) return json(res, 400, { error: v.error });

        const role = me.role === 'admin' ? 'orga' : 'student';
        await sql`
            INSERT INTO comments (user_id, author_user_id, role, text)
            VALUES (${me.id}, ${me.id}, ${role}, ${v.value.text})`;
        return json(res, 200, { success: true, comments: await loadThread(me.id) });
    } catch (e) {
        return errorResponse(res, e);
    }
}
