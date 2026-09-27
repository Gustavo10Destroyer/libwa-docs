# Testing

How `libwa` is tested: strategy, helpers, suite map, and what each layer guarantees.

## Setup

| Item | Value |
| --- | --- |
| runner | vitest 3 (`npm test` = `vitest run`) |
| location | `tests/**/*.test.ts`, node environment |
| config | `vitest.config.ts` — coverage excludes `src/backend/baileys/**` and `src/index.ts` |
| totals | **13 files, 189 tests**, ~1.2s wall time |

## Strategy: contract tests, not provider integration

```mermaid
flowchart TD
    subgraph Pure["Pure units (no I/O)"]
        P1[payload normalization]
        P2[command parsing]
        P3[reason mapping]
        P4[typed emitter]
        P5[error hierarchy]
    end
    subgraph Service["Service + client (MockBackend)"]
        S1[messaging / groups]
        S2[client lifecycle + reconnection]
        S3[interactions factory]
    end
    subgraph Adapter["Adapter (fixtures)"]
        A1[BaileysMapper]
        A2[BaileysAuth]
        A3[disconnect map]
    end
    Pure --> V[all suites]
    Service --> V
    Adapter --> V
```

1. **Provider-free core** runs against `MockBackend` — no sockets, no network, deterministic.
2. **Baileys-specific code** is unit-tested at the mapper/auth/disconnect level with **realistic provider fixtures** — no live WhatsApp in CI.
3. **Reconnection** uses fake timers (backoff, exhaustion, cancellation) — no real waiting.

## Helpers

### `tests/helpers/MockBackend.ts` (201 lines)

```ts
class MockBackend implements WhatsAppBackend { /* … */ }
class CapableMockBackend extends MockBackend { /* adds every optional capability */ }
```

- implements the full mandatory contract (~200 lines — living proof of the [small contract](/architecture/design-decisions#_3-provider-behind-an-interface-with-optional-capabilities) decision);
- records calls (`sentMessages`, `reacted`, …) for assertions;
- programmable failures (throw on `sendMessage`, …);
- `CapableMockBackend` enables the optional methods so capability-gated paths are testable;
- helper `groupMetadataFixture(id)` builds `GroupMetadata`.

### `tests/helpers/fixtures.ts` (95 lines)

Builders for every backend event: `messageEvent`, `reactionEvent`, `messageUpdateEvent`, `groupParticipantsEvent`, `groupUpdateEvent`, `referenceFixture` — each with `Partial<…>` overrides so tests only spell the fields they care about.

## Suite map

| Suite | Tests | Covers |
| --- | --- | --- |
| `client.test.ts` | 26 | state machine, dispatch order, middleware integration, error routing, login deferred, destroy/logout, reconnect (fake timers), pairing-code flow |
| `baileys-mapper.test.ts` | 44 | every content kind, wrappers (ephemeral/view-once/edit/device-sent), timestamps, JID normalization, references, mentions, stub filtering |
| `messaging.test.ts` | 18 | send target resolution, quotes, mentions, react/edit/delete, capability errors, entity reconstruction from `BackendSentMessage` |
| `interactions.test.ts` | 16 | guards/narrowing, factory classification, subclass fields, `reply()` |
| `commands.test.ts` | 13 | name/alias validation, duplicates, parse algorithm, case folding |
| `baileys-auth.test.ts` | 11 | `AuthenticationState` ⇄ store round-trips, coalescing, buffer JSON, app-state key revival |
| `payload.test.ts` | 10 | `normalizeReplyContent`: empty/ambiguous/caption/media, mention merging |
| `session.test.ts` | 10 | file store atomicity, id validation, corrupt JSON, memory store |
| `groups.test.ts` | 9 | fetch/apply metadata, participants ops, rename/description, unsupported paths |
| `errors.test.ts` | 8 | codes, `cause`, `toError`, `rethrowAsBackendError` passthrough/wrap |
| `baileys-disconnect.test.ts` | 8 | Boom codes, HTTP statuses, network errnos → `DisconnectReason` |
| `typed-event-emitter.test.ts` | 11 | on/once/off, ordering, snapshots, error hook, recursion safety |
| `middleware.test.ts` | 5 | ordering, skip semantics, double-`next()` guard, throw propagation |

## What we test (guarantees)

- **Dispatch order**: middleware → command → listeners, including gate-skips still notifying listeners.
- **Failure isolation**: a throwing listener/command/middleware produces an `error` event (with right context) and nothing else — plus the `error`-listener recursion guard.
- **Reconnection policy**: fatal set honored, attempts exhausted, `reconnect: false`, backoff formula, counter reset on open, timer cancellation on `destroy()`/`logout()`.
- **Validation completeness**: every `ERR_*` code has a test asserting it fires for the right input.
- **Mapping fidelity**: provider fixtures → exact `MessageContent` shapes (the biggest suite — the mapper is the highest-risk surface).
- **Store semantics**: atomic writes, per-slot serialization, `null` for missing, `ERR_SESSION_ID` / `ERR_SESSION_CORRUPT`.
- **No leaks**: `check:exports` (separate stage) proves the surface stays provider-free.

## Conventions inside tests

- import internals via `src/…` paths (only the root is public — see [Public API guard](/development/public-api-guard));
- use `Partial<…>` overrides in fixtures instead of hand-building full payloads;
- fake timers for anything involving backoff;
- no network, no filesystem beyond temp dirs (session tests use `node:os` temp or in-memory paths);
- assertions on `error.code` (stable), not message text.

## Running subsets

```bash
npx vitest run tests/client.test.ts
npx vitest run -t "reconnect"          # by test name
npm run test:watch                      # watch mode
```

## Coverage config

```ts
coverage: {
  reportsDirectory: "coverage",
  include: ["src/**/*.ts"],
  exclude: ["src/backend/baileys/**", "src/index.ts"],
}
```

The Baileys directory is excluded from coverage pressure (it is exercised by fixture-driven suites and would otherwise demand untestable socket-level code); `index.ts` is pure re-exports.

## See also

- [Workflow](/development/workflow) — where tests sit in `verify`
- [Repository](/development/repository) — file map
