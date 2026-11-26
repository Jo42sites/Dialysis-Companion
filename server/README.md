# Unit-Based Secure Admin Backend

This Express API allows each dialysis unit to register its own account and
manage only its own patient records. Records are stored in a local SQLite
database and encrypted with AES-256-GCM.

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Set separate, long random values for `JWT_SECRET` and `MEDICAL_DATA_KEY`.
Do not commit `.env` or `data/`.

## Run

```bash
npm start
```

The server binds only to `127.0.0.1`.

## API

```text
GET    /api/health
POST   /api/units/register
POST   /api/units/login
GET    /api/units/me
GET    /api/units/records
POST   /api/units/records
GET    /api/units/records/:id
PUT    /api/units/records/:id
DELETE /api/units/records/:id
```

Register a unit:

```bash
curl -i -X POST http://127.0.0.1:3001/api/units/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Sta. Mesa Dialysis Center","slug":"sta-mesa","password":"a-strong-password-2026"}'
```

Log in and use the returned token for record routes:

```bash
curl -i http://127.0.0.1:3001/api/units/records \
  -H "Authorization: Bearer YOUR_JWT"
```
