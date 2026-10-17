# Architecture

## System overview

```text
React/Vite client
        |
        | JSON over same-origin HTTP
        v
Express API
  ├── route handlers, auth middleware, and security middleware
  ├── Zod validation
  ├── domain rules for connections, mentorship, opportunities
  └── SQLite queries and migration helpers
        |
        v
SQLite database
```

The Vite development server proxies `/api` requests to Express. In production, Express serves the built client from `client/dist`, so the application can run as one local process.

## Main implementation areas

- `server/src/db.ts`: schema creation, deterministic seed data, schema versioning, and additive migrations.
- `server/src/index.ts`: Express app setup, security headers, CORS/CSRF checks, rate limiting, session authentication, role authorization, validation, route handlers, SQLite queries, and production static-file serving. The current implementation intentionally keeps these backend concerns in one file rather than splitting them into `middleware`, `routes`, or repository directories.
- `server/src/index.test.ts`: Supertest/Vitest integration coverage for authentication, authorization, workflows, privacy, security, and database migration behavior.
- `client/src/main.tsx`: React app shell, same-origin API helper, client-side page navigation, feature views, loading/error/empty states, pagination, and accessibility labels.
- `client/src/styles.css`: shared visual system, responsive layout, focus-visible states, and mobile adaptations.
- `client/src/frontend-smoke.test.tsx`: lightweight server-rendered smoke checks for shared frontend state primitives.

## Data model

- `users` stores identity, role, account state, password hash, and timestamps.
- `profiles` stores role-specific profile details with a one-to-one user relationship.
- `connection_requests` stores directional requests with a uniqueness constraint for each pair.
- `mentorship_requests` stores student/alumni requests and status transitions.
- `mentorship_sessions` stores scheduled sessions and cancellation state.
- `opportunities` stores moderated jobs and internships.
- `notifications` stores in-app unread/read events.
- `audit_logs` records administrative actions.

Foreign keys, indexes, status checks, and server-side validation protect the important relationships. All private routes check the current user from the signed cookie; role checks happen in the API, not only in the client.

## Local runtime

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:5173`

The API uses `server/data/app.db` by default. Set `DATABASE_PATH`, `JWT_SECRET`, `CLIENT_ORIGIN`, `NODE_ENV`, and `PORT` in a local `.env` file for deployment-like configuration; secrets are never committed. Production startup requires an explicit `JWT_SECRET`.

## Operational boundaries

- SQLite and the in-memory login/registration limiter are designed for local development and small single-instance deployments. SQLite serializes writes; the application uses a five-second busy timeout, but concurrent write-heavy or multi-instance workloads should move to a managed relational database and shared rate-limit store.
- The application provides schema versioning and additive forward migrations, but backup/restore execution remains an operator responsibility.
- CI verifies installation, tests, and the production build; it does not provision infrastructure or run browser automation.
- Accessibility coverage currently consists of semantic markup, keyboard-focus styling, labels, responsive behavior, and frontend smoke tests. A dedicated automated WCAG scanner is not part of the repository.
