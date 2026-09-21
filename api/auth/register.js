// POST /api/auth/register — self-registration gated by an invite code.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { json, methods, readBody, clientIp, errorResponse } from '../_lib/http.js';
import { signSession, setSessionCookie, assertSameOrigin } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { validate } from '../_lib/validate.js';
import { checkLoginRate, recordAttempt } from '../_lib/ratelimit.js';
import { buildProfile } from '../_lib/profile.js';

const BCRYPT_COST = 12;
const RATE_KEY = 'register';

const SCHEMA = {
    username: { type: 'string', required: true, min: 3, max: 32 },
    password: { type: 'string', required: true, min: 8, max: 128 },
    inviteCode: { type: 'string', required: true, min: 1, max: 200 },
    prenom: { type: 'string', required: true, min: 1, max: 60 },
    nom: { type: 'string', required: true, min: 1, max: 60 },
    dateNaissance: { type: 'date', required: true },
    statut: { type: 'enum', required: true, values: ['Majeur', 'Mineur'] },
    mobilhome: { type: 'string', max: 200 },
    voiture: { type: 'enum', values: ['Oui', 'Non'] },
    covoiturage: { type: 'string', max: 100 },
};

function inviteCodeMatches(candidate) {
    const expected = process.env.WEI_INVITE_CODE;
    if (!expected || typeof candidate !== 'string') return false;
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

function randomTicketId() {
    return 'WEIGO-' + String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export default async function handler(req, res) {
    if (!methods(req, res, ['POST'])) return;
    if (!assertSameOrigin(req, res)) return;
    const body = readBody(req, res);
    if (!body) return;

    try {
        const ip = clientIp(req);
        const rate = await checkLoginRate(ip, RATE_KEY);
        if (!rate.allowed) {
            res.setHeader('Retry-After', String(rate.retryAfter));
            return json(res, 429, { error: 'Trop de tentatives, réessaie plus tard.', retryAfter: rate.retryAfter });
        }

        if (typeof body.username === 'string') body.username = body.username.trim().toLowerCase();
        const v = validate(body, SCHEMA);
        if (!v.ok) return json(res, 400, { error: v.error });
        const d = v.value;

        if (!/^[a-z0-9._-]{3,32}$/.test(d.username)) {
            return json(res, 400, { error: 'Identifiant invalide : 3 à 32 caractères (lettres minuscules, chiffres, . _ -)' });
        }

        if (!inviteCodeMatches(d.inviteCode)) {
            await recordAttempt(ip, RATE_KEY);
            return json(res, 403, { error: 'Code d’invitation invalide' });
        }

        const passwordHash = await bcrypt.hash(d.password, BCRYPT_COST);
        const mobilhome = d.mobilhome || 'Non spécifié';
        const voiture = d.voiture || 'Non';
        const covoiturage = d.covoiturage || 'Non';

        let user = null;
        for (let attempt = 0; attempt < 5 && !user; attempt++) {
            const ticketId = randomTicketId();
            try {
                const rows = await sql`
                    INSERT INTO users (username, password_hash, role, prenom, nom, date_naissance, statut, mobilhome, voiture, covoiturage, ticket_id)
                    VALUES (${d.username}, ${passwordHash}, 'student', ${d.prenom}, ${d.nom}, ${d.dateNaissance}, ${d.statut}, ${mobilhome}, ${voiture}, ${covoiturage}, ${ticketId})
                    RETURNING id, username, role`;
                user = rows[0];
            } catch (e) {
                if (e?.code !== '23505') throw e;
                const detail = `${e.constraint || ''} ${e.detail || ''}`;
                if (/username/i.test(detail)) {
                    return json(res, 409, { error: 'Identifiant déjà utilisé' });
                }
                // ticket_id collision: retry with a new one
            }
        }
        if (!user) throw new Error('Impossible de générer un ticket unique');

        setSessionCookie(res, signSession(user));
        return json(res, 201, { success: true, user: await buildProfile(user.id) });
    } catch (e) {
        return errorResponse(res, e);
    }
}
