// api/covoit.js — demande de covoiturage du participant (Postgres)
// L'utilisateur vient du token ; chauffeur_assigne n'est modifiable que par le BDE.
import { json, methods, readBody, errorResponse } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { validate } from './_lib/validate.js';

function serialize(row) {
    if (!row) return null;
    return {
        role: row.role || null,
        placesDispos: row.places_dispos ?? null,
        besoin: row.besoin ?? null,
        note: row.note || '',
        chauffeurAssigne: row.chauffeur_assigne || null,
        submittedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '')
    };
}

async function load(userId) {
    const rows = await sql`
        SELECT role, places_dispos, besoin, note, chauffeur_assigne, updated_at
        FROM covoit WHERE user_id = ${userId} LIMIT 1`;
    return serialize(rows[0]);
}

export default async function handler(req, res) {
    if (!methods(req, res, ['GET', 'POST'])) return;
    const me = requireUser(req, res);
    if (!me) return;

    try {
        if (req.method === 'GET') {
            return json(res, 200, { success: true, covoit: await load(me.id) });
        }

        const body = readBody(req, res);
        if (!body) return;
        const v = validate(body, {
            role: { type: 'enum', required: true, values: ['conducteur', 'passager'] },
            placesDispos: { type: 'int', min: 0, max: 8 },
            besoin: { type: 'int', min: 0, max: 8 },
            note: { type: 'string', max: 500 }
        });
        if (!v.ok) return json(res, 400, { error: v.error });

        const { role, placesDispos, besoin, note } = v.value;
        await sql`
            INSERT INTO covoit (user_id, role, places_dispos, besoin, note, updated_at)
            VALUES (${me.id}, ${role}, ${placesDispos ?? 0}, ${besoin ?? 0}, ${note || ''}, now())
            ON CONFLICT (user_id) DO UPDATE SET
                role = EXCLUDED.role,
                places_dispos = EXCLUDED.places_dispos,
                besoin = EXCLUDED.besoin,
                note = EXCLUDED.note,
                updated_at = now()`;
        return json(res, 200, { success: true, covoit: await load(me.id) });
    } catch (e) {
        return errorResponse(res, e);
    }
}
