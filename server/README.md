# Unit-Based Patient Records Server

The Express API supports separate dialysis units and individual staff accounts.
Patient record contents are encrypted with AES-256-GCM before being written to
SQLite.

> **Prototype warning:** this is not a certified clinical system. Do not enter
> real patient data until your organization has reviewed the deployment,
> privacy controls, and applicable requirements.

## Local setup

```bash
cd server
npm install
cp .env.example .env
```

Set `JWT_SECRET` and `MEDICAL_DATA_KEY` to separate random values of at least
32 bytes. Keep `.env` and `data/` private and out of source control. Losing
`MEDICAL_DATA_KEY` makes encrypted patient records unrecoverable.

Start the API:

```bash
npm start
```

It binds to `127.0.0.1` by default. Serve the website locally on port 5500 and
open `http://127.0.0.1:5500/records.html`; do not open it using a `file://` URL.

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

## API

```text
GET    /api/health
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
your secret manager, then run:

```bash
npm run backup -- ./backups/patient-records.dcbackup
```

Backups use scrypt and AES-256-GCM. Keep the backup file and its passphrase
separate from the server. Test a restore before relying on backups.

Stop the server before restoring:

```bash
npm run restore-backup -- ./backups/patient-records.dcbackup
```

Use the same `BACKUP_PASSWORD` that encrypted the file. The restore replaces
the configured database.

## Production deployment requirements

- Deploy this API as a Node.js service. Set `HOST=0.0.0.0` so the hosting
  platform can reach it, and use the platform-provided `PORT`.
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
`dialysis-companion-api` service. The blueprint configures the required secrets,
HTTPS proxy handling, GitHub Pages CORS origin, and a persistent 1 GB disk for
SQLite. It uses Render's paid 0.5 CPU/512 MB plan; check Render's current
pricing before deploying.

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
