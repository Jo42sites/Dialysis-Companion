'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'configure-admin-api.js');
const template = '<meta name="admin-api" content="">';

function runConfiguration(apiUrl) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'configure-admin-api-'));
  const htmlPath = path.join(directory, 'records.html');
  fs.writeFileSync(htmlPath, template);
  try {
    execFileSync(process.execPath, [scriptPath, htmlPath], {
      env: { ...process.env, ADMIN_API_URL: apiUrl },
      stdio: 'pipe'
    });
    return fs.readFileSync(htmlPath, 'utf8');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('an unset API URL leaves the static records page in browser-only mode', () => {
  assert.equal(runConfiguration(''), template);
});

test('a configured API URL is normalized to its HTTPS origin', () => {
  assert.equal(
    runConfiguration('https://api.example.test/'),
    '<meta name="admin-api" content="https://api.example.test">'
  );
});

test('a configured non-origin API URL is rejected', () => {
  assert.throws(
    () => runConfiguration('https://api.example.test/v1'),
    /ADMIN_API_URL must be an HTTPS origin only/
  );
});
