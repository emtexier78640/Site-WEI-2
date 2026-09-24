// db/seed-admin.js — crée ou met à jour le compte BDE admin depuis l'env.
// Variables : ADMIN_USERNAME + ADMIN_PASSWORD_HASH (bcrypt) ou ADMIN_PASSWORD (clair, haché ici).
// Usage : npm run db:seed-admin
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { loadEnv } from './env.js';

loadEnv();

const url = process.env.DATABASE_URL;
const username = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
let hash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
const plain = process.env.ADMIN_PASSWORD || '';

if (!url) { console.error('DATABASE_URL manquant.'); process.exit(1); }
if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    console.error('ADMIN_USERNAME invalide (3-32 caractères : a-z 0-9 . _ -).');
    process.exit(1);
}
if (!hash) {
    if (plain.length < 8 || plain.length > 128) {
        console.error('Fournis ADMIN_PASSWORD_HASH (bcrypt) ou ADMIN_PASSWORD (8 à 128 caractères).');
        process.exit(1);
    }
    hash = await bcrypt.hash(plain, 12);
} else if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
    console.error('ADMIN_PASSWORD_HASH ne ressemble pas à un hash bcrypt.');
    process.exit(1);
}

const sql = neon(url);
const rows = await sql`
    INSERT INTO users (username, password_hash, role, prenom, nom, statut, ticket_id)
    VALUES (${username}, ${hash}, 'admin', 'BDE', 'MMI Wave', 'Inscrit(e)', 'STAFF-ORGA-WEI')
    ON CONFLICT (username) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            role = 'admin',
            prenom = EXCLUDED.prenom,
            nom = EXCLUDED.nom
    RETURNING id, username, role, ticket_id
`;
console.log('Compte admin prêt :', rows[0]);
