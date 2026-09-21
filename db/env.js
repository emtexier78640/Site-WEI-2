// db/env.js — charge .env.local puis .env (sans dépendance dotenv).
// Les variables déjà présentes dans process.env ne sont jamais écrasées.
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

export function loadEnv(cwd = process.cwd()) {
    for (const name of ['.env.local', '.env']) {
        let text;
        try { text = readFileSync(resolve(cwd, name), 'utf8'); } catch { continue; }
        for (const [k, v] of Object.entries(parseEnv(text))) {
            if (process.env[k] === undefined) process.env[k] = v;
        }
    }
}
