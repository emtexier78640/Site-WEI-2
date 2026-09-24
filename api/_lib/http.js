// api/_lib/http.js — small response/request helpers shared by every route.
// No CORS headers are ever set: the API is same-origin only.

const MAX_JSON_BODY = 64 * 1024;

export function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(status).json(body);
}

/** Returns true if the method is allowed, otherwise sends 405 and returns false. */
export function methods(req, res, allowed) {
    if (allowed.includes(req.method)) return true;
    res.setHeader('Allow', allowed.join(', '));
    json(res, 405, { error: 'Méthode non autorisée' });
    return false;
}

/** Returns the parsed JSON body as an object, or null after sending 413/400. */
export function readBody(req, res) {
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_JSON_BODY) {
        json(res, 413, { error: 'Requête trop volumineuse' });
        return null;
    }
    const body = req.body;
    if (body === undefined || body === null || body === '') return {};
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch { json(res, 400, { error: 'JSON invalide' }); return null; }
    }
    if (typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { error: 'Corps de requête invalide' });
        return null;
    }
    return body;
}

export function clientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

export function errorResponse(res, e) {
    console.error('API error:', e);
    return json(res, 500, { error: 'Erreur interne, réessaie dans un instant.' });
}
