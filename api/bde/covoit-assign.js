// api/bde/covoit-assign.js — POST { userId, chauffeurAssigne } : le BDE attribue un chauffeur
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

    let chauffeur = body.chauffeurAssigne;
    if (chauffeur === undefined || chauffeur === null || chauffeur === '') {
        chauffeur = '';
    } else if (typeof chauffeur !== 'string') {
        return json(res, 400, { error: 'chauffeurAssigne invalide' });
    } else {
        chauffeur = chauffeur.trim();
        if (chauffeur.length === 0) chauffeur = '';
        else if (chauffeur.length > 100) return json(res, 400, { error: 'Nom du chauffeur trop long (100 caractères max)' });
    }

    try {
        const target = await sql`SELECT id FROM users WHERE id = ${userId} AND role = 'student'`;
        if (target.length === 0) return json(res, 404, { error: 'Participant introuvable' });
        // Upsert: a passenger without a car may not have created a covoit row yet.
        await sql`
            INSERT INTO covoit (user_id, role, chauffeur_assigne, updated_at)
            VALUES (${userId}, 'passager', ${chauffeur}, now())
            ON CONFLICT (user_id) DO UPDATE SET
                chauffeur_assigne = EXCLUDED.chauffeur_assigne,
                updated_at = now()`;
        return json(res, 200, { success: true, userId, chauffeurAssigne: chauffeur || null });
    } catch (e) {
        return errorResponse(res, e);
    }
}
