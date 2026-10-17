# Architecture Decisions

## Decision 1: TypeScript across the application

The project uses TypeScript for both the Express API and React client. This keeps the course project approachable, reduces context switching, and lets shared concepts such as role names and API contracts stay consistent.

## Decision 2: React + Vite instead of a server-rendered framework

The platform is an authenticated dashboard application with clear client-side navigation and interactive filters. React with Vite gives fast local feedback and a simple production build without coupling the course project to a hosted runtime.

## Decision 3: Express API with service-oriented modules

Express is used for HTTP transport while authentication, validation, persistence, and route handlers remain in separate modules. This keeps business rules testable and avoids putting the entire backend in a single file.

## Decision 4: SQLite with `better-sqlite3`

SQLite is a suitable default for local development and demonstration: it is relational, transactional, free, and requires no separate server. The schema is created by an idempotent initializer and can later be migrated to PostgreSQL behind the repository layer.

## Decision 5: Cookie-based JWT sessions

The API issues a short-lived signed JWT in an HTTP-only cookie. Passwords are hashed with bcryptjs; the client never receives or stores a password or token. This is intentionally a local, single-instance session design rather than a claim of enterprise SSO.

## Decision 6: Seeded demonstration records are explicit

The database seeds clearly labeled sample profiles and opportunities so the dashboard is useful immediately after setup. The UI identifies demo content and the README explains how to replace it.
