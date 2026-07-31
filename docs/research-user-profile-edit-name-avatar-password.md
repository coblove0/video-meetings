# Ресерч: технологическая реализация профиля пользователя (имя, аватар, пароль)

**Связанные документы:**
@docs/prd-user-profile-edit-name-avatar-password.md
@docs/plan-user-profile-edit-name-avatar-password.md

**Дата:** 2026-07-31

## Цель документа

Сверить технологические решения плана с текущим кодом репозитория (`apps/api`, `apps/web`) и с актуальными практиками 2026 года по трём темам: обновление профиля через CQRS-модуль без контроллера, загрузка/отдача аватара как приватного файла и смена пароля в JWT-приложении без серверных сессий. Документ не меняет структуру фаз, а уточняет «как» внутри уже согласованных задач и подсвечивает три пробела в плане, которые дешевле закрыть до реализации, чем ловить как баг (см. §3.1, §6.1, §7.2).

## 1. Схема БД и миграция (Фаза 1)

План: одна миграция добавляет `name String?` и `avatarPath String?`. Это верно — обе колонки nullable, дефолтов не требуют, существующие строки не переписываются, миграция безопасна на любом объёме.

Уточнения:

- **Нужно третье поле — `avatarMimeType String?`** (см. §6.1). Без него при отдаче `GET /users/me/avatar` нечего положить в `Content-Type`, кроме догадки по расширению. Раз план сознательно избегает двух миграций подряд, это поле должно попасть в ту же миграцию Фазы 1.
- Индексы не нужны: оба поля читаются только по уже известному `id` пользователя.
- Ограничение длины имени в БД (`@db.VarChar(100)`) не обязательно — в проекте нигде не используется `@db.*`, и `String` → `text` в Postgres. Длину ограничиваем на уровне DTO (`@MaxLength`), как и всё остальное в проекте.
- `updatedAt` в `User` уже есть (`@updatedAt`) — отдельного `avatarUpdatedAt` не нужно, но помнить, что смена имени/пароля тоже двигает `updatedAt` (если он когда-нибудь понадобится как ETag для аватара — это будет неточный сигнал).
- После `prisma migrate dev` клиент перегенерируется автоматически (`prisma:migrate` = `prisma migrate dev`), отдельный `prisma:generate` не нужен — но типы `user.name`/`user.avatarPath` появятся только после этого шага, что и есть причина исключения из TDD-порядка, зафиксированного в плане.

## 2. `UsersModule` получает контроллер: DI и отсутствие циклов

План добавляет `UsersController` прямо в `UsersModule` с `imports: [CqrsModule, AuthModule]`. Проверено по коду — это безопасно:

- `AuthModule` **не импортирует** `UsersModule` (общается с ним только через `CommandBus`/`QueryBus`, см. `apps/api/CLAUDE.md` § Architecture), поэтому `UsersModule → AuthModule` циклической зависимости не создаёт и `forwardRef()` не нужен.
- `AuthModule` экспортирует и `JwtAuthGuard`, и сам инстанс `JwtModule.registerAsync(...)` — именно поэтому импорта `AuthModule` достаточно, чтобы guard получил свой `JwtService` (ровно та же схема уже работает в `MeetingsModule` и `MeetingFilesModule`).
- `CqrsModule` в `UsersModule` уже импортирован — новые handler'ы просто добавляются в массивы `CommandHandlers`/`QueryHandlers`.

Никаких изменений в `AppModule` не требуется: `UsersModule` там уже зарегистрирован.

## 3. Контракт эндпоинтов профиля

### 3.1. Пробел плана: что возвращает `PATCH /users/me`

План описывает форму ответа только для `GetCurrentUserQuery` (`{ id, email, name, hasAvatar }`). Для `UpdateProfileCommand` форма не задана, а дефолтное поведение Prisma (`user.update({...})` возвращает всю модель) **вернёт наружу `passwordHash`**. В существующем коде эта дыра не проявляется только потому, что `CreateUserHandler` возвращает `User` внутрь `RegisterHandler`, который наружу отдаёт лишь `{ accessToken }`.

