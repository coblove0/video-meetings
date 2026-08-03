# Публикует code review Фазы 5 в PR #60 (обзорный комментарий + инлайн-замечания).
# Запуск из корня репозитория:  .\scripts\post-review-pr60.ps1
# Требует авторизованного gh (gh auth status).

$ErrorActionPreference = 'Stop'

$repo   = 'coblove0/video-meetings'
$pr     = 60
$commit = '09803d3ef7e50e739563740aa94d6f2eb9a263fc'  # head PR #60 = 20af79a^2

$root       = Split-Path -Parent $PSScriptRoot
$reviewFile = Join-Path $root 'docs\review-phase-5-user-profile.md'
if (-not (Test-Path $reviewFile)) { throw "Не найден файл ревью: $reviewFile" }

Write-Host '→ обзорный комментарий к PR' -ForegroundColor Cyan
gh pr comment $pr --repo $repo --body-file $reviewFile
if ($LASTEXITCODE -ne 0) { throw 'gh pr comment завершился с ошибкой' }

$comments = @(
  @{
    path       = 'apps/api/src/users/commands/handlers/update-profile.handler.ts'
    start_line = 15
    line       = 20
    body       = @'
**Лишний запрос + гонка, из-за которой эта же проверка и не работает.**

1. `update` по несуществующему `id` и так бросает Prisma `P2025` — предзапрос не добавляет корректности, только удваивает round-trip на каждый `PATCH`.
2. `findUnique` без `select` тянет всю строку, включая `passwordHash`, в память процесса. Ниже в `update` и в соседнем `GetCurrentUserHandler` `select` есть — здесь забыт.
3. TOCTOU: два запроса вне транзакции. Если строку удалят между `findUnique` и `update`, `P2025` вылетит необработанным → **500 вместо 404**. То есть защита, ради которой предзапрос и добавлялся (`af0be77`), в реальной гонке не срабатывает.

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

`update-profile.handler.spec.ts:8-14,89-96` придётся поправить: мок завязан на `findUnique`, а тест «throws 404 and does not attempt an update» проверяет именно предзапрос.
'@
  },
  @{
    path = 'apps/api/src/users/dto/update-profile.dto.ts'
    line = 5
    body = @'
**`MaxLength(100)` проверяется до `trim()`.**

DTO валидирует сырую строку, а хендлер (`update-profile.handler.ts:22`) сохраняет обрезанную. Расходятся в обе стороны: имя из 100 значащих символов с пробелом по краям отклоняется с 400, хотя в БД легло бы ровно 100; а `"   "` проходит валидацию и молча превращается в `null`.

Нормализовать нужно до валидации:

```ts
@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
@IsString()
@MaxLength(100)
name: string;
```

Глобальный `ValidationPipe` уже с `transform: true` (`src/configure-app.ts`), так что `@Transform` отработает. После этого `trim()` из хендлера уходит и «пустое имя очищает поле» остаётся единственным местом принятия решения.
'@
  },
  @{
    path = 'apps/api/src/users/dto/update-profile.dto.ts'
    line = 4
    body = @'
**`PATCH` с телом без `name` возвращает 400, хотя должен быть no-op.**

`@IsString()` без `@IsOptional()` делает поле обязательным: `PATCH /users/me {}` падает с 400. Для `PATCH` семантика обратная — отсутствующее поле означает «не трогать».

Пока поле в DTO одно, разницы почти нет, но Фаза 3 (аватар) и Фаза 5 (пароль) добавят поля в тот же ресурс, и «обновить только аватар» станет невозможно без переписывания контракта. Дешевле заложить `@IsOptional()` + `if (command.name !== undefined)` в хендлере сейчас.
'@
  },
  @{
    path       = 'apps/api/test/users.e2e-spec.ts'
    start_line = 27
    line       = 36
    body       = @'
**E2E оставляют мусор в БД.**

`registerUser()` создаёт пользователя через `POST /auth/register` в каждом из шести тестов и нигде его не удаляет — после каждого прогона `test:e2e` в `video_meetings` оседает +6 строк `User`.

Корневой `CLAUDE.md` § Test data требует обратного: в базе должен оставаться только `test@example.com` со своими встречами. Нужен `afterEach`/`afterAll` с удалением по собранным id (или по префиксу email `test-%@example.com`) через `PrismaService` из тестового модуля.
'@
  },
  @{
    path       = 'apps/api/src/users/queries/handlers/get-current-user.handler.ts'
    start_line = 19
    line       = 21
    body       = @'
**404 на валидный JWT удалённого пользователя** (то же в `update-profile.handler.ts:18-20`).

Токен подписан и не истёк, но субъекта больше нет — это невалидные учётные данные, а не отсутствующий ресурс. `401` заставит клиент разлогиниться и перевыпустить токен; `404` он, скорее всего, покажет как «профиль не найден» и оставит мёртвую сессию.

Приоритет низкий, но поведение стоит зафиксировать осознанно, а не по умолчанию.
'@
  }
)

foreach ($c in $comments) {
  $payload = @{
    body      = $c.body
    commit_id = $commit
    path      = $c.path
    line      = $c.line
    side      = 'RIGHT'
  }
  if ($c.ContainsKey('start_line')) {
    $payload.start_line = $c.start_line
    $payload.start_side = 'RIGHT'
  }

  Write-Host "→ инлайн: $($c.path):$($c.line)" -ForegroundColor Cyan
  ($payload | ConvertTo-Json -Depth 4 -Compress) |
    gh api "repos/$repo/pulls/$pr/comments" --method POST --input - --silent
  if ($LASTEXITCODE -ne 0) { throw "не удалось создать комментарий к $($c.path)" }
}

Write-Host "`nГотово: https://github.com/$repo/pull/$pr" -ForegroundColor Green
