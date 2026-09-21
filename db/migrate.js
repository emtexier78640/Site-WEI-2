// db/migrate.js — exécute db/schema.sql sur la base Neon (DATABASE_URL).
// Usage : npm run db:migrate
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { loadEnv } from './env.js';

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL manquant (définis-le dans .env.local ou .env).');
    process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(resolve(here, 'schema.sql'), 'utf8');

// Le driver HTTP de Neon n'accepte qu'une instruction par requête :
// on retire les commentaires puis on découpe sur les ';' en fin de ligne.
const statements = schema
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

const sql = neon(url);
const run = (text) => (typeof sql.query === 'function' ? sql.query(text) : sql(text));

console.log(`Migration : ${statements.length} instruction(s) à exécuter.`);
let i = 0;
for (const text of statements) {
    i += 1;
    const label = text.replace(/\s+/g, ' ').slice(0, 70);
    try {
        await run(text);
        console.log(`  [${i}/${statements.length}] OK  ${label}`);
    } catch (e) {
        console.error(`  [${i}/${statements.length}] ERREUR  ${label}`);
        console.error(e);
        process.exit(1);
    }
}
console.log('Migration terminée.');