**Рекомендация:** оба handler'а профиля используют явный `select: { id: true, email: true, name: true, avatarPath: true }` и мапят `avatarPath` в булев `hasAvatar` перед возвратом — так путь на диске тоже не утекает клиенту (клиенту он бесполезен, а для атакующего это информация о структуре ФС). Одинаковая форма ответа у `GET` и `PATCH` заодно позволяет фронтенду просто заменить состояние ответом `PATCH` без второго запроса.

### 3.2. DTO обновления имени

`@nestjs/mapped-types` в `apps/api/package.json` **нет**, поэтому привычный `PartialType(CreateXDto)` недоступен без новой зависимости — ставить её ради одного поля не стоит. Обычный класс с `class-validator` полностью достаточен:

```ts
export class UpdateProfileDto {
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value.trim())
  name: string;
}
```

Нюансы, которые стоит решить осознанно, а не по умолчанию:

- Глобальный `ValidationPipe` в `configure-app.ts` работает с `whitelist: true, forbidNonWhitelisted: true` — любое лишнее поле в теле (например, попытка передать `email` или `id`) уже даёт 400 автоматически. Отдельной защиты от «обновления чужого профиля через body» не требуется: `userId` берётся только из `@CurrentUser()`.
- `@IsOptional()` для `name` **не нужен**, если форма всегда шлёт поле целиком (а она шлёт — это единственное поле формы). С `@IsOptional()` пустое тело `{}` стало бы валидным no-op'ом, что сложнее тестировать и не даёт ничего.
- Очистка имени: `@MaxLength` пропустит пустую строку. Определить сразу — либо запретить (`@IsNotEmpty()`), либо трактовать пустую строку как «сбросить имя» и писать в БД `null`. Рекомендация: разрешить сброс (`name: value === '' ? null : value`), потому что поле опционально по PRD и пользователь должен иметь возможность его убрать; в unit-тесте Фазы 1 это как раз хороший edge case, который план уже требует.
- `@Transform` с `trim` нужен, потому что `transform: true` в пайпе сам по себе строки не тримит — иначе имя из одних пробелов пройдёт валидацию длины.

## 4. Аватар: конфигурация multer (Фаза 3)

План повторяет `meeting-files/multer.config.ts` с более строгими константами. Проверено по коду и по актуальным гайдам — конструкция корректна, с четырьмя уточнениями.

### 4.1. Отдельная поддиректория, а не общий `UPLOAD_DIR`

План допускает `AVATAR_UPLOAD_DIR = UPLOAD_DIR`. Технически это работает (имена — UUID, коллизий нет), но смешивает два разных жизненных цикла в одной папке: файлы встреч удаляются вместе со встречей, аватары — при замене. Для отладки, ручной чистки и требования `CLAUDE.md` § Test data («убрать за собой файлы под `apps/api/uploads`») удобнее `./uploads/avatars` (директория создаётся тем же `mkdirSync(..., { recursive: true })` при импорте конфига, `apps/api/uploads/` уже в `.gitignore`).

### 4.2. Расширение файла брать из MIME, а не из `originalname`

В `meeting-files` имя на диске = `randomUUID() + extname(file.originalname)`. Для аватара allowlist состоит ровно из двух типов, поэтому расширение можно вывести детерминированно (`image/jpeg → .jpg`, `image/png → .png`) и полностью убрать пользовательский ввод из имени файла. Path traversal `extname()` и так закрывает, но это ещё и гарантирует, что расширение на диске согласовано с тем, что мы потом отдаём в `Content-Type`.

### 4.3. 413/415 обрабатывать не нужно — они уже работают

