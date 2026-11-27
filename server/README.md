# Dialysis Companion API

The FastAPI API supports separate dialysis units and individual staff accounts,
and an optional site-wide administrator. SQLite stores unit and audit data;
patient records are encrypted with AES-256-GCM before being written to the
database. The patient/family symptom guide is browser-only and does not send or
save symptom or lab-finding selections.

When `ADMIN_API_URL` is not configured on the static site, HD Records provides
a temporary browser-only vault encrypted with the user's password. It does
not sync across devices, provide staff accounts or MFA, or create server
backups. Use test data only until the API is deployed and the organization has
approved the system for clinical information. Once the API is available,
register a server unit account and use **Settings → Import older browser
records** to move local records into that unit.

> **Prototype warning:** this is not a certified clinical system. Do not enter
> real patient data until your organization has reviewed the deployment,
> privacy controls, and applicable requirements.

## Local setup

```bash
cd server
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `JWT_SECRET` and `MEDICAL_DATA_KEY` to separate random values of at least
32 bytes. Keep `.env` and `data/` private and out of source control. Losing
`MEDICAL_DATA_KEY` makes encrypted patient records unrecoverable.
To enable global site administration, set `SITE_ADMIN_EMAIL` and
`SITE_ADMIN_PASSWORD`; use a unique password of 12-72 UTF-8 bytes. Leave both
unset to disable site-admin sign-in. Never put either credential in website
files or source control. The site administrator can access clinical records
across all units, so use this account only for authorized administration.

Start the API from the `server/` directory:

```bash
python run.py
```

The local database is `server/data/dialysis-admin.sqlite` by default. Serve the
website locally on port 5500 and open `http://127.0.0.1:5500/`. The interactive
health guide is at `/account.html`, site administration at `/admin.html`, and
the unit-based record book at `/records.html`; do not open these pages using a
`file://` URL.

The Python API is compatible with the existing SQLite schema, bcrypt password
hashes, JWT tokens, and AES-256-GCM encrypted data. Keep the same
`MEDICAL_DATA_KEY` when switching an existing database; changing or losing it
makes encrypted records and MFA secrets unreadable.

## Sign-in and staff

1. Register a unit with a unique unit code, an admin username, and a password
   of at least 12 characters.
2. Set up an authenticator app and save the one-time recovery codes offline.
3. Admins can add staff in the records page's **Settings**. Staff enroll MFA on
   their first login.
4. Roles: `admin` manages staff and records; `clinician` can read and edit
   records; `viewer` can read records only.

Existing unit accounts are migrated with their old unit code as the admin
username and must enroll MFA at their next login. Older records stored in this
browser can be imported from **Settings → Import older browser records**; the
old local copy is not deleted.

Passwords are stored as bcrypt hashes. MFA uses authenticator codes and
single-use recovery codes. Tokens expire after 15 minutes; deactivating an
account or changing its password invalidates existing tokens.

## Patient and family interactive guide

The browser-only guide provides actionable steps for common and custom
symptoms, plus general education for hemoglobin, uric acid, potassium,
phosphorus, calcium, albumin, BUN, and glucose results compared with the
reference range printed on the patient's report. Food
suggestions are qualified by the patient's renal meal plan; the guide does not
prescribe treatment or recommend medication doses. Selections are held only in
page memory: they are not saved in local storage and are not sent to the API.
The guide does not diagnose, set personal targets, or replace advice from a
dialysis team.

Public patient/family account registration, sign-in, and card-sync API routes
have been removed. The legacy `guide_accounts` database table is retained so
existing rows and encrypted content are not silently destroyed. If an older
deployment has account data that should be erased, arrange a database backup
and explicit, verified deletion separately.

## Site administration

Configure the admin email and password on the API server (never in GitHub Pages
files). The admin dashboard can manage existing legacy guide-account access
and dialysis units, manage unit staff access, and create, view, edit, or delete
patient records across all units. Record access and administrative changes are
written to the `site_admin_audit` table. The latest 200 events are shown in the
dashboard; the database retains the audit history. Global access expands the
normal unit-isolation boundary and should be restricted to the designated
administrator. Admin credential changes invalidate existing admin tokens;
tokens also expire according to `JWT_EXPIRES_IN`.

## API

```text
GET    /api/health
POST   /api/site-admin/login
GET    /api/site-admin/overview
GET    /api/site-admin/audit
GET    /api/site-admin/accounts
PATCH  /api/site-admin/accounts/:id
GET    /api/site-admin/units
PATCH  /api/site-admin/units/:id
GET    /api/site-admin/units/:id/staff
PATCH  /api/site-admin/units/:id/staff/:user_id
GET    /api/site-admin/units/:id/records
GET    /api/site-admin/units/:id/records/:record_id
POST   /api/site-admin/units/:id/records
PUT    /api/site-admin/units/:id/records/:record_id
DELETE /api/site-admin/units/:id/records/:record_id
POST   /api/units/register
POST   /api/units/login
POST   /api/units/mfa/confirm
GET    /api/units/me
PUT    /api/units/me/password
GET    /api/units/users                 (admin)
POST   /api/units/users                 (admin)
DELETE /api/units/users/:id             (admin)
POST   /api/units/users/:id/reset-mfa   (admin)
GET    /api/units/audit                 (admin)
GET    /api/units/records
POST   /api/units/records               (admin/clinician)
POST   /api/units/records/import        (admin/clinician)
GET    /api/units/records/:id
PUT    /api/units/records/:id           (admin/clinician)
DELETE /api/units/records/:id           (admin/clinician)
```

Audit entries record staff, action, record ID, and timestamp—not medical record
contents. The audit log is stored in the same SQLite database and is not
tamper-proof against a host administrator.

