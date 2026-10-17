# Architecture

## System overview

```text
React/Vite client
        |
        | JSON over same-origin HTTP
        v
Express API
  ├── route handlers and auth middleware
  ├── Zod validation
  ├── domain rules for connections, mentorship, opportunities
  └── repository helpers
        |
        v
SQLite database
```

The Vite development server proxies `/api` requests to Express. In production, Express serves the built client from `client/dist`, so the application can run as one local process.

## Main modules

- `server/src/db`: schema creation, seed data, and database access.
- `server/src/middleware`: session authentication and role authorization.
- `server/src/routes`: focused HTTP endpoints for auth, profiles, discovery, connections, mentorship, opportunities, notifications, and administration.
- `client/src`: page shell, reusable UI primitives, typed API client, and feature views.

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

The API uses `server/data/app.db` by default. Set `DATABASE_PATH`, `JWT_SECRET`, and `PORT` in a local `.env` file for deployment-like configuration; secrets are never committed.