Подтверждено кодом и документацией модуля: `fileFilter` отдаёт `UnsupportedMediaTypeException` (415), а `LIMIT_FILE_SIZE` конвертируется в `PayloadTooLargeException` (413) самим `@nestjs/platform-express`. Дополнительно проверено в `node_modules/multer/lib/make-middleware.js` — при аборте по лимиту multer сам вызывает `removeUploadedFiles(...)`, то есть частично записанный файл с диска удаляется, и e2e-проверка «после 413 на диске ничего не осталось» будет зелёной без нашего кода.

### 4.4. Проверка магических байт — здесь её стоит наконец сделать

`fileFilter` проверяет только клиентский `Content-Type`, который атакующий контролирует целиком; в `apps/api/CLAUDE.md` это честно записано как «not yet implemented» для файлов встреч. Для аватара пробел закрывается почти бесплатно, потому что форматов всего два:

```ts
const SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  {
    mime: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
];
```

Читаем первые 8 байт уже записанного файла (`open` + `read` из `fs/promises`) в handler'е — прецедент работы с `fs` в handler'е уже есть (`UploadMeetingFileHandler` делает `unlink`), — и при несовпадении удаляем файл и бросаем `UnsupportedMediaTypeException`. Библиотеку `file-type` брать не стоит: с v17 она чисто ESM, а `apps/api` собирается в CommonJS (`ts-jest` + `nest build`), то есть потребовался бы динамический `import()` ради двух сигнатур.

Важно понимать границу этой проверки: polyglot-файл (валидный JPEG-заголовок + payload дальше) её пройдёт. Реальную защиту даёт то, что файлы **не раздаются статикой** и отдаются только через контроллер с `nosniff` (§6.2), а SVG вообще не входит в allowlist — именно SVG-аватары дают самый частый persistent XSS в этом классе фич.

### 4.5. Порядок операций при замене аватара

Handler должен: (1) прочитать текущий `avatarPath`, (2) записать новый путь в БД, (3) только потом `unlink(oldPath).catch(() => undefined)`. Обратный порядок означает, что упавший `update` оставит пользователя без аватара вообще. Если пользователя не нашли (теоретически — токен валиден, а строка удалена) — удалить только что загруженный файл и бросить 404, ровно как в `UploadMeetingFileHandler`.

Гонка двух одновременных загрузок от одного пользователя может оставить один файл-сирота на диске. Для этого проекта приемлемо; при желании закрывается транзакцией с `SELECT ... FOR UPDATE`, но это оверинжиниринг для MVP.

## 5. Смена пароля (Фаза 5)

### 5.1. bcrypt

`SALT_ROUNDS = 10` в `register.handler.ts` соответствует минимуму OWASP («10 или выше»), но рекомендация 2026 года — 12 (цель ~250 мс на хеш на прод-железе). Cost хранится внутри самого хеша, поэтому поднять его безопасно и без миграции: старые хеши продолжат проверяться, новые будут крепче. **Рекомендация:** либо оставить 10 и вынести константу в общее место, либо поднять до 12 **одновременно в обоих местах** (register + change password) отдельной задачей — но не заводить два разных cost'а в двух файлах.

Второй момент: bcrypt молча игнорирует всё после 72 байт пароля. В `RegisterDto` есть только `@MinLength(8)`. Для `ChangePasswordDto` (и, по-хорошему, для `RegisterDto` в том же изменении) стоит добавить `@MaxLength(72)`, иначе «пароль сменился, но вход по обрезанному варианту тоже работает» — неприятный сюрприз.

### 5.2. Пробел плана: какой код ошибки у неверного текущего пароля

Интуитивный выбор — `UnauthorizedException`, как в `login.handler.ts`. **Для этой фичи он неверен.** Весь фронтенд проекта (`page.tsx`, `meetings/[id]/page.tsx`) трактует 401 от API как «сессия истекла»: чистит `localStorage` и редиректит на `/auth/login`. То есть 401 на `POST /users/me/password` выбросит пользователя из приложения ровно в тот момент, когда он всего лишь опечатался в текущем пароле — а e2e-тест Фазы 6 в плане прямо требует «не разлогинивает пользователя».

