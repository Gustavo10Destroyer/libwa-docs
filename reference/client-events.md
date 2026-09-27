# Client events

<ApiBadge kind="interface" /> The closed, provider-independent event map consumed by [`client.on / once / off`](/reference/client#on-once-off). Listener arguments are fully inferred from the event name.

```ts
import type { ClientEvents } from "libwa";
import type { Client, DisconnectReason, Interaction } from "libwa";

type ClientEvents = {
  ready: [client: Client];
  interactionCreate: [interaction: Interaction];
  error: [error: Error];
  disconnect: [reason: DisconnectReason];
  reconnecting: [attempt: number, delayMs: number];
  qr: [qr: string];
  pairingCode: [code: string];
};
```

Each event is declared as a **tuple of arguments** — the emitter invokes listeners with exactly that tuple. Raw backend/provider events are never part of this map.

## Events

### `ready`

<ApiBadge kind="event" />

```ts
client.on("ready", (client) => { /* client === the emitting Client */ });
```

<ApiTable
  :rows="[
    { name: 'client', type: 'Client', description: 'The client that (re)connected — same instance as the one you called login() on.' }
  ]"
/>

**When:** every time the connection opens — including reconnects. On the first open it fires **after** `login()` resolves (the login deferred is settled inside the same connection handler, before emission). `client.me` is already populated; `client.state === "ready"`; the reconnection attempt counter has been reset.

### `interactionCreate`

<ApiBadge kind="event" />

```ts
client.on("interactionCreate", async (interaction) => { /* … */ });
```

<ApiTable
  :rows="[
    { name: 'interaction', type: 'Interaction', description: 'A factory-built interaction that passed the middleware pipeline. Narrow with isMessage()/isCommand()/isReaction()/…' }
  ]"
/>

**When:** after a backend event was mapped, converted by `InteractionFactory`, and every registered middleware called `next()`. A matched command's `execute()` runs **before** these listeners (and even when `groupOnly`/`dmOnly` skip it, listeners still run).

**Ordering:** listeners run sequentially in registration order; each may be async (awaited). Thrown errors → context `interactionCreate listener` on the `error` event.

### `error`

<ApiBadge kind="event" />

```ts
client.on("error", (error) => {
  console.error(error.name, error.code, error.message, error.cause);
});
```

<ApiTable
  :rows="[
    { name: 'error', type: 'Error', description: 'Usually a WhatsAppError subclass. Context strings (command name, middleware, …) appear in the logger line, not on the error object.' }
  ]"
/>

**When:** any library/middleware/command/listener failure, plus terminal conditions like `Gave up reconnecting after N attempt(s) (reason).`

**Critical semantics:**

- Emitted **only if at least one `error` listener exists** — without one, failures are log-only (and the default logger is silent).
- If an `error` listener itself throws, that failure is logged as `[error listener] …` and **not** re-emitted (no recursion).
- Typical sources: command execution, middleware, other listeners, `connect` failures, `reconnect exhausted`, `login` failures, `backend logout`, `disconnect during destroy`.

### `disconnect`

<ApiBadge kind="event" />

```ts
client.on("disconnect", (reason) => {
  if (reason === "loggedOut") process.exit(1);
});
```

<ApiTable
  :rows="[
    { name: 'reason', type: 'DisconnectReason', description: 'Why the connection closed for good. See the DisconnectReason reference for the full enum.' }
  ]"
/>

**When:** the connection closed and will **not** be retried — because the reason is in the fatal set, `reconnect: false`, or `attempts` were exhausted. For fatal reasons during a pending `login()`, the login promise rejects with `AuthenticationError` *and* this event fires. Not emitted after `destroy()` (state guard).

### `reconnecting`

<ApiBadge kind="event" />

```ts
client.on("reconnecting", (attempt, delayMs) => {
  console.warn(`retry ${attempt} in ${delayMs}ms`);
});
```

<ApiTable
  :rows="[
    { name: 'attempt', type: 'number', description: '1-based attempt number for the current connection epoch. Resets to 0 on every successful open.' },
    { name: 'delayMs', type: 'number', description: 'Backoff wait before the retry: min(maxDelayMs, initialDelayMs * factor ** (attempt - 1)).' }
  ]"
/>

**When:** a recoverable close was accepted by the policy and a timer has been scheduled (timer is `unref`'d — it will not keep Node alive). If the scheduled `connect()` throws, it is reported as `reconnection` on the error event and the close logic runs again with the same reason.

### `qr`

<ApiBadge kind="event" />

```ts
client.on("qr", (qr) => console.log(qr)); // render / pipe to a scanner
```

<ApiTable
  :rows="[
    { name: 'qr', type: 'string', description: 'Raw QR payload from the backend (opaque string — render it with a QR library or display as text).' }
  ]"
/>

**When:** the backend reports `status: "connecting"` with a `qr` while unauthenticated. Only in QR flows — not emitted when pairing codes are being requested. **Attach before `login()`.**

### `pairingCode`

<ApiBadge kind="event" />

```ts
client.on("pairingCode", (code) => console.log(code)); // e.g. "ABCD-EFGH"
```

<ApiTable
  :rows="[
    { name: 'code', type: 'string', description: 'Pairing code to enter on the phone (WhatsApp → Linked devices → Link a device).' }
  ]"
/>

**When:** the backend produces a code — auto-requested when `auth.pairingPhoneNumber` is set, or from `client.requestPairingCode()`. The manual method also resolves with the same code.

## Quick reference table

| Event | Args | Emit sources | Typical use |
| --- | --- | --- | --- |
| `ready` | `(client)` | connection open | announce readiness, sync state |
| `interactionCreate` | `(interaction)` | dispatch pipeline | main handler |
| `error` | `(error)` | `#handleError` | logging/alerting |
| `disconnect` | `(reason)` | terminal close | cleanup, process exit |
| `reconnecting` | `(attempt, delayMs)` | retry scheduled | observability |
| `qr` | `(qr)` | backend connecting+qr | display QR |
| `pairingCode` | `(code)` | backend/manual request | display code |

## Full example

```ts
import { Client, DisconnectReason, type Interaction } from "libwa";

const client = new Client();

client.on("qr", (qr) => process.stdout.write(`${qr}\n`));
client.on("pairingCode", (code) => console.log("code:", code));
client.on("ready", (c) => console.log("ready as", c.me?.displayName));
client.on("reconnecting", (n, ms) => console.warn(`retry ${n} in ${ms}ms`));
client.on("disconnect", (r) =>
  console.error("bye:", r, r === DisconnectReason.LoggedOut ? "(re-pair needed)" : ""),
);
client.on("error", (e) => console.error("!", e.name, e.message));

client.on("interactionCreate", (i: Interaction) => {
  if (i.isMessage() && i.isText()) void i.reply(`echo: ${i.text}`);
});

await client.login();
```

## See also

- [Events guide](/guide/events) — patterns, ordering, teardown
- [Client methods](/reference/client#on-once-off) — subscription API
- [TypedEventEmitter](/reference/typed-event-emitter) — the emitter implementation behind these events
