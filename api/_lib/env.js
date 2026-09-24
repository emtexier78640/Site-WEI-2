// api/_lib/env.js — en local (vercel dev), charge .env.local puis .env dans process.env.
// Sur Vercel (process.env.VERCEL défini) les variables sont déjà injectées : no-op.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnv(text) {
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let value = m[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        } else {
            const hash = value.indexOf(' #');
            if (hash !== -1) value = value.slice(0, hash);
            value = value.trim();
        }
        out[m[1]] = value;
    }
    return out;
}

if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    for (const name of ['.env.local', '.env']) {
        let text;
        try { text = readFileSync(resolve(process.cwd(), name), 'utf8'); } catch { continue; }
        for (const [k, v] of Object.entries(parseEnv(text))) {
            if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
        }
    }
}
