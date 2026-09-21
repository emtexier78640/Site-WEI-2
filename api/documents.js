// api/documents.js — documents du participant (liste / upload / suppression)
// Upload multipart via busboy, stockage Vercel Blob (jamais d'URL exposée au client).
import { randomUUID } from 'node:crypto';
import Busboy from 'busboy';
import { put, del } from '@vercel/blob';
import { json, methods, errorResponse } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { api: { bodyParser: false } };

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_DOCS_PER_USER = 10;
const MAX_NOTE = 300;
const MAX_NAME = 120;
const TYPES = {
    parentale: 'Autorisation parentale',
    decharge: 'Décharge de responsabilité',
    autre: 'Autre document',
};
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.0', '')} Ko`;
    return `${(n / (1024 * 1024)).toFixed(1).replace('.0', '')} Mo`;
}

/** Serialization shared with the profile: never exposes blob_url / pathname. */
function serializeDocument(row) {
    return {
        id: row.id,
        name: row.original_name,
        type: row.type,
        label: row.label,
        size: formatSize(row.size),
        date: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
        status: 'reçu',
        note: row.note || '',
    };
}

async function listDocuments(userId) {
    const rows = await sql`
        SELECT id, type, label, original_name, note, size, mime, created_at
        FROM documents WHERE user_id = ${userId}
        ORDER BY created_at ASC`;
    return rows.map(serializeDocument);
}

function sniffMime(buf) {
    if (!buf || buf.length < 4) return null;
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf'; // %PDF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    return null;
}

function sanitizeFilename(name, ext) {
    let base = String(name || '').split(/[\\/]/).pop() || '';
    // eslint-disable-next-line no-control-regex
    base = base.replace(/[\x00-\x1f\x7f"<>:|?*]/g, '').trim();
    if (!base || base === '.' || base === '..') base = `document.${ext}`;
    if (base.length > MAX_NAME) {
        const dot = base.lastIndexOf('.');
        const suffix = dot > 0 ? base.slice(dot).slice(0, 10) : '';
        base = base.slice(0, MAX_NAME - suffix.length) + suffix;
    }
    return base;
}

/**
 * Parses the multipart body. Resolves { file: {buffer, mime, originalName}, fields }
 * or rejects with { status, error } for client errors.
 */
function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        let bb;
        try {
            bb = Busboy({
                headers: req.headers,
                limits: { files: 1, fields: 5, fieldSize: 2048, fileSize: MAX_FILE_BYTES },
            });
        } catch {
            return reject({ status: 400, error: 'Requête multipart invalide' });
        }

        const fields = {};
        let file = null;
        let done = false;
        const fail = (err) => {
            if (done) return;
            done = true;
            try { req.unpipe(bb); req.resume(); } catch {}
            reject(err);
        };
        const finish = () => {
            if (done) return;
            done = true;
            resolve({ file, fields });
        };

        bb.on('field', (name, val) => {
            if (name === 'type' || name === 'note') fields[name] = String(val);
        });

        bb.on('file', (name, stream, info) => {
            if (name !== 'file' || file) {
                stream.resume();
                return;
            }
            const chunks = [];
            let total = 0;
            let mime;
            stream.on('data', (chunk) => {
                if (done) return;
                if (mime === undefined) {
                    mime = sniffMime(chunk);
                    if (!mime) {
                        stream.resume();
                        return fail({ status: 415, error: 'Format non supporté (PDF, JPG, PNG)' });
                    }
                }
                total += chunk.length;
                if (total > MAX_FILE_BYTES) {
                    stream.resume();
                    return fail({ status: 413, error: 'Fichier trop volumineux (max 4 Mo)' });
                }
                chunks.push(chunk);
            });
            stream.on('limit', () => fail({ status: 413, error: 'Fichier trop volumineux (max 4 Mo)' }));
            stream.on('end', () => {
                if (done) return;
                if (!mime) return; // empty file → handled after close
                file = { buffer: Buffer.concat(chunks), mime, originalName: info?.filename || '' };
            });
        });

        bb.on('filesLimit', () => fail({ status: 400, error: 'Un seul fichier par envoi' }));
        bb.on('error', () => fail({ status: 400, error: 'Requête multipart invalide' }));
        bb.on('close', finish);
        bb.on('finish', finish);
        req.on('error', () => fail({ status: 400, error: 'Connexion interrompue' }));
        req.pipe(bb);
    });
}

