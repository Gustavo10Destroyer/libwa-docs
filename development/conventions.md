# Conventions

Rules enforced by configuration — not by review. Following them keeps `verify` green.

## TypeScript

From `tsconfig.json` (all on):

| Flag | Effect on code style |
| --- | --- |
| `strict` | null checks, implicit-any errors |
| `exactOptionalPropertyTypes` | public optionals written `field: T \| undefined`, never `field?: T` with loose assignment; **do not pass explicit `undefined`** to optional props — omit them |
| `noUncheckedIndexedAccess` | index access yields `T \| undefined` — guard before use |
| `noImplicitOverride` | `override` keyword required (`Group extends Chat`, event maps) |
| `noFallthroughCasesInSwitch` | grouped switch cases must be intentional |
| `noImplicitReturns` | every code path returns |
| `verbatimModuleSyntax` + `isolatedModules` | `import type` for type-only imports; no `export type` ambiguity |
| `module/moduleResolution: NodeNext` | ESM with `.js` extensions in relative imports |

Additional:

- `paths: { "libwa": ["./src/index.ts"] }` — examples import the real package name;
- emit split: base config typechecks (no emit); `tsconfig.build.json` adds `rootDir: src` + declarations for `dist/`.

## Biome (`biome.json`)

```json
{
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "organizeImports": { "enabled": true },
  "linter": {
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "noNonNullAssertion": "error" }
    }
  }
}
```

| Rule | Meaning |
| --- | --- |
| 2-space, width 100 | no tabs, no debate — `npm run format` fixes |
| organize imports | import order is machine-managed |
| `noExplicitAny` (**error**) | `any` must never appear; use `unknown` + narrowing |
| `noNonNullAssertion` (**error**) | no `!` — check instead |
| recommended rules | suspicious/style/correctness defaults |

`as unknown as X` is reserved for test fixtures where a provider-shaped literal is intentionally coerced, plus the single internal cast in `TypedEventEmitter`'s snapshot code.

## Architecture rules

| Rule | Enforcement |
| --- | --- |
| provider imports only in `src/backend/baileys/` | review + `check:exports` (consequence fails the build) |
| no deep package exports | `package.json` `exports` exposes only `.` |
| services wrap unknown errors | `rethrowAsBackendError(op, e)` at every backend call site |
| listeners never crash | all emit paths route failures to `onListenerError` / `error` event |
| entities delegate to services | `chat.send` → `client.messages.send`, never to a backend |
| option defaults live in one place | `resolveClientOptions` (`DEFAULT_RECONNECT`, prefix rules) |
| input validation before backend I/O | `rename("")` errors before the capability check; participant ops check capability first, then the user list |

## Naming

| Kind | Convention | Examples |
| --- | --- | --- |
| classes | PascalCase nouns | `Client`, `FileSessionStore`, `CommandInteraction` |
| interfaces/types | PascalCase; type guards `is*` | `ChatId`, `isFromGroup()` |
| events | lowerCamel, past/state | `ready`, `interactionCreate`, `reconnecting` |
| error codes | `ERR_` + SCREAMING_SNAKE | `ERR_EMPTY_MESSAGE` |
| private fields | `#name` (native private) | `#backend`, `#handleError` |
| files | match primary export | `MessageService.ts`, `compose.ts` for utilities |
| tests | `<subject>.test.ts` | `client.test.ts` |

## Error & event discipline

- user input → `ValidationError` with a specific `code`;
- provider failures → `rethrowAsBackendError` (context strings start with a verb phrase: `Failed to send message`);
- internal dispatch failures → `#handleError(e, context)` (context = stage name);
- never throw from: listener wrappers (failures route to `onListenerError` / the `error` event) and `destroy()` (reports, not raises); `logout()` swallows backend failures but can surface a rejecting store `clear()`; keep `Logger` implementations total — the library does not guard logger calls.

## Docs discipline

- every public symbol: JSDoc with at least a one-line summary;
- examples in `examples/` must typecheck (they are part of `tsconfig.json` include);
- `README.md` / `docs/` updated when behavior changes.

## See also

- [Workflow](/development/workflow) — commands that enforce the above
- [Public API guard](/development/public-api-guard) — the leak rule
- [Design decisions #16](/architecture/design-decisions#_16-repo-hygiene-choices) — rationale
