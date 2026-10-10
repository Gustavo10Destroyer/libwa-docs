# Repository

Layout of the `libwa.js` library repository — where everything lives and why.

```
libwa.js/
├── src/                 library source (ESM, TypeScript)
│   ├── index.ts         ← the ONLY public entry (package exports ".")
│   ├── Client.ts        composition root, lifecycle, dispatch
│   ├── ClientOptions.ts option resolution + validation
│   ├── events/          ClientEvents + TypedEventEmitter
│   ├── interactions/    9 interaction classes + factory
│   ├── entities/        Chat/Group/Message/User + EntityFactory
│   ├── commands/        CommandRegistry + CommandDefinition
│   ├── messaging/       MessageService + payload normalization
│   ├── groups/          GroupService
│   ├── middleware/      compose.ts (chain runner)
│   ├── auth/            SessionStore contract + file/sqlite/memory stores + driver seam
│   ├── backend/         contract (Backend.ts, events.ts), createDefaultBackend
│   │   └── baileys/     ← ONLY dir allowed to import the provider
│   ├── errors/          WhatsAppError hierarchy
│   ├── logging/         Logger contract + console/null loggers
│   └── core/            ids, content union, DisconnectReason, LruMap, sequence
├── tests/               vitest suites + helpers (MockBackend, fixtures)
├── examples/            typechecked consumer-style examples ("libwa.js" import)
├── scripts/
│   ├── check-exports.mjs   public API leak guard (runs in `verify`)
│   └── clean-dist.mjs      wipes `dist/` before every build
├── docs/                in-repo architecture + design-decision notes
├── dist/                build output (tsc: js + d.ts + maps)
├── package.json         scripts, exports, engines
├── tsconfig.json        typecheck config (src + tests + examples)
├── tsconfig.build.json  emit config (src → dist, declarations)
├── vitest.config.ts     test config + coverage excludes
└── biome.json           formatter + linter (2-space, no any)
```

## Key facts

| Item | Value |
| --- | --- |
| package name | `libwa.js` (v0.4.0, MIT, ESM, Node ≥ 20.0.0) |
| runtime dependencies | `@whiskeysockets/baileys` + `better-sqlite3` (loaded lazily, only by `SqliteSessionStore`) |
| public surface | `exports`: `.` → `dist/index.d.ts` + `dist/index.js` (declared under `types`, `import`, `require` and `default`), plus `./package.json` |
| published files | `dist`, `docs`, `LICENSE` (README auto-included) |
| test runner | vitest (`tests/**/*.test.ts`, node environment) |
| linter/formatter | biome |
| build | `node scripts/clean-dist.mjs && tsc -p tsconfig.build.json` (clears `dist/`, then declarations + sourcemaps) |
| import style | tests → `src/…` paths; examples → `"libwa.js"` (tsconfig paths → `src/index.ts`) |

## Source inventory

8,071 lines of `src` across 50 TypeScript files, grouped by layer:

| Area | Files | Role |
| --- | --- | --- |
| client | 3 | lifecycle + options + `index.ts` barrel |
| interactions | 11 | event classes + factory + `InteractionType` |
| entities | 5 | domain objects + factory |
| backend | 9 | contract (3) + Baileys adapter (6, incl. `index.ts` barrel) |
| services | 7 | messaging (3), commands (2), groups (1), users (1) |
| infrastructure | 15 | auth (5: contract, file, sqlite, memory, driver seam), core (5), events (2), middleware (1), errors (1), logging (1) |

## Tests

17 suites, **349 tests**, 6,378 lines (5,984 of tests + 394 of helpers):

| Suite | Focus |
| --- | --- |
| `baileys-mapper.test.ts` (57) | provider payload → domain mapping (largest suite) |
| `client.test.ts` (36) | lifecycle, dispatch, group metadata ensure (TTL/dedupe/backoff), reconnection, login/destroy/logout |
| `users.test.ts` (30) | `client.users` id-pair recording, resolution, fetch, name memory, profile enrichment |
| `interactions.test.ts` (25) | guards, factory, subclasses, `interaction.member` |
| `sqlite-session-store.test.ts` (25) | SQLite store: contract round-trip, WAL schema, busy-timeout locking, close lifecycle, driver interop |
| `messaging.test.ts` (21) | send/react/edit/delete paths |
| `commands.test.ts` (18) | registration + parsing |
| `groups.test.ts` (21) | GroupService ops, ensure cache, membership patches + `Group.member` lookups |
| `typed-event-emitter.test.ts` (11) | emitter semantics |
| `baileys-auth.test.ts` (13) | session-backed auth state |
| `payload.test.ts` (10) | `normalizeReplyContent` validation |
| `session.test.ts` (15) | file/memory stores |
| `errors.test.ts` (8) | hierarchy + wrapping |
| `baileys-disconnect.test.ts` (8) | reason mapping |
| `middleware.test.ts` (9) | chain semantics |
| `entities.test.ts` (18) | identity, chat/metadata cache identity + bounded LRU eviction, name memory |
| `baileys-backend.test.ts` (24) | adapter lifecycle, send/event normalization, group metadata + cache hook, pairing (mocked provider) |

Helpers: `MockBackend` / `CapableMockBackend` (299 lines — the mandatory contract plus every optional capability) and `fixtures.ts` (backend event builders).

## Examples

| File | Demonstrates |
| --- | --- |
| `basic-bot.ts` | logger, commands, QR listener, ready, reply |
| `pairing-login.ts` | `WA_PHONE_NUMBER` pairing-code flow |
| `middleware-filters.ts` | rate limit, chat deny-list, group-join welcome, error classes, `DisconnectReason` handling |

All import `"libwa.js"` exactly like consumer code and are covered by `npm run typecheck`.

## Commands

See [Workflow](/development/workflow) for the full script matrix — the important one:

```bash
npm run verify   # typecheck → test → lint → build → check:exports
```

## See also

- [Workflow](/development/workflow) — scripts in detail
- [Testing](/development/testing) — strategy and helpers
- [Conventions](/development/conventions) — style rules enforced by config
- [Public API guard](/development/public-api-guard) — how leaks are blocked
