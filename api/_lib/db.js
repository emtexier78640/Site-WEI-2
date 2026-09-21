// api/_lib/db.js — Neon serverless Postgres client (tagged template)
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL manquant — les routes API échoueront.');
}

export const sql = neon(process.env.DATABASE_URL || 'postgres://x:x@localhost/x');