**Рекомендация:** возвращать `BadRequestException('Current password is incorrect')` (400). Утечки информации здесь нет — вызов уже аутентифицирован, пользователь и так знает, что это его аккаунт (в отличие от `login`, где одинаковый 401 нужен против перебора существующих email). Это решение надо зафиксировать в задачах Фазы 5 и 6, иначе фронтенд и бэкенд разъедутся.

### 5.3. Старый JWT остаётся валидным

После смены пароля выданные ранее токены продолжают действовать до истечения `JWT_EXPIRES_IN` — в приложении нет ни revocation-списка, ни `tokenVersion`. PRD явно выносит «разлогинивание других сессий» из скоупа, так что это осознанное ограничение, а не баг; но его стоит записать в `apps/api/CLAUDE.md` при реализации, потому что интуиция говорит обратное. Стандартный способ закрыть это позже — счётчик версии сессии (`tokenVersion`/`passwordChangedAt`) в `User`, попадающий в payload токена и сверяемый в `JwtAuthGuard`. Токен текущей сессии тоже остаётся валидным — это то, что нужно: пользователь не должен переавторизовываться после смены собственного пароля.

Отдельно: rate limiting на ручку смены пароля (`@nestjs/throttler` в проекте не установлен) — вне скоупа, риск ниже обычного, так как ручка требует валидный JWT.

## 6. Отдача аватара (Фаза 3)

### 6.1. Пробел плана: `Content-Type` брать неоткуда

План хранит только `avatarPath` и отдаёт файл «как `download-meeting-file`». Но в `MeetingFilesController.download()` `Content-Type` берётся из `file.mimeType` — колонки, которой у `User` в плане нет. Отсюда рекомендация §1: добавить `avatarMimeType String?` в ту же миграцию. Альтернатива (выводить MIME из расширения файла) работает, но заводит вторую точку правды о типе.

### 6.2. Заголовки

Аватар — это `inline`-изображение, а не вложение, поэтому `Content-Disposition` из `download` копировать не надо (и RFC 5987-кодирование имени тут не нужно — имени файла у аватара нет). Правильный набор:

- `Content-Type: <avatarMimeType>`
- `X-Content-Type-Options: nosniff` — обязательный минимум при отдаче пользовательского контента: запрещает браузеру «додумать» тип и исполнить содержимое как скрипт;
- `Cache-Control: private, max-age=0, must-revalidate` — аватар персональный, промежуточным кэшам его хранить нельзя.

Сборка `StreamableFile`/`createReadStream` и установка заголовков — в контроллере через `@Res({ passthrough: true })`, как и решено в плане; handler остаётся чистым (только поиск пользователя и `NotFoundException`, если `avatarPath` пуст). Статическая раздача (`useStaticAssets`) не подключается — единственный путь к файлу должен идти через guard.

### 6.3. Расхождение БД и диска

Если строка в БД есть, а файла на диске нет (ручная чистка `uploads`, сбой), `createReadStream` бросит `ENOENT` **после** отправки заголовков — клиент получит оборванный ответ вместо понятного статуса. Дёшево закрывается `await stat(path)` в контроллере до создания стрима с преобразованием `ENOENT` в 404 (в `meeting-files` эта проблема есть, но там она заметно менее вероятна — файлы никто не трогает руками; папку аватаров как раз будут чистить руками по политике `CLAUDE.md` § Test data).

## 7. Фронтенд (Фазы 2, 4, 6)

