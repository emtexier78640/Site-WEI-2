// GET  /api/me — current user's profile from the session cookie.
// POST /api/me — logout: always clears the session cookie, even if it is expired or invalid.
//               /api/auth/logout is rewritten here (vercel.json) to stay under the
//               12-function limit of the Vercel Hobby plan.
import { json, methods, errorResponse } from './_lib/http.js';
import { requireUser, clearSessionCookie, assertSameOrigin } from './_lib/auth.js';
import { buildProfile } from './_lib/profile.js';

export default async function handler(req, res) {
    if (!methods(req, res, ['GET', 'POST'])) return;
    if (req.method === 'POST') {
        if (!assertSameOrigin(req, res)) return;
        try {
            clearSessionCookie(res);
            res.setHeader('Cache-Control', 'no-store');
            return res.status(204).end();
        } catch (e) {
            return errorResponse(res, e);
        }
    }
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
