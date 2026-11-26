'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

class Element {
  constructor() {
    this.hidden = true;
    this.value = '';
    this.textContent = '';
    this.dataset = {};
    this.listeners = {};
    this.lastElementChild = new ElementChild();
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  closest() {
    return this;
  }

  reset() {}

  focus() {}

  select() {}
}

class ElementChild {
  constructor() {
    this.textContent = '';
  }
}

function createBrowser(storage = new Map(), apiUrl = '') {
  const elements = new Map();
  const getElement = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  getElement('meta[name="admin-api"]').content = apiUrl;

  const localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  };
  const document = {
    querySelector: getElement,
    querySelectorAll: () => [],
    getElementById: getElement,
    addEventListener(name, callback) {
      if (name === 'DOMContentLoaded') this.ready = callback;
    }
  };
  const window = {
    crypto: webcrypto,
    location: { hostname: 'dialysiscompanion.example', reload() {} },
    addEventListener() {}
  };
  const context = {
    document,
    window,
    localStorage,
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    setTimeout: () => 0,
    clearTimeout() {},
    fetch: async () => {
      throw new Error('Local-only mode must not call the API.');
    },
    console
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'records.js'), 'utf8');
  vm.runInNewContext(source, context);
  document.ready();
  return { elements, element: getElement, storage };
}

test('registering without an API opens an encrypted browser-only record book', async () => {
  const { element, storage } = createBrowser();
  element('#setupUnit').value = 'Test Dialysis Unit';
  element('#setupSlug').value = 'test-unit';
  element('#setupUsername').value = 'unit.admin';
  element('#newPw').value = 'Temporary-Password-123';
  element('#newPw2').value = 'Temporary-Password-123';
  element('#ackPw').checked = true;

  await element('#setupForm').listeners.submit({ preventDefault() {} });

  assert.equal(element('#app').hidden, false);
  assert.equal(element('#appLocalWarning').hidden, false);
  assert.match(element('#accountLabel').textContent, /Test Dialysis Unit/);
  assert.ok(storage.has('dc-records-vault-v1'));
  assert.ok(storage.has('dc-records-local-account-v1'));
  assert.equal(Array.from(storage.values()).some((value) => value.includes('Temporary-Password-123')), false);
});

test('the browser-only vault can be unlocked again with its password', async () => {
  const firstBrowser = createBrowser();
  firstBrowser.element('#setupUnit').value = 'Test Dialysis Unit';
  firstBrowser.element('#setupSlug').value = 'test-unit';
  firstBrowser.element('#setupUsername').value = 'unit.admin';
  firstBrowser.element('#newPw').value = 'Temporary-Password-123';
  firstBrowser.element('#newPw2').value = 'Temporary-Password-123';
  firstBrowser.element('#ackPw').checked = true;
  await firstBrowser.element('#setupForm').listeners.submit({ preventDefault() {} });

  const nextBrowser = createBrowser(firstBrowser.storage);
  nextBrowser.element('#pw').value = 'Temporary-Password-123';
  await nextBrowser.element('#unlockForm').listeners.submit({ preventDefault() {} });

  assert.equal(nextBrowser.element('#app').hidden, false);
  assert.equal(nextBrowser.element('#appLocalWarning').hidden, false);
});

test('an incorrect password does not unlock the local record book', async () => {
  const firstBrowser = createBrowser();
  firstBrowser.element('#setupUnit').value = 'Test Dialysis Unit';
  firstBrowser.element('#setupSlug').value = 'test-unit';
  firstBrowser.element('#setupUsername').value = 'unit.admin';
  firstBrowser.element('#newPw').value = 'Temporary-Password-123';
  firstBrowser.element('#newPw2').value = 'Temporary-Password-123';
  firstBrowser.element('#ackPw').checked = true;
  await firstBrowser.element('#setupForm').listeners.submit({ preventDefault() {} });

  const nextBrowser = createBrowser(firstBrowser.storage);
  nextBrowser.element('#pw').value = 'Incorrect-Password-123';
  await nextBrowser.element('#unlockForm').listeners.submit({ preventDefault() {} });

  assert.equal(nextBrowser.element('#app').hidden, true);
  assert.match(nextBrowser.element('#unlockError').textContent, /check the password/i);
});

test('a later API deployment leaves local records available for migration', async () => {
  const firstBrowser = createBrowser();
  firstBrowser.element('#setupUnit').value = 'Test Dialysis Unit';
  firstBrowser.element('#setupSlug').value = 'test-unit';
  firstBrowser.element('#setupUsername').value = 'unit.admin';
  firstBrowser.element('#newPw').value = 'Temporary-Password-123';
  firstBrowser.element('#newPw2').value = 'Temporary-Password-123';
  firstBrowser.element('#ackPw').checked = true;
  await firstBrowser.element('#setupForm').listeners.submit({ preventDefault() {} });

  const deployedBrowser = createBrowser(firstBrowser.storage, 'https://api.example.test');
  assert.equal(deployedBrowser.element('#localMigrationNotice').hidden, false);
  assert.equal(deployedBrowser.element('#localModeNotice').hidden, true);
});
