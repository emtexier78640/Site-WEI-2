// GET /api/me — current user's profile from the session cookie.
import { json, methods, errorResponse } from './_lib/http.js';
import { requireUser, clearSessionCookie } from './_lib/auth.js';
import { buildProfile } from './_lib/profile.js';

export default async function handler(req, res) {
    if (!methods(req, res, ['GET'])) return;
    const session = requireUser(req, res);
    if (!session) return;
    try {
        const profile = await buildProfile(session.id);
        if (!profile) {
            clearSessionCookie(res);
            return json(res, 401, { error: 'Non authentifié' });
        }
        return json(res, 200, { success: true, user: profile });
    } catch (e) {
        return errorResponse(res, e);
    }
}
