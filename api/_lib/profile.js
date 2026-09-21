// api/_lib/profile.js — construit l'objet profil rendu par le frontend.
import { sql } from './db.js';

export const ORGA_AUTHOR = 'BDE MMI Wave (Orga WEI)';

export const WELCOME_COMMENT = Object.freeze({
    id: 'c-welcome-1',
    author: ORGA_AUTHOR,
    role: 'orga',
    date: 'Message officiel',
    text: 'Bonjour ! Ton espace participant est prêt. Tu peux échanger avec l’équipe organisatrice ci-dessous.',
});

function toIso(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
}

/** date_naissance → 'YYYY-MM-DD' ou ''. Accepte Date ou chaîne. */
export function formatDateNaissance(d) {
    if (!d) return '';
    if (typeof d === 'string') {
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
        return m ? m[1] : '';
    }
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
        // Une colonne `date` est renvoyée à minuit UTC par le driver.
        return d.toISOString().slice(0, 10);
    }
    return '';
}

/** Octets → '340 Ko' / '1.2 Mo'. */
export function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} Mo`;
    if (n >= 1024) return `${Math.round(n / 1024)} Ko`;
    return `${n} o`;
}

/** Ligne comments (+ author_prenom / author_nom optionnels) → objet exposé au client. */
export function serializeComment(row) {
    const isOrga = row.role === 'orga';
    const name = [row.author_prenom, row.author_nom].filter(Boolean).join(' ').trim();
    return {
        id: row.id,
        author: isOrga ? ORGA_AUTHOR : (name || 'Participant'),
        role: isOrga ? 'orga' : 'student',
        text: row.text,
        date: toIso(row.created_at),
    };
}

/** Ligne documents → objet exposé au client (jamais blob_url / blob_pathname). */
export function serializeDocument(row) {
    return {
        id: row.id,
        name: row.original_name,
        type: row.type,
        label: row.label || '',
        size: formatSize(row.size),
        date: toIso(row.created_at),
        status: 'reçu',
        note: row.note || '',
    };
}

/** Profil complet d'un utilisateur, ou null s'il n'existe pas. */
export async function buildProfile(userId) {
    const users = await sql`
        SELECT id, username, role, prenom, nom, date_naissance, statut, mobilhome, voiture, covoiturage, ticket_id
        FROM users WHERE id = ${userId}
    `;
    const u = users[0];
    if (!u) return null;

    const [validations, commentRows, documentRows] = await Promise.all([
        sql`SELECT validated FROM validations WHERE user_id = ${userId}`,
        sql`
            SELECT c.id, c.role, c.text, c.created_at, a.prenom AS author_prenom, a.nom AS author_nom
            FROM comments c
            LEFT JOIN users a ON a.id = c.author_user_id
            WHERE c.user_id = ${userId}
            ORDER BY c.created_at ASC
        `,
        sql`
            SELECT id, type, label, original_name, note, size, created_at
            FROM documents WHERE user_id = ${userId}
            ORDER BY created_at DESC
        `,
    ]);

    const isValidated = Boolean(validations[0]?.validated);
    const comments = commentRows.length ? commentRows.map(serializeComment) : [{ ...WELCOME_COMMENT }];
    const documents = documentRows.map(serializeDocument);
    const prenom = u.prenom || '';
    const nom = u.nom || '';

    return {
        id: u.id,
        username: u.username,
        role: u.role === 'admin' ? 'admin' : 'student',
        prenom,
        nom,
        promo: 'Participant WEI',
        ticketId: u.ticket_id,
        participant: {
            fullName: `${prenom} ${nom}`.trim(),
            prenom,
            nom,
            statut: u.statut || '',
            dateNaissance: formatDateNaissance(u.date_naissance),
            mobilhome: u.mobilhome || '',
            voiture: u.voiture || '',
            covoiturage: u.covoiturage || '',
            isValidated,
            validationStatus: isValidated ? 'Validé' : 'En attente',
            hasDecharge: documentRows.some((d) => d.type === 'decharge'),
            hasAttestation: documentRows.some((d) => d.type === 'parentale'),
        },
        comments,
        documents,
    };
}
