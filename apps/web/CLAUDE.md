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
npm run test:e2e -w web   # playwright test — needs apps/api's dev server + Postgres running
```

Equivalent raw scripts inside `apps/web/package.json`: `dev`, `build`, `start`, `lint`, `test:e2e`.

## Architecture

- App Router under `src/app`, TypeScript path alias `@/*` → `src/*` (see `tsconfig.json`).
- `next.config.ts` is currently empty (no custom config).
- No test runner is configured yet.
- `src/app/register/page.tsx` — client component (`'use client'`) rendering a registration form (email + password + confirm password) built with HeroUI's `Form`/`TextField`/`Card`/`Alert`. Submits directly to the API's `POST /auth/register` (see `apps/api/CLAUDE.md` § Architecture) via `fetch`, client-validates email format and password length (mirroring the API's `RegisterDto`) before submit, surfaces a 409 (duplicate email) as a field-level error via `Form`'s `validationErrors` prop, and stores the returned `accessToken` in `localStorage` before redirecting to `/`.
- `src/app/auth/login/page.tsx` — client component mirroring the register page's structure (same HeroUI form components, same password show/hide toggle). Submits to `POST /auth/login` via `fetch`, treats any 401 as a generic "Invalid email or password" banner (the API deliberately returns the same message for unknown emails and wrong passwords, so the client doesn't distinguish either), stores `accessToken` in `localStorage`, and redirects to `/`. Links to `/register`.
- `src/app/page.tsx` — the protected home page. Client component: on mount it reads `accessToken` from `localStorage` and redirects to `/auth/login` if absent (there's no server-side session/middleware, so this is a client-side-only guard — see § Auth below). Fetches `GET /users/me` and `GET /meetings` in parallel (Bearer token); the header renders the current user as a HeroUI `Avatar`/`Avatar.Fallback` (initials, same derivation as the profile page) plus their name (or email if no name is set) as a `Link` to `/profile` — this is the only way to reach the profile page from the UI. The body renders the total meeting count and the 3 most recent meetings (sorted client-side by `date` descending — the API returns the full unsorted array, no pagination) as links to `/meetings/[id]`. A 401 from either request clears the stored token and redirects to `/auth/login`; any other non-OK response or network failure shows a retryable `Alert`. The "Create meeting" button is currently a disabled placeholder — there is no meeting-creation UI yet.
- `src/app/profile/page.tsx` — the profile page. Client component, same `accessToken` guard as the other protected pages. On mount fetches `GET /users/me` (Bearer token); a 401 clears the token and redirects to `/auth/login`, any other non-OK response or network failure shows a retryable `Alert`. Renders the email (read-only) and name inside a HeroUI `Card`, with a HeroUI `Avatar`/`Avatar.Fallback` showing initials derived from the name (first letter of up to the first two words) or, if no name is set, the first letter of the email. The name is editable via a HeroUI `Form`/`TextField` (bound to local state, seeded from the fetched profile) with a "Save" button; submitting sends `PATCH /users/me` (Bearer token, `{ name }`) and updates both the input and the avatar initials straight from the response body, without reloading or refetching. A 401 on save clears the token and redirects to `/auth/login` like the initial load; other failures (non-OK response or network error) show an inline `Alert` above the field without clearing the typed value, distinct from the retryable top-level `Alert` used for load failures. A real avatar image is not implemented yet — the `Avatar.Fallback` initials are the only avatar UI so far.
- `src/app/meetings/[id]/page.tsx` — the meeting detail page. Client component, same `accessToken` guard as the home page (via `useParams()` for the dynamic segment, not the `params` prop, since this is a Client Component). On mount fetches `GET /meetings/:id` and `GET /meetings/:id/files` in parallel; a 401 from either clears the token and redirects to `/auth/login`, a 404 from either (non-owner) renders an "Access denied" message instead of the page content. Renders the file list in a HeroUI `Table` (name, size formatted as B/KB/MB/GB, MIME type, upload date). Each row has a download button (`fetch`s the download endpoint with the Bearer token, since a plain `<a href>` can't carry an auth header — turns the response into a `Blob`, then triggers the browser download via a temporary `<a download>` pointing at an `Object URL`) and a delete button wrapped in a HeroUI `AlertDialog` confirmation; on confirm it calls `DELETE /meetings/:id/files/:fileId` and removes the file from local state without reloading. An "Upload a file" card above the file list lets the owner pick a single file (HeroUI `Input type="file"`, remounted via a `key` counter after a successful upload to reset it — file inputs are uncontrolled, so this is simpler than reaching for a ref) and submit it via `XMLHttpRequest` (not `fetch`, since only `xhr.upload.onprogress` exposes upload progress) as multipart form data to `POST /meetings/:id/files` with the Bearer token, rendering a HeroUI `ProgressBar` while it's in flight. On success the returned file is appended to local state (no reload). On failure it surfaces a specific message for `413` (too large) and `415` (unsupported type) API responses, reusing the same action-error `Alert` as download/delete; the file is never added to the list on error.

## Auth

Auth state is **client-side only**: `accessToken` (a JWT) lives in `localStorage`, set by `register`/`login` and read by any page/request that needs it. There is no cookie, no Next.js middleware, and no server-side session check — protected pages (currently just `src/app/page.tsx`) guard themselves in a `useEffect` by checking for the token and redirecting to `/auth/login` if it's missing or the API returns 401. Follow this same pattern for new protected routes rather than introducing middleware or a context provider, unless the app's auth needs grow beyond what a single client check can handle.

## Environment

Copy `apps/web/.env.local.example` to `apps/web/.env.local` (gitignored) if you need to override the API URL. Variables:

- `NEXT_PUBLIC_API_URL` — base URL of `apps/api`, used by client components that call the API directly (e.g. `src/app/register/page.tsx`). Defaults to `http://localhost:4000` when unset. Must be `NEXT_PUBLIC_`-prefixed since it's read from client-side code.

## UI library

- [HeroUI v3](https://heroui.com) (`@heroui/react`, `@heroui/styles`) is the component library, on top of Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/postcss`) and `tailwind-variants`.
- `postcss.config.mjs` runs the `@tailwindcss/postcss` plugin. `src/app/globals.css` imports `tailwindcss` then `@heroui/styles` (order matters).
- HeroUI v3 needs **no provider** — don't wrap the tree in `HeroUIProvider`. Components use compound composition (e.g. `Card.Header`), not flat props, and `onPress` instead of `onClick`.
- Theming is CSS-variable/`oklch`-based; light/dark is driven by a `data-theme` attribute (no theme toggle wired up yet, so the app currently renders in light mode only).
- Before adding or changing components, fetch current docs with the project-local skill scripts in `.agents/skills/heroui-react/scripts/` (e.g. `node .agents/skills/heroui-react/scripts/get_component_docs.mjs Button`) rather than relying on prior knowledge — the API differs from HeroUI v2.
- `globals.css` overrides HeroUI's default `Button` heights (`.button--sm`/`--md`/`--lg`, measured at 32/36/40px) up to a 44px (`2.75rem`) minimum, and icon-only buttons (`.button--icon-only.button--sm/--md`) to a 44×44px square, to meet the WCAG/HIG/Material minimum touch target size. This is an app-wide `@layer components` override, not a per-page fix — don't reintroduce per-component `min-h-11`/`size-11` classNames for this same purpose.

## Testing

`@playwright/test` is configured for e2e testing: `playwright.config.ts` (project root `apps/web`) drives Chromium against `http://localhost:3000`, starting `npm run dev` itself if nothing is already listening there (`reuseExistingServer: !CI`, so it happily reuses the dev server you already have running). Specs live under `e2e/*.spec.ts`. Tests seed their own data (register a user, create a meeting, upload a file) via direct API calls through Playwright's `request` fixture rather than the UI, then drive only the flow under test through the browser — this requires `apps/api`'s dev server and a local Postgres to be running (see root `CLAUDE.md` § Database), same as `apps/api`'s own e2e suite. Run via `npm run test:e2e -w web`.

## Testing UI changes

Whenever you make any UI change in this app, you **must**:

- Visually verify the change in a real browser using the `playwright` MCP tools (`mcp__playwright__browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, etc.) — don't consider a UI change done from code/types alone.
- Review the change against the `ui-ux-pro-max` skill (styles, color, typography, layout, accessibility) before calling it finished.
- **Do not start the dev server yourself** — `npm run dev:web` is always already running at `http://localhost:3000`. Just navigate to it with Playwright.

## Keeping documentation in sync

When you add a route, dependency, config, or otherwise change this app's architecture, update this file in the same change — don't leave it describing a stale structure.

## meeting-file-upload-storage-and-display

Use this doc for research: @docs/meeting-file-upload-storage-and-display.md
