# WEIGO — Plateforme d’inscription au WEI (BDE MMI Wave)

Site statique + fonctions serverless Vercel qui permet aux participants du WEI de :

- créer un compte (avec un code d’invitation fourni par le BDE) et se connecter ;
- consulter leur Pass participant et l’état de validation de leur dossier ;
- renseigner leurs préférences de mobil-home et de covoiturage ;
- téléverser leurs pièces justificatives (autorisation parentale, décharge…) ;
- échanger avec l’équipe organisatrice via un fil de messages.

Le BDE dispose d’une page d’administration (`/admin.html`) pour valider les dossiers, attribuer des chauffeurs, consulter les documents et répondre aux participants.

## Architecture

| Couche | Techno |
|---|---|
| Front | `index.html` (participants) et `admin.html` (BDE), HTML + JS vanilla, Tailwind via CDN |
| API | Fonctions serverless Vercel (ESM, Node 20) dans `api/` |
| Base de données | Postgres serverless (Neon / Vercel Postgres) via `@neondatabase/serverless` |
| Fichiers | Vercel Blob (accès privé, servi uniquement par l’API) |
| Sessions | JWT signé, stocké dans un cookie `httpOnly` |

```
index.html / admin.html      pages front
vercel.json                  en-têtes de sécurité (CSP, HSTS…)
api/_lib/                    helpers partagés (db, http, auth, validate, ratelimit, profile)
api/auth/{register,login,logout}.js
api/me.js                    profil de l’utilisateur connecté
api/{comments,covoit,mobilhome,documents}.js
api/documents/[id].js        flux d’un document (propriétaire ou admin)
api/bde/{participants,validate,covoit-assign,reply}.js   routes admin
db/schema.sql                schéma Postgres
db/migrate.js                applique le schéma
db/seed-admin.js             crée / met à jour le compte admin
```

## Variables d’environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chaîne de connexion Postgres (Neon), avec `sslmode=require` |
| `JWT_SECRET` | Secret de signature des sessions (32 caractères ou plus, `openssl rand -hex 32`) |
| `WEI_INVITE_CODE` | Code d’invitation demandé à l’inscription |
| `ADMIN_USERNAME` | Identifiant du compte BDE admin (créé par `db:seed-admin`) |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt du mot de passe admin (recommandé) |
| `ADMIN_PASSWORD` | Alternative locale : mot de passe en clair, haché par le script de seed. À ne jamais définir sur Vercel |
| `BLOB_READ_WRITE_TOKEN` | Token Vercel Blob pour le stockage des documents |

Un modèle est fourni dans `.env.example`. En production, ces variables se définissent dans Vercel → Settings → Environment Variables. `.env.local` ne doit jamais être commité.

## Installation et lancement en local

```bash
npm install
vercel link                  # lie le dossier au projet Vercel
vercel env pull .env.local   # récupère DATABASE_URL, BLOB_READ_WRITE_TOKEN, etc.
# complète .env.local : JWT_SECRET, WEI_INVITE_CODE, ADMIN_USERNAME, ADMIN_PASSWORD_HASH
npm run db:migrate           # applique db/schema.sql
npm run db:seed-admin        # crée / met à jour le compte admin
npm run dev                  # vercel dev → http://localhost:3000
```

### Générer un hash bcrypt

```bash
node -e "import('bcryptjs').then(b => console.log(b.hashSync(process.argv[1], 12)))" 'MonMotDePasse'
```

Copie la valeur affichée dans `ADMIN_PASSWORD_HASH`, puis relance `npm run db:seed-admin`.

## Modèle de sécurité

- **Authentification** : mots de passe hachés avec bcrypt (coût 12). La session est un JWT (7 jours) placé dans le cookie `weigo_session` avec `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`. Le JS de la page n’a jamais accès au jeton.
- **Identité côté serveur** : l’utilisateur est toujours déduit du cookie, jamais du corps de la requête. Un participant ne peut lire ou modifier que ses propres données ; les routes `api/bde/*` exigent le rôle `admin` (403 sinon). Le rôle des messages est forcé côté serveur (`student` / `orga`).
- **Anti-CSRF** : cookie `SameSite=Strict` et vérification de l’origine (`Origin` / `Sec-Fetch-Site`) sur toutes les requêtes non-GET. Aucun en-tête CORS n’est émis.
- **Rate limiting** : connexions limitées à 10 tentatives par couple (IP, identifiant) et 30 par IP sur 15 minutes (`429` avec `retryAfter`). Les identifiants inconnus passent quand même par une comparaison bcrypt pour éviter l’énumération.
- **Inscription** : code d’invitation comparé en temps constant, validation stricte de tous les champs (identifiant `[a-z0-9._-]{3,32}`, mot de passe 8–128 caractères, énumérations pour statut / voiture / covoiturage).
- **Uploads** : multipart limité à 4 Mo (Content-Length + comptage en flux), vérification des octets magiques (PDF, JPEG, PNG uniquement), 10 documents maximum par participant, stockage Vercel Blob en accès privé. Les fichiers ne sont jamais exposés par URL directe : `api/documents/[id]` vérifie le propriétaire (ou le rôle admin) puis diffuse le fichier avec `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` et `Cache-Control: no-store`.
- **En-têtes HTTP** (`vercel.json`) : Content-Security-Policy stricte (scripts limités à `self` et au CDN Tailwind, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS et `Permissions-Policy`.
- **Réponses d’erreur** : messages génériques, aucun détail interne (`e.message`, stack) n’est renvoyé au client.

## Checklist de QA manuelle

1. `npm install`, puis `grep -rn "localhost\|notion\|weigo_user_profile\|document.write\|Access-Control" index.html admin.html api/` ne renvoie rien ; `node --check` passe sur chaque fichier de `api/` et `db/`.
2. Avec une base Neon (`vercel env pull`, `npm run db:migrate`, `npm run db:seed-admin`, `npm run dev`), vérifier en `curl` :
   - inscription avec un mauvais code d’invitation → `403` ;
   - inscription valide → `201` et cookie `HttpOnly; Secure; SameSite=Strict` ;
   - `GET /api/me` sans cookie → `401` ;
   - 11 connexions erronées d’affilée → `429` ;
   - `POST /api/comments` avec `role: "orga"` → le message est stocké en `student` ;
   - un participant sur `GET /api/bde/participants` → `403` ;
   - upload de 6 Mo → `413` ; fichier `.exe` renommé en `.pdf` → `415` ;
   - accès au document d’un autre utilisateur → `404` ;
   - après `POST /api/auth/logout`, `GET /api/me` → `401`.
3. Dans le navigateur : inscription → tableau de bord ; upload d’un PDF et ouverture via « Voir » ; connexion admin → `/admin.html` : validation d’un dossier, attribution d’un chauffeur, réponse dans le fil ; côté participant, la réponse apparaît avec le badge « Staff ». Aucune violation CSP dans la console.
4. Si aucune `DATABASE_URL` n’est disponible localement, les points 2 et 3 sont à faire par le relecteur sur un environnement de preview Vercel.
