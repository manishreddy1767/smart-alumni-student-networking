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
- Vitest and Supertest

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
```

The API test suite covers health, invalid credentials, seeded login, protected dashboard/discovery data, and unauthenticated access.
The current canonical suite includes 22 backend integration tests and 2 frontend smoke tests (24 tests total).

## Deployment notes

The production process is a single Node.js service: build the client and server with `npm run build`, then start Express with `npm start`. Configure `NODE_ENV=production`, a long random `JWT_SECRET`, `CLIENT_ORIGIN` for the deployed frontend origin, `PORT`, and a writable `DATABASE_PATH`. State-changing requests with a browser `Origin` or `Referer` are restricted to `CLIENT_ORIGIN`; login and registration attempts are rate-limited in memory per IP/email key, so use a shared rate-limit store before running multiple instances. Session cookies are invalidated when an account status changes, and public profile responses do not expose email addresses. SQLite is suitable for a small single-instance deployment; use a managed relational database before scaling to multiple application instances. The repository CI workflow runs `npm ci`, `npm test`, and `npm run build` for pushes and pull requests targeting `main`.

The repository does not include infrastructure provisioning, hosted database setup, browser-E2E automation, or a dedicated automated WCAG scanner. Those remain deployment/operator responsibilities and should be added before a larger production rollout.

### Database migrations and backup

The database initializer maintains an `app` schema version in `schema_meta` and applies only forward-compatible changes. It never drops tables or resets existing data. Before upgrades, stop the application and copy the SQLite database file to a protected backup location:

```powershell
Copy-Item server\data\app.db server\data\backups\app-$(Get-Date -Format yyyyMMdd-HHmmss).db
```

To restore, stop the application, preserve the current database for investigation, and copy a verified backup back to the configured `DATABASE_PATH`. Restore procedures should be tested before production use; SQLite backups are not encrypted by this application and must be protected by the deployment environment.
