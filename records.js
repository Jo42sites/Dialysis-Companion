/* ============================================================
   Dialysis Companion — unit-based HD patient records
   Patient records are encrypted by the server before database storage.
   ============================================================ */
(function () {
  'use strict';

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const VAULT_KEY = 'dc-records-vault-v1';
  const UNIT_KEY = 'dc-records-unit';
  const CENSUS_KEY = 'dc-records-census';
  const SESSION_KEY = 'dc-records-session-epoch';
  const UNIT_TOKEN_KEY = 'dc-unit-token';
  const UNIT_SLUG_KEY = 'dc-unit-slug';
  const SERVER_API = (document.querySelector('meta[name="admin-api"]')?.content || 'http://127.0.0.1:3001').replace(/\/$/, '');
  const ITERATIONS = 250000;
  const IDLE_MS = 15 * 60 * 1000;

  const state = {
    key: null,
    vault: null,
    patients: [],
    editingId: null,
    editingMonthId: null,
    query: '',
    sort: 'updated',
    statusFilter: 'all',
    sessionEpoch: '0',
    idleTimer: null,
    unitToken: null,
    unit: null,
    user: null,
    pendingSetupToken: null,
    pendingAuth: null
  };

  let formComplications = [];
  let formMedications = [];
  let monthComplications = [];
  let sessionChannel = null;
  try {
    if ('BroadcastChannel' in window) sessionChannel = new BroadcastChannel('dc-records-sessions');
  } catch (err) { sessionChannel = null; }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /* ------------------------------------------------------------
     Lab definitions and unit conversion
     ------------------------------------------------------------ */
  const LABS = {
    hb: {
      label: 'Hemoglobin', units: ['g/L', 'g/dL'],
      factor: { 'g/L': 1, 'g/dL': 10 }, digits: 1,
      flag: { type: 'low', limit: 100, canonical: 'g/L' }
    },
    ca: {
      label: 'Calcium', units: ['mg/dL', 'mmol/L'],
      factor: { 'mg/dL': 0.2495, 'mmol/L': 1 }, digits: 2,
      flag: { type: 'high', limit: 2.5, canonical: 'mmol/L' }
    },
    po4: {
      label: 'Phosphorus', units: ['mg/dL', 'mmol/L'],
      factor: { 'mg/dL': 0.3229, 'mmol/L': 1 }, digits: 2,
      flag: { type: 'high', limit: 1.78, canonical: 'mmol/L' }
    },
    alb: {
      label: 'Albumin', units: ['g/L', 'g/dL'],
      factor: { 'g/L': 1, 'g/dL': 10 }, digits: 1,
      flag: { type: 'low', limit: 35, canonical: 'g/L' }
    },
    urr: {
      label: 'URR', units: ['%'],
      factor: { '%': 1 }, digits: 1,
      flag: { type: 'low', limit: 65, canonical: '%' }
    }
  };

  /* ------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------ */
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const num = (value) => {
    if (value === '' || value == null) return null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  };

  const plain = (value) => (value === '' || value == null ? '—' : esc(value));

  const fmtNum = (value, digits) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '';
    return String(Number(value.toFixed(digits)));
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const uid = () => (window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2));

  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map((word) => word.charAt(0)).join('').toUpperCase();

  const toB64 = (buffer) => {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };

  const fromB64 = (text) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

  let toastTimer = null;
  const toast = (message) => {
    const el = $('#recToast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  };

  /* ------------------------------------------------------------
     Lab conversion helpers
     ------------------------------------------------------------ */
  function labCanonical(key, value, unit) {
    const def = LABS[key];
    const n = num(value);
    if (!def || n === null) return null;
    const factor = def.factor[unit] == null ? 1 : def.factor[unit];
    return n * factor;
  }

  function otherUnit(key, unit) {
    const def = LABS[key];
    if (!def) return '';
    return def.units.find((item) => item !== unit) || '';
  }

  function labOtherValue(key, value, unit) {
    const canon = labCanonical(key, value, unit);
    const target = otherUnit(key, unit);
    if (canon === null || !target) return null;
    return canon / LABS[key].factor[target];
  }

  function labFlag(key, value, unit) {
    const def = LABS[key];
    const canon = labCanonical(key, value, unit);
    if (!def || canon === null || !def.flag) return null;
    if (def.flag.type === 'low' && canon < def.flag.limit) return { label: 'Low', className: 'low' };
    if (def.flag.type === 'high' && canon > def.flag.limit) return { label: 'High', className: '' };
    return null;
  }

  function labDisplay(key, value, unit) {
    const def = LABS[key];
    if (!def || value === '' || value == null) return '—';
    const other = labOtherValue(key, value, unit);
    const flag = labFlag(key, value, unit);
    const alt = other === null ? '' :
      ` <span class="lab-alt">(${fmtNum(other, def.digits)} ${esc(otherUnit(key, unit))})</span>`;
    return `${esc(value)} ${esc(unit || def.units[0])}${alt}${flag ? ` <span class="flag ${flag.className}">${flag.label}</span>` : ''}`;
  }

  function labPlain(key, value, unit) {
    const def = LABS[key];
    if (!def || value === '' || value == null) return '';
    const other = labOtherValue(key, value, unit);
    return `${value} ${unit || def.units[0]}` +
      (other === null ? '' : ` (${fmtNum(other, def.digits)} ${otherUnit(key, unit)})`);
  }

  function syncLabHints(prefix) {
    const p = prefix || '';
    Object.keys(LABS).forEach((key) => {
      const dataAttr = p ? 'data-mlab' : 'data-lab';
      const unitAttr = p ? 'data-mlab-unit' : 'data-lab-unit';
      const hintAttr = p ? 'data-mlab-hint' : 'data-lab-hint';
      const input = document.querySelector('[' + dataAttr + '="' + key + '"]');
      const unitSelect = document.querySelector('[' + unitAttr + '="' + key + '"]');
      const hint = document.querySelector('[' + hintAttr + '="' + key + '"]');
      if (!input || !unitSelect || !hint) return;
      const value = input.value.trim();
      if (!value) {
        hint.textContent = '—';
        return;
      }
      const def = LABS[key];
      const other = labOtherValue(key, value, unitSelect.value);
      const flag = labFlag(key, value, unitSelect.value);
      hint.innerHTML = (other === null ? '—' : '= ' + fmtNum(other, def.digits) + ' ' + esc(otherUnit(key, unitSelect.value))) +
        (flag ? ' <span class="flag ' + flag.className + '">' + flag.label + '</span>' : '');
    });
  }

  function unitDisplay(patient) {
    return patient.unit || '';
  }

  function accessText(patient) {
    if (patient.accessType === 'Other') return patient.accessOther || 'Other';
    return patient.accessType || '';
  }

  function dialyzerText(patient) {
    if (patient.dialyzerType === 'Other / not listed') return patient.dialyzerOther || 'Other';
    return patient.dialyzerType || '';
  }

  function statusOf(patient) {
    return patient.status || 'Active';
  }

  function statusClass(patient) {
    const status = statusOf(patient);
    if (status === 'Deceased') return 'deceased';
    if (status === 'Transferred') return 'transferred';
    return 'active';
  }

  function ageOf(patient) {
    if (patient.birthday) {
      const parts = String(patient.birthday).split('-').map(Number);
      if (parts.length === 3 && parts[0]) {
        const birth = new Date(parts[0], parts[1] - 1, parts[2]);
        if (!Number.isNaN(birth.getTime())) {
          const now = new Date();
          let age = now.getFullYear() - birth.getFullYear();
          const monthDiff = now.getMonth() - birth.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
          if (age >= 0 && age < 130) return age;
        }
      }
    }
    return patient.age || '';
  }

  function latestMonth(patient) {
    const months = Array.isArray(patient.months) ? patient.months.slice() : [];
    if (!months.length) return null;
    months.sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')));
    return months[0];
  }

  function currentData(patient) {
    return latestMonth(patient) || patient;
  }

  function monthLabel(value) {
    if (!value) return '';
    const parts = String(value).split('-').map(Number);
    if (parts.length < 2 || !parts[0] || !parts[1]) return value;
    return new Date(parts[0], parts[1] - 1, 1)
      .toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
  }

  function fmtDateOnly(value) {
    if (!value) return '';
    const parts = String(value).split('-').map(Number);
    if (parts.length !== 3 || !parts[0]) return String(value);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  /* ------------------------------------------------------------
     Encryption
     ------------------------------------------------------------ */
  const cryptoReady = !!(window.crypto && window.crypto.subtle);

  async function deriveKey(password, salt, iterations) {
    const material = await crypto.subtle.importKey(
      'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  function readVault() {
    try {
      const raw = localStorage.getItem(VAULT_KEY);
      if (!raw) return null;
      const vault = JSON.parse(raw);
      if (!vault || !vault.salt || !vault.iter || !vault.iv || !vault.data) return null;
      return vault;
    } catch (err) {
      return null;
    }
  }

  function writeVault(vault) {
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  }

  async function serverApi(path, options) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.unitToken) headers.Authorization = 'Bearer ' + state.unitToken;
    const response = await fetch(SERVER_API + path, {
      ...options,
      headers,
      credentials: 'omit'
    });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Server request failed');
    return body;
  }

  async function persist() {
    if (state.unitToken) {
      const existing = await serverApi('/api/units/records');
      const serverIds = new Set((existing.records || []).map((item) => item.id));
      const localIds = new Set(state.patients.map((item) => item.id));

      for (const patient of state.patients) {
        if (serverIds.has(patient.id)) {
          await serverApi('/api/units/records/' + encodeURIComponent(patient.id), {
            method: 'PUT',
            body: JSON.stringify(patient)
          });
        } else {
          const created = await serverApi('/api/units/records', {
            method: 'POST',
            body: JSON.stringify(patient)
          });
          patient.id = created.id;
        }
      }
      for (const serverId of serverIds) {
        if (!localIds.has(serverId)) {
          await serverApi('/api/units/records/' + encodeURIComponent(serverId), {
            method: 'DELETE'
          });
        }
      }
      updateCensus();
      return;
    }
    const salt = fromB64(state.vault.salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      state.key,
      encoder.encode(JSON.stringify(state.patients))
    );
    const nextVault = {
      v: 1,
      salt: state.vault.salt,
      iter: state.vault.iter,
      iv: toB64(iv),
      data: toB64(cipher),
      updatedAt: new Date().toISOString()
    };
    if (state.vault.recovery) nextVault.recovery = state.vault.recovery;
    state.vault = nextVault;
    writeVault(state.vault);
    updateCensus();
  }

  function updateCensus() {
    const active = state.patients.filter((p) => statusOf(p) === 'Active');
    const counts = { opd: 0, ip: 0, others: 0, total: active.length, updatedAt: new Date().toISOString() };
    active.forEach((p) => {
      const type = p.patientType || 'OPD';
      if (type === 'IP') counts.ip += 1;
      else if (type === 'Others') counts.others += 1;
      else counts.opd += 1;
    });
    try { localStorage.setItem(CENSUS_KEY, JSON.stringify(counts)); } catch (err) { /* ignore */ }
  }

  const normalizeRecoveryCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function prepareRecoveryCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return (hex.match(/.{1,4}/g) || []).join('-');
  }

  async function exportRawKey(key) {
    return new Uint8Array(await crypto.subtle.exportKey('raw', key));
  }

  async function importRawKey(raw) {
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async function commitRecoveryKey(code) {
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length < 32) throw new Error('bad-code');
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = toB64(saltBytes);
    const kek = await deriveKey(normalized, saltBytes, ITERATIONS);
    const raw = await exportRawKey(state.key);
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kek, raw);
    const encIv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: encIv }, state.key, encoder.encode(normalized));
    state.vault.recovery = {
      salt,
      iter: ITERATIONS,
      wrapIv: toB64(wrapIv),
      wrappedKey: toB64(wrapped),
      encIv: toB64(encIv),
      encKey: toB64(enc)
    };
    writeVault(state.vault);
  }

  async function rewrapRecovery(oldKey, newKey) {
    const rec = state.vault.recovery;
    if (!rec) return null;
    const code = decoder.decode(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(rec.encIv) }, oldKey, fromB64(rec.encKey)
    ));
    const kek = await deriveKey(code, fromB64(rec.salt), rec.iter);
    const raw = await exportRawKey(newKey);
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kek, raw);
    const encIv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: encIv }, newKey, encoder.encode(code));
    return {
      salt: rec.salt,
      iter: rec.iter,
      wrapIv: toB64(wrapIv),
      wrappedKey: toB64(wrapped),
      encIv: toB64(encIv),
      encKey: toB64(enc)
    };
  }

  async function recoverVault(code, newPassword) {
    const vault = readVault();
    if (!vault || !vault.recovery) throw new Error('no-recovery');
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length < 32) throw new Error('bad-code');
    const kek = await deriveKey(normalized, fromB64(vault.recovery.salt), vault.recovery.iter);
    const rawOld = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(vault.recovery.wrapIv) }, kek, fromB64(vault.recovery.wrappedKey)
    ));
    const oldKey = await importRawKey(rawOld);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(vault.iv) }, oldKey, fromB64(vault.data)
    );
    const patients = JSON.parse(decoder.decode(plaintext));
    if (!Array.isArray(patients)) throw new Error('bad-data');

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = toB64(saltBytes);
    const newKey = await deriveKey(newPassword, saltBytes, ITERATIONS);
    const rawNew = await exportRawKey(newKey);
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kek, rawNew);
    const encIv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: encIv }, newKey, encoder.encode(normalized));

    state.key = newKey;
    state.patients = patients.map(normalizePatient);
    state.vault = {
      v: 1,
      salt,
      iter: ITERATIONS,
      recovery: {
        salt: vault.recovery.salt,
        iter: vault.recovery.iter,
        wrapIv: toB64(wrapIv),
        wrappedKey: toB64(wrapped),
        encIv: toB64(encIv),
        encKey: toB64(enc)
      }
    };
    await persist();
    revokeOtherSessions();
  }

  async function createVault(password) {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = toB64(saltBytes);
    const key = await deriveKey(password, saltBytes, ITERATIONS);
    state.key = key;
    state.patients = [];
    state.vault = { v: 1, salt, iter: ITERATIONS };
    await persist();
  }

  function normalizeComplication(comp) {
    if (typeof comp === 'string') {
      return { id: uid(), name: comp, date: '', time: '', nurse: '', management: '' };
    }
    const c = Object.assign({}, comp);
    c.id = c.id || uid();
    ['name', 'date', 'time', 'nurse', 'management'].forEach((key) => {
      c[key] = c[key] == null ? '' : String(c[key]);
    });
    return c;
  }

  function normalizeMonth(month) {
    const m = Object.assign({}, month);
    if (!m.id) m.id = uid();
    if (!m.idwgBasis) m.idwgBasis = 'dry';
    m.complications = (Array.isArray(m.complications) ? m.complications : []).map(normalizeComplication);
    if (m.hb && !m.hbUnit) m.hbUnit = 'g/dL';
    if (m.ca && !m.caUnit) m.caUnit = 'mg/dL';
    if (m.po4 && !m.po4Unit) m.po4Unit = 'mg/dL';
    if (m.alb && !m.albUnit) m.albUnit = 'g/dL';
    if (m.urrUnit === 'fraction') { const n = parseFloat(m.urr); if (Number.isFinite(n) && n > 0 && n <= 1.5) m.urr = String(Number((n * 100).toFixed(1))); }
    m.urrUnit = '%';
    return m;
  }

  function normalizePatient(patient) {
    const p = Object.assign({}, patient);
    if (!p.unit && p.center) p.unit = p.center;
    if (!p.accessType && p.access) {
      p.accessType = 'Other';
      p.accessOther = p.access;
    }
    p.complications = (Array.isArray(p.complications) ? p.complications : []).map(normalizeComplication);
    p.medications = (Array.isArray(p.medications) ? p.medications : []).map((m) => ({
      id: m.id || uid(),
      name: String(m.name || ''),
      dose: String(m.dose || ''),
      frequency: String(m.frequency || '')
    }));
    if (!p.status) p.status = 'Active';
    if (!p.idwgBasis) p.idwgBasis = 'dry';
    if (!p.patientType) p.patientType = 'OPD';
    if (!Array.isArray(p.months)) p.months = [];
    p.months = p.months.map(normalizeMonth);
    if (p.hb && !p.hbUnit) p.hbUnit = 'g/dL';
    if (p.ca && !p.caUnit) p.caUnit = 'mg/dL';
    if (p.po4 && !p.po4Unit) p.po4Unit = 'mg/dL';
    if (p.alb && !p.albUnit) p.albUnit = 'g/dL';
    if (p.urrUnit === 'fraction') { const n = parseFloat(p.urr); if (Number.isFinite(n) && n > 0 && n <= 1.5) p.urr = String(Number((n * 100).toFixed(1))); }
    p.urrUnit = '%';
    if (!p.id) p.id = uid();
    return p;
  }

  async function unlockVault(password) {
    const vault = readVault();
    if (!vault) throw new Error('no-vault');
    const key = await deriveKey(password, fromB64(vault.salt), vault.iter);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(vault.iv) },
      key,
      fromB64(vault.data)
    );
    const patients = JSON.parse(decoder.decode(plaintext));
    if (!Array.isArray(patients)) throw new Error('bad-data');
    state.key = key;
    state.vault = vault;
    state.patients = patients.map(normalizePatient);
  }

  async function verifyPassword(password) {
    const vault = readVault();
    if (!vault) return false;
    try {
      const key = await deriveKey(password, fromB64(vault.salt), vault.iter);
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.data));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ------------------------------------------------------------
     Lock / unlock UI
     ------------------------------------------------------------ */
  function loadUnitLabel() {
    let unit = '';
    try { unit = localStorage.getItem(UNIT_KEY) || ''; } catch (err) { /* ignore */ }
    const label = $('#recUnitLabel');
    if (label) label.textContent = unit ? ' · ' + unit : '';
    const input = $('#unitName');
    if (input) input.value = unit;
  }

  function showMfaSetup(result) {
    state.pendingSetupToken = result.setupToken;
    state.pendingAuth = null;
    $('#setupView').hidden = true;
    $('#unlockView').hidden = true;
    $('#mfaSetupView').hidden = false;
    $('#recoveryCodesView').hidden = true;
    $('#mfaSecret').textContent = result.secret;
    $('#mfaSetupForm').hidden = false;
    $('#mfaCode').value = '';
    $('#mfaSetupError').textContent = '';
    setTimeout(() => $('#mfaCode').focus(), 60);
  }

  async function activateUnit(result) {
    state.unitToken = result.token;
    state.unit = result.unit;
    state.user = result.user;
    const response = await serverApi('/api/units/records');
    state.patients = (response.records || []).map((item) => normalizePatient(item.record));
    $('#unlockForm').reset();
    $('#setupForm').reset();
    $('#mfaSetupView').hidden = true;
    showApp();
  }

  async function loadAdminSettings() {
    if (!state.user || state.user.role !== 'admin') return;
    const [users, auditLog] = await Promise.all([
      serverApi('/api/units/users'),
      serverApi('/api/units/audit')
    ]);
    $('#staffList').innerHTML = users.users.map((user) => `
      <div class="set-block">
        <strong>${esc(user.username)}</strong> · ${esc(user.role)}${user.active ? '' : ' · inactive'}
        ${user.id === state.user.id || !user.active ? '' : `
          <button class="link-btn" type="button" data-reset-mfa-user="${Number(user.id)}">Reset MFA</button>
          <button class="link-btn" type="button" data-deactivate-user="${Number(user.id)}">Deactivate</button>`}
      </div>`).join('');
    $('#auditList').innerHTML = auditLog.events.length
      ? auditLog.events.map((event) => `
        <div class="set-block">
          <strong>${esc(event.action)}</strong> · ${esc(event.username)}
          ${event.record_id ? ` · record ${esc(event.record_id)}` : ''}
          <small>${esc(event.created_at)}</small>
        </div>`).join('')
      : '<p>No recent activity.</p>';
  }

  function showApp() {
    $('#lockScreen').hidden = true;
    $('#app').hidden = false;
    try { state.sessionEpoch = localStorage.getItem(SESSION_KEY) || '0'; } catch (err) { state.sessionEpoch = '0'; }
    loadUnitLabel();
    const accountLabel = $('#accountLabel');
    if (accountLabel && state.unit) {
      accountLabel.textContent = `${state.unit.name} · ${state.user.username} (${state.user.role})`;
    }
    const staffSection = $('#staffForm').closest('.set-block');
    const auditSection = $('#auditList').closest('.set-block');
    const importSection = $('#legacyImportForm').closest('.set-block');
    if (staffSection) staffSection.hidden = state.user.role !== 'admin';
    if (auditSection) auditSection.hidden = state.user.role !== 'admin';
    if (importSection) importSection.hidden = state.user.role === 'viewer';
    const canEdit = state.user.role !== 'viewer';
    $('#addPatientBtn').hidden = !canEdit;
    $('#emptyAddBtn').hidden = !canEdit;
    $('#editPatient').hidden = !canEdit;
    $('#deletePatient').hidden = !canEdit;
    updateCensus();
    updateRecoveryUI();
    render();
    resetIdle();
  }

  function revokeOtherSessions() {
    const next = Date.now() + '-' + Math.random().toString(36).slice(2);
    try { localStorage.setItem(SESSION_KEY, next); } catch (err) { /* ignore */ }
    state.sessionEpoch = next;
    if (sessionChannel) {
      try { sessionChannel.postMessage({ type: 'revoke' }); } catch (err) { /* ignore */ }
    }
  }

  function logOutOtherSessions() {
    if (!window.confirm('Log out other open tabs of this record book on this device? They will need the password again.')) return;
    revokeOtherSessions();
    toast('Other open sessions have been logged out.');
  }

  let pendingRecoveryCode = null;
  let pendingRecoveryDone = null;

  function updateRecoveryUI() {
    const has = !!(state.vault && state.vault.recovery);
    const status = $('#recoveryStatus');
    const action = $('#recoveryAction');
    if (status) {
      status.textContent = has
        ? 'A recovery key is set. Keep it offline. Replacing it makes the old key invalid.'
        : 'No recovery key set. Create one to reset a forgotten password without deleting records.';
    }
    if (action) action.textContent = has ? 'Replace recovery key' : 'Create recovery key';
  }

  function showRecoveryCode(code, done) {
    pendingRecoveryCode = code;
    pendingRecoveryDone = done;
    $('#recoveryCodeText').textContent = code;
    $('#recoveryAck').checked = false;
    $('#recoverySave').disabled = true;
    $('#recoveryKeyError').textContent = '';
    $('#recoveryKeyDialog').showModal();
  }

  async function saveRecoveryKey() {
    if (!pendingRecoveryCode) return;
    const btn = $('#recoverySave');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await commitRecoveryKey(pendingRecoveryCode);
      const done = pendingRecoveryDone;
      pendingRecoveryCode = null;
      pendingRecoveryDone = null;
      $('#recoveryKeyDialog').close();
      updateRecoveryUI();
      if (done) done(true);
    } catch (err) {
      $('#recoveryKeyError').textContent = 'Could not save the recovery key. Try again.';
    } finally {
      btn.disabled = !$('#recoveryAck').checked;
      btn.textContent = label;
    }
  }

  function skipRecoveryKey() {
    const done = pendingRecoveryDone;
    pendingRecoveryCode = null;
    pendingRecoveryDone = null;
    $('#recoveryKeyDialog').close();
    if (done) done(false);
  }

  function lockNow() {
    state.unitToken = null;
    state.unit = null;
    state.key = null;
    state.patients = [];
    try { localStorage.removeItem(UNIT_TOKEN_KEY); } catch (err) { /* ignore */ }
    location.reload();
  }

  function resetIdle() {
    clearTimeout(state.idleTimer);
    if ($('#app').hidden) return;
    state.idleTimer = setTimeout(() => {
      if (!$('#app').hidden) lockNow();
    }, IDLE_MS);
  }

  /* ------------------------------------------------------------
     Rendering
     ------------------------------------------------------------ */
  function filteredPatients() {
    const query = state.query.trim().toLowerCase();
    let list = state.patients.slice();
    if (state.statusFilter !== 'all') {
      list = list.filter((p) => statusOf(p) === state.statusFilter);
    }
    if (query) {
      list = list.filter((p) => [p.name, p.philhealth, p.unit, p.nephrologist, p.contact]
        .some((value) => String(value || '').toLowerCase().includes(query)));
    }
    if (state.sort === 'name') {
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } else {
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }
    return list;
  }

  function renderStats() {
    const active = state.patients.filter((p) => statusOf(p) === 'Active');
    const typeCount = (type) => active.filter((p) => (p.patientType || 'OPD') === type).length;
    $('#statTotal').textContent = active.length;
    $('#statOpd').textContent = typeCount('OPD');
    $('#statIp').textContent = typeCount('IP');
    $('#statOthers').textContent = typeCount('Others');
    $('#statHD').textContent = active.filter((p) => p.modality === 'HD' || p.modality === 'HDF').length;
    $('#statUrr').textContent = active.filter((p) => {
      const data = currentData(p);
      const v = labCanonical('urr', data.urr, data.urrUnit || '%');
      return v !== null && v < 65;
    }).length;
    $('#statP').textContent = active.filter((p) => {
      const data = currentData(p);
      const v = labCanonical('po4', data.po4, data.po4Unit || 'mg/dL');
      return v !== null && v > 1.78;
    }).length;
  }

  function patientCard(p) {
    const cur = currentData(p);
    const status = statusOf(p);
    const age = ageOf(p);
    const meta = [age ? age + ' y/o' : '', p.sex, unitDisplay(p)]
      .filter(Boolean).join(' · ');
    const chips = [
      cur.month ? `<span class="chip chip-month">${esc(monthLabel(cur.month))}</span>` : '',
      p.patientType ? `<span class="chip">${esc(p.patientType)}</span>` : '',
      p.modality ? `<span class="chip">${esc(p.modality)}</span>` : '',
      accessText(p) ? `<span class="chip">${esc(accessText(p))}</span>` : '',
      dialyzerText(p) ? `<span class="chip">${esc(dialyzerText(p))}</span>` : '',
      cur.complications && cur.complications.length ? `<span class="chip">${cur.complications.length} complication${cur.complications.length > 1 ? 's' : ''}</span>` : ''
    ].filter(Boolean).join('');

    const hbFlag = labFlag('hb', cur.hb, cur.hbUnit || 'g/L');
    const po4Flag = labFlag('po4', cur.po4, cur.po4Unit || 'mg/dL');
    const urrFlag = labFlag('urr', cur.urr, cur.urrUnit || '%');
    const urrCanon = labCanonical('urr', cur.urr, cur.urrUnit || '%');
    const statusBadge = status !== 'Active'
      ? `<span class="status-badge ${statusClass(p)}">${esc(status)}</span>` : '';

    return `
      <article class="patient-card ${status !== 'Active' ? 'is-inactive' : ''}" role="button" tabindex="0" data-id="${esc(p.id)}" aria-label="Open record for ${esc(p.name)}">
        <div class="pc-head">
          <span class="pc-avatar" aria-hidden="true">${esc(initials(p.name))}</span>
          <div>
            <h3>${esc(p.name)}</h3>
            <p class="pc-meta">${meta ? esc(meta) : 'No demographic details'} ${statusBadge}</p>
          </div>
          <div class="pc-actions">
            <button class="pc-delete" type="button" data-delete-patient="${esc(p.id)}" aria-label="Delete record for ${esc(p.name)}" title="Delete record"><svg><use href="#r-trash"/></svg></button>
            <span class="pc-open">Open</span>
          </div>
        </div>
        ${chips ? `<div class="chip-row pc-chips">${chips}</div>` : ''}
        <div class="pc-stats">
          <div><span>Dry wt</span><strong>${(cur.dryWeight || p.dryWeight) ? esc(cur.dryWeight || p.dryWeight) + ' kg' : '—'}</strong></div>
          <div><span>Hb</span><strong class="${hbFlag ? 'low' : ''}">${cur.hb ? esc(cur.hb) + ' <span class="pc-unit">' + esc(cur.hbUnit || 'g/L') + '</span>' : '—'}</strong></div>
          <div><span>PO₄</span><strong class="${po4Flag ? 'high' : ''}">${cur.po4 ? esc(cur.po4) + ' <span class="pc-unit">' + esc(cur.po4Unit || 'mg/dL') + '</span>' : '—'}</strong></div>
          <div><span>URR</span><strong class="${urrFlag ? 'low' : ''}">${urrCanon !== null ? fmtNum(urrCanon, 1) + '%' : '—'}</strong></div>
        </div>
        <p class="pc-foot">Updated ${fmtDate(p.updatedAt) || '—'}${cur.month ? ' · Latest ' + esc(monthLabel(cur.month)) : ''}</p>
      </article>`;
  }

  function render() {
    renderStats();
    const list = filteredPatients();
    const grid = $('#patientList');
    const empty = $('#emptyState');

    if (!state.patients.length) {
      grid.hidden = true;
      grid.innerHTML = '';
      empty.hidden = false;
      $('#recCount').textContent = '';
      return;
    }

    empty.hidden = true;
    grid.hidden = false;
    grid.innerHTML = list.length
      ? list.map(patientCard).join('')
      : '<p class="no-results">No patients match your search.</p>';
    if (state.user && state.user.role === 'viewer') {
      grid.querySelectorAll('[data-delete-patient]').forEach((button) => { button.hidden = true; });
    }
    $('#recCount').textContent = list.length === state.patients.length
      ? state.patients.length + (state.patients.length === 1 ? ' patient' : ' patients')
      : list.length + ' of ' + state.patients.length + ' shown';
  }

  /* ------------------------------------------------------------
     Detail view
     ------------------------------------------------------------ */
  function dRow(label, value) {
    return `<div class="d-row"><dt>${esc(label)}</dt><dd>${value || '—'}</dd></div>`;
  }

  function complicationMeta(c) {
    return [c.date ? fmtDateOnly(c.date) : '', c.time, c.nurse ? 'Nurse: ' + c.nurse : '']
      .filter(Boolean).join(' · ');
  }

  function complicationItem(c, index, removeType) {
    const meta = complicationMeta(c);
    const remove = removeType
      ? `<button class="comp-remove" type="button" data-${removeType}="${index}" aria-label="Remove ${esc(c.name)}">×</button>`
      : '';
    return `<div class="comp-entry">
      <div class="comp-entry-head">
        <strong>${esc(c.name)}</strong>
        ${meta ? `<span class="comp-meta">${esc(meta)}</span>` : ''}
        ${remove}
      </div>
      ${c.management ? `<p class="comp-mgmt"><span>Management:</span> ${esc(c.management)}</p>` : ''}
    </div>`;
  }

  function complicationList(list) {
    if (!Array.isArray(list) || !list.length) return '—';
    return `<div class="comp-list">${list.map((c) => complicationItem(c, -1, null)).join('')}</div>`;
  }

  function statusBanner(p) {
    const status = statusOf(p);
    if (status === 'Active') return '';
    return `<div class="status-banner ${statusClass(p)}">
      <span class="status-badge ${statusClass(p)}">${esc(status)}</span>
      ${p.statusDate ? `<span class="status-when">${esc(fmtDateOnly(p.statusDate))}</span>` : ''}
      ${p.statusFacility ? `<span class="status-where">Transferred to ${esc(p.statusFacility)}</span>` : ''}
      ${p.statusNote ? `<p>${esc(p.statusNote)}</p>` : ''}
    </div>`;
  }

  function monthSummary(m) {
    const bits = [];
    if (m.hb) bits.push('Hb ' + m.hb + ' ' + (m.hbUnit || 'g/L'));
    if (m.po4) bits.push('PO₄ ' + m.po4 + ' ' + (m.po4Unit || 'mg/dL'));
    const urr = labCanonical('urr', m.urr, m.urrUnit || '%');
    if (urr !== null) bits.push('URR ' + fmtNum(urr, 1) + '%');
    return bits.join(' · ');
  }

  function monthBlock(m) {
    return `<details class="month-item">
      <summary>
        <span class="month-name">${esc(monthLabel(m.month))}</span>
        <span class="month-key">${esc(monthSummary(m))}</span>
        <span class="month-date">${esc(fmtDateOnly(m.date) || '')}</span>
      </summary>
      <div class="month-body">
        <div class="month-cols">
          <div>
            <h4>Measurements</h4>
            <dl>
              ${dRow('Pre-HD weight', m.preWeight ? esc(m.preWeight) + ' kg' : '—')}
              ${dRow('Post-HD weight', m.postWeight ? esc(m.postWeight) + ' kg' : '—')}
              ${dRow('IDWG %', idwgDisplay(m))}
              ${dRow('Blood pressure', plain(m.bp))}
              ${dRow('Heart rate', m.hr ? esc(m.hr) + ' bpm' : '—')}
              ${dRow('Dry weight', m.dryWeight ? esc(m.dryWeight) + ' kg' : '—')}
              ${dRow('UF goal', m.ufGoal ? esc(m.ufGoal) + ' L' : '—')}
            </dl>
          </div>
          <div>
            <h4>Laboratories</h4>
            <dl>
              ${dRow('Hemoglobin', labDisplay('hb', m.hb, m.hbUnit || 'g/L'))}
              ${dRow('Calcium', labDisplay('ca', m.ca, m.caUnit || 'mg/dL'))}
              ${dRow('Phosphorus', labDisplay('po4', m.po4, m.po4Unit || 'mg/dL'))}
              ${dRow('Albumin', labDisplay('alb', m.alb, m.albUnit || 'g/L'))}
              ${dRow('URR', labDisplay('urr', m.urr, m.urrUnit || '%'))}
              ${dRow('Kt/V', m.ktv ? esc(m.ktv) : '—')}
              ${dRow('Pre-BUN', m.preBun ? esc(m.preBun) + ' mg/dL' : '—')}
              ${dRow('Post-BUN', m.postBun ? esc(m.postBun) + ' mg/dL' : '—')}
              ${dRow('Potassium', m.k ? esc(m.k) + ' mmol/L' : '—')}
              ${dRow('PTH', m.pth ? esc(m.pth) + ' pg/mL' : '—')}
            </dl>
          </div>
        </div>
        <div class="month-cols">
          <div>
            <h4>Orders</h4>
            <dl>
              ${dRow('Epoetin', plain(m.epoetin))}
              ${dRow('IV iron', plain(m.iron))}
              ${dRow('Transfusion', plain(m.transfusion))}
            </dl>
          </div>
          <div>
            <h4>Complications</h4>
            <div class="comp-chips">${complicationList(m.complications)}</div>
            ${m.notes ? `<p class="month-notes">${esc(m.notes)}</p>` : ''}
          </div>
        </div>
        ${(() => {
          const daily = [
            m.preWeightDaily ? 'Pre ' + m.preWeightDaily : '',
            m.postWeightDaily ? 'Post ' + m.postWeightDaily : '',
            m.ufGoalDaily ? 'UF ' + m.ufGoalDaily : '',
            m.ktvDaily ? 'Kt/V ' + m.ktvDaily : ''
          ].filter(Boolean).join(' · ');
          return daily ? '<p class="month-daily"><strong>Daily values:</strong> ' + esc(daily) + '</p>' : '';
        })()}
        <div class="month-actions">
          <button class="link-btn" type="button" data-edit-month="${esc(m.id)}">Edit month</button>
          <button class="link-btn danger" type="button" data-delete-month="${esc(m.id)}">Delete</button>
        </div>
      </div>
    </details>`;
  }

  function compiledMonths(months) {
    const val = (v) => (v === '' || v == null ? '—' : esc(v));
    const lab = (key, m) => {
      const def = LABS[key];
      const unit = m[key + 'Unit'] || (def ? def.units[0] : '');
      const text = labPlain(key, m[key], unit);
      return text ? esc(text) : '—';
    };
    const comp = (m) => {
      if (!m.complications || !m.complications.length) return '—';
      return esc(m.complications.map((c) => {
        const meta = [c.date ? fmtDateOnly(c.date) : '', c.time, c.nurse ? 'Nurse: ' + c.nurse : '']
          .filter(Boolean).join(' ');
        return c.name + (meta ? ' — ' + meta : '') + (c.management ? ': ' + c.management : '');
      }).join('; '));
    };
    const idwg = (m) => {
      const value = idwgPercent(m);
      return value === null ? '—' : fmtNum(value, 1) + '%';
    };
    const average = (key) => {
      const vals = months.map((m) => parseFloat(m[key])).filter((v) => Number.isFinite(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const avgPre = average('preWeight');
    const avgPost = average('postWeight');
    const avgUf = average('ufGoal');
    const avgKtv = average('ktv');
    const averages = `<div class="monthly-averages">
      <span class="avg-title">Automatic average</span>
      <span>Pre weight <strong>${avgPre !== null ? fmtNum(avgPre, 1) + ' kg' : '—'}</strong></span>
      <span>Post weight <strong>${avgPost !== null ? fmtNum(avgPost, 1) + ' kg' : '—'}</strong></span>
      <span>UF goal <strong>${avgUf !== null ? avgUf.toFixed(2) + ' L' : '—'}</strong></span>
      <span>Kt/V <strong>${avgKtv !== null ? avgKtv.toFixed(2) : '—'}</strong></span>
    </div>`;
    const measureRows = months.map((m) => `<tr>
      <td>${esc(monthLabel(m.month))}</td>
      <td>${esc([m.preWeight, m.postWeight].filter(Boolean).join(' / ') || '—')}</td>
      <td>${val(m.bp)}</td>
      <td>${val(m.hr)}</td>
      <td>${val(m.dryWeight)}</td>
      <td>${val(m.ufGoal)}</td>
      <td>${idwg(m)}</td>
      <td>${lab('hb', m)}</td>
      <td>${lab('ca', m)}</td>
      <td>${lab('po4', m)}</td>
      <td>${lab('alb', m)}</td>
      <td>${lab('urr', m)}</td>
      <td>${val(m.ktv)}</td>
      <td>${val(m.preBun)}</td>
      <td>${val(m.postBun)}</td>
      <td>${val(m.k)}</td>
      <td>${val(m.pth)}</td>
    </tr>`).join('');
    const orderRows = months.map((m) => `<tr>
      <td>${esc(monthLabel(m.month))}</td>
      <td class="wrap">${val(m.epoetin)}</td>
      <td class="wrap">${val(m.iron)}</td>
      <td class="wrap">${val(m.transfusion)}</td>
      <td class="wrap">${comp(m)}</td>
      <td class="wrap">${val(m.notes)}</td>
    </tr>`).join('');
    return `<details class="compiled-months" open>
      <summary>Compiled monthly data <span>· ${months.length} ${months.length === 1 ? 'month' : 'months'}</span></summary>
      ${averages}
      <h4>Measurements and laboratories</h4>
      <div class="monthly-table-wrap">
        <table class="month-table">
          <thead><tr><th>Month</th><th>Pre / post wt (kg)</th><th>BP</th><th>HR (bpm)</th><th>Dry wt (kg)</th><th>UF goal (L)</th><th>IDWG %</th><th>Hb</th><th>Ca</th><th>PO₄</th><th>Alb</th><th>URR</th><th>Kt/V</th><th>Pre-BUN (mg/dL)</th><th>Post-BUN (mg/dL)</th><th>K (mmol/L)</th><th>PTH (pg/mL)</th></tr></thead>
          <tbody>${measureRows}</tbody>
        </table>
      </div>
      <h4>Orders, complications and notes</h4>
      <div class="monthly-table-wrap">
        <table class="month-table">
          <thead><tr><th>Month</th><th>Epoetin</th><th>IV iron</th><th>Transfusion</th><th>Complications</th><th>Notes</th></tr></thead>
          <tbody>${orderRows}</tbody>
        </table>
      </div>
    </details>`;
  }

  function parseAverageValues(text) {
    return String(text || '').split(/[\s,;]+/).map((v) => parseFloat(v)).filter((v) => Number.isFinite(v));
  }

  function meanOf(values) {
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  const BASE_AVG_FIELDS = {
    pre: ['pPre', 'pPreAvg', 1, ' kg'],
    post: ['pPost', 'pPostAvg', 1, ' kg'],
    uf: ['pUf', 'pUfAvg', 2, ' L'],
    ktv: ['pKtv', 'pKtvAvg', 2, '']
  };

  function updateBaselineAverage(key) {
    const def = BASE_AVG_FIELDS[key];
    if (!def) return;
    const input = document.getElementById(def[0]);
    const result = document.getElementById(def[1]);
    if (!input || !result) return;
    const mean = meanOf(parseAverageValues(input.value));
    if (mean === null) {
      result.textContent = '—';
    } else {
      result.textContent = (def[2] === 2 ? mean.toFixed(2) : mean.toFixed(1)) + def[3];
    }
    if (key === 'pre' || key === 'post') updateIdwg('p');
  }

  const AVG_FIELDS = {
    pre: ['mPre', 'mPreAvg', 1, ' kg'],
    post: ['mPost', 'mPostAvg', 1, ' kg'],
    uf: ['mUf', 'mUfAvg', 2, ' L'],
    ktv: ['mKtv', 'mKtvAvg', 2, '']
  };

  function updateFieldAverage(key) {
    const def = AVG_FIELDS[key];
    if (!def) return;
    const input = document.getElementById(def[0]);
    const result = document.getElementById(def[1]);
    if (!input || !result) return;
    const mean = meanOf(parseAverageValues(input.value));
    if (mean === null) {
      result.textContent = '—';
      return;
    }
    result.textContent = (def[2] === 2 ? mean.toFixed(2) : mean.toFixed(1)) + def[3];
  }

  function monthlyBlock(p) {
    const months = Array.isArray(p.months) ? p.months.slice() : [];
    months.sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')));
    return `<section class="detail-block wide monthly-block">
      <div class="monthly-head">
        <h3>Monthly monitoring</h3>
        <div class="monthly-actions">
          <button class="btn btn-primary btn-small" type="button" data-add-month>
            <svg class="ic"><use href="#r-plus"/></svg>Add monthly data
          </button>
        </div>
      </div>
      ${months.length
        ? compiledMonths(months) + '<p class="muted-note month-detail-note">Open a month for full details, edit, or delete.</p>' + months.map(monthBlock).join('')
        : '<p class="muted-note">No monthly entries yet. Add one to track weights, labs, orders, and complications every month.</p>'}
    </section>`;
  }

  function renderDetail(id) {
    const p = state.patients.find((item) => item.id === id);
    if (!p) return;
    const cur = currentData(p);
    const age = ageOf(p);

    const meta = [age ? age + ' y/o' : '', p.sex, p.modality, unitDisplay(p)]
      .filter(Boolean).join(' · ');
    $('#detailMeta').textContent = meta || 'Patient record';
    $('#detailTitle').textContent = p.name || 'Patient';

    const currentTag = cur.month ? `<span class="section-tag">${esc(monthLabel(cur.month))}</span>` : '';

    $('#detailBody').innerHTML = `
      ${statusBanner(p)}
      <div class="detail-grid">
        <section class="detail-block">
          <h3>Patient</h3>
          <dl>
            ${dRow('Birthday', plain(fmtDateOnly(p.birthday)))}
            ${dRow('Age', age ? esc(age) : '—')}
            ${dRow('Sex', plain(p.sex))}
            ${dRow('Type', plain(p.patientType))}
            ${dRow('Contact', plain(p.contact))}
            ${dRow('PhilHealth', plain(p.philhealth))}
            ${dRow('Unit', plain(p.unit))}
            ${dRow('Nephrologist', plain(p.nephrologist))}
            ${dRow('Address', plain(p.address))}
          </dl>
        </section>
        <section class="detail-block">
          <h3>HD prescription</h3>
          <dl>
            ${dRow('Modality', plain(p.modality))}
            ${dRow('Schedule', plain(p.schedule))}
            ${dRow('Access', plain(accessText(p)))}
            ${dRow('Dialyzer', plain(dialyzerText(p)))}
            ${dRow('Dry weight', (cur.dryWeight || p.dryWeight) ? esc(cur.dryWeight || p.dryWeight) + ' kg' : '—')}
            ${dRow('UF goal', (cur.ufGoal || p.ufGoal) ? esc(cur.ufGoal || p.ufGoal) + ' L' : '—')}
          </dl>
        </section>
        <section class="detail-block">
          <h3>Current measurements ${currentTag}</h3>
          <dl>
            ${dRow('Pre-HD weight', cur.preWeight ? esc(cur.preWeight) + ' kg' : '—')}
            ${dRow('Post-HD weight', cur.postWeight ? esc(cur.postWeight) + ' kg' : '—')}
            ${dRow('IDWG %', idwgDisplay(cur))}
            ${dRow('Blood pressure', plain(cur.bp))}
            ${dRow('Heart rate', cur.hr ? esc(cur.hr) + ' bpm' : '—')}
            ${dRow('Updated', plain(fmtDate(p.updatedAt)))}
          </dl>
        </section>
        <section class="detail-block">
          <h3>Laboratories ${currentTag}</h3>
          <dl>
            ${dRow('Hemoglobin', labDisplay('hb', cur.hb, cur.hbUnit || 'g/L'))}
            ${dRow('Calcium', labDisplay('ca', cur.ca, cur.caUnit || 'mg/dL'))}
            ${dRow('Phosphorus', labDisplay('po4', cur.po4, cur.po4Unit || 'mg/dL'))}
            ${dRow('Albumin', labDisplay('alb', cur.alb, cur.albUnit || 'g/L'))}
            ${dRow('URR', labDisplay('urr', cur.urr, cur.urrUnit || '%'))}
            ${dRow('Kt/V', cur.ktv ? esc(cur.ktv) : '—')}
            ${dRow('Pre-BUN', cur.preBun ? esc(cur.preBun) + ' mg/dL' : '—')}
            ${dRow('Post-BUN', cur.postBun ? esc(cur.postBun) + ' mg/dL' : '—')}
            ${dRow('Potassium', cur.k ? esc(cur.k) + ' mmol/L' : '—')}
            ${dRow('PTH', cur.pth ? esc(cur.pth) + ' pg/mL' : '—')}
          </dl>
        </section>
        <section class="detail-block">
          <h3>Orders ${currentTag}</h3>
          <dl>
            ${dRow('Epoetin', plain(cur.epoetin))}
            ${dRow('IV iron', plain(cur.iron))}
            ${dRow('Transfusion', plain(cur.transfusion))}
          </dl>
        </section>
        <section class="detail-block">
          <h3>Complications ${currentTag}</h3>
          <div class="comp-chips detail-comp">${complicationList(cur.complications)}</div>
        </section>
        ${cur !== p && p.complications.length ? `<section class="detail-block">
          <h3>Baseline complications</h3>
          <div class="comp-chips detail-comp">${complicationList(p.complications)}</div>
        </section>` : ''}
        <section class="detail-block wide">
          <h3>Current medicines</h3>
          ${medicationList(p.medications)}
          ${p.meds ? `<p class="month-notes">${esc(p.meds)}</p>` : ''}
        </section>
        <section class="detail-block wide">
          <h3>Clinical notes</h3>
          <dl>
            ${dRow('Comorbidities', plain(p.comorbidities))}
            ${dRow('Allergies', plain(p.allergies))}
            ${dRow('Notes', plain(p.notes))}
          </dl>
        </section>
        ${monthlyBlock(p)}
      </div>`;

    $('#detailDialog').dataset.id = p.id;
  }

  function openDetail(id) {
    renderDetail(id);
    const dialog = $('#detailDialog');
    if (!dialog.open) dialog.showModal();
  }

  /* ------------------------------------------------------------
     Add / edit / delete
     ------------------------------------------------------------ */
  const FORM_FIELDS = [
    'name', 'birthday', 'age', 'sex', 'patientType', 'unit', 'contact', 'philhealth', 'address', 'nephrologist', 'schedule',
    'status', 'statusDate', 'statusFacility', 'statusNote',
    'modality', 'accessType', 'accessOther', 'dialyzerType', 'dialyzerOther', 'dryWeight', 'ufGoal', 'idwgBasis',
    'preWeight', 'postWeight', 'bp', 'hr',
    'hb', 'hbUnit', 'ca', 'caUnit', 'po4', 'po4Unit', 'alb', 'albUnit', 'urr', 'preBun', 'postBun', 'ktv', 'k', 'pth',
    'epoetin', 'iron', 'transfusion',
    'comorbidities', 'allergies', 'meds', 'notes'
  ];

  function readForm(form) {
    const data = {};
    FORM_FIELDS.forEach((field) => {
      const input = form.elements[field];
      data[field] = input ? String(input.value).trim() : '';
    });
    data.complications = formComplications.slice();
    data.medications = trimMedications();
    [['preWeight', 1], ['postWeight', 1], ['ufGoal', 2], ['ktv', 2]].forEach(([key, digits]) => {
      const raw = data[key];
      if (raw) data[key + 'Daily'] = raw;
      const mean = meanOf(parseAverageValues(raw));
      data[key] = mean === null ? '' : (digits === 2 ? mean.toFixed(2) : mean.toFixed(1));
    });
    return data;
  }

  function syncOtherFields() {
    const access = $('#pAccess').value;
    $('#accessOtherWrap').hidden = access !== 'Other';
    const dialyzer = $('#pDialyzer').value;
    $('#dialyzerOtherWrap').hidden = dialyzer !== 'Other / not listed';
  }

  function syncStatusFields() {
    const status = $('#pStatus').value;
    $('#statusDateWrap').hidden = status === 'Active';
    $('#statusFacilityWrap').hidden = status !== 'Transferred';
    $('#statusNoteWrap').hidden = status === 'Active';
    $('#statusDateLabel').textContent = status === 'Deceased' ? 'Date of death' : 'Date of transfer';
    if (status === 'Active') {
      $('#pStatusDate').value = '';
      $('#pStatusFacility').value = '';
      $('#pStatusNote').value = '';
    } else if (status === 'Deceased') {
      $('#pStatusFacility').value = '';
    }
  }

  function renderComplicationChips() {
    const wrap = $('#complicationChips');
    if (!formComplications.length) {
      wrap.innerHTML = '<span class="muted-note">No complications added.</span>';
      return;
    }
    wrap.innerHTML = formComplications
      .map((item, index) => complicationItem(item, index, 'remove-comp')).join('');
  }

  function resetComplicationInputs() {
    $('#pCompDate').value = localDateISO();
    $('#pCompTime').value = currentTime();
    $('#pCompNurse').value = '';
    $('#pCompManagement').value = '';
  }

  function openAdd() {
    state.editingId = null;
    const form = $('#patientForm');
    form.reset();
    formComplications = [];
    formMedications = [];
    renderComplicationChips();
    renderMedications();
    resetComplicationInputs();
    syncOtherFields();
    syncStatusFields();
    syncLabHints('');
    updateIdwg('p');
    ['pre', 'post', 'uf', 'ktv'].forEach(updateBaselineAverage);
    $('#patientError').textContent = '';
    $('#patientDialogTitle').textContent = 'Add patient';
    $('#savePatient').textContent = 'Save patient';
    $('#patientDialog').showModal();
    setTimeout(() => $('#pName').focus(), 60);
  }

  function openEdit(id) {
    const p = state.patients.find((item) => item.id === id);
    if (!p) return;
    const form = $('#patientForm');
    form.reset();
    FORM_FIELDS.forEach((field) => {
      if (form.elements[field]) form.elements[field].value = p[field] == null ? '' : p[field];
    });
    ['preWeight', 'postWeight', 'ufGoal', 'ktv'].forEach((key) => {
      if (p[key + 'Daily'] && form.elements[key]) form.elements[key].value = p[key + 'Daily'];
    });
    formComplications = (p.complications || []).slice();
    formMedications = (p.medications || []).map((m) => Object.assign({}, m));
    renderComplicationChips();
    renderMedications();
    resetComplicationInputs();
    syncOtherFields();
    syncStatusFields();
    syncLabHints('');
    updateIdwg('p');
    ['pre', 'post', 'uf', 'ktv'].forEach(updateBaselineAverage);
    state.editingId = id;
    $('#patientError').textContent = '';
    $('#patientDialogTitle').textContent = 'Edit patient';
    $('#savePatient').textContent = 'Save changes';
    $('#patientDialog').showModal();
    setTimeout(() => $('#pName').focus(), 60);
  }

  function renderMedications() {
    const wrap = $('#medRows');
    if (!wrap) return;
    if (!formMedications.length) {
      formMedications.push({ id: uid(), name: '', dose: '', frequency: '' });
    }
    wrap.innerHTML = formMedications.map((m, index) =>
      `<div class="med-row">
        <div class="med-cell" data-label="Medicine"><input data-med-index="${index}" data-med-field="name" value="${esc(m.name)}" placeholder="e.g., Amlodipine" autocomplete="off" aria-label="Medicine ${index + 1}"></div>
        <div class="med-cell" data-label="Dosage"><input data-med-index="${index}" data-med-field="dose" value="${esc(m.dose)}" placeholder="e.g., 5 mg" autocomplete="off" aria-label="Dosage ${index + 1}"></div>
        <div class="med-cell" data-label="Frequency"><input data-med-index="${index}" data-med-field="frequency" value="${esc(m.frequency)}" placeholder="e.g., once daily" autocomplete="off" aria-label="Frequency ${index + 1}"></div>
        <button class="med-row-remove" type="button" data-remove-med="${index}" aria-label="Remove medicine ${index + 1}">×</button>
      </div>`
    ).join('');
  }

  function trimMedications() {
    const cleaned = formMedications.map((m) => ({
      id: m.id || uid(),
      name: String(m.name || '').trim(),
      dose: String(m.dose || '').trim(),
      frequency: String(m.frequency || '').trim()
    })).filter((m) => m.name || m.dose || m.frequency);
    return cleaned;
  }

  function medicationList(list) {
    if (!Array.isArray(list) || !list.length) return '<p class="muted-note">No medicines added.</p>';
    return `<div class="med-view">${list.map((m) =>
      `<div class="med-view-item"><strong>${esc(m.name)}</strong><span>${esc([m.dose, m.frequency].filter(Boolean).join(' · '))}</span></div>`
    ).join('')}</div>`;
  }

  let pendingDelete = null;

  function requirePassword(options) {
    if (state.unitToken) {
      if (window.confirm((options.message || 'Confirm deletion') + '\n\nThis cannot be undone.')) {
        const action = options.onConfirm;
        if (action) action();
      }
      return;
    }
    pendingDelete = options.onConfirm;
    $('#deleteAuthTitle').textContent = options.title || 'Confirm deletion';
    $('#deleteAuthMessage').textContent = options.message || 'Retype your password to continue.';
    $('#deleteAuthConfirm').textContent = options.confirmLabel || 'Delete';
    $('#deleteAuthError').textContent = '';
    $('#deletePw').value = '';
    const dialog = $('#deleteAuthDialog');
    if (dialog.open) dialog.close();
    dialog.showModal();
    setTimeout(() => $('#deletePw').focus(), 60);
  }

  function deletePatient(id) {
    const p = state.patients.find((item) => item.id === id);
    if (!p) return;
    requirePassword({
      title: 'Delete patient record',
      message: 'Retype your password to delete the record for ' + (p.name || 'this patient') + '. This cannot be undone.',
      onConfirm: () => performDeletePatient(id)
    });
  }

  async function performDeletePatient(id) {
    state.patients = state.patients.filter((item) => item.id !== id);
    try {
      await persist();
    } catch (err) {
      toast('Could not save the change. Browser storage may be full.');
      return;
    }
    $('#detailDialog').close();
    render();
    toast('Patient record deleted.');
  }

  /* ------------------------------------------------------------
     Monthly data
     ------------------------------------------------------------ */
  const MONTH_FIELDS = [
    'month', 'date', 'preWeight', 'postWeight', 'bp', 'hr', 'dryWeight', 'ufGoal', 'idwgBasis',
    'hb', 'hbUnit', 'ca', 'caUnit', 'po4', 'po4Unit', 'alb', 'albUnit', 'urr', 'preBun', 'postBun', 'ktv', 'k', 'pth',
    'epoetin', 'iron', 'transfusion', 'notes'
  ];

  function localDateISO() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function currentTime() {
    const now = new Date();
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }

  function idwgPercent(data) {
    const pre = meanOf(parseAverageValues(data.preWeight));
    const post = meanOf(parseAverageValues(data.postWeight));
    const basis = data.idwgBasis === 'post' ? post : num(data.dryWeight);
    if (pre === null || post === null || basis === null || basis <= 0) return null;
    return ((pre - post) / basis) * 100;
  }

  function idwgDisplay(data) {
    const value = idwgPercent(data);
    if (value === null) return '—';
    const basis = data.idwgBasis === 'post' ? 'post weight' : 'dry weight';
    return fmtNum(value, 1) + '% (' + basis + ')';
  }

  function updateIdwg(prefix) {
    const p = prefix === 'm' ? 'm' : 'p';
    const preEl = document.getElementById(p + 'Pre');
    const postEl = document.getElementById(p + 'Post');
    const dryEl = document.getElementById(p + 'Dry');
    const basisEl = document.getElementById(p + 'IdwgBasis');
    const valueEl = document.getElementById(p + 'IdwgValue');
    const hintEl = document.getElementById(p + 'IdwgHint');
    if (!preEl || !postEl || !dryEl || !basisEl || !valueEl || !hintEl) return;
    const value = idwgPercent({
      preWeight: preEl.value,
      postWeight: postEl.value,
      dryWeight: dryEl.value,
      idwgBasis: basisEl.value
    });
    valueEl.textContent = value === null ? '—' : fmtNum(value, 1) + '%';
    const basis = basisEl.value === 'post' ? 'post-dialysis weight' : 'dry weight';
    hintEl.textContent = '(pre − post) ÷ ' + basis + ' × 100';
  }

  function calculateUrr(prefix) {
    const p = prefix === 'm' ? 'm' : 'p';
    const preEl = document.getElementById(p + 'PreBun');
    const postEl = document.getElementById(p + 'PostBun');
    const urrEl = document.getElementById(p + 'Urr');
    const hint = document.getElementById(p + 'UrrHint');
    if (!preEl || !postEl || !urrEl || !hint) return;
    const pre = parseFloat(preEl.value);
    const post = parseFloat(postEl.value);
    if (!Number.isFinite(pre) || pre <= 0) {
      hint.textContent = 'Enter a valid pre-dialysis BUN.';
      return;
    }
    if (!Number.isFinite(post) || post < 0) {
      hint.textContent = 'Enter a valid post-dialysis BUN.';
      return;
    }
    if (post > pre) {
      hint.textContent = 'Post-BUN cannot be higher than pre-BUN.';
      return;
    }
    const urr = ((pre - post) / pre) * 100;
    urrEl.value = urr.toFixed(1);
    hint.textContent = 'URR = (' + pre + ' − ' + post + ') ÷ ' + pre + ' × 100 = ' + urr.toFixed(1) + '%';
    urrEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function readMonthForm(form) {
    const data = {};
    MONTH_FIELDS.forEach((field) => {
      const input = form.elements[field];
      data[field] = input ? String(input.value).trim() : '';
    });
    data.complications = monthComplications.slice();
    [['preWeight', 1], ['postWeight', 1], ['ufGoal', 2], ['ktv', 2]].forEach(([key, digits]) => {
      const raw = data[key];
      if (raw) data[key + 'Daily'] = raw;
      const mean = meanOf(parseAverageValues(raw));
      data[key] = mean === null ? '' : (digits === 2 ? mean.toFixed(2) : mean.toFixed(1));
    });
    return data;
  }

  function renderMonthComplications() {
    const wrap = $('#monthCompChips');
    if (!monthComplications.length) {
      wrap.innerHTML = '<span class="muted-note">No complications added.</span>';
      return;
    }
    wrap.innerHTML = monthComplications
      .map((item, index) => complicationItem(item, index, 'remove-mcomp')).join('');
  }

  function openMonthDialog(patientId, monthId) {
    const p = state.patients.find((item) => item.id === patientId);
    if (!p) return;
    const month = monthId ? (p.months || []).find((item) => item.id === monthId) : null;
    const form = $('#monthForm');
    form.reset();
    monthComplications = month ? (month.complications || []).slice() : [];
    renderMonthComplications();

    if (month) {
      MONTH_FIELDS.forEach((field) => {
        if (form.elements[field]) form.elements[field].value = month[field] == null ? '' : month[field];
      });
      ['preWeight', 'postWeight', 'ufGoal', 'ktv'].forEach((key) => {
        if (month[key + 'Daily'] && form.elements[key]) form.elements[key].value = month[key + 'Daily'];
      });
      state.editingMonthId = month.id;
      $('#monthDialogTitle').textContent = 'Edit ' + (monthLabel(month.month) || 'monthly') + ' data';
    } else {
      MONTH_FIELDS.forEach((field) => {
        if (form.elements[field]) form.elements[field].value = '';
      });
      form.elements.month.value = localDateISO().slice(0, 7);
      form.elements.date.value = localDateISO();
      state.editingMonthId = null;
      $('#monthDialogTitle').textContent = 'Add monthly data';
    }

    $('#monthError').textContent = '';
    $('#mCompDate').value = form.elements.date.value || localDateISO();
    $('#mCompTime').value = currentTime();
    $('#mCompNurse').value = '';
    $('#mCompManagement').value = '';
    syncLabHints('m');
    updateIdwg('m');
    ['pre', 'post', 'uf', 'ktv'].forEach(updateFieldAverage);
    const dialog = $('#monthDialog');
    dialog.dataset.patient = p.id;
    dialog.showModal();
    setTimeout(() => $('#mMonth').focus(), 60);
  }

  function deleteMonth(patientId, monthId) {
    const p = state.patients.find((item) => item.id === patientId);
    if (!p) return;
    const month = (p.months || []).find((item) => item.id === monthId);
    if (!month) return;
    requirePassword({
      title: 'Delete monthly entry',
      message: 'Retype your password to delete the ' + (monthLabel(month.month) || 'monthly') + ' entry. This cannot be undone.',
      onConfirm: () => performDeleteMonth(patientId, monthId)
    });
  }

  async function performDeleteMonth(patientId, monthId) {
    const p = state.patients.find((item) => item.id === patientId);
    if (!p) return;
    p.months = p.months.filter((item) => item.id !== monthId);
    p.updatedAt = new Date().toISOString();
    try {
      await persist();
    } catch (err) {
      toast('Could not save the change. Browser storage may be full.');
      return;
    }
    render();
    renderDetail(p.id);
    toast('Monthly entry deleted.');
  }

  /* ------------------------------------------------------------
     Printing
     ------------------------------------------------------------ */
  function printNow() {
    document.body.classList.add('rec-print');
    window.print();
    setTimeout(() => document.body.classList.remove('rec-print'), 400);
  }

  function printHeader(title, meta) {
    const now = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    return `<div class="pr-head">
      <div><h1>Dialysis Companion</h1><p>HD patient record · Private</p></div>
      <div><p>Printed ${esc(now)}</p></div>
    </div>
    <h2 class="pr-title">${esc(title)}</h2>
    <p class="pr-meta">${esc(meta || '')}</p>`;
  }

  function printSection(title, rows) {
    return `<section class="pr-section"><h2>${esc(title)}</h2>
      <table class="pr-table">${rows.map((row) =>
        `<tr><th>${esc(row[0])}</th><td>${row[1] === '' || row[1] == null ? '—' : esc(row[1])}</td></tr>`
      ).join('')}</table></section>`;
  }

  function printComplicationLog(p) {
    const rows = [];
    (p.complications || []).forEach((c) => rows.push(['Baseline', c]));
    (p.months || []).slice()
      .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))
      .forEach((m) => (m.complications || []).forEach((c) => rows.push([monthLabel(m.month), c])));
    if (!rows.length) return printSection('Complication log', [['Complications', '—']]);
    const body = rows.map(([month, c]) => `<tr>
      <td>${esc(month)}</td>
      <td>${esc(c.name)}</td>
      <td>${esc(fmtDateOnly(c.date))}</td>
      <td>${esc(c.time)}</td>
      <td>${esc(c.nurse)}</td>
      <td>${esc(c.management)}</td>
    </tr>`).join('');
    return `<section class="pr-section"><h2>Complication log</h2>
      <table class="pr-list">
        <thead><tr><th>Month</th><th>Complication</th><th>Date</th><th>Time</th><th>Nurse in charge</th><th>Management</th></tr></thead>
        <tbody>${body}</tbody>
      </table></section>`;
  }

  function printPatient(id) {
    const p = state.patients.find((item) => item.id === id);
    if (!p) return;
    const cur = currentData(p);
    const age = ageOf(p);
    const meta = [age ? age + ' y/o' : '', p.sex, p.modality, unitDisplay(p), statusOf(p)].filter(Boolean).join(' · ');
    const monthRows = (p.months || []).slice()
      .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))
      .map((m) => {
        const urr = labCanonical('urr', m.urr, m.urrUnit || '%');
        return `<tr>
          <td>${esc(monthLabel(m.month))}</td>
          <td>${esc([m.preWeight, m.postWeight].filter(Boolean).join(' / '))}</td>
          <td>${esc(idwgDisplay(m))}</td>
          <td>${esc(m.bp || '')}</td>
          <td>${esc(m.hb ? m.hb + ' ' + (m.hbUnit || 'g/L') : '')}</td>
          <td>${esc(m.ca ? m.ca + ' ' + (m.caUnit || 'mg/dL') : '')}</td>
          <td>${esc(m.po4 ? m.po4 + ' ' + (m.po4Unit || 'mg/dL') : '')}</td>
          <td>${esc(m.alb ? m.alb + ' ' + (m.albUnit || 'g/L') : '')}</td>
          <td>${urr !== null ? fmtNum(urr, 1) + '%' : ''}</td>
          <td>${esc(m.ktv || '')}</td>
          <td>${esc(m.k || '')}</td>
        </tr>`;
      }).join('');

    $('#printRecord').innerHTML = `
      ${printHeader(p.name, meta)}
      ${printSection('Patient', [
        ['Birthday', fmtDateOnly(p.birthday)], ['Age', age], ['Sex', p.sex], ['Type', p.patientType], ['Contact', p.contact],
        ['PhilHealth', p.philhealth], ['Unit', p.unit], ['Nephrologist', p.nephrologist], ['Address', p.address],
        ['Status', statusOf(p)], ['Status date', fmtDateOnly(p.statusDate)],
        ['Transferred to', p.statusFacility], ['Status notes', p.statusNote]
      ])}
      ${printSection('HD prescription', [
        ['Modality', p.modality], ['Schedule', p.schedule], ['Access', accessText(p)],
        ['Dialyzer', dialyzerText(p)],
        ['Dry weight', (cur.dryWeight || p.dryWeight) ? (cur.dryWeight || p.dryWeight) + ' kg' : ''],
        ['UF goal', (cur.ufGoal || p.ufGoal) ? (cur.ufGoal || p.ufGoal) + ' L' : '']
      ])}
      ${printSection('Current values' + (cur.month ? ' — ' + monthLabel(cur.month) : ''), [
        ['Pre-HD weight', cur.preWeight ? cur.preWeight + ' kg' : ''],
        ['Post-HD weight', cur.postWeight ? cur.postWeight + ' kg' : ''],
        ['IDWG %', idwgDisplay(cur)],
        ['Blood pressure', cur.bp], ['Heart rate', cur.hr ? cur.hr + ' bpm' : '']
      ])}
      ${printSection('Current laboratories' + (cur.month ? ' — ' + monthLabel(cur.month) : ''), [
        ['Hemoglobin', labPlain('hb', cur.hb, cur.hbUnit || 'g/L')],
        ['Calcium', labPlain('ca', cur.ca, cur.caUnit || 'mg/dL')],
        ['Phosphorus', labPlain('po4', cur.po4, cur.po4Unit || 'mg/dL')],
        ['Albumin', labPlain('alb', cur.alb, cur.albUnit || 'g/L')],
        ['URR', labPlain('urr', cur.urr, cur.urrUnit || '%')],
        ['Kt/V', cur.ktv || ''],
        ['Pre-BUN', cur.preBun ? cur.preBun + ' mg/dL' : ''],
        ['Post-BUN', cur.postBun ? cur.postBun + ' mg/dL' : ''],
        ['Potassium', cur.k ? cur.k + ' mmol/L' : ''],
        ['PTH', cur.pth ? cur.pth + ' pg/mL' : '']
      ])}
      ${printSection('Current orders', [
        ['Epoetin', cur.epoetin], ['IV iron', cur.iron], ['Blood transfusion', cur.transfusion]
      ])}
      ${printComplicationLog(p)}
      ${printSection('Current medicines', (() => {
        const rows = (p.medications || []).map((m, i) => ['Medicine ' + (i + 1), [m.name, m.dose, m.frequency].filter(Boolean).join(' · ')]);
        if (p.meds) rows.push(['Other medicine notes', p.meds]);
        return rows.length ? rows : [['Medicines', '—']];
      })())}
      ${printSection('Clinical notes', [
        ['Comorbidities', p.comorbidities], ['Allergies', p.allergies], ['Notes', p.notes]
      ])}
      ${(p.months || []).length ? printSection('Monthly averages', (() => {
        const months = (p.months || []);
        const avg = (key) => {
          const vals = months.map((m) => parseFloat(m[key])).filter((v) => Number.isFinite(v));
          return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        };
        const pre = avg('preWeight'), post = avg('postWeight'), uf = avg('ufGoal'), ktv = avg('ktv');
        return [
          ['Pre weight', pre !== null ? fmtNum(pre, 1) + ' kg' : ''],
          ['Post weight', post !== null ? fmtNum(post, 1) + ' kg' : ''],
          ['UF goal', uf !== null ? uf.toFixed(2) + ' L' : ''],
          ['Kt/V', ktv !== null ? ktv.toFixed(2) : '']
        ];
      })()) : ''}
      ${monthRows ? `<section class="pr-section"><h2>Monthly monitoring</h2>
        <table class="pr-list">
          <thead><tr><th>Month</th><th>Pre / post wt</th><th>IDWG %</th><th>BP</th><th>Hb</th><th>Ca</th><th>PO₄</th><th>Alb</th><th>URR</th><th>Kt/V</th><th>K</th></tr></thead>
          <tbody>${monthRows}</tbody>
        </table></section>` : ''}
      <p class="pr-note">For record keeping only. Clinical decisions remain with the care team. Updated ${esc(fmtDate(p.updatedAt))}.</p>`;
    printNow();
  }

  function printList() {
    const list = filteredPatients();
    if (!list.length) {
      toast('No patient records to print.');
      return;
    }
    const rows = list.map((p) => {
      const cur = currentData(p);
      const urr = labCanonical('urr', cur.urr, cur.urrUnit || '%');
      return `<tr>
        <td>${esc(p.name)}</td>
        <td>${esc(statusOf(p))}</td>
        <td>${esc(p.patientType || '')}</td>
        <td>${esc([ageOf(p), p.sex].filter(Boolean).join(' / '))}</td>
        <td>${esc((cur.dryWeight || p.dryWeight) ? (cur.dryWeight || p.dryWeight) + ' kg' : '')}</td>
        <td>${esc(accessText(p))}</td>
        <td>${esc(cur.hb ? cur.hb + ' ' + (cur.hbUnit || 'g/L') : '')}</td>
        <td>${esc(cur.po4 ? cur.po4 + ' ' + (cur.po4Unit || 'mg/dL') : '')}</td>
        <td>${urr !== null ? fmtNum(urr, 1) + '%' : ''}</td>
        <td>${esc(fmtDate(p.updatedAt))}</td>
      </tr>`;
    }).join('');
    $('#printRecord').innerHTML = `
      ${printHeader('HD patient list', list.length + (list.length === 1 ? ' patient' : ' patients'))}
      <table class="pr-list">
        <thead><tr><th>Name</th><th>Status</th><th>Type</th><th>Age / sex</th><th>Dry wt</th><th>Access</th><th>Hb</th><th>PO₄</th><th>URR</th><th>Updated</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="pr-note">For record keeping only. Clinical decisions remain with the care team.</p>`;
    printNow();
  }

  /* ------------------------------------------------------------
     Settings, backup, restore
     ------------------------------------------------------------ */
  function downloadBackup() {
    const vault = readVault();
    if (!vault) return;
    const payload = {
      app: 'Dialysis Companion',
      type: 'hd-records-backup',
      exportedAt: new Date().toISOString(),
      vault
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dialysis-records-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Encrypted backup downloaded.');
  }

  async function restoreBackup(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const vault = parsed && parsed.vault ? parsed.vault : parsed;
      if (!vault || !vault.salt || !vault.iter || !vault.iv || !vault.data) throw new Error('bad');
      if (!window.confirm('Replace the records on this device with this backup? You will need the backup password.')) return;
      writeVault({ v: 1, salt: vault.salt, iter: vault.iter, iv: vault.iv, data: vault.data });
      try { localStorage.removeItem(CENSUS_KEY); } catch (err) { /* ignore */ }
      revokeOtherSessions();
      window.alert('Backup loaded. Enter the password used for that backup to unlock.');
      location.reload();
    } catch (err) {
      window.alert('This is not a valid Dialysis Companion records backup.');
    }
  }

  function eraseAll() {
    requirePassword({
      title: 'Erase all records',
      message: 'Retype your password to permanently erase every patient record on this device. This cannot be undone without a backup.',
      confirmLabel: 'Erase all',
      onConfirm: () => {
        revokeOtherSessions();
        try { localStorage.removeItem(VAULT_KEY); } catch (err) { /* ignore */ }
        try { localStorage.removeItem(CENSUS_KEY); } catch (err) { /* ignore */ }
        location.reload();
      }
    });
  }


  /* ------------------------------------------------------------
     Events
     ------------------------------------------------------------ */
  function init() {
    let savedSlug = '';
    try { savedSlug = localStorage.getItem(UNIT_SLUG_KEY) || ''; } catch (err) { /* ignore */ }
    if (savedSlug) {
      $('#unlockView').hidden = false;
      $('#unitSlug').value = savedSlug;
      setTimeout(() => $('#pw').focus(), 80);
    } else {
      $('#setupView').hidden = false;
      setTimeout(() => $('#newPw').focus(), 80);
    }

    loadUnitLabel();
    $('#showLoginBtn').addEventListener('click', () => {
      $('#setupView').hidden = true;
      $('#unlockView').hidden = false;
      setTimeout(() => $('#unitSlug').focus(), 60);
    });
    $('#showRegisterBtn').addEventListener('click', () => {
      $('#unlockView').hidden = true;
      $('#setupView').hidden = false;
      setTimeout(() => $('#setupUnit').focus(), 60);
    });

    /* Setup */
    $('#setupForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('#setupError');
      error.textContent = '';
      const unitName = $('#setupUnit').value.trim();
      const slug = $('#setupSlug').value.trim();
      const username = $('#setupUsername').value.trim();
      const pw = $('#newPw').value;
      const pw2 = $('#newPw2').value;
      if (!unitName) { error.textContent = 'Enter a unit or center name.'; $('#setupUnit').focus(); return; }
      if (!slug) { error.textContent = 'Enter a unit login code.'; $('#setupSlug').focus(); return; }
      if (!username) { error.textContent = 'Choose an admin username.'; $('#setupUsername').focus(); return; }
      if (pw.length < 12) { error.textContent = 'Use at least 12 characters.'; $('#newPw').focus(); return; }
      if (pw !== pw2) { error.textContent = 'The passwords do not match.'; $('#newPw2').focus(); return; }
      if (!$('#ackPw').checked) { error.textContent = 'Please confirm the unit password acknowledgment.'; return; }
      const btn = $('#setupBtn');
      btn.disabled = true;
      btn.textContent = 'Creating…';
      try {
        const result = await serverApi('/api/units/register', {
          method: 'POST',
          body: JSON.stringify({ name: unitName, slug, username, password: pw })
        });
        try {
          localStorage.setItem(UNIT_SLUG_KEY, result.unit.slug);
          localStorage.setItem(UNIT_KEY, result.unit.name);
        } catch (err) { /* ignore */ }
        $('#setupForm').reset();
        showMfaSetup(result);
      } catch (err) {
        error.textContent = err.message || 'Could not create the unit account.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create unit account';
      }
    });

    /* Unlock */
    $('#unlockForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('#unlockError');
      error.textContent = '';
      const slug = $('#unitSlug').value.trim();
      const username = $('#unitUsername').value.trim();
      const pw = $('#pw').value;
      if (!slug) { error.textContent = 'Enter your unit login code.'; $('#unitSlug').focus(); return; }
      if (!username) { error.textContent = 'Enter your username.'; $('#unitUsername').focus(); return; }
      if (!pw) { error.textContent = 'Enter your password.'; return; }
      const btn = $('#unlockBtn');
      btn.disabled = true;
      btn.textContent = 'Unlocking…';
      try {
        const result = await serverApi('/api/units/login', {
          method: 'POST',
          body: JSON.stringify({ slug, username, password: pw, code: $('#loginCode').value.trim() })
        });
        try {
          localStorage.setItem(UNIT_SLUG_KEY, result.unit.slug);
          localStorage.setItem(UNIT_KEY, result.unit.name);
        } catch (err) { /* ignore */ }
        if (result.mfaSetupRequired) showMfaSetup(result);
        else await activateUnit(result);
      } catch (err) {
        error.textContent = 'Wrong password. Try again.';
        $('#pw').select();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Unlock records';
      }
    });

    $('#mfaSetupForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('#mfaSetupError');
      error.textContent = '';
      const button = $('#mfaConfirmBtn');
      button.disabled = true;
      try {
        const result = await serverApi('/api/units/mfa/confirm', {
          method: 'POST',
          body: JSON.stringify({
            setupToken: state.pendingSetupToken,
            code: $('#mfaCode').value.trim()
          })
        });
        state.pendingAuth = result;
        $('#recoveryCodes').textContent = result.recoveryCodes.join('\n');
        $('#mfaSetupForm').hidden = true;
        $('#recoveryCodesView').hidden = false;
      } catch (err) {
        error.textContent = err.message || 'Could not verify the code.';
      } finally {
        button.disabled = false;
      }
    });

    $('#finishMfaBtn').addEventListener('click', async () => {
      const result = state.pendingAuth;
      if (!result) return;
      try {
        await activateUnit(result);
        state.pendingSetupToken = null;
        state.pendingAuth = null;
        toast('Two-step sign-in is enabled. Keep recovery codes offline.');
      } catch (err) {
        $('#mfaSetupError').textContent = err.message || 'Could not load unit records.';
      }
    });

    /* Show / hide password */
    document.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-toggle-pw]');
      if (!toggle) return;
      const input = document.getElementById(toggle.getAttribute('data-toggle-pw'));
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
    });

    /* Delete confirmation */
    $('#deleteAuthDialog').addEventListener('close', () => {
      pendingDelete = null;
      $('#deletePw').value = '';
      $('#deleteAuthError').textContent = '';
    });
    $('#deleteAuthForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('#deleteAuthError');
      error.textContent = '';
      const pw = $('#deletePw').value;
      if (!pw) { error.textContent = 'Enter your password.'; return; }
      const btn = $('#deleteAuthConfirm');
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const ok = await verifyPassword(pw);
        if (!ok) {
          error.textContent = 'Wrong password. Nothing was deleted.';
          $('#deletePw').select();
          return;
        }
        const action = pendingDelete;
        pendingDelete = null;
        $('#deleteAuthDialog').close();
        if (action) await action();
      } catch (err) {
        error.textContent = 'Could not verify the password. Try again.';
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });

    /* Close dialogs */
    $$('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dialog = btn.closest('dialog');
        if (dialog) dialog.close();
      });
    });

    /* Toolbar */
    $('#addPatientBtn').addEventListener('click', openAdd);
    $('#emptyAddBtn').addEventListener('click', openAdd);
    $('#recSearch').addEventListener('input', (event) => {
      state.query = event.target.value;
      render();
    });
    $('#recSort').addEventListener('change', (event) => {
      state.sort = event.target.value;
      render();
    });
    $('#recStatusFilter').addEventListener('change', (event) => {
      state.statusFilter = event.target.value;
      render();
    });
    $('#printListBtn').addEventListener('click', printList);
    $('#lockBtn').addEventListener('click', lockNow);
    $('#settingsBtn').addEventListener('click', async () => {
      $('#settingsDialog').showModal();
      try {
        await loadAdminSettings();
      } catch (err) {
        toast(err.message || 'Could not load account settings.');
      }
    });
    $('#accountPasswordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('#accountPasswordError');
      error.textContent = '';
      const next = $('#newAccountPassword').value;
      if (next.length < 12) { error.textContent = 'Use at least 12 characters.'; return; }
      if (next !== $('#confirmAccountPassword').value) {
        error.textContent = 'The new passwords do not match.';
        return;
      }
      try {
        await serverApi('/api/units/me/password', {
          method: 'PUT',
          body: JSON.stringify({
            currentPassword: $('#currentAccountPassword').value,
            newPassword: next
          })
        });
        lockNow();
      } catch (err) {
        error.textContent = err.message || 'Could not change the password.';
      }
    });
    $('#legacyImportForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('#legacyImportError');
      error.textContent = '';
      const vault = readVault();
      if (!vault) {
        error.textContent = 'No older browser record book was found on this device.';
        return;
      }

      const button = $('#legacyImportBtn');
      button.disabled = true;
      try {
        const key = await deriveKey($('#legacyPassword').value, fromB64(vault.salt), vault.iter);
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.data)
        );
        const legacyPatients = JSON.parse(decoder.decode(plaintext));
        if (!Array.isArray(legacyPatients)) throw new Error('Invalid local records');
        const records = legacyPatients.map((patient) => {
          const normalized = normalizePatient(patient);
          return { id: normalized.id, record: normalized };
        });
        if (!window.confirm(`Import ${records.length} old patient record(s) into this unit? The local copy will remain on this device.`)) {
          return;
        }
        const result = await serverApi('/api/units/records/import', {
          method: 'POST',
          body: JSON.stringify({ records })
        });
        const refreshed = await serverApi('/api/units/records');
        state.patients = (refreshed.records || []).map((item) => normalizePatient(item.record));
        render();
        $('#legacyImportForm').reset();
        toast(`Imported ${result.imported}; already present ${result.skipped}.`);
      } catch (err) {
        error.textContent = 'Could not import. Check the old password and try again.';
      } finally {
        button.disabled = false;
      }
    });
    $('#staffForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('#staffError');
      error.textContent = '';
      try {
        await serverApi('/api/units/users', {
          method: 'POST',
          body: JSON.stringify({
            username: $('#staffUsername').value.trim(),
            password: $('#staffPassword').value,
            role: $('#staffRole').value
          })
        });
        $('#staffForm').reset();
        await loadAdminSettings();
        toast('Staff account created. They must enroll an authenticator at first login.');
      } catch (err) {
        error.textContent = err.message || 'Could not create the staff account.';
      }
    });
    $('#staffList').addEventListener('click', async (event) => {
      const reset = event.target.closest('[data-reset-mfa-user]');
      if (reset) {
        if (!window.confirm('Reset MFA for this staff account? They must enroll their authenticator again.')) return;
        try {
          await serverApi('/api/units/users/' + encodeURIComponent(reset.dataset.resetMfaUser) + '/reset-mfa', {
            method: 'POST',
            body: JSON.stringify({})
          });
          toast('MFA reset. The staff member must sign in and enroll again.');
        } catch (err) {
          toast(err.message || 'Could not reset MFA.');
        }
        return;
      }
      const button = event.target.closest('[data-deactivate-user]');
      if (!button || !window.confirm('Deactivate this staff account?')) return;
      try {
        await serverApi('/api/units/users/' + encodeURIComponent(button.dataset.deactivateUser), {
          method: 'DELETE'
        });
        await loadAdminSettings();
        toast('Staff account deactivated.');
      } catch (err) {
        toast(err.message || 'Could not deactivate the account.');
      }
    });

    /* Lock this tab when another tab logs out sessions or changes authorisation */
    window.addEventListener('storage', (event) => {
      if (event.key === SESSION_KEY && event.newValue !== state.sessionEpoch && !$('#app').hidden) {
        lockNow();
      }
    });
    if (sessionChannel) {
      sessionChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'revoke' && !$('#app').hidden) lockNow();
      };
    }

    /* Patient cards */
    const grid = $('#patientList');
    grid.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-delete-patient]');
      if (remove) {
        event.stopPropagation();
        deletePatient(remove.getAttribute('data-delete-patient'));
        return;
      }
      const card = event.target.closest('.patient-card');
      if (card) openDetail(card.dataset.id);
    });
    grid.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('button, a, input, textarea, select')) return;
      const card = event.target.closest('.patient-card');
      if (!card) return;
      event.preventDefault();
      openDetail(card.dataset.id);
    });

    /* Form helpers */
    $('#pAccess').addEventListener('change', syncOtherFields);
    $('#pDialyzer').addEventListener('change', syncOtherFields);
    $('#pStatus').addEventListener('change', syncStatusFields);
    $$('[data-lab]').forEach((input) => input.addEventListener('input', () => syncLabHints('')));
    $$('[data-lab-unit]').forEach((select) => select.addEventListener('change', () => syncLabHints('')));
    $$('[data-mlab]').forEach((input) => input.addEventListener('input', () => syncLabHints('m')));
    $$('[data-mlab-unit]').forEach((select) => select.addEventListener('change', () => syncLabHints('m')));
    $$('[data-calc-urr]').forEach((btn) => btn.addEventListener('click', () => calculateUrr(btn.getAttribute('data-calc-urr'))));
    Object.entries(AVG_FIELDS).forEach(([key, def]) => {
      const input = document.getElementById(def[0]);
      if (input) input.addEventListener('input', () => {
        updateFieldAverage(key);
        if (key === 'pre' || key === 'post') updateIdwg('m');
      });
    });
    Object.entries(BASE_AVG_FIELDS).forEach(([key, def]) => {
      const input = document.getElementById(def[0]);
      if (input) input.addEventListener('input', () => updateBaselineAverage(key));
    });
    ['pPre', 'pPost', 'pDry', 'pIdwgBasis'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => updateIdwg('p'));
      if (el) el.addEventListener('change', () => updateIdwg('p'));
    });
    ['mPre', 'mPost', 'mDry', 'mIdwgBasis'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => updateIdwg('m'));
      if (el) el.addEventListener('change', () => updateIdwg('m'));
    });

    $('#addComplication').addEventListener('click', () => {
      const custom = $('#pCompOther').value.trim();
      const pick = $('#pComplicationPick').value;
      const value = custom || pick;
      if (!value) {
        toast('Select or type a complication.');
        $('#pComplicationPick').focus();
        return;
      }
      formComplications.push({
        id: uid(),
        name: value,
        date: $('#pCompDate').value,
        time: $('#pCompTime').value,
        nurse: $('#pCompNurse').value.trim(),
        management: $('#pCompManagement').value.trim()
      });
      $('#pCompOther').value = '';
      $('#pComplicationPick').value = '';
      $('#pCompManagement').value = '';
      renderComplicationChips();
    });

    $('#addMedRow').addEventListener('click', () => {
      formMedications.push({ id: uid(), name: '', dose: '', frequency: '' });
      renderMedications();
      const rows = document.querySelectorAll('#medRows .med-row');
      const last = rows[rows.length - 1];
      if (last) last.querySelector('input').focus();
    });

    $('#medRows').addEventListener('input', (event) => {
      const input = event.target.closest('[data-med-field]');
      if (!input) return;
      const item = formMedications[Number(input.getAttribute('data-med-index'))];
      if (!item) return;
      item[input.getAttribute('data-med-field')] = input.value;
    });

    $('#medRows').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove-med]');
      if (!btn) return;
      formMedications.splice(Number(btn.getAttribute('data-remove-med')), 1);
      renderMedications();
    });

    $('#complicationChips').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove-comp]');
      if (!btn) return;
      const index = Number(btn.getAttribute('data-remove-comp'));
      formComplications.splice(index, 1);
      renderComplicationChips();
    });

    /* Monthly complications */
    $('#addMonthComp').addEventListener('click', () => {
      const custom = $('#mCompOther').value.trim();
      const pick = $('#mCompPick').value;
      const value = custom || pick;
      if (!value) {
        toast('Select or type a complication.');
        $('#mCompPick').focus();
        return;
      }
      monthComplications.push({
        id: uid(),
        name: value,
        date: $('#mCompDate').value,
        time: $('#mCompTime').value,
        nurse: $('#mCompNurse').value.trim(),
        management: $('#mCompManagement').value.trim()
      });
      $('#mCompOther').value = '';
      $('#mCompPick').value = '';
      $('#mCompManagement').value = '';
      renderMonthComplications();
    });

    $('#monthCompChips').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove-mcomp]');
      if (!btn) return;
      const index = Number(btn.getAttribute('data-remove-mcomp'));
      monthComplications.splice(index, 1);
      renderMonthComplications();
    });

    /* Detail: monthly data */
    $('#detailBody').addEventListener('click', (event) => {
      const add = event.target.closest('[data-add-month]');
      if (add) {
        openMonthDialog($('#detailDialog').dataset.id);
        return;
      }
      const edit = event.target.closest('[data-edit-month]');
      if (edit) {
        openMonthDialog($('#detailDialog').dataset.id, edit.getAttribute('data-edit-month'));
        return;
      }
      const remove = event.target.closest('[data-delete-month]');
      if (remove) {
        deleteMonth($('#detailDialog').dataset.id, remove.getAttribute('data-delete-month'));
      }
    });

    /* Save patient */
    $('#patientForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const error = $('#patientError');
      error.textContent = '';
      if (!form.reportValidity()) {
        error.textContent = 'Please check the highlighted fields.';
        return;
      }
      const data = readForm(form);
      const wasEditing = !!state.editingId;
      const now = new Date().toISOString();

      if (state.editingId) {
        const patient = state.patients.find((item) => item.id === state.editingId);
        if (patient) Object.assign(patient, data, { updatedAt: now });
      } else {
        state.patients.unshift(Object.assign({ id: uid(), createdAt: now, updatedAt: now, months: [] }, data));
      }

      const btn = $('#savePatient');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await persist();
        state.editingId = null;
        $('#patientDialog').close();
        render();
        toast(wasEditing ? 'Patient record updated.' : 'Patient record added.');
      } catch (err) {
        error.textContent = 'Could not save. Browser storage may be full.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save patient';
      }
    });

    /* Save monthly data */
    $('#monthForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const error = $('#monthError');
      error.textContent = '';
      if (!form.reportValidity()) {
        error.textContent = 'Please check the highlighted fields.';
        return;
      }
      const dialog = $('#monthDialog');
      const patient = state.patients.find((item) => item.id === dialog.dataset.patient);
      if (!patient) return;
      const data = readMonthForm(form);
      if (!data.month) {
        error.textContent = 'Choose the month for this entry.';
        return;
      }
      if (!Array.isArray(patient.months)) patient.months = [];
      const editingId = state.editingMonthId;
      const duplicate = patient.months.some((m) => m.month === data.month && m.id !== editingId);
      if (duplicate) {
        error.textContent = 'An entry for this month already exists. Edit that entry instead.';
        return;
      }

      const now = new Date().toISOString();
      if (editingId) {
        const month = patient.months.find((m) => m.id === editingId);
        if (month) Object.assign(month, data, { updatedAt: now });
      } else {
        patient.months.push(Object.assign({ id: uid(), createdAt: now, updatedAt: now }, data));
      }
      patient.updatedAt = now;

      const btn = $('#saveMonth');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await persist();
        state.editingMonthId = null;
        dialog.close();
        render();
        renderDetail(patient.id);
        toast(editingId ? 'Monthly entry updated.' : 'Monthly data added.');
      } catch (err) {
        error.textContent = 'Could not save. Browser storage may be full.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save monthly data';
      }
    });

    /* Detail actions */
    $('#editPatient').addEventListener('click', () => {
      const id = $('#detailDialog').dataset.id;
      $('#detailDialog').close();
      openEdit(id);
    });
    $('#deletePatient').addEventListener('click', () => {
      deletePatient($('#detailDialog').dataset.id);
    });
    $('#printPatient').addEventListener('click', () => {
      printPatient($('#detailDialog').dataset.id);
    });
    $('#addMonthFooter').addEventListener('click', () => {
      openMonthDialog($('#detailDialog').dataset.id);
    });

    /* Clear errors while typing */
    $$('form').forEach((form) => {
      form.addEventListener('input', () => {
        const error = form.querySelector('.form-error');
        if (error) error.textContent = '';
      });
    });

    /* Idle auto-lock */
    ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
      document.addEventListener(evt, resetIdle, { passive: true });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
