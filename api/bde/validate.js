// api/bde/validate.js — POST { userId, validated } : le BDE valide / invalide un dossier
import { json, methods, readBody, errorResponse } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
    if (!methods(req, res, ['POST'])) return;
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = readBody(req, res);
    if (!body) return;

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!UUID_RE.test(userId)) return json(res, 400, { error: 'userId invalide' });
    if (typeof body.validated !== 'boolean') return json(res, 400, { error: 'validated doit être un booléen' });
    const validated = body.validated;

    try {
        const target = await sql`SELECT id FROM users WHERE id = ${userId} AND role = 'student'`;
        if (target.length === 0) return json(res, 404, { error: 'Participant introuvable' });

        await sql`
            INSERT INTO validations (user_id, validated, validated_by, validated_at)
            VALUES (${userId}, ${validated}, ${admin.id}, now())
            ON CONFLICT (user_id) DO UPDATE
            SET validated = EXCLUDED.validated,
                validated_by = EXCLUDED.validated_by,
                validated_at = now()`;

        return json(res, 200, { success: true, userId, validated });
    } catch (e) {
        return errorResponse(res, e);
    }
}
