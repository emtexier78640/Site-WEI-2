// api/bde/participants.js — GET liste complète des participants (BDE uniquement)
import { json, methods, errorResponse } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

const ORGA_AUTHOR = 'BDE MMI Wave (Orga WEI)';

function iso(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
}

function dateOnly(d) {
    if (!d) return '';
    if (typeof d === 'string') return d.slice(0, 10);
    return iso(d).slice(0, 10);
}

function humanSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
    if (n >= 1024) return `${Math.round(n / 1024)} Ko`;
    return `${n} o`;
}

function serializeComment(c, authorsById) {
    const a = authorsById.get(c.author_user_id);
    const author = c.role === 'orga' || !a
        ? ORGA_AUTHOR
        : `${a.prenom || ''} ${a.nom || ''}`.trim() || a.username || ORGA_AUTHOR;
    return { id: c.id, author, role: c.role, text: c.text, date: iso(c.created_at) };
}

function serializeDocument(d) {
    return {
        id: d.id,
        name: d.original_name,
        type: d.type,
        label: d.label,
        size: humanSize(d.size),
        date: iso(d.created_at),
        status: 'reçu',
        note: d.note || ''
    };
}

export default async function handler(req, res) {
    if (!methods(req, res, ['GET'])) return;
    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
        const users = await sql`
            SELECT id, username, prenom, nom, date_naissance, statut, mobilhome, voiture, covoiturage
            FROM users WHERE role = 'student'
            ORDER BY nom, prenom`;
        const ids = users.map(u => u.id);
        if (ids.length === 0) return json(res, 200, { success: true, participants: [] });

        const [validations, documents, mobilhomes, covoits, comments] = await Promise.all([
            sql`SELECT user_id, validated FROM validations WHERE user_id = ANY(${ids})`,
            sql`SELECT id, user_id, type, label, original_name, note, size, created_at
                FROM documents WHERE user_id = ANY(${ids}) ORDER BY created_at ASC`,
            sql`SELECT user_id, membres, note, updated_at FROM mobilhome_prefs WHERE user_id = ANY(${ids})`,
            sql`SELECT user_id, role, places_dispos, besoin, note, chauffeur_assigne, updated_at
                FROM covoit WHERE user_id = ANY(${ids})`,
            sql`SELECT id, user_id, author_user_id, role, text, created_at
                FROM comments WHERE user_id = ANY(${ids}) ORDER BY created_at ASC`
        ]);

        // Authors of comments may include admins (not in `users`): fetch the missing ones.
        const authorsById = new Map(users.map(u => [u.id, u]));
        const missing = [...new Set(comments.map(c => c.author_user_id).filter(a => a && !authorsById.has(a)))];
        if (missing.length) {
            const extra = await sql`SELECT id, username, prenom, nom FROM users WHERE id = ANY(${missing})`;
            for (const a of extra) authorsById.set(a.id, a);
        }

        const group = (rows) => {
            const m = new Map();
            for (const r of rows) {
                if (!m.has(r.user_id)) m.set(r.user_id, []);
                m.get(r.user_id).push(r);
            }
            return m;
        };
        const valByUser = new Map(validations.map(v => [v.user_id, Boolean(v.validated)]));
        const docsByUser = group(documents);
        const mhByUser = new Map(mobilhomes.map(m => [m.user_id, m]));
        const covByUser = new Map(covoits.map(c => [c.user_id, c]));
        const comByUser = group(comments);

        const participants = users.map(u => {
            const mh = mhByUser.get(u.id);
            const cv = covByUser.get(u.id);
            const thread = (comByUser.get(u.id) || []).map(c => serializeComment(c, authorsById));
            const prenom = u.prenom || '';
            const nom = u.nom || '';
            return {
                id: u.id,
                username: u.username,
                fullName: `${prenom} ${nom}`.trim(),
                prenom,
                nom,
                statut: u.statut || '',
                dateNaissance: dateOnly(u.date_naissance),
                mobilhome: u.mobilhome || '',
                voiture: u.voiture || '',
                covoiturage: u.covoiturage || '',
                isValidated: valByUser.get(u.id) === true,
                documents: (docsByUser.get(u.id) || []).map(serializeDocument),
                mobilhomePrefs: mh
                    ? { membres: mh.membres || '', note: mh.note || '', submittedAt: iso(mh.updated_at) }
                    : null,
                covoitData: cv
                    ? {
                        role: cv.role,
                        placesDispos: cv.places_dispos ?? null,
                        besoin: cv.besoin ?? null,
                        note: cv.note || '',
                        chauffeurAssigne: cv.chauffeur_assigne || null,
                        submittedAt: iso(cv.updated_at)
                    }
                    : null,
                comments: thread,
                lastComment: thread.length ? thread[thread.length - 1] : null
            };
        });

        return json(res, 200, { success: true, participants });
    } catch (e) {
        return errorResponse(res, e);
    }
}
