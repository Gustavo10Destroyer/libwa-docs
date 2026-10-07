# Configuration

All configuration flows through the [`ClientOptions`](/reference/client-options) object passed to `new Client(options?)`. Every option is optional; omitting everything yields a working default bot (Baileys backend, `!` prefix, `.libwa/` sessions, silent logger, exponential reconnection).

```ts
import { Client } from "libwa";

const client = new Client({
  sessionId: "work",
  commands: { prefix: ["!", "/"], ignoreSelf: true },
  reconnect: { attempts: 8, initialDelayMs: 2_000, maxDelayMs: 60_000, factor: 2 },
  logger: myLogger,
  sessionStore: myStore,
  backend: myBackend,
  auth: { pairingPhoneNumber: "5511999999999" },
});
```

## Options

<ApiTable
  :rows="[
    { name: 'backend', type: 'WhatsAppBackend | (() => WhatsAppBackend)', def: 'createDefaultBackend()', description: 'Provider adapter. A instance is used directly; a function is invoked once per Client construction. Defaults to the bundled Baileys backend.' },
    { name: 'sessionStore', type: 'SessionStore', def: 'new FileSessionStore()', description: 'Persistence for login state. Defaults to a filesystem store writing into .libwa/; use SqliteSessionStore in production.' },
    { name: 'sessionId', type: 'string', def: '&quot;default&quot;', description: 'Slot id inside the store. Use distinct ids for multiple accounts over one store.' },
    { name: 'logger', type: 'Logger', def: 'nullLogger', description: 'Receives internal diagnostics. Defaults to a silent logger — nothing is printed unless you inject one.' },
    { name: 'commands', type: 'CommandOptions | false', def: '{ prefix: &quot;!&quot; }', description: 'Command parsing configuration, or false to disable prefix parsing entirely (every text message stays a plain MessageInteraction).' },
    { name: 'reconnect', type: 'ReconnectOptions | false', def: '{ attempts: 5, initialDelayMs: 1000, maxDelayMs: 30000, factor: 2 }', description: 'Automatic reconnection policy, or false to disable retries (first close emits disconnect immediately).' },
    { name: 'auth', type: '{ pairingPhoneNumber?: string }', def: 'undefined', description: 'Pairing-code login settings. pairingPhoneNumber is international, 7-15 digits, no + prefix.' }
  ]"
/>

### `commands`

<ApiTable
  :rows="[
    { name: 'prefix', type: 'string | readonly string[]', def: '&quot;!&quot;', description: 'One or more command prefixes. The longest prefix that matches the message wins; ties keep the earlier entry. Empty strings or an empty array throw ValidationError (ERR_INVALID_PREFIX) when the client is constructed.' },
    { name: 'ignoreSelf', type: 'boolean', def: 'false', description: 'When true, messages sent by the logged-in account are never parsed as commands (they still dispatch as MessageInteractions).' }
  ]"
/>

Pass `commands: false` to turn parsing off completely. The [CommandRegistry](/reference/commands) stays usable (you can still register commands programmatically), but no message is ever promoted to a `CommandInteraction`.

### `reconnect`

<ApiTable
  :rows="[
    { name: 'attempts', type: 'number', def: '5', description: 'Maximum retry count for recoverable disconnects. Attempt counting resets every time the connection opens.' },
    { name: 'initialDelayMs', type: 'number', def: '1000', description: 'Delay before the first retry. Subsequent delays are initialDelayMs * factor ** (attempt - 1).' },
    { name: 'maxDelayMs', type: 'number', def: '30000', description: 'Upper bound applied to every computed delay.' },
    { name: 'factor', type: 'number', def: '2', description: 'Exponential backoff multiplier.' }
  ]"
/>

Fatal reasons — [`LoggedOut`, `BadSession`, `ConnectionReplaced`, `Forbidden`](/reference/disconnect-reason) — are **never** retried regardless of this setting. Full policy details: [Reconnection](/architecture/reconnection).

### `logger`

The [`Logger`](/reference/logger) interface is four methods:

```ts
import { type Logger, createConsoleLogger, nullLogger } from "libwa";

// Built-in console logger with your prefix: "my-bot info: ..." (default prefix "libwa")
const logger = createConsoleLogger("my-bot");

// Bring your own (pino, winston, ts-log, ...)
const structured: Logger = {
  debug: (...args) => log.debug(args),
  info: (...args) => log.info(args),
  warn: (...args) => log.warn(args),
  error: (...args) => log.error(args),
};
```

