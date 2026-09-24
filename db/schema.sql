-- db/schema.sql — schéma Postgres (Neon) de la plateforme WEIGO.
-- Idempotent : peut être rejoué sans risque (IF NOT EXISTS partout).
-- Exécuté par `npm run db:migrate` (db/migrate.js) instruction par instruction.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Utilisateurs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username       citext NOT NULL UNIQUE,
    password_hash  text NOT NULL,
    role           text NOT NULL DEFAULT 'student',
    prenom         text NOT NULL,
    nom            text NOT NULL,
    date_naissance date,
    statut         text NOT NULL DEFAULT 'Inscrit(e)',
    mobilhome      text NOT NULL DEFAULT '',
    voiture        text NOT NULL DEFAULT '',
    covoiturage    text NOT NULL DEFAULT '',
    ticket_id      text NOT NULL UNIQUE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_username_len CHECK (char_length(username::text) BETWEEN 3 AND 32),
    CONSTRAINT users_username_chars CHECK (username::text ~ '^[a-z0-9._-]+$'),
    CONSTRAINT users_role_chk CHECK (role IN ('student', 'admin')),
    CONSTRAINT users_prenom_len CHECK (char_length(prenom) BETWEEN 1 AND 60),
    CONSTRAINT users_nom_len CHECK (char_length(nom) BETWEEN 1 AND 60),
    CONSTRAINT users_statut_chk CHECK (statut IN ('Majeur', 'Mineur', 'Inscrit(e)')),
    CONSTRAINT users_mobilhome_len CHECK (char_length(mobilhome) <= 200),
    CONSTRAINT users_voiture_len CHECK (char_length(voiture) <= 200),
    CONSTRAINT users_covoiturage_len CHECK (char_length(covoiturage) <= 200),
    CONSTRAINT users_ticket_fmt CHECK (ticket_id ~ '^(WEIGO-[0-9]{6}|STAFF-[A-Z0-9-]{1,32})$')
);

CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);

-- ─── Validations (dossier validé par le BDE) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS validations (
    user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    validated    boolean NOT NULL DEFAULT false,
    validated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    validated_at timestamptz
);

-- ─── Commentaires (fil de discussion participant <-> orga) ─────────────────────
CREATE TABLE IF NOT EXISTS comments (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    role           text NOT NULL,
    text           text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT comments_role_chk CHECK (role IN ('student', 'orga')),
    CONSTRAINT comments_text_len CHECK (char_length(text) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS comments_user_created_idx ON comments (user_id, created_at);

-- ─── Covoiturage ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS covoit (
    user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role              text NOT NULL,
    places_dispos     integer NOT NULL DEFAULT 0,
    besoin            integer NOT NULL DEFAULT 0,
    note              text NOT NULL DEFAULT '',
    chauffeur_assigne text NOT NULL DEFAULT '',
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT covoit_role_chk CHECK (role IN ('conducteur', 'passager')),
    CONSTRAINT covoit_places_chk CHECK (places_dispos BETWEEN 0 AND 8),
    CONSTRAINT covoit_besoin_chk CHECK (besoin BETWEEN 0 AND 8),
    CONSTRAINT covoit_note_len CHECK (char_length(note) <= 500),
    CONSTRAINT covoit_chauffeur_len CHECK (char_length(chauffeur_assigne) <= 120)
);

-- ─── Préférences mobil-home ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobilhome_prefs (
    user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    membres    text NOT NULL DEFAULT '',
    note       text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mobilhome_membres_len CHECK (char_length(membres) <= 500),
    CONSTRAINT mobilhome_note_len CHECK (char_length(note) <= 500)
);

-- ─── Documents (fichiers stockés sur Vercel Blob) ──────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          text NOT NULL,
    label         text NOT NULL DEFAULT '',
    original_name text NOT NULL,
    note          text NOT NULL DEFAULT '',
    blob_url      text NOT NULL,
    blob_pathname text NOT NULL,
    size          integer NOT NULL,
    mime          text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT documents_type_chk CHECK (type IN ('parentale', 'decharge', 'autre')),
    CONSTRAINT documents_label_len CHECK (char_length(label) <= 120),
    CONSTRAINT documents_name_len CHECK (char_length(original_name) BETWEEN 1 AND 255),
    CONSTRAINT documents_note_len CHECK (char_length(note) <= 500),
    CONSTRAINT documents_size_chk CHECK (size > 0 AND size <= 5242880),
    CONSTRAINT documents_mime_chk CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png'))
);

CREATE INDEX IF NOT EXISTS documents_user_created_idx ON documents (user_id, created_at DESC);

-- ─── Tentatives de connexion (rate limiting) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
    id           bigserial PRIMARY KEY,
    ip           text NOT NULL,
    username     citext NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_ip_time_idx ON login_attempts (ip, attempted_at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_user_time_idx ON login_attempts (ip, username, attempted_at);
