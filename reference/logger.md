# Logger

<ApiBadge kind="interface" /> Minimal pluggable logging contract. The library prints nothing by default — inject a `Logger` via [`ClientOptions.logger`](/reference/client-options) to observe internal activity.

```ts
import { Client, createConsoleLogger } from "libwa";

new Client({ logger: createConsoleLogger("mybot") });
```

## `Logger` <ApiBadge kind="interface" />

```ts
interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
```

Four levels, rest-spread args (no format string required). Implementations should be non-throwing — the library does **not** guard logger calls, so a throwing logger propagates into whatever operation triggered the log (and can fail it).

## `nullLogger` <ApiBadge kind="constant" />

```ts
const nullLogger: Logger;
```

No-op implementation; the default when `logger` is not provided. Everything is discarded.

```ts
new Client();                 // logger: nullLogger (silent)
```

## `createConsoleLogger` <ApiBadge kind="function" />

```ts
function createConsoleLogger(prefix?: string): Logger; // default prefix "libwa"
```

Development logger printing to `console.debug/info/warn/error` with a `` `${prefix} ${level}:` `` head.

```ts
createConsoleLogger("bot");
// debug: …  →  "bot debug: …"
createConsoleLogger();        // "libwa debug: …"
```

## What gets logged

| Source | Level | Example line |
| --- | --- | --- |
| client error routing | `error` | `[reconnect exhausted] Gave up reconnecting after 5 attempt(s) (networkError).` |
| error-listener failure | `error` | `[error listener] <message>` |
| destroy/logout failures | `error` | `[disconnect during destroy] …` |
| backend/provider diagnostics | `debug`/`info` | via `BackendConnectOptions.logger` (same instance) |

The `error` **event** and the logger are independent: without `error` listeners, logged failures are the only trace (and with `nullLogger`, the only trace is whatever you catch yourself).

## Wiring a real logger

```ts
import { Client, type Logger } from "libwa";
import pino from "pino";

const p = pino({ name: "libwa-bot" });
const logger: Logger = {
  debug: (...a) => p.debug(a),
  info: (...a) => p.info(a),
  warn: (...a) => p.warn(a),
  error: (...a) => p.error(a),
};

const client = new Client({ logger });
```

The same instance is handed to the backend in `BackendConnectOptions`, so provider-level diagnostics flow through your logger too.

## See also

- [Error handling guide](/guide/error-handling#logging) — log-vs-event routing
- [ClientOptions](/reference/client-options) — injection point