The backend forwards provider logging through the same object (see [`createProviderLogger`](/reference/logger#createconsolelogger)).

## Validation performed at construction

`resolveClientOptions()` runs when `new Client()` executes and can throw immediately:

| Condition | Error | Code |
| --- | --- | --- |
| `commands.prefix` is an empty array, or contains an empty string | `ValidationError` | `ERR_INVALID_PREFIX` |

Everything else is validated later, when used (see the [error reference](/reference/errors#validation-codes)).

::: tip Fail fast, then normalise
Reconnection and command defaults are applied here; `ResolvedClientOptions` (exported) is the fully-defaulted shape used internally.
:::

## Recipes

### Development bot with visible logging

```ts
import { Client, createConsoleLogger } from "libwa";

const client = new Client({
  logger: createConsoleLogger("dev-bot"),
  commands: { prefix: ["!", "/"] },
});
```

### Multi-account bot sharing one store

```ts
import { Client, FileSessionStore } from "libwa";

const store = new FileSessionStore({ directory: ".sessions" });

const sales = new Client({ sessionStore: store, sessionId: "sales" });
const support = new Client({ sessionStore: store, sessionId: "support" });
```

Each slot gets its own `<directory>/<id>.json` file. Slot ids must match `/^[A-Za-z0-9_-]{1,64}$/` (enforced by the store — see [`assertSafeSessionId`](/reference/sessions#assertsafesessionid)).

### Production: one SQLite database

```ts
import { Client, SqliteSessionStore } from "libwa";

const store = new SqliteSessionStore({ filename: "var/bots.db", busyTimeoutMs: 5000 });

const sales = new Client({ sessionStore: store, sessionId: "sales" });
const support = new Client({ sessionStore: store, sessionId: "support" });

// … on shutdown:
await sales.destroy();
await support.destroy();
store.close(); // you own the handle — libwa never closes it
```

Every slot is a row in one WAL-mode database: crash-safe (`synchronous = FULL`), safe to share between processes (`busy_timeout`), and a single transactional upsert per save. See [Sessions → SqliteSessionStore](/reference/sessions#sqlitesessionstore).

### Test bot with no persistence

```ts
import { Client, MemorySessionStore } from "libwa";

const client = new Client({
  sessionStore: new MemorySessionStore(),
  reconnect: false,          // fail fast instead of retrying in tests
  commands: { prefix: "!" },
});
```

### Disable commands, handle messages only

```ts
const client = new Client({ commands: false });
```

### Custom backend instance vs factory

```ts
// instance — shared, handy in tests
new Client({ backend: myMockBackend });

// factory — invoked once, gives per-client isolation
new Client({ backend: () => createBaileysBackend({ browser: ["my-bot", "2.0", "Linux"] }) });
```

::: warning Do not share one backend instance between clients
A backend owns a live provider socket. One `Client` per backend instance.
:::

## Environment variables

libwa itself reads **no** environment variables. The bundled example `examples/pairing-login.ts` reads one for convenience:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `WA_PHONE_NUMBER` | string (digits) | no | `"5511999999999"` (placeholder) | Phone number used for pairing-code login in the example. Format: international, 7–15 digits, no `+`. |

```sh
WA_PHONE_NUMBER=5511999999999 npx tsx examples/pairing-login.ts
```

## Configuration files

| File | Role |
| --- | --- |
| `package.json` | Declares the `libwa` dependency; `"type": "module"` recommended (libwa is ESM). |
| `tsconfig.json` | Recommended compiler flags are documented in [Coding conventions](/development/conventions). |
| `.libwa/*.json` | Runtime session files written by the default `FileSessionStore` (not configuration — do not edit by hand). |

There is no libwa config file: **code is configuration** (`new Client({...})`).

## Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| `await client.login()` before attaching `qr` | You never see the QR / error | Register listeners first ([getting started](/guide/getting-started)) |
| `commands: { prefix: [] }` | `ValidationError: Command prefix must be a non-empty string...` at construction | Pass at least one non-empty prefix |
| Reusing one `sessionId` for two live clients | Session file contention; both bots fight over one login | One slot per account |
| `reconnect: false` in production | First network blip emits `disconnect` | Leave defaults or tune `ReconnectOptions` |
| Committing `.libwa/` | Leaks your session | Add it to `.gitignore` |
