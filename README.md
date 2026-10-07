# O.M.B (Operation More Bacon)
This is a local-first application to project future balances and income based on weekly options trading performance.

## Local-only architecture

- Frontend: Vue 3 + Pinia + Vue Router + Bootstrap + Chart.js
- Backend: Node + Express (`server/index.js`)
- Persistence: SQLite (`server/db.js`)
- State model: single JSON payload in `app_state` table (`id=1`)
- Network bind: `0.0.0.0` (LAN/Tailscale friendly)

Database file path: `server/data/app.db` (gitignored)

## API

- `GET /api/state` → returns `{ state, updatedAt }`
- `PUT /api/state` → saves full state object payload
- `GET /api/backup/export` → returns current full state payload
- `POST /api/backup/import` → imports full state payload

## Development

Install dependencies:

```bash
npm install
```

Run frontend + backend together:

```bash
npm run dev
```

Run backend only:

```bash
npm run server
```

Build production assets:

```bash
npm run build
```

## Data migration workflow

To import existing data from prior backups:

1. Open the app and go to **Manage / Switch Accounts**
2. Click **Restore**
3. Select your full backup JSON
4. Confirm restore and verify tabs/charts