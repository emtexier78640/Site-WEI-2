// api/_lib/auth.js — JWT session in an httpOnly cookie + role gates.
// Every protected route derives the user from the token, never from the body.
import './env.js';
import jwt from 'jsonwebtoken';
import { json } from './http.js';

const COOKIE = 'weigo_session';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 32) throw new Error('JWT_SECRET manquant ou trop court (32+ caractères)');
    return s;
}

export function signSession(user) {
    return jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        secret(),
        { expiresIn: MAX_AGE, algorithm: 'HS256' }
    );
}

function cookieBase() {
    const secure = process.env.VERCEL_ENV ? '; Secure' : '';
    return `${COOKIE}=%VALUE%; HttpOnly${secure}; SameSite=Strict; Path=/`;
}

export function setSessionCookie(res, token) {
    res.setHeader('Set-Cookie', cookieBase().replace('%VALUE%', token) + `; Max-Age=${MAX_AGE}`);
}

export function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', cookieBase().replace('%VALUE%', '') + '; Max-Age=0');
}

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
    return out;
}

/** Returns {id, username, role} or null. Never throws. */
export function getSession(req) {
    try {
        const token = parseCookies(req.headers.cookie)[COOKIE];
        if (!token) return null;
        const p = jwt.verify(token, secret(), { algorithms: ['HS256'] });
        if (!p?.sub || !p?.username) return null;
        return { id: p.sub, username: p.username, role: p.role === 'admin' ? 'admin' : 'student' };
    } catch {
        return null;
    }
}

/** For state-changing requests: reject if the browser says the request is cross-site. */
export function assertSameOrigin(req, res) {
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    const sfs = req.headers['sec-fetch-site'];
    if (sfs && sfs !== 'same-origin' && sfs !== 'none') {
        json(res, 403, { error: 'Requête cross-site refusée' });
        return false;
    }
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin && host) {
        let oHost = null;
        try { oHost = new URL(origin).host; } catch {}
        if (oHost !== host) {
            json(res, 403, { error: 'Origine refusée' });
            return false;
        }
    }
    return true;
}

/** Returns the session or null after sending 401 (or 403 on cross-site). */
export function requireUser(req, res) {
    if (!assertSameOrigin(req, res)) return null;
    const s = getSession(req);
    if (!s) {
        json(res, 401, { error: 'Non authentifié' });
        return null;
    }
    return s;
}

/** Returns the admin session or null after sending 401/403. */
export function requireAdmin(req, res) {
    const s = requireUser(req, res);
    if (!s) return null;
    if (s.role !== 'admin') {
        json(res, 403, { error: 'Accès réservé au BDE' });
        return null;
    }
    return s;
}
