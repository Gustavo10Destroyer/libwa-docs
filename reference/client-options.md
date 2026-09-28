# ClientOptions

<ApiBadge kind="interface" /> Options accepted by `new Client(options?)`. All properties optional.

```ts
import { Client, type ClientOptions } from "libwa";

const options: ClientOptions = {
  sessionId: "default",
  commands: { prefix: "!", ignoreSelf: false },
  reconnect: { attempts: 5, initialDelayMs: 1000, maxDelayMs: 30000, factor: 2 },
  auth: { pairingPhoneNumber: "5511999999999" },
};

const client = new Client(options);
```

## Properties

<ApiTable
  :rows="[
    { name: 'backend', type: 'WhatsAppBackend | (() => WhatsAppBackend)', def: 'undefined → createDefaultBackend()', description: 'Provider adapter. Instances are used directly; factories are invoked once per Client. Never share one instance across clients.' },
    { name: 'sessionStore', type: 'SessionStore', def: 'undefined → new FileSessionStore()', description: 'Where login state persists. Defaults to a filesystem store in .libwa/.' },
    { name: 'sessionId', type: 'string', def: '&quot;default&quot;', description: 'Slot id inside the store; must be usable as a filename stem ([A-Za-z0-9_-]{1,64} for FileSessionStore).' },
    { name: 'logger', type: 'Logger', def: 'undefined → nullLogger', description: 'Internal diagnostics sink. The default discards everything — inject a logger to see anything.' },
    { name: 'commands', type: 'CommandOptions | false', def: 'undefined → { prefix: &quot;!&quot; }', description: 'Command parsing configuration, or false to disable parsing entirely.' },
    { name: 'reconnect', type: 'ReconnectOptions | false', def: 'undefined → DEFAULT_RECONNECT object', description: 'Reconnection policy, or false to disable automatic retries.' },
    { name: 'auth', type: '{ pairingPhoneNumber?: string }', def: 'undefined', description: 'Pairing-code login configuration. pairingPhoneNumber: international, 7-15 digits, no +.' }
  ]"
/>

Note: under `exactOptionalPropertyTypes`, do **not** pass explicit `undefined` for optional props — omit them instead.

## CommandOptions <ApiBadge kind="interface" />

Options for the command system. Pass `commands: false` on `ClientOptions` to disable parsing (this interface then does not apply).

<ApiTable
  :rows="[
    { name: 'prefix', type: 'string | readonly string[]', def: '&quot;!&quot;', description: 'Command prefix(es). Checked in array order; first match wins. Empty array or any empty string → ValidationError ERR_INVALID_PREFIX at construction.' },
    { name: 'ignoreSelf', type: 'boolean', def: 'false', description: 'Skip command parsing for messages sent by the logged-in account (they still dispatch as MessageInteractions).' }
  ]"
/>

```ts
new Client({ commands: { prefix: ["!", "/", "?"], ignoreSelf: true } });
new Client({ commands: false }); // no CommandInteractions ever
```

## ReconnectOptions <ApiBadge kind="interface" />

Automatic reconnection policy for recoverable disconnects. Fatal reasons ([`FATAL_DISCONNECT_REASONS`](/reference/disconnect-reason#fatal-disconnect-reasons)) ignore it.

<ApiTable
  :rows="[
    { name: 'attempts', type: 'number', def: '5', description: 'Maximum retries per connection epoch. The counter resets to 0 whenever the connection opens.' },
    { name: 'initialDelayMs', type: 'number', def: '1000', description: 'Delay before retry #1.' },
    { name: 'maxDelayMs', type: 'number', def: '30000', description: 'Ceiling for every computed delay.' },
    { name: 'factor', type: 'number', def: '2', description: 'Exponential base: delay(n) = min(maxDelayMs, initialDelayMs * factor ** (n - 1)).' }
  ]"
/>

Defaults object (mirrored as `DEFAULT_RECONNECT` in source):

```ts
const DEFAULT_RECONNECT = { attempts: 5, initialDelayMs: 1000, maxDelayMs: 30000, factor: 2 };
```

```ts
// fast local dev: don't retry at all
new Client({ reconnect: false });

// flaky network: patient backoff
new Client({ reconnect: { attempts: 10, initialDelayMs: 2000, maxDelayMs: 120000, factor: 2 } });
```

## ResolvedClientOptions <ApiBadge kind="interface" />

The fully-defaulted shape produced by [`resolveClientOptions`](#resolveclientoptions) and stored on the client (`readonly`):

```ts
interface ResolvedClientOptions {
  readonly backend: WhatsAppBackend | (() => WhatsAppBackend) | undefined;
  readonly sessionStore: SessionStore | undefined;
  readonly sessionId: string;
  readonly logger: Logger;
  readonly commandOptions: CommandParsingOptions | null; // null = parsing disabled
  readonly reconnect:
    | { readonly attempts: number; readonly initialDelayMs: number;
        readonly maxDelayMs: number; readonly factor: number }
    | false;
  readonly pairingPhoneNumber: string | undefined;
}
```

Differences from raw options: `commandOptions` is normalized (`prefix` → `prefixes: readonly string[]`, or `null` for `commands: false`); `reconnect` is either a required-fields object or `false`; `logger` is never `undefined`.

## resolveClientOptions <ApiBadge kind="internal" />

```ts
function resolveClientOptions(options: ClientOptions): ResolvedClientOptions
```

Applies every default. Called by the `Client` constructor — you normally never call it.

<ApiTable
  :rows="[
    { name: 'options', type: 'ClientOptions', description: 'Raw user options.' }
  ]"
/>

**Returns:** `ResolvedClientOptions`.

**Throws:**

| Condition | Error | Code |
| --- | --- | --- |
| `commands` present with `prefix: []` | `ValidationError` | `ERR_INVALID_PREFIX` |
| `commands.prefix` contains `""` | `ValidationError` | `ERR_INVALID_PREFIX` |

Message: `Command prefix must be a non-empty string or a non-empty list.`

Internal helper `normalizePrefixes(prefix)` performs the check: converts a single string to a one-element array, copies readonly arrays to a mutable snapshot, then validates.

```ts
import { resolveClientOptions } from "../src/ClientOptions.js"; // repo-internal path
```

<ApiNote kind="internal">
Not exported from the package root — only importable inside the repository (or via the tsconfig paths trick). Application code should pass options to <code>new Client()</code> instead.
</ApiNote>

## See also

- [Configuration guide](/guide/configuration) — recipes and rationale
- [Client reference](/reference/client) — how options are consumed
- [Reconnection architecture](/architecture/reconnection) — policy behavior
