(function () {
  'use strict';

  const TOKEN_KEY = 'dc-guide-account-token';
  const $ = (selector) => document.querySelector(selector);
  const message = $('#accountMessage');
  const authView = $('#authView');
  const signedInView = $('#signedInView');
  const apiMeta = document.querySelector('meta[name="admin-api"]');
  const configuredOrigin = apiMeta ? apiMeta.content.trim() : '';
  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiOrigin = configuredOrigin || (localHost ? 'http://127.0.0.1:3001' : '');
  let token = '';

  function showMessage(text, kind) {
    message.textContent = text;
    message.dataset.kind = kind || '';
  }

  async function api(path, options) {
    if (!apiOrigin) throw new Error('The account API is not configured. Ask the site administrator to deploy it and set ADMIN_API_URL.');
    const requestOptions = options || {};
    const headers = { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetch(`${apiOrigin}${path}`, { ...requestOptions, headers });
    } catch (error) {
      throw new Error('Could not connect to the account service. Check your connection and try again.');
    }
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result && (result.error || result.detail) || 'The request could not be completed.');
    return result;
  }

  function showSignedIn(user, hasSavedData) {
    authView.hidden = true;
    signedInView.hidden = false;
    $('#accountEmail').textContent = user.email;
    $('#restoreDataButton').disabled = !hasSavedData;
    showMessage(hasSavedData ? 'You have saved card data in your account.' : 'Your account is ready. Save this device to keep a copy in your account.', 'success');
  }

  function localData() {
    let card = null;
    const raw = localStorage.getItem('dc-plan');
    if (raw) {
      try {
        card = JSON.parse(raw);
      } catch (_error) {
        throw new Error('The care card on this device could not be read. Open the guide and save it again first.');
      }
    }
    if (card !== null && (!card || typeof card !== 'object' || Array.isArray(card))) {
      throw new Error('The care card on this device has an invalid format.');
    }
    const language = localStorage.getItem('dc-lang-v2') || 'tl';
    return { card, preferences: { language: ['tl', 'en'].includes(language) ? language : 'tl' } };
  }

  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('Signing in…');
    try {
      const result = await api('/api/accounts/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.elements.email.value.trim(),
          password: form.elements.password.value
        })
      });
      token = result.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      form.reset();
      showSignedIn(result.user, result.hasSavedData);
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('Creating your account…');
    try {
      const result = await api('/api/accounts/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.elements.email.value.trim(),
          password: form.elements.password.value
        })
      });
      token = result.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      form.reset();
      showSignedIn(result.user, false);
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#saveDataButton').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    showMessage('Saving your card and language preference…');
    try {
      const data = localData();
      const payload = { preferences: data.preferences };
      if (data.card) payload.card = data.card;
      await api('/api/accounts/me/data', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      $('#restoreDataButton').disabled = false;
      showMessage('Saved securely to your account. You can restore it on another device.', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#restoreDataButton').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!window.confirm('Replace this device’s care card and language preference with the copy saved in your account?')) return;
    button.disabled = true;
    showMessage('Restoring your saved information…');
    try {
      const result = await api('/api/accounts/me/data');
      if (!result.data) throw new Error('There is no saved information in this account yet.');
      if (result.data.card && (typeof result.data.card !== 'object' || Array.isArray(result.data.card))) {
        throw new Error('The saved care card has an invalid format and was not restored.');
      }
      if (result.data.card) localStorage.setItem('dc-plan', JSON.stringify(result.data.card));
      const language = result.data.preferences && result.data.preferences.language;
      if (['tl', 'en'].includes(language)) localStorage.setItem('dc-lang-v2', language);
      showMessage('Restored. Reload the guide to see your card and language preference.', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#signOutButton').addEventListener('click', () => {
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    signedInView.hidden = true;
    authView.hidden = false;
    showMessage('You have signed out.');
  });

  try {
    token = sessionStorage.getItem(TOKEN_KEY) || '';
  } catch (_error) {
    showMessage('Session storage is unavailable. Enable browser storage to sign in.', 'error');
  }
  if (token) {
    api('/api/accounts/me')
      .then(async (result) => {
        const data = await api('/api/accounts/me/data');
        showSignedIn(result.user, Boolean(data.data));
      })
      .catch((error) => {
        token = '';
        sessionStorage.removeItem(TOKEN_KEY);
        showMessage(error.message, 'error');
      });
  } else if (!apiOrigin) {
    showMessage('The account API is not configured. Ask the site administrator to deploy it and set ADMIN_API_URL.', 'error');
  }
})();
