# Repository

Layout of the `libwa` library repository — where everything lives and why.

```
libwa/
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
│   ├── auth/            SessionStore contract + file/memory stores
│   ├── backend/         contract (Backend.ts, events.ts), createDefaultBackend
│   │   └── baileys/     ← ONLY dir allowed to import the provider
│   ├── errors/          WhatsAppError hierarchy
│   ├── logging/         Logger contract + console/null loggers
│   └── core/            ids, content union, DisconnectReason
├── tests/               vitest suites + helpers (MockBackend, fixtures)
├── examples/            typechecked consumer-style examples ("libwa" import)
├── scripts/
│   └── check-exports.mjs   public API leak guard (runs in `verify`)
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
| package name | `libwa` (v0.1.0, MIT, ESM, Node ≥ 18.17) |
| runtime dependency | `@whiskeysockets/baileys` only |
| public surface | `exports`: `.` → `dist/index.js` + `dist/index.d.ts`, plus `./package.json` |
| published files | `dist`, `README.md`, `docs` |
| test runner | vitest (`tests/**/*.test.ts`, node environment) |
| linter/formatter | biome |
| build | `tsc -p tsconfig.build.json` (declarations + sourcemaps) |
| import style | tests → `src/…` paths; examples → `"libwa"` (tsconfig paths → `src/index.ts`) |

## Source inventory

Roughly 5,900 lines of `src` across 39 modules, grouped by layer:

| Area | Modules | Role |
| --- | --- | --- |
| client | 2 | lifecycle + options |
| interactions | 11 | event classes + factory |
| entities | 5 | domain objects + factory |
| backend | 9 (incl. 5 Baileys) | contract + adapter |
| services | 4 | messaging, groups, commands, payload |
| infrastructure | 9 | sessions, middleware, events, errors, logging, core |

## Tests

13 suites, **189 tests**, ~2,900 lines + 300 lines of helpers:

| Suite | Focus |
| --- | --- |
| `client.test.ts` (26) | lifecycle, dispatch, reconnection, login/destroy/logout |
| `baileys-mapper.test.ts` (44) | provider payload → domain mapping (largest suite) |
| `messaging.test.ts` (18) | send/react/edit/delete paths |
| `typed-event-emitter.test.ts` (11) | emitter semantics |
| `interactions.test.ts` (16) | guards, factory, subclasses |
| `commands.test.ts` (13) | registration + parsing |
| `baileys-auth.test.ts` (11) | session-backed auth state |
| `payload.test.ts` (10) | `normalizeReplyContent` validation |
| `session.test.ts` (10) | file/memory stores |
| `groups.test.ts` (9) | GroupService ops |
| `errors.test.ts` (8) | hierarchy + wrapping |
| `baileys-disconnect.test.ts` (8) | reason mapping |
| `middleware.test.ts` (5) | chain semantics |

Helpers: `MockBackend` / `CapableMockBackend` (201 lines — a ~200-line contract implementation) and `fixtures.ts` (backend event builders).

## Examples

| File | Demonstrates |
| --- | --- |
| `basic-bot.ts` | logger, commands, QR listener, ready, reply/react |
| `pairing-login.ts` | `WA_PHONE_NUMBER` pairing-code flow |
| `middleware-filters.ts` | rate limit, group-only, error classes, `DisconnectReason` handling |

All import `"libwa"` exactly like consumer code and are covered by `npm run typecheck`.

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
