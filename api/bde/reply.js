// api/bde/reply.js — POST { userId, text } : réponse du BDE dans le fil d'un participant
import { json, methods, readBody, errorResponse } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORGA_AUTHOR = 'BDE MMI Wave (Orga WEI)';

function iso(d) {
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
}

export default async function handler(req, res) {
    if (!methods(req, res, ['POST'])) return;
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = readBody(req, res);
    if (!body) return;

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!UUID_RE.test(userId)) return json(res, 400, { error: 'userId invalide' });
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length < 1) return json(res, 400, { error: 'Le message est vide' });
    if (text.length > 2000) return json(res, 400, { error: 'Message trop long (2000 caractères max)' });

    try {
        const target = await sql`SELECT id FROM users WHERE id = ${userId} AND role = 'student'`;
        if (target.length === 0) return json(res, 404, { error: 'Participant introuvable' });

        await sql`
            INSERT INTO comments (user_id, author_user_id, role, text)
            VALUES (${userId}, ${admin.id}, 'orga', ${text})`;

        const rows = await sql`
            SELECT c.id, c.role, c.text, c.created_at, a.prenom, a.nom, a.username
            FROM comments c
            LEFT JOIN users a ON a.id = c.author_user_id
            WHERE c.user_id = ${userId}
            ORDER BY c.created_at ASC`;

        const comments = rows.map(c => ({
            id: c.id,
            author: c.role === 'orga'
                ? ORGA_AUTHOR
                : (`${c.prenom || ''} ${c.nom || ''}`.trim() || c.username || ORGA_AUTHOR),
            role: c.role,
            text: c.text,
            date: iso(c.created_at)
        }));

        return json(res, 200, { success: true, comments });
    } catch (e) {
        return errorResponse(res, e);
    }
}
