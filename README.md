# Dialysis Companion

### Gabay para sa Pamilyang Pilipino · Nurse Jo42

A bilingual Tagalog and English dialysis guide for Filipino patients and their
families, with a private, local hemodialysis (HD) record book for care teams.

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
- **Private by design:** records are encrypted and saved in the current browser;
  they are not sent to a server and do not sync between devices.
- **Works offline:** the guide and record book work without an internet
  connection. Internet access is needed only for PhilHealth/DOH links in the
  guide footer.

## Open the app

Keep the project files together in one folder:

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Patient and family guide |
| `records.html`, `records.css`, `records.js` | Private HD patient record book |

Open `index.html` in a browser to read the guide. Choose **HD records** from the
navigation or the guide's main button to open the record book. The guide and
record book can also be hosted together on a static web host.

## Using the HD record book

On first use, create a password of at least 8 characters. You can optionally
enter a unit or center name. The record book is set up independently on each
browser/device.

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
history) or the patient list. Deleting a patient, deleting monthly data, or
erasing the record book requires re-entering the current password.

## Privacy, security, and backups

**Please read this before entering patient information.**

- Patient records are encrypted with **AES-256-GCM** and stored in this
  browser's `localStorage`. Nothing is sent to a server.
- Only active-patient counts are stored outside the encrypted records; patient
  names and clinical details are not included in those counts.
- The record book locks after 15 minutes of inactivity. Use a trusted, private
  device and lock the page when it is not in use.
- At initial setup, save the one-time recovery key **offline and separately
  from the device**. It can reset a forgotten password without deleting records.
  Replacing the recovery key invalidates the old one.
- There is no email or server-based password reset. If you lose both the
  password and recovery key, you will need an encrypted backup to recover the
  records; without either, they cannot be opened.
- Each browser/device has its own record book. To move records, use
  **Settings → Download backup**, then restore it on the other device using the
  backup password.
- **Settings → Other sessions → Log out other tabs** locks other open record
  book tabs in the same browser. It cannot log out a different device.

## Sharing and deployment

To share the complete app, host the project files together on a static web host.
The **HD records** link expects `records.html` to be available beside the guide.

---

Made for Filipino patients and families · Nurse Jo42
