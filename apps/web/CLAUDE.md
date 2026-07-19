# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Part of a monorepo

This app lives at `apps/web` inside an npm workspaces monorepo — see the root `CLAUDE.md` for cross-cutting commands and the sibling `apps/api` (NestJS) app. Do **not** run `npm install` inside this directory; dependencies are hoisted to the root `node_modules`.

## Commands

Run from the repo root (or add `-w web` / `--prefix apps/web` if working from elsewhere):

```bash
npm run dev:web       # next dev — http://localhost:3000
npm run build:web     # next build
npm run lint:web      # eslint
```

Equivalent raw scripts inside `apps/web/package.json`: `dev`, `build`, `start`, `lint`.

## Architecture

- App Router under `src/app`, TypeScript path alias `@/*` → `src/*` (see `tsconfig.json`).
- `next.config.ts` is currently empty (no custom config).
- No test runner is configured yet.
- Currently just the scaffolded starter (`src/app/page.tsx`, `layout.tsx`) — no real routes, data fetching, or state management have been introduced yet.

## Keeping documentation in sync

When you add a route, dependency, config, or otherwise change this app's architecture, update this file in the same change — don't leave it describing a stale structure.
