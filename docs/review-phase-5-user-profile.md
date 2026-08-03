# Code review: PR #60 `feature/phase-5` → `master`

**Дифф:** `2a60867..20af79a` — 4 коммита, 14 файлов, +450/−12, только `apps/api`.
**Фича:** Фаза 1 профиля пользователя — миграция + чтение/редактирование имени.

## Скоуп

Реализована **только Фаза 1** из `docs/plan-user-profile-edit-name-avatar-password.md`:
`GET /users/me`, `PATCH /users/me` (имя), миграция с `name`/`avatarPath`/`avatarMimeType`.
Аватар и смена пароля из PRD — следующие фазы.

Соответствие PRD (`docs/prd-user-profile-edit-name-avatar-password.md` § Критерии готовности)
в рамках фазы — полное:

| Критерий PRD | Статус |
| --- | --- |
| Аутентифицированный видит имя/email/признак аватара | ✅ `GET /users/me` |
| Пользователь меняет имя и оно сохраняется | ✅ `PATCH /users/me` + e2e на персистентность |
| Неаутентифицированный получает отказ | ✅ `JwtAuthGuard` + e2e на 401 |
| Нельзя прочитать/изменить чужой профиль | ✅ `userId` берётся только из JWT |
| CQRS-паттерн, а не прямой вызов между модулями | ✅ Command/Query + шины |
| Аватар, смена пароля | ⏳ вне этой фазы |

---

## Замечания

### 1. `UpdateProfileHandler`: лишний запрос + гонка, из-за которой проверка не работает

`apps/api/src/users/commands/handlers/update-profile.handler.ts:15-27`

```ts
const existing = await this.prisma.user.findUnique({ where: { id: command.userId } });
if (!existing) throw new NotFoundException('User not found');
const user = await this.prisma.user.update({ ... });
```

Три проблемы в одном месте:

- **Лишний round-trip.** `update` по несуществующему `id` и так бросает Prisma `P2025`.
  Предзапрос не добавляет корректности, только удваивает число запросов на каждый PATCH.
- **`findUnique` без `select`** тянет всю строку, включая `passwordHash`, в память процесса.
  В соседнем `GetCurrentUserHandler` и в самом `update` ниже `select` стоит — здесь забыт.
  Утечки наружу нет (результат не возвращается), но это ровно та привычка, из-за которой
  хэш однажды уедет в лог или в ответ.
- **TOCTOU.** Два запроса вне транзакции: если строку удалят между `findUnique` и `update`,
  `P2025` вылетит необработанным → **500 вместо 404**. То есть защита, ради которой добавлен
  предзапрос (коммит `af0be77`), в реальной гонке не срабатывает.

Достаточно одного запроса с перехватом:

```ts
try {
  const user = await this.prisma.user.update({
    where: { id: command.userId },
    data: { name: trimmed === '' ? null : trimmed },
    select: { id: true, email: true, name: true, avatarPath: true },
  });
  return { ...user, hasAvatar: user.avatarPath !== null };
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
    throw new NotFoundException('User not found');
  }
  throw e;
}
```

`update-profile.handler.spec.ts:8-14,89-96` придётся поправить — мок сейчас завязан на
`findUnique`, и тест «throws 404 and does not attempt an update» проверяет именно предзапрос.

### 2. `MaxLength(100)` проверяется до `trim()`

`apps/api/src/users/dto/update-profile.dto.ts:5` vs `update-profile.handler.ts:22`

DTO валидирует сырую строку, а хендлер сохраняет обрезанную. Расходятся в обе стороны:
имя из 100 значащих символов с пробелом по краям отклоняется с 400, хотя в БД легло бы 100;
а `"   "` проходит валидацию и молча превращается в `null`. Нормализовать нужно до валидации:

```ts
@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
@IsString()
@MaxLength(100)
name: string;
```

Глобальный `ValidationPipe` уже с `transform: true` (`src/configure-app.ts`), так что
`@Transform` отработает. После этого `trim()` из хендлера уходит, и «пустое имя очищает поле»
остаётся единственным местом принятия решения.

### 3. `PATCH` с телом без `name` возвращает 400, хотя должен быть no-op

`apps/api/src/users/dto/update-profile.dto.ts:4-6`

