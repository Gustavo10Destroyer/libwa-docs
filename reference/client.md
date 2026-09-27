# Client

<ApiBadge kind="class" /> The entry point of the library. One instance = one WhatsApp account/session slot = one backend.

```ts
import { Client, type ClientState } from "libwa";

const client = new Client({ commands: { prefix: "!" } });
await client.login();
```

The client owns:

- **Connection lifecycle** — `login()`, `destroy()`, `logout()`, reconnection policy.
- **Backend subscription** — subscribes to the six normalized backend events exactly once per instance.
- **Dispatch pipeline** — factory → middleware → command execution → `interactionCreate` listeners.
- **Services** — composed in the constructor and exposed as readonly fields.
- **Error routing** — every internal failure goes through `#handleError(error, context)` → logger + `error` event.

## Constructor

```ts
new Client(options?: ClientOptions)
```

<ApiTable
  :rows="[
    { name: 'options', type: 'ClientOptions', def: '{}', description: 'Configuration object. Resolved immediately via resolveClientOptions() — invalid command prefixes throw synchronously here.' }
  ]"
/>

**Composition performed in order:** resolve options → build `TypedEventEmitter` (with the error-recursion guard) → create backend (instance, factory call, or `createDefaultBackend()`) → create session store (`options.sessionStore ?? new FileSessionStore()`) → `EntityFactory` → `CommandRegistry` → `InteractionFactory` → `MessageService` / `GroupService`.

**Throws:** `ValidationError` (`ERR_INVALID_PREFIX`) for an empty prefix list or an empty-string prefix.

```ts
new Client({ commands: { prefix: [] } }); // → ValidationError at construction
```

## Properties

### `state`

```ts
get state(): ClientState
```

Current lifecycle state — see [`ClientState`](#clientstate). Starts `"idle"`.

| Transition | Trigger |
| --- | --- |
| `idle → connecting` | `login()` |
| `connecting → ready` | first connection open |
| `ready → connecting` | recoverable close, retry scheduled |
| `connecting → ready` | reconnect succeeds (also emits `ready` again) |
| `ready/connecting → idle` | fatal close, retries exhausted, `logout()` |
| `any → destroyed` | `destroy()` (terminal) |

### `isReady`

```ts
get isReady(): boolean
```

`true` only while the connection is open. Reset on every close (including before a retry).

### `me`

```ts
get me(): User | null
```

The logged-in account, populated when the backend reports `me` on connection open. `null` before the first successful connect.

```ts
client.on("ready", () => console.log(client.me?.displayName));
```

### `backend`

```ts
get backend(): WhatsAppBackend
```

The active backend — for advanced integrations (capability detection, direct event access). Normal bots never need it. Read-only reference: the client never swaps backends.

### `sessionId`

```ts
get sessionId(): string
```

The session slot this client uses (`ClientOptions.sessionId`, default `"default"`).

### Services (readonly fields)

| Field | Type | Role |
| --- | --- | --- |
| `messages` | `MessageService` | send / react / edit / delete ([reference](/reference/messaging)) |
| `groups` | `GroupService` | metadata fetch + group management ([reference](/reference/groups)) |
| `commands` | `CommandRegistry` | command registration & parsing ([reference](/reference/commands)) |

## Methods

### `on` / `once` / `off`

```ts
on<Key extends keyof ClientEvents>(event: Key, listener: ListenerOf<ClientEvents, Key>): Unsubscribe
once<Key extends keyof ClientEvents>(event: Key, listener: ListenerOf<ClientEvents, Key>): Unsubscribe
off<Key extends keyof ClientEvents>(event: Key, listener?: ListenerOf<ClientEvents, Key>): void
```

Typed event subscription over the seven [client events](/reference/client-events).

<ApiTable
  :rows="[
    { name: 'event', type: 'keyof ClientEvents', description: 'Event name. Listener arguments are inferred from it.' },
    { name: 'listener', type: '(...args) => void | Promise<void>', description: 'May be async. Rejections are caught: logged + routed to the error event (except for the error event itself, which is log-only).' }
  ]"