async function handlePost(req, res, user) {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.toLowerCase().startsWith('multipart/form-data')) {
        return json(res, 400, { error: 'Envoi attendu en multipart/form-data' });
    }
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_FILE_BYTES + 64 * 1024) {
        return json(res, 413, { error: 'Fichier trop volumineux (max 4 Mo)' });
    }

    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM documents WHERE user_id = ${user.id}`;
    if (count >= MAX_DOCS_PER_USER) {
        return json(res, 409, { error: `Limite de ${MAX_DOCS_PER_USER} documents atteinte` });
    }

    let parsed;
    try {
        parsed = await parseMultipart(req);
    } catch (e) {
        if (e && typeof e.status === 'number') return json(res, e.status, { error: e.error });
        throw e;
    }

    const { file, fields } = parsed;
    if (!file || !file.buffer?.length) return json(res, 400, { error: 'Aucun fichier reçu' });
    if (file.buffer.length > MAX_FILE_BYTES) return json(res, 413, { error: 'Fichier trop volumineux (max 4 Mo)' });

    const type = String(fields.type || '').trim();
    if (!TYPES[type]) return json(res, 400, { error: 'Type de document invalide' });
    const note = String(fields.note || '').trim();
    if (note.length > MAX_NOTE) return json(res, 400, { error: `Note trop longue (max ${MAX_NOTE} caractères)` });

    const label = TYPES[type];
    const ext = EXT[file.mime];
    const originalName = sanitizeFilename(file.originalName, ext);
    const pathname = `documents/${user.id}/${randomUUID()}.${ext}`;

    const blob = await put(pathname, file.buffer, {
        access: 'private',
        contentType: file.mime,
        addRandomSuffix: false,
    });

    try {
        await sql`
            INSERT INTO documents (user_id, type, label, original_name, note, blob_url, blob_pathname, size, mime)
            VALUES (${user.id}, ${type}, ${label}, ${originalName}, ${note}, ${blob.url}, ${blob.pathname || pathname}, ${file.buffer.length}, ${file.mime})`;
    } catch (e) {
        try { await del(blob.url); } catch {}
        throw e;
    }

    try {
        await sql`
            INSERT INTO comments (user_id, author_user_id, role, text)
            VALUES (${user.id}, ${user.id}, 'student', ${`📎 Document ajouté : ${label}`})`;
    } catch (e) {
        console.error('Comment insert after upload failed:', e);
    }

    return json(res, 201, { success: true, documents: await listDocuments(user.id) });
}

async function handleDelete(req, res, user) {
    const id = String(req.query?.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return json(res, 404, { error: 'Document introuvable' });
    }
    const rows = await sql`SELECT id, blob_url FROM documents WHERE id = ${id} AND user_id = ${user.id}`;
    if (!rows.length) return json(res, 404, { error: 'Document introuvable' });

    await sql`DELETE FROM documents WHERE id = ${id} AND user_id = ${user.id}`;
    try {
        if (rows[0].blob_url) await del(rows[0].blob_url);
    } catch (e) {
        console.error('Blob delete failed:', e);
    }
    return res.status(204).end();
}

export default async function handler(req, res) {
    if (!methods(req, res, ['GET', 'POST', 'DELETE'])) return;
    const user = requireUser(req, res);
    if (!user) return;
    try {
        if (req.method === 'GET') return json(res, 200, { success: true, documents: await listDocuments(user.id) });
        if (req.method === 'POST') return await handlePost(req, res, user);
        return await handleDelete(req, res, user);
    } catch (e) {
        return errorResponse(res, e);
    }
}
