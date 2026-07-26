# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Part of a monorepo

This app lives at `apps/api` inside an npm workspaces monorepo — see the root `CLAUDE.md` for cross-cutting commands and the sibling `apps/web` (Next.js) app. Do **not** run `npm install` inside this directory; dependencies are hoisted to the root `node_modules`.

## Commands

Run from the repo root (or add `-w api` if working from elsewhere):

```bash
npm run dev:api          # nest start --watch — http://localhost:4000
npm run build:api        # nest build
npm run lint:api         # eslint --fix
npm run test:api         # jest unit tests
```

Equivalent raw scripts inside `apps/api/package.json`: `start`, `start:dev`, `start:debug`, `start:prod`, `build`, `lint`, `format`, `test`, `test:watch`, `test:cov`, `test:debug`, `test:e2e`, `prisma:generate`, `prisma:migrate`, `prisma:studio`.

To run a single test or filter by name, pass jest args through the workspace script:

```bash
npm run test -w api -- app.controller.spec
npm run test -w api -- -t "some test name"
npm run test:e2e -w api      # uses test/jest-e2e.json
```

Prisma commands (run with `-w api`, or `cd apps/api` first — they need `apps/api` as the working directory to find `prisma.config.ts`/`.env`):

```bash
npm run prisma:generate -w api        # regenerate the client after editing prisma/schema.prisma
npm run prisma:migrate -w api -- --name <migration-name>   # create + apply a migration in dev
npm run prisma:studio -w api          # browse the DB at http://localhost:5555
```

## Environment

Copy `apps/api/.env.example` to `apps/api/.env` (gitignored) before running the app or its tests. Variables:

- `DATABASE_URL` — Postgres connection string for Prisma. Defaults match the root `docker-compose.yml` Postgres service (see root `CLAUDE.md` § Database) — start it with `docker compose up -d` first.
- `JWT_SECRET` — signing secret for access tokens issued by `AuthModule`. The example value is dev-only; use a real secret outside local dev.
- `JWT_EXPIRES_IN` — access token lifetime (e.g. `1h`), passed straight to `@nestjs/jwt`.

`@nestjs/config`'s `ConfigModule.forRoot({ isGlobal: true })` (registered in `AppModule`) loads `.env` into `process.env` as soon as `app.module.ts` is imported — this must happen before `PrismaService` is instantiated, since it reads `process.env.DATABASE_URL` in its constructor. Both `src/main.ts` and the e2e tests import `AppModule` first, so this ordering holds.

## Architecture

