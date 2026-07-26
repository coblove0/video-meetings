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
- `src/app/page.tsx` is still the scaffolded starter — no home/dashboard route has been built yet.
- `src/app/register/page.tsx` — client component (`'use client'`) rendering a registration form (email + password + confirm password) built with HeroUI's `Form`/`TextField`/`Card`/`Alert`. Submits directly to the API's `POST /auth/register` (see `apps/api/CLAUDE.md` § Architecture) via `fetch`, client-validates email format and password length (mirroring the API's `RegisterDto`) before submit, surfaces a 409 (duplicate email) as a field-level error via `Form`'s `validationErrors` prop, and stores the returned `accessToken` in `localStorage` before redirecting to `/`. There is no login page yet.

## Environment

Copy `apps/web/.env.local.example` to `apps/web/.env.local` (gitignored) if you need to override the API URL. Variables:

- `NEXT_PUBLIC_API_URL` — base URL of `apps/api`, used by client components that call the API directly (e.g. `src/app/register/page.tsx`). Defaults to `http://localhost:4000` when unset. Must be `NEXT_PUBLIC_`-prefixed since it's read from client-side code.

## UI library

- [HeroUI v3](https://heroui.com) (`@heroui/react`, `@heroui/styles`) is the component library, on top of Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/postcss`) and `tailwind-variants`.
- `postcss.config.mjs` runs the `@tailwindcss/postcss` plugin. `src/app/globals.css` imports `tailwindcss` then `@heroui/styles` (order matters).
- HeroUI v3 needs **no provider** — don't wrap the tree in `HeroUIProvider`. Components use compound composition (e.g. `Card.Header`), not flat props, and `onPress` instead of `onClick`.
- Theming is CSS-variable/`oklch`-based; light/dark is driven by a `data-theme` attribute (no theme toggle wired up yet, so the app currently renders in light mode only).
- Before adding or changing components, fetch current docs with the project-local skill scripts in `.agents/skills/heroui-react/scripts/` (e.g. `node .agents/skills/heroui-react/scripts/get_component_docs.mjs Button`) rather than relying on prior knowledge — the API differs from HeroUI v2.

## Keeping documentation in sync

When you add a route, dependency, config, or otherwise change this app's architecture, update this file in the same change — don't leave it describing a stale structure.
