// POST /api/auth/login — username/password → session cookie.
import bcrypt from 'bcryptjs';
import { json, methods, readBody, clientIp, errorResponse } from '../_lib/http.js';
import { signSession, setSessionCookie, assertSameOrigin } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { checkLoginRate, recordAttempt, clearAttempts } from '../_lib/ratelimit.js';
import { buildProfile } from '../_lib/profile.js';

// Cost-12 bcrypt hash of a random string: compared against when the user does
// not exist so that unknown and known usernames take the same time.
const DUMMY_HASH = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
const GENERIC_ERROR = 'Identifiant ou mot de passe incorrect.';

export default async function handler(req, res) {
    if (!methods(req, res, ['POST'])) return;
    if (!assertSameOrigin(req, res)) return;
    const body = readBody(req, res);
    if (!body) return;

    try {
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!username || !password || username.length > 32 || password.length > 128) {
            return json(res, 401, { error: GENERIC_ERROR });
        }

        const ip = clientIp(req);
        const rate = await checkLoginRate(ip, username);
        if (!rate.allowed) {
            res.setHeader('Retry-After', String(rate.retryAfter));
            return json(res, 429, { error: 'Trop de tentatives, réessaie plus tard.', retryAfter: rate.retryAfter });
        }

        const rows = await sql`SELECT id, username, role, password_hash FROM users WHERE username = ${username} LIMIT 1`;
        const user = rows[0] || null;
        const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

        if (!user || !ok) {
            await recordAttempt(ip, username);
            return json(res, 401, { error: GENERIC_ERROR });
        }

        await clearAttempts(ip, username);
        setSessionCookie(res, signSession(user));
        return json(res, 200, { success: true, user: await buildProfile(user.id) });
    } catch (e) {
        return errorResponse(res, e);
    }
}
