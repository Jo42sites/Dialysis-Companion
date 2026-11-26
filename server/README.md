# Secure Admin Backend

This is a local-only Express API for administering Dialysis Companion.
Medical records should remain encrypted and should be backed by a database and
access-control design before handling real patient data.

## Setup

```bash
cd server
npm install
npm run hash-password -- "replace-with-a-strong-password"
cp .env.example .env
```

Put the generated hash in `ADMIN_PASSWORD_HASH` and set a unique long random value
for `JWT_SECRET` in `.env`.

## Run

```bash
npm start
```

The server binds only to `127.0.0.1`.

## API

```text
POST /api/admin/login
GET  /api/admin/users
GET  /api/health
```

Login:

```bash
curl -i -X POST http://127.0.0.1:3001/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

Use the returned token:

```bash
curl -i http://127.0.0.1:3001/api/admin/users \
  -H "Authorization: Bearer YOUR_JWT"
```
