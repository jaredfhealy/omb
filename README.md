# O.M.B (Operation More Bacon)
This is a local-first application to project future balances and income based on weekly options trading performance.

## Product and Engineering Specs

Canonical project specs and architectural decisions are stored in-repo:

- Spec index: [docs/spec/README.md](./docs/spec/README.md)
- ADR index: [docs/adr/README.md](./docs/adr/README.md)

## Local-only architecture

- Frontend: Vue 3 + Pinia + Vue Router + Bootstrap + Chart.js
- Backend: Node + Express (`server/index.js`)
- Primary persistence: IndexedDB (browser local-first envelope)
- State model: single JSON payload (`data`) plus local sync metadata (`meta.revision`, `meta.updatedAt`, `meta.updatedByDevice`, `meta.lastSyncedRevision`)
- Network bind: `0.0.0.0` for local browser access on the machine/network

### Persistence model

- Always local-first: IndexedDB is the primary runtime persistence layer.
- If Google Drive is connected in this browser, saves are mirrored to Drive with backup snapshots.

Environment flags:

- `VITE_GOOGLE_CLIENT_ID=...` (Google OAuth client ID for Drive sync)
- `VITE_GOOGLE_DRIVE_APPDATA_FILENAME=omb-data-envelope.json` (optional custom appDataFolder file name)
- `VITE_GOOGLE_DRIVE_SCOPE=https://www.googleapis.com/auth/drive.appdata`
- `VITE_GOOGLE_REDIRECT_URI=https://your-domain.example/...` (optional explicit redirect URI for OAuth)

## Development

Install dependencies:

```bash
npm install
```

Run frontend + backend together:

```bash
npm run dev
```

This runs the app on `http://localhost:5173` by default.

Run backend only:

```bash
npm run server
```

Build production assets:

```bash
npm run build
```

## GitHub Pages (project site mode)

This repo includes a GitHub Actions workflow at [.github/workflows/deploy-pages.yml](./.github/workflows/deploy-pages.yml) that deploys to GitHub Pages as a project site.

- Expected URL: `https://jaredfhealy.github.io/omb/`
- Workflow sets `VITE_PUBLIC_BASE_PATH=/omb/` during build.
- Vue Router uses `import.meta.env.BASE_URL` so route resolution works under the project path.

To enable:

1. Push to `main` (or run the workflow manually from Actions).
2. In GitHub repository settings, ensure **Pages** is configured to use **GitHub Actions**.
3. (Optional) To enable Drive sync in production, add these **Actions Variables** in repository or `github-pages` environment settings:
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_GOOGLE_DRIVE_APPDATA_FILENAME`
   - `VITE_GOOGLE_DRIVE_BACKUP_PREFIX`
   - `VITE_GOOGLE_DRIVE_BACKUP_RETENTION`
   - `VITE_GOOGLE_DRIVE_SCOPE`
   - `VITE_GOOGLE_REDIRECT_URI`
4. After first successful deploy, open the `github-pages` environment URL from the workflow summary.

## Local development and production hosting

The app is designed to run in two browser environments:

- Local development: `http://localhost:5173`
- Production: `https://jaredfhealy.github.io/omb/`

## Google Drive sync

Drive sync is optional and user-initiated (Connect Drive in Data Manager). Core app persistence remains local-first.

To enable Drive sync in a browser build:

1. Create a Google Cloud OAuth client for a web app.
2. Add the app domain to the authorized JavaScript origins.
3. Add the redirect URI used by the app (if needed).
4. Set these environment variables before running the frontend build:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_GOOGLE_DRIVE_APPDATA_FILENAME=omb-data-envelope.json
VITE_GOOGLE_DRIVE_BACKUP_PREFIX=omb-backup-
VITE_GOOGLE_DRIVE_BACKUP_RETENTION=20
VITE_GOOGLE_DRIVE_SCOPE=https://www.googleapis.com/auth/drive.appdata
```

If `VITE_GOOGLE_CLIENT_ID` is not set, Drive sync remains unavailable and the app stays local-only.
For GitHub Pages, these values must be present in GitHub Actions Variables because `.env.local` is not used by the deployment runner.
Drive OAuth is user-initiated from the UI and is not triggered automatically during app bootstrap.
When connected, each local save is mirrored to Drive. Drive writes snapshot the previous main data envelope into timestamped backup files in `appDataFolder` and prune old backups based on retention.

## Data migration workflow

To import existing data from prior backups:

1. Open the app and select the target account from the account dropdown in the navbar
2. Click **Restore**
3. Select your full backup JSON
4. Confirm restore and verify tabs/charts