## Encrypted backups

Set `BACKUP_PASSWORD` to a unique passphrase of at least 16 characters using
your secret manager, activate the virtual environment, then run:

```bash
python backup.py ./backups/patient-records.dcbackup
```

Backups use scrypt and AES-256-GCM. Keep the backup file and its passphrase
separate from the server. Test a restore before relying on backups.

Stop the server before restoring:

```bash
python restore_backup.py ./backups/patient-records.dcbackup
```

Use the same `BACKUP_PASSWORD` that encrypted the file. The restore replaces
the configured database.

## Tests

Install the development dependencies and run the Python API and backup tests:

```bash
pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

## Production deployment requirements

- Deploy this API as a Python 3.12 service running FastAPI and Uvicorn. Set
  `HOST=0.0.0.0` and use the platform-provided `PORT`.
- Set `DATABASE_PATH` to a location on persistent storage. The default SQLite
  file is lost if the host uses ephemeral storage.
- Set `CORS_ORIGIN` to the exact origin of the website (for example
  `https://jo42sites.github.io`, with no path or trailing slash).
- For this repository's GitHub Pages site, add the GitHub Actions repository
  variable `ADMIN_API_URL` with the API's public HTTPS origin, then select
  **GitHub Actions** under **Settings → Pages → Build and deployment**. The
  workflow fails if this variable is missing or is not an HTTPS origin.
- Serve both the website and API over HTTPS. In production the API rejects
  non-HTTPS requests. Behind a reverse proxy, set `TRUST_PROXY` to the exact
  trusted proxy hop count, and ensure the proxy overwrites forwarded headers.
- Set `CORS_ORIGIN` to the exact website origin(s); do not use `*`.
- Keep the API private behind a firewall or trusted network. Do not expose the
  development server directly to the internet.
- The default rate-limit store is in memory. Configure a shared persistent
  rate-limit store before using multiple server instances.
- Restrict server and backup access, patch dependencies, monitor access, and
  arrange backup retention and restore drills. The app does not automate
  backups or key rotation.

## Deploying this repository on Render

The repository includes a Render Blueprint in `../render.yaml`. In Render,
create a new **Blueprint** from this GitHub repository and deploy the
`dialysis-companion-api` service. The blueprint installs the Python requirements,
starts Uvicorn, configures generated secrets and GitHub Pages CORS, and mounts
a persistent 1 GB disk for SQLite. Check Render's current pricing before
deploying.

After the service is live:

1. Copy its public HTTPS origin (for example, `https://your-service.onrender.com`).
2. In GitHub, open **Settings → Secrets and variables → Actions → Variables**
   and add `ADMIN_API_URL` with that origin only (no path or trailing slash).
3. Under **Settings → Pages → Build and deployment**, select **GitHub Actions**.
4. Run the **Deploy GitHub Pages** workflow. Once it succeeds, reload the Pages
   site and create the unit account.

The Render blueprint allows the repository's GitHub Pages origin through CORS.
If you use a custom Pages domain, update `CORS_ORIGIN` on the Render service to
that exact website origin and redeploy.

## Deploying this repository on Coolify

The root `Dockerfile` builds this FastAPI service (it previously built a
throwaway Node demo and served no data). The static website is still deployed
separately to GitHub Pages.

In Coolify, on the application resource:

1. **Configuration → Build**: keep the Dockerfile build strategy with
   `/Dockerfile`, and set *Ports Exposes* to `3000`.
2. **Persistent Storage**: add a volume with mount path `/var/data`. Without it
   the SQLite database is recreated empty on every redeploy.
3. **Environment Variables**: set
   - `MEDICAL_DATA_KEY` — 32+ random bytes (`openssl rand -base64 48`). Back this
     up: losing it makes encrypted patient records unrecoverable.
   - `JWT_SECRET` — 32+ random bytes.
   - `DATABASE_PATH=/var/data/dialysis-admin.sqlite`
   - `HOST=0.0.0.0`, `PORT=3000`
   - `CORS_ORIGIN=https://jo42sites.github.io` (or your Pages origin)
   - `TRUST_PROXY=1`, `NODE_ENV=production`
4. **Healthcheck**: path `/api/health`, port `3000`.
5. **Deploy**, then open `https://<api-domain>/api/health`. It must return
   `{"status":"ok"}`.

In GitHub, set the Actions variable `ADMIN_API_URL` to the API's HTTPS origin
(for example `https://api.example.com`) and re-run the Pages workflow so
`records.html` and `admin.html` receive the `admin-api` meta tag. Without it the
site stays in browser-only vault mode.

`NODE_ENV=production` rejects `/api` requests that do not arrive over HTTPS
(everything except `/api/health`), so the API needs a TLS-terminated domain. The
generated `*.sslip.io` hostname is HTTP-only and resolves to a private address;
it is fine for `/api/health` checks on the LAN but cannot serve the site across
devices.

Patient records are encrypted at rest with `MEDICAL_DATA_KEY`; the SQLite file
itself is not. Use `server/backup.py` with `backup_crypto.py` for encrypted
backups and store them off the server.

The API runs as uid `10001`, not root. Coolify's Docker volumes inherit that
ownership from the image. If you switch to a host bind mount, run
`chown -R 10001:10001 <host-path>` first or SQLite will fail to open.

### Backups

`backup.py` writes an encrypted snapshot (`.dcbackup`) and needs
`BACKUP_PASSWORD` (16+ characters) in the environment. Add a Coolify scheduled
task, for example daily:

```
python backup.py /var/data/backups/records-$(date +%F).dcbackup
```

Files written to the app volume die with the server, so copy them offsite
(`restore_backup.py` reverses the format). Test a restore before you rely on it.
