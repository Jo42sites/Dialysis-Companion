(function () {
  'use strict';

  const TOKEN_KEY = 'dc-site-admin-token';
  const $ = (selector) => document.querySelector(selector);
  const message = $('#adminMessage');
  const loginPanel = $('#adminLoginPanel');
  const dashboard = $('#adminDashboard');
  const apiMeta = document.querySelector('meta[name="admin-api"]');
  const configuredOrigin = apiMeta ? apiMeta.content.trim() : '';
  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiOrigin = configuredOrigin || (localHost ? 'http://127.0.0.1:3001' : '');
  let token = '';
  let selectedUnit = '';
  let pageOffset = 0;
  const pageSize = 50;
  let totalRecords = 0;
  let selectedRecordId = '';

  function showMessage(text, kind) {
    message.textContent = text;
    message.dataset.kind = kind || '';
  }

  async function api(path, options) {
    if (!apiOrigin) throw new Error('The admin API is not configured. Ask the site administrator to deploy it and set ADMIN_API_URL.');
    const requestOptions = options || {};
    const headers = { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetch(`${apiOrigin}${path}`, { ...requestOptions, headers });
    } catch (_error) {
      throw new Error('Could not connect to the admin service. Check the connection and try again.');
    }
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result && (result.error || result.detail) || 'The request could not be completed.');
    return result;
  }

  function request(method, body) {
    return { method, body: JSON.stringify(body) };
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function makeButton(text, callback, className) {
    const button = element('button', text, className || 'small-action');
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }

  function statusPill(active) {
    return element('span', active ? 'Active' : 'Suspended', `status-pill${active ? '' : ' is-inactive'}`);
  }

  function setSignedIn(email) {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    $('#adminIdentity').textContent = email;
  }

  async function loadOverview() {
    const [overview, accounts, units, audit] = await Promise.all([
      api('/api/site-admin/overview'),
      api('/api/site-admin/accounts'),
      api('/api/site-admin/units'),
      api('/api/site-admin/audit')
    ]);
    const overviewCards = $('#overviewCards');
    overviewCards.replaceChildren();
    [
      ['Guide accounts', overview.accounts],
      ['Dialysis units', overview.units],
      ['Unit staff', overview.staff],
      ['Patient records', overview.records]
    ].forEach(([label, count]) => {
      const card = element('div', undefined, 'overview-card');
      card.append(element('span', label), element('strong', count));
      overviewCards.append(card);
    });
    renderAccounts(accounts.accounts);
    renderUnits(units.units);
    renderAudit(audit.events);
  }

  function renderAudit(events) {
    const body = $('#auditRows');
    body.replaceChildren();
    if (!events.length) {
      const row = element('tr');
      const cell = element('td', 'No administrator activity yet.');
      cell.colSpan = 4;
      row.append(cell);
      body.append(row);
      return;
    }
    events.forEach((event) => {
      const row = element('tr');
      const target = event.record_id || event.account_id || '—';
      row.append(
        element('td', event.created_at),
        element('td', event.action),
        element('td', event.unit_name || '—'),
        element('td', target)
      );
      body.append(row);
    });
  }

  function renderAccounts(accounts) {
    const body = $('#accountRows');
    body.replaceChildren();
    if (!accounts.length) {
      const row = element('tr');
      const cell = element('td', 'No guide accounts yet.');
      cell.colSpan = 3;
      row.append(cell);
      body.append(row);
      return;
    }
    accounts.forEach((account) => {
      const row = element('tr');
      row.append(element('td', account.email));
      const status = element('td');
      status.append(statusPill(account.active));
      row.append(status);
      const action = element('td');
      action.append(makeButton(account.active ? 'Suspend' : 'Activate', async () => {
        const actionText = account.active ? 'suspend' : 'activate';
        if (!window.confirm(`Are you sure you want to ${actionText} ${account.email}?`)) return;
        try {
          await api(`/api/site-admin/accounts/${account.id}`, request('PATCH', { active: !account.active }));
          await loadOverview();
          showMessage('Guide account status updated.', 'success');
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }));
      row.append(action);
      body.append(row);
    });
  }

  function renderUnits(units) {
    const select = $('#unitSelect');
    const previous = select.value;
    select.replaceChildren();
    const placeholder = element('option', 'Select a dialysis unit…');
    placeholder.value = '';
    select.append(placeholder);
    units.forEach((unit) => {
      const option = element('option', `${unit.name} (${unit.recordCount} records)${unit.active ? '' : ' — suspended'}`);
      option.value = String(unit.id);
      select.append(option);
    });
    if (units.length && units.some((unit) => String(unit.id) === previous)) {
      select.value = previous;
      selectedUnit = previous;
      loadUnit().catch((error) => showMessage(error.message, 'error'));
    } else {
      selectedUnit = '';
      $('#unitSummary').textContent = units.length
        ? 'Choose a unit to view staff and patient records.'
        : 'No dialysis units have registered.';
      $('#staffRows').replaceChildren();
      $('#recordRows').replaceChildren();
      $('#recordPageLabel').textContent = 'Select a unit';
      $('#previousPage').disabled = true;
      $('#nextPage').disabled = true;
    }
  }

  async function loadUnit() {
    if (!selectedUnit) return;
    const [unitsResult, staffResult] = await Promise.all([
      api('/api/site-admin/units'),
      api(`/api/site-admin/units/${selectedUnit}/staff`)
    ]);
    const unit = unitsResult.units.find((item) => String(item.id) === selectedUnit);
    if (!unit) throw new Error('The selected dialysis unit was not found.');
    const summary = $('#unitSummary');
    summary.replaceChildren();
    const details = element('p', `${unit.slug} · ${unit.staffCount} staff · ${unit.recordCount} patient records · ${unit.active ? 'active' : 'suspended'}`);
    const button = makeButton(unit.active ? 'Suspend unit' : 'Reactivate unit', async () => {
      const actionText = unit.active ? 'suspend' : 'reactivate';
      if (!window.confirm(`Are you sure you want to ${actionText} ${unit.name}?`)) return;
      try {
        await api(`/api/site-admin/units/${unit.id}`, request('PATCH', { active: !unit.active }));
        await loadOverview();
        showMessage('Dialysis unit status updated.', 'success');
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
    summary.append(details, button);
    renderStaff(staffResult.staff);
    await loadRecords();
  }

  function renderStaff(staff) {
    const body = $('#staffRows');
    body.replaceChildren();
    if (!staff.length) {
      const row = element('tr');
      const cell = element('td', 'No unit staff accounts.');
      cell.colSpan = 4;
      row.append(cell);
      body.append(row);
      return;
    }
    staff.forEach((user) => {
      const row = element('tr');
      row.append(element('td', user.username), element('td', user.role));
      const status = element('td');
      status.append(statusPill(user.active));
      row.append(status);
      const action = element('td');
      action.append(makeButton(user.active ? 'Suspend' : 'Activate', async () => {
        const actionText = user.active ? 'suspend' : 'activate';
        if (!window.confirm(`Are you sure you want to ${actionText} ${user.username}?`)) return;
        try {
          await api(`/api/site-admin/units/${selectedUnit}/staff/${user.id}`, request('PATCH', { active: !user.active }));
          await loadUnit();
          showMessage('Staff account status updated.', 'success');
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }));
      row.append(action);
      body.append(row);
    });
  }

  async function loadRecords() {
    if (!selectedUnit) return;
    const result = await api(`/api/site-admin/units/${selectedUnit}/records?limit=${pageSize}&offset=${pageOffset}`);
    totalRecords = result.total;
    const body = $('#recordRows');
    body.replaceChildren();
    if (!result.records.length) {
      const row = element('tr');
      const cell = element('td', 'No patient records in this unit.');
      cell.colSpan = 4;
      row.append(cell);
      body.append(row);
    }
    result.records.forEach((item) => {
      const row = element('tr');
      row.append(element('td', item.id), element('td', item.patientName || '—'), element('td', item.updatedAt || '—'));
      const action = element('td');
      action.append(makeButton('View / edit', () => openRecord(item.id)));
      row.append(action);
      body.append(row);
    });
    const first = totalRecords ? pageOffset + 1 : 0;
    const last = Math.min(pageOffset + pageSize, totalRecords);
    $('#recordPageLabel').textContent = `${first}–${last} of ${totalRecords}`;
    $('#previousPage').disabled = pageOffset === 0;
    $('#nextPage').disabled = pageOffset + pageSize >= totalRecords;
    $('#editRecordPanel').hidden = true;
    selectedRecordId = '';
  }

  async function openRecord(recordId) {
    try {
      const result = await api(`/api/site-admin/units/${selectedUnit}/records/${encodeURIComponent(recordId)}`);
      selectedRecordId = result.id;
      $('#recordEditorTitle').textContent = `Edit record ${result.id}`;
      $('#editRecordJson').value = JSON.stringify(result.record, null, 2);
      $('#editRecordPanel').hidden = false;
      showMessage(`Opened patient record ${result.id}. This access has been logged.`, 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  $('#adminLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('Signing in…');
    try {
      const result = await api('/api/site-admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.elements.email.value.trim(),
          password: form.elements.password.value
        })
      });
      token = result.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      form.reset();
      await loadOverview();
      setSignedIn(result.email);
      showMessage('Signed in. Patient-record access is audited.', 'success');
    } catch (error) {
      token = '';
      sessionStorage.removeItem(TOKEN_KEY);
      showMessage(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#adminSignOut').addEventListener('click', () => {
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    dashboard.hidden = true;
    loginPanel.hidden = false;
    selectedUnit = '';
    showMessage('You have signed out.');
  });

  $('#unitSelect').addEventListener('change', async (event) => {
    selectedUnit = event.currentTarget.value;
    pageOffset = 0;
    $('#recordEditorTitle').textContent = 'Create a record';
    try {
      await loadUnit();
      showMessage('');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });

  $('#previousPage').addEventListener('click', async () => {
    pageOffset = Math.max(0, pageOffset - pageSize);
    try { await loadRecords(); } catch (error) { showMessage(error.message, 'error'); }
  });
  $('#nextPage').addEventListener('click', async () => {
    if (pageOffset + pageSize >= totalRecords) return;
    pageOffset += pageSize;
    try { await loadRecords(); } catch (error) { showMessage(error.message, 'error'); }
  });

  $('#createRecordButton').addEventListener('click', async () => {
    const id = $('#newRecordId').value.trim();
    try {
      const record = JSON.parse($('#newRecordJson').value);
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Record JSON must be an object.');
      await api(`/api/site-admin/units/${selectedUnit}/records`, request('POST', { id, record }));
      $('#newRecordId').value = '';
      $('#newRecordJson').value = '{}';
      pageOffset = 0;
      await loadOverview();
      showMessage('Patient record created.', 'success');
    } catch (error) {
      showMessage(error instanceof SyntaxError ? 'Record JSON is not valid.' : error.message, 'error');
    }
  });

  $('#saveRecordButton').addEventListener('click', async () => {
    if (!selectedRecordId) return;
    try {
      const record = JSON.parse($('#editRecordJson').value);
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Record JSON must be an object.');
      await api(`/api/site-admin/units/${selectedUnit}/records/${encodeURIComponent(selectedRecordId)}`, request('PUT', record));
      await loadOverview();
      showMessage('Patient record updated.', 'success');
    } catch (error) {
      showMessage(error instanceof SyntaxError ? 'Record JSON is not valid.' : error.message, 'error');
    }
  });

  $('#deleteRecordButton').addEventListener('click', async () => {
    if (!selectedRecordId || !window.confirm(`Permanently delete patient record ${selectedRecordId}? This cannot be undone.`)) return;
    try {
      await api(`/api/site-admin/units/${selectedUnit}/records/${encodeURIComponent(selectedRecordId)}`, { method: 'DELETE' });
      await loadOverview();
      showMessage('Patient record deleted.', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  });
  $('#closeRecordButton').addEventListener('click', () => {
    selectedRecordId = '';
    $('#editRecordPanel').hidden = true;
    $('#recordEditorTitle').textContent = 'Create a record';
  });

  try {
    token = sessionStorage.getItem(TOKEN_KEY) || '';
  } catch (_error) {
    showMessage('Session storage is unavailable. Enable browser storage to sign in.', 'error');
  }
  if (token) {
    api('/api/site-admin/overview')
      .then(async () => {
        await loadOverview();
        setSignedIn('Site administrator');
        showMessage('Signed in. Patient-record access is audited.', 'success');
      })
      .catch((error) => {
        token = '';
        sessionStorage.removeItem(TOKEN_KEY);
        showMessage(error.message, 'error');
      });
  } else if (!apiOrigin) {
    showMessage('The admin API is not configured. Ask the site administrator to deploy it and set ADMIN_API_URL.', 'error');
  }
})();
