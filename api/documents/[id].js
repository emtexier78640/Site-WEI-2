// api/documents/[id].js — proxy de téléchargement : le blob est lu côté serveur,
// l'URL de stockage n'est jamais communiquée au client.
import * as blob from '@vercel/blob';
import { json, methods, errorResponse } from '../_lib/http.js';
import { requireUser } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeFilename(name) {
    let base = String(name || '').split(/[\\/]/).pop() || 'document';
    // eslint-disable-next-line no-control-regex
    base = base.replace(/[\x00-\x1f\x7f"\;]/g, '').replace(/[^\x20-\x7e]/g, '_').trim() || 'document';
    return base.slice(0, 120);
}

/** Returns a Node-compatible readable stream (web ReadableStream or Node Readable) of the blob body. */
async function openBlob(row) {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    // @vercel/blob >= 2 exposes get() for private blobs.
    if (typeof blob.get === 'function') {
        try {
            const r = await blob.get(row.blob_url, { access: 'private', token });
            if (r && r.stream) return r.stream;
            if (r && r.body) return r.body;
        } catch (e) {
            console.error('blob.get failed, falling back to fetch:', e?.message || e);
        }
    }
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const r = await fetch(row.blob_url, { headers });
    if (!r.ok || !r.body) throw new Error(`Blob fetch failed (${r.status})`);
    return r.body;
}

export default async function handler(req, res) {
    if (!methods(req, res, ['GET'])) return;
    const session = requireUser(req, res);
    if (!session) return;

    const id = String(req.query?.id || '').trim();
    if (!UUID_RE.test(id)) return json(res, 404, { error: 'Document introuvable' });

    try {
        const rows = await sql`
            SELECT id, user_id, original_name, mime, size, blob_url
            FROM documents WHERE id = ${id}`;
        const row = rows[0];
        if (!row || (row.user_id !== session.id && session.role !== 'admin')) {
            return json(res, 404, { error: 'Document introuvable' });
        }

        const body = await openBlob(row);
        const mime = ALLOWED_MIME.has(row.mime) ? row.mime : 'application/octet-stream';

        res.statusCode = 200;
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename="${safeFilename(row.original_name)}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // 'sandbox' would disable Chrome's PDF viewer; PDFs get a strict non-sandbox policy instead.
        res.setHeader('Content-Security-Policy', mime === 'application/pdf' ? "default-src 'none'; frame-ancestors 'none'" : 'sandbox');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        if (row.size) res.setHeader('Content-Length', String(row.size));

        if (typeof body.pipe === 'function') {
            body.on('error', () => { try { res.end(); } catch {} });
            body.pipe(res);
            return;
        }
        // Web ReadableStream (fetch / blob.get)
        const reader = body.getReader();
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!res.write(value)) await new Promise((r) => res.once('drain', r));
            }
            res.end();
        } catch (e) {
            console.error('Stream error:', e);
            try { res.end(); } catch {}
        }
    } catch (e) {
        if (res.headersSent) { try { res.end(); } catch {} return; }
        return errorResponse(res, e);
    }
}
