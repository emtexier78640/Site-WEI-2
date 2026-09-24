// api/mobilhome.js — préférences mobilhome du participant (Postgres)
// L'utilisateur vient toujours du token de session.
import { json, methods, readBody, errorResponse } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { validate } from './_lib/validate.js';

function serialize(row) {
    if (!row) return null;
    return {
        membres: row.membres || '',
        note: row.note || '',
        submittedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '')
    };
}

async function load(userId) {
    const rows = await sql`
        SELECT membres, note, updated_at FROM mobilhome_prefs WHERE user_id = ${userId} LIMIT 1`;
    return serialize(rows[0]);
}

export default async function handler(req, res) {
    if (!methods(req, res, ['GET', 'POST'])) return;
    const me = requireUser(req, res);
    if (!me) return;

    try {
        if (req.method === 'GET') {
            return json(res, 200, { success: true, prefs: await load(me.id) });
        }

        const body = readBody(req, res);
        if (!body) return;
        const v = validate(body, {
            membres: { type: 'string', max: 500 },
            note: { type: 'string', max: 500 }
        });
        if (!v.ok) return json(res, 400, { error: v.error });

        const membres = v.value.membres || '';
        const note = v.value.note || '';
        await sql`
            INSERT INTO mobilhome_prefs (user_id, membres, note, updated_at)
            VALUES (${me.id}, ${membres}, ${note}, now())
            ON CONFLICT (user_id) DO UPDATE SET
                membres = EXCLUDED.membres,
                note = EXCLUDED.note,
                updated_at = now()`;
        return json(res, 200, { success: true, prefs: await load(me.id) });
    } catch (e) {
        return errorResponse(res, e);
    }
}
