'use strict';

const fs = require('node:fs');
const path = require('node:path');

const apiUrl = process.env.ADMIN_API_URL;
if (!apiUrl) {
  throw new Error('Set the ADMIN_API_URL environment variable to the deployed API HTTPS origin.');
}

let parsedUrl;
try {
  parsedUrl = new URL(apiUrl);
} catch (_error) {
  throw new Error('ADMIN_API_URL must be a valid HTTPS origin, such as https://api.example.com.');
}
if (
  parsedUrl.protocol !== 'https:' ||
  parsedUrl.username ||
  parsedUrl.password ||
  parsedUrl.pathname !== '/' ||
  parsedUrl.search ||
  parsedUrl.hash
) {
  throw new Error('ADMIN_API_URL must be an HTTPS origin only, without credentials, path, query, or fragment.');
}

const htmlPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'records.html'));
const html = fs.readFileSync(htmlPath, 'utf8');
const metaTag = '<meta name="admin-api" content="">';
if (html.split(metaTag).length !== 2) {
  throw new Error(`Expected exactly one unconfigured admin-api meta tag in ${htmlPath}.`);
}

fs.writeFileSync(htmlPath, html.replace(metaTag, `<meta name="admin-api" content="${parsedUrl.origin}">`));