`@IsString()` без `@IsOptional()` делает `name` обязательным, то есть `PATCH /users/me {}`
падает с 400. Для `PATCH` (частичное обновление) семантика обратная: отсутствующее поле —
«не трогать». Пока поле в DTO одно, разницы почти нет, но Фаза 3 (аватар) и Фаза 5 (пароль)
добавят поля в тот же ресурс, и тогда «обновить только аватар» станет невозможно без
переписывания DTO. Дешевле заложить `@IsOptional()` + `if (command.name !== undefined)`
в хендлере сейчас, чем ломать контракт потом.

### 4. E2E-тесты оставляют мусор в БД

`apps/api/test/users.e2e-spec.ts:27-36`

`registerUser()` создаёт пользователя через `POST /auth/register` в каждом из шести тестов
и нигде не удаляет. Корневой `CLAUDE.md` § Test data требует обратного — оставлять только
базового `test@example.com`. После каждого прогона `test:e2e` в `video_meetings` оседает
+6 строк `User`. Нужен `afterEach`/`afterAll` с удалением по собранным id
(или по префиксу email `test-%@example.com`) через `PrismaService` из тестового модуля.

### 5. 404 на валидный JWT удалённого пользователя

`get-current-user.handler.ts:19-21`, `update-profile.handler.ts:18-20`

Токен подписан и не истёк, но субъекта больше нет — это невалидные учётные данные,
а не отсутствующий ресурс. `401` заставит клиент разлогиниться и перевыпустить токен;
`404` он, скорее всего, покажет как «профиль не найден» и оставит мёртвую сессию.
Приоритет низкий, но поведение стоит зафиксировать осознанно, а не по умолчанию.

---

## Что сделано хорошо

- `userId` во всех путях берётся исключительно из JWT (`@CurrentUser()`), в БД не приходит
  ни одного идентификатора из тела запроса — IDOR закрыт по построению.
- `select` в `GetCurrentUserHandler` перечисляет поля явно, `passwordHash` не попадает в
  выборку даже случайно; e2e это проверяет (`expect(body).not.toHaveProperty('passwordHash')`).
- `hasAvatar: avatarPath !== null` вместо самого пути — клиенту не видна раскладка на диске.
- `forbidNonWhitelisted` реально протестирован (`{ name, isAdmin: true }` → 400), а не принят
  на веру из конфига пайпа.
- Миграция чисто аддитивная, все три колонки nullable — накатывается на непустую таблицу
  без дефолтов и долгих блокировок.
- `UsersModule` импортирует `AuthModule` только ради `JwtAuthGuard`, связь с `AuthModule`
  остаётся односторонней через шины — цикла импортов нет.
- `apps/api/CLAUDE.md` обновлён в том же изменении, включая описание новых хендлеров.

## Производительность

Обе ручки — точечный доступ по первичному ключу, индексы не нужны. Единственная лишняя
работа на запрос — предзапрос из замечания №1 (2 round-trip'а вместо 1 на каждый PATCH).

## Итог

Блокирующих дефектов нет; PR уже смержен. Догоняющим коммитом стоит закрыть **№1**
(тихий 500 в гонке + лишний запрос) и **№4** (мусор в БД вопреки `CLAUDE.md`).
**№3** дешевле сделать до Фазы 3. Остальное — на усмотрение.

---

## Вне диффа этого PR (уже в `master`, коммит `2a60867`)

Замечания ниже относятся к базе PR, а не к его изменениям — оставлены здесь, чтобы не потерять.

- **`.claude/settings.json`**: в закоммиченный teamwide-файл добавлены `Edit(*)`, `Write(*)`,
  `Bash(git *)`, `Bash(gh *)`, `Bash(npx prisma *)`. После клона у любого участника Claude Code
  сможет писать в любой файл и выполнять произвольные `git`/`gh` без подтверждения — включая
  `git push --force` и `gh pr merge`. Место таким правилам в `.claude/settings.local.json`.
- **`.claude/hooks/stop.js:42-48`**: ветка «milestone закрыт» запускает `claude -p` без учёта
  `maxIterations` (он проверяется только на пути с открытыми issues). Порождённая сессия видит
  тот же конфиг, те же закрытые issues и запускает следующую — рекурсия без дна, каждый виток
  полноценная сессия Opus 5. Нужен `config.active = false` в файл **перед** `execSync` либо
  отдельный флаг `finalReviewDone`.
- **`.claude/hooks/stop.js:26,40-41`**: `config.milestone` и `config.prompt` интерполируются
  в строку `execSync` без экранирования. Любая кавычка в конфиге ломает команду или выполняет
  произвольный код. `execFileSync('gh', [...])` с массивом аргументов снимает вопрос.
