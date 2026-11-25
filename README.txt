DIALYSIS COMPANION
Gabay para sa Pamilyang Pilipino · Nurse Jo42

WHAT IS IN THIS PACKAGE
- index.html, styles.css, app.js — the patient and family guide.
- records.html, records.css, records.js — the private HD patient record book.
- README.txt — this file.

HOW TO OPEN
1. Keep all files together in one folder.
2. Double-click index.html for the guide.
3. Click "HD records" (top menu or hero button) for the record book.

THE HD RECORD BOOK
- The guide opens in Tagalog by default. Use the Tagalog / English switch in the
  header (or the menu on a phone) to read it in English. The choice is remembered
  in that browser. The HD patient records pages stay in English.
- First visit: create a password (at least 8 characters) and optionally add your
  unit or center name. Anyone can set up their own record book on their own device.
- Add one record per patient. Each record includes:
  · patient details, birthday (age is computed), unit/center, nephrologist, schedule
  · patient type: OPD, IP, or Others
  · status: Active, Transferred, or Deceased, with date, destination facility
    (for transfers), and a status note
  · access type and dialyzer type (dropdown lists, with "Other" fields)
  · dry weight, UF goal, pre/post weight, BP, heart rate
  · hemoglobin, calcium, phosphorus, albumin, URR, Kt/V, pre/post BUN,
    potassium, PTH
  · lab units can be chosen (g/L or g/dL, mg/dL or mmol/L); the other unit is
    computed automatically. URR is a single percentage value.
  · URR can be typed directly or calculated from pre- and post-dialysis BUN:
    URR = (pre-BUN − post-BUN) ÷ pre-BUN × 100
  · IDWG % is calculated automatically from pre/post weight using either
    dry weight or post-dialysis weight as the denominator:
    IDWG % = (pre-weight − post-weight) ÷ dry weight or post weight × 100
  · epoetin order, IV iron order, blood transfusion order
  · complications: log as many entries as needed. Each entry has a complication
    (chosen from common ones or typed), date, time, nurse in charge, and the
    management done
  · current medicines: a table with one row per medicine, with columns for
    medicine, dosage, and frequency. Use "+ Add medicine" for another row and
    the × button to remove a row, plus a free text field for other medicine
    notes
  · clinical notes
- Monthly monitoring: open a patient and choose "Add monthly data" to record
  weights, BP, labs, orders, complications (with date/time/nurse/management),
  and notes for that month. You can add one entry per month, edit it, or delete it.
  The newest month is shown on the patient card; baseline values in the patient
  form are used only until the first monthly entry is added.
- At first setup, the app shows a one-time recovery key. Save it offline. It can
  reset a forgotten password without deleting records. Settings → Recovery key can
  create a replacement (the old code then stops working).
- The dashboard shows active patients with an OPD / IP / Others breakdown.
- The monthly compiled view automatically averages pre weight, post weight, UF goal,
  and Kt/V across the recorded months; per-month values remain editable.
- The baseline and monthly Pre weight, Post weight, UF goal, and Kt/V fields accept
  several values separated by commas or spaces. The average appears under each field
  and is saved as the single value; the raw list is kept for reference.
- Add as many monthly entries as needed. A compiled view shows every month's
  measurements, laboratories, orders, complications, and notes in one place.
- Delete a patient from the trash icon on the patient card, from the Delete
  button inside the record, or clear the whole book in Settings → Erase all records.
  Deleting a patient, deleting a monthly entry, or erasing everything requires
  retyping the current password.
- Settings → Other sessions → Log out other tabs locks other open tabs of this
  record book in the same browser. They will need the password again. This cannot
  reach a different computer; change the password to block re-entry with the old one.
- Search, filter by status, edit, print one record (including the monthly history
  and complication details), or print the patient list.
- The front page shows the number of active OPD, IP, and Others records on that
  device. Only the counts are stored outside the encrypted records; no patient
  names or clinical details are exposed. Counts update when records are saved.
  Old records with no type are counted as OPD until edited.
- Records are encrypted with AES-256-GCM and saved only in this browser's
  localStorage. Nothing is sent to a server.

PRIVACY AND BACKUP — PLEASE READ
- The password cannot be recovered without either the recovery key or an encrypted
  backup. If both are lost, the records cannot be opened.
- The recovery key is as powerful as the password. Keep it offline and never store
  it on the same device. It stays valid after password changes; replacing it makes
  the old recovery key invalid.
- One browser/device has its own record book. Records do not sync between phones
  or computers. To move them, use Settings → Download backup, then Restore backup
  on the other device and unlock with the backup password.
- Use a trusted, private device. Lock the page when not in use (it also locks after
  15 minutes idle).
- This is a local record-keeping tool, not a hospital system and not an official
  medical record. Clinical decisions remain with the care team.
- There is no email or server password reset. Recovery is local: use the recovery
  key on the lock screen, or restore an encrypted backup.

SHARING
- Full site: upload the whole folder (or Dialysis-Companion-netlify.zip) to a static
  host such as Netlify Drop. The "HD records" link will work.
- Single guide file: Dialysis-Companion-standalone.html contains the guide only and
  does not include the record book.

OFFLINE
- The guide and record book work offline. Internet is only needed for the
  PhilHealth/DOH links in the guide footer.