/>

**Returns:** `Unsubscribe` (`() => void`) for `on`/`once`; `void` for `off`. Calling `off(event)` without a listener removes **all** listeners for that event.

```ts
const stop = client.on("ready", () => {});
stop();
client.off("interactionCreate"); // nuke all
```

Errors thrown by listeners never propagate to the emitter caller.

### `use`

```ts
use(middleware: Middleware): this
```

Appends a middleware to the dispatch pipeline. Middlewares run in registration order **before** commands and `interactionCreate` listeners; skipping `next()` stops dispatch entirely. Returns `this` for chaining.

<ApiTable
  :rows="[
    { name: 'middleware', type: 'Middleware', description: '(interaction, next) => void | Promise<void>. Throwing aborts dispatch and reports the middleware context through the error event.' }
  ]"
/>

There is no `unuse` — compose your chain yourself before registering:

```ts
for (const mw of buildChain()) client.use(mw);
```

Details: [Middleware guide](/guide/middleware).

### `login`

```ts
login(): Promise<void>
```

Connects to WhatsApp. **Resolves** when the connection is open for the first time (first `ready`). **Rejects** if authentication fails or reconnection is exhausted before the first success.

Behavior matrix:

| Current situation | Result |
| --- | --- |
| `state === "destroyed"` | rejects `ConnectionError("This client has been destroyed...")` |
| already ready | resolves immediately |
| `login()` already pending | returns the **same** promise |
| otherwise | subscribes backend, `state = "connecting"`, starts `connect()` |

Failure routing inside:

- `ValidationError` / `AuthenticationError` from `connect()` → fail fast: reject (no retries; auth/session problems will not fix themselves).
- any other `connect()` failure → log + synthesized close with `DisconnectReason.NetworkError` → normal retry policy.
- while pending, a fatal close rejects with `AuthenticationError`; a non-fatal terminal close rejects with `ConnectionError`.
- a rejection with no `await` is pre-caught internally so fire-and-forget calls never crash the process (callers that await still observe it).

**Side effects:** state transitions, `error` events, backend listeners attached (once).

```ts
client.on("qr", showQr);
client.on("pairingCode", showCode);
try {
  await client.login();
} catch (error) {
  // AuthenticationError | ConnectionError | ValidationError
}
```

### `destroy`

```ts
async destroy(): Promise<void>
```

Permanently stops the client:

1. no-op if already `destroyed`;
2. `state = "destroyed"`, `isReady = false`;
3. cancels a pending reconnect timer;
4. rejects a pending `login()` with `ConnectionError("Client was destroyed.")` — **without** emitting `error` for it (report = false);
5. unsubscribes all backend listeners;
6. `await backend.disconnect()` — failures reported through `error` (context `disconnect during destroy`), never thrown.

After `destroy()`, `login()` always rejects. This is the only terminal state.

### `logout`

```ts
async logout(): Promise<void>
```

Invalidates the session and returns the client to `idle`:

1. cancels any pending reconnect timer;
2. `backend.logout()` if implemented (remote revocation) — failures → `error` (context `backend logout`);
3. `sessionStore.clear(sessionId)` — the slot is wiped;
4. `backend.disconnect()` — failures → `error` (context `disconnect after logout`);
5. `isReady = false`; `state = "idle"` (unless destroyed).

Never rejects itself; a subsequent `login()` starts a **fresh pairing flow**. Does not detach listeners (unlike `destroy()`).

### `requestPairingCode`

```ts
async requestPairingCode(phoneNumber: string): Promise<string>
```

Requests an 8-character pairing code for phone-number login.

<ApiTable
  :rows="[
    { name: 'phoneNumber', type: 'string', description: 'International format, 7-15 digits, no +. Validated against /^\\d{7,15}$/.' }
  ]"
/>

