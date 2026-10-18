# AlumniConnect

Smart Alumni–Student Career Networking Platform for Vardhaman College of Engineering.

AlumniConnect gives students and verified alumni one trusted place to discover one another, request mentorship, exchange connection requests, and share career opportunities. It is a locally runnable Software Engineering course project with a real Express API and SQLite persistence, not a static UI prototype.

## Features

- Public landing page and responsive navigation.
- Student, alumni, and administrator accounts with server-enforced role checks.
- Secure bcrypt password hashing and HTTP-only JWT session cookies.
- Student and alumni profile editing, visibility controls, skills, and interests.
- Verified alumni discovery with search and mentoring availability filters.
- Connection request lifecycle: send, accept, reject, and cancel.
- Mentorship request lifecycle with alumni availability controls.
- Mentorship session scheduling from open availability, with cancellation and completion actions.
- Opportunity search and publishing with explicit demonstration-data labels.
- Paginated alumni and opportunity discovery, with internal application status management.
- In-app notifications with unread/read state.
- Administrator dashboard for alumni verification, opportunity moderation, account moderation, and recent audit-log review.
- SQLite schema with foreign keys, indexes, constraints, and deterministic seed data.

## Stack

- React 18, Vite, and TypeScript
- Express and TypeScript
- SQLite via `better-sqlite3`
- Zod validation, bcryptjs password hashing, signed JWT cookies
- Vitest, Supertest, Playwright, and axe-core

The rationale and system/data architecture are documented in [`docs/DECISIONS.md`](docs/DECISIONS.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The development server proxies `/api` to the Express server at port 4000.

To verify a production build:

```bash
npm run build
npm start
```

The local SQLite database is created at `server/data/app.db`. Copy `.env.example` to `.env` and set `DATABASE_PATH`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN`, or `NODE_ENV` when needed. Do not commit `.env` or database files. Production startup fails fast unless `JWT_SECRET` is explicitly configured; use a long randomly generated value and set `CLIENT_ORIGIN` to the deployed frontend origin.

## Demo accounts

All seeded demo accounts use `DemoPass123!`. The seeded records are intentionally labeled demonstration content and are not real college records or live job listings.

| Account | Email |
| --- | --- |
| Student | `student@alumni-connect.local` |
| Alumni | `alumni@alumni-connect.local` |
| Administrator | `admin@alumni-connect.local` |

## Verification

```bash
npm test
npm run build
npm run test:e2e
```

The API test suite covers health, invalid credentials, seeded login, protected dashboard/discovery data, and unauthenticated access.
The canonical Vitest suite includes 24 backend integration tests and 2 frontend smoke tests (26 tests total). `npm run test:e2e` starts the production build with an isolated temporary SQLite database and runs headless Chromium smoke tests for navigation, authentication forms, registration, mobile layout, and focused axe-core structural checks. Install the local browser once with `npx playwright install chromium`.

## Deployment notes

The production process is a single Node.js service: build the client and server with `npm run build`, then start Express with `npm start`. Configure `NODE_ENV=production`, a long random `JWT_SECRET`, `CLIENT_ORIGIN` for the deployed frontend origin, `PORT`, and a writable `DATABASE_PATH`. State-changing requests with a browser `Origin` or `Referer` are restricted to `CLIENT_ORIGIN`; login and registration attempts are rate-limited in memory per IP/email key, so use a shared rate-limit store before running multiple instances. Session cookies are invalidated when an account status changes, and public profile responses do not expose email addresses. SQLite is suitable for local development and small single-instance deployments: it serializes writes, and this app waits briefly on a locked database, but it is not a substitute for a multi-instance production database. Move to a managed relational database when write contention, multiple application instances, operational durability, or workload growth make SQLite's single-file and concurrent-write limits unsuitable. The repository CI workflow runs `npm ci`, `npm test`, `npm run build`, installs Chromium, and runs `npm run test:e2e` for pushes and pull requests targeting `main`.

The repository includes a focused Playwright browser smoke suite and a scoped axe-core scan. The scan is not a WCAG conformance claim; remaining color-contrast findings outside the shared tokens require further visual review. Browser tests use an isolated temporary database and do not validate deployment infrastructure or hosted browser availability.

### Database migrations and backup

The database initializer maintains an `app` schema version in `schema_meta` and applies only forward-compatible changes. It never drops tables or resets existing data. The repository does not include a separate backup service or command: the supported mechanism is a file copy while the application is stopped, so no process can write during the copy. Before upgrades, create a protected backup directory and copy the configured SQLite database file:

```powershell
$database = if ($env:DATABASE_PATH) { $env:DATABASE_PATH } else { "server\data\app.db" }
$backupDir = "server\data\backups"
New-Item -ItemType Directory -Force $backupDir | Out-Null
$backup = Join-Path $backupDir ("app-" + (Get-Date -Format yyyyMMdd-HHmmss) + ".db")
Copy-Item -LiteralPath $database -Destination $backup
```

To restore, stop the application, preserve the current database for investigation, and copy a verified backup to a separate temporary path first. Open that copy with the application or a read-only SQLite client and verify the expected schema/data before replacing the configured `DATABASE_PATH`. A same-volume replacement can then use `Copy-Item -LiteralPath $backup -Destination $database -Force`. Restore procedures should be tested before production use; SQLite backups are not encrypted by this application, WAL/SHM sidecar files must not be copied as a substitute for a consistent stopped-database copy, and backup files must be protected by the deployment environment.
