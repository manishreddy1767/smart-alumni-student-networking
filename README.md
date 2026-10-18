# AlumniConnect

### A practical career-networking platform for students and alumni

AlumniConnect is a full-stack Software Engineering project for Vardhaman College of Engineering. It gives students and verified alumni a focused place to find each other, ask for guidance, build professional connections, and share career opportunities.

This is a working application rather than a static UI mock-up. It includes a React frontend, an Express API, SQLite persistence, authentication, role-aware workflows, automated tests, and browser smoke tests.

> **Project status:** Ready for a local academic demonstration. Production deployment, full WCAG conformance, and horizontally scaled operation are not claimed or verified.

## What you can do

### Students

- Create and update a professional profile.
- Discover verified alumni by name, skills, interests, and mentoring availability.
- Send and manage connection requests.
- Request mentorship and schedule sessions from published availability.
- Browse opportunities and track application status.
- Read in-app notifications.

### Alumni

- Build a profile with skills, interests, experience, and availability.
- Accept or reject connection requests.
- Publish mentoring availability and manage mentorship sessions.
- Share career opportunities and review incoming applications.

### Administrators

- Verify alumni accounts.
- Moderate opportunities.
- Suspend or reactivate accounts.
- Review recent audit-log activity.

## Built with

| Layer | Technology |
| --- | --- |
| Web client | React 18, Vite, TypeScript |
| API | Express, TypeScript |
| Database | SQLite with `better-sqlite3` |
| Validation and security | Zod, bcryptjs, signed HTTP-only JWT cookies |
| Testing | Vitest, Supertest, Playwright, axe-core |

The architecture and design decisions are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Get started

### Prerequisites

- Node.js 22 or newer
- npm 10 or newer

### Install and run in development

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

The Vite development server serves the React client and proxies `/api` requests to the Express server on port `4000`.

### Run the production build locally

```bash
npm run build
npm start
```

The production server serves the built client and API from one Node.js process. By default, the local database is created at `server/data/app.db`.

## Try the demo

The application includes clearly labelled demonstration records so the main workflows can be explored without setting up accounts first.

All seeded accounts use:

```text
Password: DemoPass123!
```

| Role | Email |
| --- | --- |
| Student | `student@alumni-connect.local` |
| Alumni | `alumni@alumni-connect.local` |
| Administrator | `admin@alumni-connect.local` |

These records are sample data only. They do not represent real college users, real alumni records, or live job listings.

## Configuration

For local overrides, copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Available settings include:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_PATH` | SQLite database file | `server/data/app.db` |
| `JWT_SECRET` | Secret used to sign sessions | Development fallback only |
| `PORT` | Express server port | `4000` |
| `CLIENT_ORIGIN` | Allowed browser origin for CORS and CSRF checks | `http://localhost:5173` |
| `NODE_ENV` | Runtime mode | Development |

Production startup requires an explicitly configured `JWT_SECRET`. Use a long, randomly generated value and set `CLIENT_ORIGIN` to the actual frontend origin. Never commit `.env` files, credentials, or database files.

## Verify the project

Run the canonical checks from the repository root:

```bash
npm test
npm run build
npm run test:e2e
```

The test setup includes:

- **Vitest and Supertest:** backend integration coverage for authentication, authorization, security controls, persistence, and core workflows.
- **Frontend smoke tests:** focused checks for important client states and interactions.
- **Playwright:** five browser smoke tests covering landing-page navigation, authentication forms, registration and protected navigation, mobile rendering, and a representative accessibility scan.
- **axe-core:** a deliberately scoped check for document structure and accessible names. It is useful feedback, not a full WCAG conformance assessment.

Install the local Chromium browser once before running Playwright:

```bash
npx playwright install chromium
```

The browser suite starts the built application with an isolated temporary SQLite database, so it does not use or reset the normal local database.

## Database, migrations, and backups

The database initializer stores the current schema version in `schema_meta` and applies additive, forward-compatible changes. Re-running initialization does not drop tables or erase existing records. SQLite foreign keys, indexes, constraints, and a short busy timeout are enabled.

SQLite works well for local development and a small, single-instance demonstration. It serializes writes, so a busy system or multiple application instances can experience contention. Move to a managed relational database when the application needs multiple instances, heavier write traffic, stronger operational durability, or larger-scale growth.

There is no separate backup service or npm backup command. The supported procedure is a stopped-application file copy:

```powershell
$database = if ($env:DATABASE_PATH) { $env:DATABASE_PATH } else { "server\data\app.db" }
$backupDir = "server\data\backups"
New-Item -ItemType Directory -Force $backupDir | Out-Null
$backup = Join-Path $backupDir ("app-" + (Get-Date -Format yyyyMMdd-HHmmss) + ".db")
Copy-Item -LiteralPath $database -Destination $backup
```

For a restore, stop the application, preserve the current database, and first restore the backup to a separate temporary path. Open that copy and verify its schema and expected data before replacing the configured database. Protect backup files: this application does not encrypt them, and a consistent stopped-database copy is required instead of treating WAL/SHM sidecar files as a backup.

## Security and deployment notes

The application includes:

- bcrypt password hashing.
- Signed, HTTP-only session cookies.
- Same-origin checks for state-changing browser requests.
- Security response headers and disabled Express fingerprinting.
- Login and registration rate limiting with `Retry-After` responses.
- Session invalidation after account-status changes.
- Server-side role and ownership checks.
- Public profile responses that omit email addresses.

Rate limiting is held in process memory and is suitable only for a single application instance. A horizontally scaled deployment needs shared rate-limit storage. No deployment infrastructure is included in this repository, and hosted deployment behavior has not been verified.

## Project layout

```text
client/       React application and styles
server/       Express API, SQLite initialization, and backend tests
e2e/          Playwright browser smoke tests
docs/         Architecture, decisions, and implementation work log
```

The chronological implementation record is available in [`docs/WORK_LOG.md`](docs/WORK_LOG.md).

## Continuous integration

The GitHub Actions workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes and pull requests targeting `main`:

1. Install dependencies with `npm ci`.
2. Run the Vitest suite.
3. Create the production build.
4. Install Chromium.
5. Run the Playwright smoke suite.

The checks validate the application in CI, but they do not constitute a production deployment, a full accessibility audit, or a test of horizontally scaled infrastructure.

## License

See [`LICENSE`](LICENSE).