**Returns:** the code (e.g. `"ABCD-EFGH"`). A `pairingCode` event is also emitted by the backend when it produces a code.

**Errors:**

| Condition | Error | Code |
| --- | --- | --- |
| format mismatch | `ValidationError` | `ERR_INVALID_PHONE` |
| backend lacks `requestPairingCode` | `ValidationError` | `ERR_UNSUPPORTED` |
| provider failure | `BackendError` (wrapped, context `Failed to request pairing code`) | `ERR_BACKEND` |

Meaningful only while connecting; with `auth.pairingPhoneNumber` configured the bundled backend auto-requests one.

## `ClientState`

```ts
type ClientState = "idle" | "connecting" | "ready" | "destroyed";
```

| Value | Meaning |
| --- | --- |
| `"idle"` | Not connected; `login()` may start a fresh attempt (initial state, after terminal close, after logout). |
| `"connecting"` | `connect()` in flight or backoff timer pending. |
| `"ready"` | Connection open; `isReady === true`. |
| `"destroyed"` | Terminal; all listeners detached; `login()` rejects. |

## Internal machinery <ApiBadge kind="internal" />

For contributors reading `src/Client.ts` (511 lines):

| Member | Purpose |
| --- | --- |
| `#subscribeBackend()` | Attaches the six backend listeners once (guarded by `#subscribed`). Each payload is fed to the factory and dispatched via `void #dispatch(...)`. |
| `#connectBackend()` | Wraps `backend.connect({ sessionId, sessionStore, logger, pairingPhoneNumber })`. |
| `#dispatch(interaction)` | `runMiddlewareChain` → `#commandAllowed` check → `command.execute` → `interactionCreate` listeners; every stage individually try/caught into `#handleError`. |
| `#commandAllowed(command, i)` | Enforces `groupOnly`/`dmOnly` against `isFromGroup()`/`isFromDirectChat()`. |
| `#onConnectionUpdate(u)` | Routes `qr`/`pairingCode` emissions; on `open` resets the attempt counter, sets `me`, resolves the login deferred (first open only), emits `ready`. |
| `#onClose(u)` | Reconnect policy: fatal set / `reconnect: false` / attempts exhausted → `disconnect` event + login rejection; otherwise schedules backoff (`delay = min(max, initial * factor^(n-1))`, `unref`'d timer). |
| `#failLogin(e, report)` | Rejects and clears the login deferred exactly once; reports through `error` when `report` (default true). |
| `#handleError(e, context)` | `logger.error("[context]", message)`; emits `error` only when listeners exist. `error`-listener failures are downgraded to logs inside the emitter hook. |

## Full example

```ts
import { Client, DisconnectReason, type Interaction } from "libwa";

const client = new Client({
  sessionId: "main",
  commands: { prefix: ["!", "/"], ignoreSelf: true },
  reconnect: { attempts: 5, initialDelayMs: 1000, maxDelayMs: 30000, factor: 2 },
});

const stopError = client.on("error", (error) => {
  console.error("[libwa]", error.name, error.code, error.message);
});

client.on("ready", () => console.log("online:", client.me?.displayName));
client.on("reconnecting", (attempt, delay) =>
  console.warn(`reconnect #${attempt} in ${delay}ms`),
);
client.on("disconnect", (reason) => {
  console.error("disconnected:", reason);
  if (reason === DisconnectReason.LoggedOut) process.exit(1);
});

client.on("interactionCreate", (i: Interaction) => {
  if (i.isCommand() && i.name === "status") {
    void i.reply(`state=${client.state} ready=${client.isReady}`);
  }
});

await client.login();          // resolves on first ready
await client.destroy();        // later: terminal cleanup
stopError();
```

## See also

- [ClientOptions](/reference/client-options) — every constructor option
- [Client events](/reference/client-events) — the event map
- [Getting started](/guide/getting-started) — first connection walkthrough
- [Reconnection architecture](/architecture/reconnection) — policy internals
