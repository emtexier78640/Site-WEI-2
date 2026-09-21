// api/_lib/ratelimit.js — limitation des tentatives de connexion, stockée en base.
// Fenêtre glissante de 15 min : 10 essais max par (ip, username), 30 max par ip.
import { sql } from './db.js';

const WINDOW_SEC = 15 * 60;
const MAX_PER_IP_USER = 10;
const MAX_PER_IP = 30;
const CLEANUP_PROBABILITY = 0.01;

function norm(username) {
    return String(username || '').trim().toLowerCase().slice(0, 64);
}

function normIp(ip) {
    return String(ip || 'unknown').slice(0, 64);
}

async function maybeCleanup() {
    if (Math.random() >= CLEANUP_PROBABILITY) return;
    try {
        await sql`DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'`;
    } catch (e) {
        console.warn('Nettoyage login_attempts échoué :', e);
    }
}

/** → { allowed: boolean, retryAfter: seconds } */
export async function checkLoginRate(ip, username) {
    const i = normIp(ip);
    const u = norm(username);
    const rows = await sql`
        SELECT
            count(*) FILTER (WHERE username = ${u})::int AS by_user,
            count(*)::int AS by_ip,
            min(attempted_at) FILTER (WHERE username = ${u}) AS oldest_user,
            min(attempted_at) AS oldest_ip
        FROM login_attempts
        WHERE ip = ${i} AND attempted_at > now() - make_interval(secs => ${WINDOW_SEC})
    `;
    const r = rows[0] || {};
    const byUser = Number(r.by_user || 0);
    const byIp = Number(r.by_ip || 0);

    let oldest = null;
    if (byUser >= MAX_PER_IP_USER) oldest = r.oldest_user;
    else if (byIp >= MAX_PER_IP) oldest = r.oldest_ip;
    if (!oldest) return { allowed: true, retryAfter: 0 };

    const expiresAt = new Date(oldest).getTime() + WINDOW_SEC * 1000;
    const retryAfter = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
    return { allowed: false, retryAfter };
}

export async function recordAttempt(ip, username) {
    await sql`INSERT INTO login_attempts (ip, username) VALUES (${normIp(ip)}, ${norm(username)})`;
    await maybeCleanup();
}

export async function clearAttempts(ip, username) {
    await sql`DELETE FROM login_attempts WHERE ip = ${normIp(ip)} AND username = ${norm(username)}`;
}