- **HeroUI v3.0.5 содержит компонент `Avatar`** (`Avatar.Image` + `Avatar.Fallback`, размеры `sm/md/lg`) — заглушку из Фазы 2 не нужно верстать руками: `Avatar.Fallback` с инициалами из имени (или первой буквой email) и есть требуемое «placeholder, если аватар не загружен». Перед версткой всё равно вытянуть актуальные доки скриптом `node .agents/skills/heroui-react/scripts/get_component_docs.mjs Avatar`, как требует `apps/web/CLAUDE.md`.
- **Blob URL для защищённой картинки.** `<img src="/users/me/avatar">` не отправит `Authorization` — только `fetch` + `URL.createObjectURL(blob)`, как и написано в плане. Ключевой нюанс, которого в плане нет: **revoke делать в cleanup'е `useEffect`/при замене аватара, а не сразу после присвоения `src`** — иначе картинка ломается в части браузеров; и не revoke'ать вовсе — это утечка памяти на каждой перезагрузке аватара (существующий `handleDownload` в `meetings/[id]/page.tsx` решает ту же проблему через `setTimeout`, но там URL одноразовый — для долгоживущего `<img>` нужен именно cleanup).
- **Предвалидация на клиенте.** Проверять `file.type` и `file.size` до отправки: 5 МБ-файл не имеет смысла гонять на сервер ради 413, а сообщение об ошибке будет мгновенным. Серверная проверка при этом остаётся источником истины (клиентскую тривиально обойти).
- **XHR для прогресса** — уже отработанный в проекте паттерн (`handleUpload` в meeting page), копируется без изменений; `fetch` по-прежнему не даёт upload-progress.
- **401 vs 400 в форме пароля** — см. §5.2: обработчик ошибок формы не должен использовать общий «401 → редирект», иначе тест Фазы 6 не пройдёт.
- **Поля формы пароля:** `autoComplete="current-password"` и `autoComplete="new-password"`, show/hide-кнопка как в `auth/login/page.tsx` — менеджеры паролей ориентируются именно на эти значения.
- **Пробел покрытия:** PRD требует, чтобы имя и аватар отображались «в остальном интерфейсе, где используется имя пользователя», но ни одна фаза плана не трогает шапку `src/app/page.tsx`, где сейчас показывается email из JWT, и **никакой навигации на `/profile` в приложении нет вообще** — страница будет доступна только по прямому URL. Минимум: в шапке главной страницы поставить `Avatar` + имя как ссылку на `/profile` (задача в конце Фазы 2, дополнить аватаром в Фазе 4). Заодно можно заменить ручной `atob`-разбор JWT на `GET /users/me` — после Фазы 1 у фронтенда наконец появляется нормальный источник данных о текущем пользователе.

## 8. Тестирование

- **Unit (Фазы 1, 3, 5):** мок `PrismaService` как объектный литерал + `jest.mock('fs/promises')` — точная копия `upload-meeting-file.handler.spec.ts`. Для `ChangePasswordHandler` bcrypt мокать не нужно: реальный `hash`/`compare` на cost 10 — это ~100 мс, приемлемо для двух тестов и надёжнее мока.
- **e2e бэкенда:** буферы в `.attach(...)` должны содержать **настоящие магические байты** (`Buffer.from([0xff,0xd8,0xff, ...])`), если реализуется §4.4, иначе «валидный» тест упадёт на своей же проверке. Файлы аватаров нужно собирать в массив путей и удалять в `afterAll` (`rmSync(path, { force: true })`) — как `createdStoragePaths` в `meeting-files.e2e-spec.ts`; это прямое требование `CLAUDE.md` § Test data.
- **e2e фронтенда (Playwright):** `setInputFiles` с in-memory буфером JPEG; проверять отображение не по `src` (там будет `blob:`-URL), а через `expect(img).toHaveJSProperty('naturalWidth', ...)` либо ожидание непустого `naturalWidth` — иначе тест зелёный на битой картинке. Пользователи сидируются через `request.post('/auth/register')`, как в существующем `meeting-page.spec.ts`.
- **Персистентный тестовый пользователь:** ни один тест не должен трогать `test@example.com` — все сценарии смены пароля и загрузки аватара идут на свежезарегистрированных throwaway-пользователях. Если ручная проверка в браузере велась под тестовым аккаунтом, вернуть пароль `TestPassword123!`, очистить `name`/аватар и удалить файл из `uploads/avatars`.

