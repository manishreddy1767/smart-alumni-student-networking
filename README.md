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
- Opportunity search and publishing with explicit demonstration-data labels.
- In-app notifications with unread/read state.
- Administrator dashboard for alumni verification and audit-ready actions.
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
