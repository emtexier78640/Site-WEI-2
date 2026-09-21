// POST /api/auth/logout — always clears the session cookie, even if it is expired or invalid.
import { methods, errorResponse } from '../_lib/http.js';
import { assertSameOrigin, clearSessionCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
    if (!methods(req, res, ['POST'])) return;
    if (!assertSameOrigin(req, res)) return;
    try {
        clearSessionCookie(res);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(204).end();
    } catch (e) {
        return errorResponse(res, e);
    }
}