## 9. Итоговые рекомендации по фазам

Все пункты — уточнения внутри существующих задач, структура фаз не меняется:

1. **Фаза 1:** добавить в миграцию третье поле `avatarMimeType String?`; в обоих handler'ах использовать явный `select` и не отдавать наружу `passwordHash`/`avatarPath`; `UpdateProfileDto` — обычный класс с `@IsString @MaxLength(100)` + `trim` (без `@nestjs/mapped-types`, его в проекте нет), пустая строка = сброс имени в `null`.
2. **Фаза 2:** заглушку аватара делать через HeroUI `Avatar.Fallback`, а не своей вёрсткой; добавить ссылку на `/profile` в шапку главной страницы — иначе страница недостижима из UI.
3. **Фаза 3:** отдельная поддиректория `uploads/avatars`; расширение файла выводить из MIME, а не из `originalname`; добавить проверку магических байт JPEG/PNG в handler'е (без библиотеки `file-type` — она ESM-only); порядок замены: запись в БД → `unlink` старого; при отдаче — `nosniff` + `Cache-Control: private` + `Content-Disposition: inline`, `stat()` перед стримом для честного 404; 413/415 писать в тестах, но не реализовывать — Nest и multer уже делают это сами, включая удаление недописанного файла.
4. **Фаза 4:** revoke blob URL в cleanup'е эффекта, а не сразу после присвоения `src`; предвалидация типа/размера на клиенте до отправки.
5. **Фаза 5:** неверный текущий пароль → **400**, а не 401 (иначе фронтенд разлогинит пользователя); `@MaxLength(72)` на пароль; решить один раз про `SALT_ROUNDS` (оставить 10 или поднять до 12 сразу в обоих местах); задокументировать в `apps/api/CLAUDE.md`, что старые JWT переживают смену пароля — это осознанное ограничение по PRD.
6. **Фаза 6:** обработчик ошибок формы пароля не должен наследовать общее правило «401 → редирект на логин»; `autoComplete="current-password"/"new-password"`.

## Источники

- [OWASP Password Storage Cheat Sheet — bcrypt work factor](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Choosing the Right bcrypt Cost Factor in 2026 (OWASP Guide)](https://hashgenerator.tools/blog/bcrypt-cost-factor.html)
- [File Upload — OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Beyond the Extension: Securing File Uploads with Content Sniffing and Magic Bytes](https://habtesoft.medium.com/beyond-the-extension-securing-file-uploads-with-content-sniffing-and-magic-bytes-b0622bf0679d)
- [Secure API file uploads with magic numbers — Transloadit](https://transloadit.com/devtips/secure-api-file-uploads-with-magic-numbers/)
- [Persistent XSS via Avatar Upload (CVE-2021-43991) — AppCheck](https://appcheck-ng.com/persistent-xss-kentico-cms/)
- [Countering MIME sniffing with X-Content-Type-Options and Content-Type](https://wanago.io/2022/03/14/mime-sniffing-x-content-type-options-content-type/)
- [How to display an image protected by header-based authentication](https://alphahydrae.com/2021/02/how-to-display-an-image-protected-by-header-based-authentication/)
- [MDN — URL.revokeObjectURL()](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)
- [JWT Security Best Practices for 2026 — session version on password change](https://devtoolkit.cloud/blog/jwt-security-best-practices-2026)
- [Should I invalidate tokens when password changes? — LexikJWTAuthenticationBundle discussion](https://github.com/lexik/LexikJWTAuthenticationBundle/discussions/1053)
- [Why validation fails with `Partial<DTO>` in NestJS update endpoints](https://www.w3tutorials.net/blog/validation-does-not-work-with-partial-dto-nestjs/)
- [HeroUI v3 — Avatar](https://heroui.com/en/docs/react/components/avatar)
