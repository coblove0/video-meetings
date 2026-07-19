# video-meetings

Монорепозиторий на npm workspaces.

## Структура

- `apps/web` — фронтенд на Next.js (App Router, TypeScript, ESLint).
- `apps/api` — бэкенд на NestJS (TypeScript, ESLint, Prettier).

## Установка

```bash
npm install
```

## Разработка

```bash
npm run dev:web    # Next.js dev-сервер (http://localhost:3000)
npm run dev:api    # NestJS dev-сервер с watch (http://localhost:3000, см. apps/api/src/main.ts)
```

## Линтинг и форматирование

```bash
npm run lint          # eslint во всех воркспейсах
npm run lint:web
npm run lint:api

npm run format         # prettier --write
npm run format:check   # prettier --check
```

## Сборка

```bash
npm run build       # сборка всех воркспейсов
npm run build:web
npm run build:api
```
