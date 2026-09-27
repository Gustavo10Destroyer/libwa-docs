# DisconnectReason

<ApiBadge kind="enum" /> Normalized close reasons emitted by backends and surfaced through the client's [`disconnect`](/reference/client-events#disconnect) event.

```ts
import { DisconnectReason, FATAL_DISCONNECT_REASONS } from "libwa";

client.on("disconnect", (reason) => {
  if (FATAL_DISCONNECT_REASONS.has(reason)) rePair();
});
```

## Enum

```ts
enum DisconnectReason {
  LoggedOut = "loggedOut",
  BadSession = "badSession",
  ConnectionReplaced = "connectionReplaced",
  Forbidden = "forbidden",
  RateLimited = "rateLimited",
  RestartRequired = "restartRequired",
  ConnectionClosed = "connectionClosed",
  ConnectionLost = "connectionLost",
  TimedOut = "timedOut",
  ServiceUnavailable = "serviceUnavailable",
  NetworkError = "networkError",
  Unknown = "unknown",
}
```

String-valued (JSON-safe). The Baileys adapter maps provider close codes onto these — the core only ever sees this enum.

## Reference

| Value | Meaning | Retriable? |
| --- | --- | --- |
| `loggedOut` | Session no longer valid; new login required | ❌ fatal |
| `badSession` | Stored session corrupt/inconsistent with server | ❌ fatal |
| `connectionReplaced` | Another device took over the connection | ❌ fatal |
| `forbidden` | Account not allowed to connect (banned) | ❌ fatal |
| `rateLimited` | Provider rate limiting | ✅ (via retry) |
| `restartRequired` | Server asked to restart the connection | ✅ |
| `connectionClosed` | Closed by remote side | ✅ |
| `connectionLost` | Network dropped | ✅ |
| `timedOut` | Connection timed out | ✅ |
| `serviceUnavailable` | WhatsApp service temporarily down | ✅ |
| `networkError` | Could not reach the network at all | ✅ |
| `unknown` | Unclassified close | ✅ |

## `FATAL_DISCONNECT_REASONS`

```ts
const FATAL_DISCONNECT_REASONS: ReadonlySet<DisconnectReason>;
```

The set the reconnect policy consults: `loggedOut`, `badSession`, `connectionReplaced`, `forbidden`.

**Policy:** a close in this set → **no retries**, immediate `disconnect` event, and (during a pending `login()`) an `AuthenticationError` rejection. Retrying them in a loop would never succeed (logged out) or fight the user (connection replaced).

```ts
if (FATAL_DISCONNECT_REASONS.has(reason)) {
  console.error("session dead:", reason);
} else {
  console.warn("transient:", reason, "— client will retry");
}
```

## Behavioral split

| Category | Examples | Client behavior |
| --- | --- | --- |
| Fatal | loggedOut, badSession, connectionReplaced, forbidden | `disconnect` now; `AuthenticationError` if login pending |
| Transient | network/timed out/service unavailable/… | backoff retry (up to `reconnect.attempts`), `reconnecting` events |
| Exhausted retries | any transient, attempts spent | `disconnect` with last reason; `ConnectionError` if login pending |
| Reconnect disabled | `reconnect: false` | any close → `disconnect` immediately |

See [Reconnection architecture](/architecture/reconnection) for the full decision flowchart.

## See also

- [Error handling guide](/guide/error-handling#disconnects) — reacting to reasons
- [ClientOptions → reconnect](/reference/client-options#reconnectoptions) — the retry policy
