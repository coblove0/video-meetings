# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

This is an npm workspaces monorepo with two independent applications, each with its own `CLAUDE.md` for app-specific details:

- `apps/web` — Next.js frontend (App Router, TypeScript, ESLint). See `apps/web/CLAUDE.md`.
- `apps/api` — NestJS backend (TypeScript, ESLint, Prettier). See `apps/api/CLAUDE.md`.

The two apps currently have no shared code or package between them — no shared types, no shared UI, no shared config package. Each app manages its own ESLint config; Prettier is shared from the root `.prettierrc` (which `apps/api` overrides with its own identical `.prettierrc`).

There is only one `package-lock.json`, at the root — dependencies for both apps are hoisted into the root `node_modules` via npm workspaces. Always run `npm install` from the repo root, never inside `apps/web` or `apps/api`.

## Commands

Run from the repo root:

```bash
npm install              # install deps for both workspaces

npm run dev:web           # Next.js dev server — http://localhost:3000
npm run dev:api           # NestJS dev server with watch — http://localhost:4000

npm run lint               # eslint across both workspaces
npm run lint:web
npm run lint:api

npm run format              # prettier --write across apps/**
npm run format:check        # prettier --check across apps/**

npm run build                # build both workspaces
npm run build:web
npm run build:api

npm run test:api             # jest unit tests for apps/api
```

To run a single Nest test file or filter by name, use `-w api` to target the workspace and pass jest args through:

```bash
npm run test -w api -- app.controller.spec
npm run test -w api -- -t "some test name"
npm run test:e2e -w api
```

There is no test runner configured for `apps/web` yet.

## Ports

`apps/api` listens on port 4000 by default (`PORT` env var overrides it) — deliberately not 3000, since Next.js dev server owns 3000. Keep this separation if either default ever changes.

## Keeping documentation in sync

Whenever a change alters the project's architecture — new module/package, new shared code between `apps/web` and `apps/api`, a changed port or entry point, a new service (database, queue, auth provider), a changed build/test/lint command — update this file and/or the relevant app's `CLAUDE.md` (`apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`) in the same change. Treat outdated docs here as a bug, not a follow-up task.
