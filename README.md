# Dialysis Companion

### Gabay para sa Pamilyang Pilipino · Nurse Jo42

A bilingual Tagalog and English dialysis guide for Filipino patients and their
families, with a unit-based hemodialysis (HD) record manager for care teams.

> **Educational and record-keeping tool only.** It is not a hospital system or
> an official medical record, and it does not replace advice from a qualified
> healthcare professional. Clinical decisions remain with the patient's care team.

## At a glance

- **Patient and family guide:** practical information about dialysis, access,
  food, medicines, laboratory tests, emergencies, PhilHealth, and caregiving.
- **Tagalog and English:** the guide opens in Tagalog; switch languages from the
  header. Your choice is remembered in that browser.
- **HD patient record book:** password-protected patient profiles and monthly
  monitoring, including measurements, laboratory results, orders, complications,
  medicines, and notes.
- **Unit accounts:** each dialysis unit has separate accounts and records.
  Patient record contents are encrypted before being saved in the server's
  SQLite database.
- **Patient and family accounts:** users can sign up to securely save and
  restore their dialysis card and language preference across devices.
- **Site administration:** a separately configured server-side admin can
  suspend accounts and units, manage unit access, and view/edit clinical
  records across units. Admin record access is audited.
- **Offline guide:** the patient and family guide works without an internet
  connection. The HD record book needs a connection to its API; internet access
  is also needed for PhilHealth/DOH links in the guide footer.

## Open the app

Keep the project files together in one folder:

| File | Purpose |
| --- | --- |
| `index.html`, `dialysis.html`, `daily-care.html`, `emergency.html`, `philhealth.html`, `support.html`, `styles.css`, `app.js` | Patient and family guide |
| `account.html`, `account.css`, `account.js` | Patient and family sign-up, sign-in, and encrypted card sync |
| `admin.html`, `admin.css`, `admin.js` | Protected site administration |
| `records.html`, `records.css`, `records.js` | Private HD patient record book |

Open `index.html` in a browser to find the focused guide pages. Choose **HD
records** from the navigation or the guide's main button to open the record
book. The guide can be hosted as a static site, but the record book also
requires the FastAPI service in [server/](./server/) to be deployed separately.
A static host alone cannot create unit accounts or save records.
For local development, set `SITE_ADMIN_EMAIL` and `SITE_ADMIN_PASSWORD` in
`server/.env` to enable the site-admin area. Use a unique password of 12-72
UTF-8 bytes; do not commit it. The site-admin page can access and modify
clinical records from every unit, so limit access to the authorized
administrator and review the audit log.

For the local record book, start the API as described in
[server/README.md](./server/README.md) and serve the project on
`http://127.0.0.1:5500` (do not open the record book as a `file://` URL).

To enable unit accounts on GitHub Pages, deploy the API using the included
[Python FastAPI/SQLite Render blueprint](./render.yaml). Then set the GitHub
Actions repository variable `ADMIN_API_URL` to the Render service's HTTPS origin and select
**GitHub Actions** as the Pages build and deployment source. Run the
**Deploy GitHub Pages** workflow after setting the variable. The setup details
are in [server/README.md](./server/README.md).
In the Render service environment, set `SITE_ADMIN_EMAIL` and a unique
`SITE_ADMIN_PASSWORD`. These credentials are not embedded in the static site.

## Using the HD record book

On first use, register your unit and its first admin account. Use a password of
at least 12 characters and enroll an authenticator app. Save the one-time
recovery codes offline. Admins can add staff accounts with admin, clinician, or
viewer access. Staff sign in with the unit code, their username, password, and
an authenticator code.

### Patient records

Each patient profile can include:

- Personal and care details: birthday (age is calculated), unit/center,
  nephrologist, dialysis schedule, and patient type (OPD, IP, or Others).
- Status: Active, Transferred, or Deceased, with a date and supporting details.
- Access and dialyzer types, dry weight, UF goal, pre/post-dialysis weights,
  blood pressure, and heart rate.
- Laboratory values: hemoglobin, calcium, phosphorus, albumin, URR, Kt/V,
  pre/post BUN, potassium, and PTH. Supported lab units can be selected, with
  the alternate unit calculated automatically.
- Epoetin, IV iron, and blood transfusion orders.
- Current medicines, clinical notes, and dated complication entries, including
  the nurse in charge and management provided.

URR can be entered directly or calculated from pre- and post-dialysis BUN:

```text
URR = (pre-BUN - post-BUN) / pre-BUN * 100
```

IDWG percentage is calculated from pre- and post-dialysis weight using either
dry weight or post-dialysis weight as the denominator.

### Monthly monitoring

Open a patient and select **Add monthly data** to record that month's weights,
blood pressure, labs, orders, complications, and notes. Entries can be edited
or deleted. A compiled view brings monthly history together; the newest month
appears on the patient card.

Pre weight, post weight, UF goal, and Kt/V accept multiple values separated by
commas or spaces. Their average is shown and saved as the value, while the
original list is retained for reference.

The dashboard summarizes active patients by OPD, IP, and Others. You can search
and filter records, edit them, and print an individual record (including monthly
history) or the patient list. Admins and clinicians can edit; viewers are
read-only. Deletion requires confirmation.

## Privacy, security, and backups

**Please read this before entering patient information.**

- Patient record contents use **AES-256-GCM** encryption at rest. The server
  needs the secret `MEDICAL_DATA_KEY` from its environment to decrypt records.
- Admins can review recent record access and changes in **Settings → Recent
  access history**. Logs contain staff names, action types, and record IDs, not
  the record contents.
- Sign-in requires a password and an authenticator code. Save the one-time
  recovery codes offline; an admin can reset another staff member's MFA.
- Tokens expire after 15 minutes. Deactivating a staff account invalidates its
  active tokens. The page also locks after inactivity.
- Create encrypted database backups with the commands in [server/README.md](./server/README.md).
  Keep the backup passphrase separate from the server and test restores.
- Use HTTPS for both the website and API before connecting from other devices.
  The included server binds only to localhost by default.
- **This prototype is not yet a certified clinical system.** Do not enter real
  patient data until it has been deployed, reviewed, and approved under your
  organization's security and privacy requirements.

## Sharing and deployment

The static website needs the FastAPI server in [server/](./server/) to use
patient records. Configure HTTPS, CORS, secrets, firewall rules, backups, and a
production rate-limit store before deployment. The **HD records** link expects
`records.html` to be available beside the guide.

---

Made for Filipino patients and families · Nurse Jo42
