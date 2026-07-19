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

Equivalent raw scripts inside `apps/api/package.json`: `start`, `start:dev`, `start:debug`, `start:prod`, `build`, `lint`, `format`, `test`, `test:watch`, `test:cov`, `test:debug`, `test:e2e`.

To run a single test or filter by name, pass jest args through the workspace script:

```bash
npm run test -w api -- app.controller.spec
npm run test -w api -- -t "some test name"
npm run test:e2e -w api      # uses test/jest-e2e.json
```

## Architecture

- Standard Nest module/controller/service structure under `src/`: `app.module.ts` wires `AppController` and `AppService` together (no other modules registered yet).
- Entry point is `src/main.ts`, which bootstraps `AppModule` and listens on `process.env.PORT ?? 4000` (deliberately not 3000, since that's Next.js's dev port — see `apps/web`).
- `src/main.ts` uses `void bootstrap();` — keep the `void` operator on the top-level bootstrap call to satisfy the `@typescript-eslint/no-floating-promises` rule.
- Unit tests (`*.spec.ts`) live next to their source files under `src/`; Jest's `rootDir` is `src` (see the `jest` block in `package.json`). E2E tests live separately under `test/`, configured via `test/jest-e2e.json`.
- Currently just the Nest CLI starter (`AppController`/`AppService` with a single `getHello()`) — no real modules, database, or auth have been introduced yet.

## Keeping documentation in sync

When you add a module, dependency, config, or otherwise change this app's architecture, update this file in the same change — don't leave it describing a stale structure.