- Feature modules under `src/`: `app.module.ts` wires up `AppController`/`AppService` plus `PrismaModule`, `AuthModule`, and `MeetingsModule`, and registers `ConfigModule.forRoot({ isGlobal: true })`.
- Entry point is `src/main.ts`, which bootstraps `AppModule`, applies shared app config via `configureApp()` (see below), and listens on `process.env.PORT ?? 4000` (deliberately not 3000, since that's Next.js's dev port — see `apps/web`).
- `src/main.ts` uses `void bootstrap();` — keep the `void` operator on the top-level bootstrap call to satisfy the `@typescript-eslint/no-floating-promises` rule.
- `src/configure-app.ts` exports `configureApp()`, which applies the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`). Both `main.ts` and e2e tests call this — e2e tests build the app via `Test.createTestingModule(...).createNestApplication()` directly and never run `main.ts`, so anything `bootstrap()` needs at runtime (pipes, filters, interceptors) must go through this shared helper or it silently won't apply in tests.
- `src/prisma/` — `PrismaModule` (`@Global()`) provides `PrismaService`, a `PrismaClient` subclass using the `@prisma/adapter-pg` driver adapter (required in Prisma 7 — see below) that connects/disconnects on Nest module init/destroy.
- `src/auth/` — `AuthModule` follows the CQRS pattern via `@nestjs/cqrs` rather than a plain service: `AuthController` (`POST /auth/register`, `POST /auth/login`) dispatches through `CommandBus`/`QueryBus` instead of calling a service directly.
  - `commands/impl/register.command.ts` + `commands/handlers/register.handler.ts` (`@CommandHandler`) — registration mutates state (creates a `User`), so it's a command.
  - `queries/impl/login.query.ts` + `queries/handlers/login.handler.ts` (`@QueryHandler`) — login only reads a user and issues a token, no state mutation, so it's a query rather than a command.
  - `token.service.ts` — small `TokenService` shared by both handlers so JWT signing (`sub`, `email` payload) isn't duplicated between them.
  - Both endpoints return `{ accessToken }`; `register` 409s on a duplicate email, `login` 401s on an unknown email or wrong password (same message for both, to avoid user enumeration). Passwords are hashed with `bcrypt`. DTOs (`RegisterDto`, `LoginDto`) use `class-validator`; validation is enforced by the global `ValidationPipe` before a command/query is even dispatched.
  - `AuthModule` imports `CqrsModule` and registers the command/query handlers as providers (`CommandHandlers`/`QueryHandlers` arrays) — new use cases should follow the same `impl/` + `handlers/` split rather than growing a fat service.
  - `jwt-auth.guard.ts` — `JwtAuthGuard` verifies the `Authorization: Bearer <token>` header via the injected `JwtService` and attaches `{ userId, email }` to `request.user` (see the `declare module 'express'` augmentation in the same file). `current-user.decorator.ts` exports `@CurrentUser()`, a param decorator that reads `request.user`. `AuthModule` provides and exports both `JwtAuthGuard` and the `JwtModule.registerAsync(...)` dynamic module instance (kept in a local `jwtModule` const so the same instance is both imported and exported) — a module that only exports the guard without also re-exporting `jwtModule` breaks DI for any other module importing `AuthModule`, since Nest re-resolves the guard's own constructor deps (`JwtService`) from the consuming module's import graph, not from `AuthModule`'s.
- `src/meetings/` — `MeetingsModule` follows the same CQRS + `impl/`/`handlers/` split as `AuthModule`. `MeetingsController` (`POST /meetings`, `GET /meetings`, `GET /meetings/:id`) is guarded by `@UseGuards(JwtAuthGuard)` and reads the caller via `@CurrentUser()`; every command/query is scoped to `ownerId` from the token, so users only ever see their own meetings. `GetMeetingHandler` uses `findFirst({ where: { id, ownerId } })` (not `findUnique` by `id` alone) so a meeting owned by another user 404s the same way a nonexistent id does, rather than leaking existence. `CreateMeetingDto` validates `title` (non-empty string), `date` (ISO date string, stored as `Date`), and `participants` (non-empty string array) via `class-validator`. `MeetingsModule` imports `AuthModule` to get `JwtAuthGuard` (and its `JwtService` dependency) into scope.
- **Prisma schema and migrations** live in `apps/api/prisma/` (`schema.prisma`, `migrations/`), not under `src/`. The schema currently has `User` (with a `meetings Meeting[]` back-relation) and `Meeting` (`title`, `date`, `participants String[]`, `ownerId` FK to `User`). Prisma 7 no longer allows a `url` in the schema's `datasource` block — the connection string lives in `apps/api/prisma.config.ts` (`datasource: { url: env('DATABASE_URL') }`) instead, loaded via `dotenv/config`.
- The generator in `schema.prisma` outputs the generated client to `src/generated/prisma` (gitignored) rather than the default `node_modules/.prisma/client`. Jest's file crawler ignores dot-directories, so the default output path makes `@prisma/client` unresolvable under `ts-jest`; import `PrismaClient` from `../generated/prisma` (relative to `src/prisma/prisma.service.ts`), not from the `@prisma/client` package directly. Run `npm run prisma:generate -w api` after cloning or after schema changes to (re)create this folder.
- Unit tests (`*.spec.ts`) live next to their source files under `src/`; Jest's `rootDir` is `src` (see the `jest` block in `package.json`). E2E tests live separately under `test/`, configured via `test/jest-e2e.json`, and require Postgres running (`docker compose up -d` at the repo root) plus migrations applied (`npm run prisma:migrate -w api`).

## Keeping documentation in sync

When you add a module, dependency, config, or otherwise change this app's architecture, update this file in the same change — don't leave it describing a stale structure.
