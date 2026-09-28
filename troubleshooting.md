# Troubleshooting

Symptom → cause → fix. Ordered by how often bot authors hit it.

## Login & pairing

### `qr` event never fires

- Attach listeners **before** `login()`: `client.on("qr", …)` after `await client.login()` is too late (the event fires during connect).
- Pairing flow: listen for `pairingCode` (emitted whenever a code is produced — auto via `auth.pairingPhoneNumber` or manual `requestPairingCode()`). libwa does **not** suppress `qr`; if one still arrives while waiting for the code, ignore it.
- Check you are not swallowing errors: attach `client.on("error", …)` and log it.

### Pairing code request fails

| Error | Code | Fix |
| --- | --- | --- |
| `phoneNumber must contain 7-15 digits…` | `ERR_INVALID_PHONE` | international digits only: `5511999999999`, no `+`, no spaces |
| `Backend "…" does not support pairing codes` | `ERR_UNSUPPORTED` | this backend has no `requestPairingCode` (the bundled Baileys one does) |
| `Failed to request pairing code: …` | `ERR_BACKEND` | provider rejected — phone not reachable, rate limited; try QR flow |

### `login()` rejects with `AuthenticationError`

Session is dead (`loggedOut` / `badSession` / `connectionReplaced` / `forbidden`). **No automatic retry will fix it** — re-pair:

```ts
await client.logout();   // clears the slot (backend failures are reported through "error")
// then QR or pairing flow again
```

Also happens with an **interrupted pairing**: if a pairing-code/QR attempt was started but never completed on the phone, the slot holds unregistered creds (`"registered": false`) and the server answers `Connection Failure` → `loggedOut`. Recover by deleting the slot file directly (relative to your process working directory):

```sh
rm -rf .libwa          # or .libwa/<sessionId>.json for one slot
```

If the rejection is uncaught (bare top-level `await client.login()`), Node prints the `AuthenticationError` stack and exits `1` — wrap `login()` in `try/catch`.

### `login()` rejects with `ConnectionError: Client was destroyed.`

You called `destroy()` while login was pending — expected. Create a new `Client` (destroyed is terminal).

### Login hangs, no `ready`, no `qr`

Almost always: no `error` listeners and `logger` unset (defaults to `nullLogger`) — failures are invisible. Always start with:

```ts
client.on("error", (e) => console.error("[libwa]", e instanceof WhatsAppError ? e.code : "—", e.message, e.cause));
```

## Reconnection

### Bot stays disconnected after network drop

- `reconnect: false` configured? → close is terminal by design.
- Fatal reason? log `disconnect` reasons: `loggedOut`, `badSession`, `connectionReplaced`, `forbidden` never retry.
- Attempts exhausted (default 5)? watch for the `error` line `Gave up reconnecting after 5 attempt(s) (…)`, and raise `reconnect.attempts` / `maxDelayMs`.
- Process exited? pending backoff timers are `unref`'d — a process with nothing else alive **will** exit during backoff. Keep it alive (server, `process.stdin`, etc.).

### Endless reconnect loop

Transient reason but the network is genuinely down → the client keeps retrying up to `attempts` per epoch (counter resets on every open). Tighten `attempts`, add monitoring on the `reconnecting` event.

### Old messages processed after reconnect

Should not happen (backend generation guards drop dead-socket events). If you see it, verify you are not re-using a **single backend instance across multiple clients** — one backend per client.

## Commands

### Commands do not fire

1. `commands: false` in options? → parsing disabled entirely.
2. Wrong prefix (array order matters; first match wins).
3. Name fails the pattern (`^[a-z0-9][a-z0-9_-]{0,31}$`) → `parse()` returns `null` silently.
4. `ignoreSelf: true` + message sent by the bot account.
5. `groupOnly`/`dmOnly` gate — note `interactionCreate` listeners still fire; only `execute()` is skipped.

### `ERR_DUPLICATE_COMMAND` at registration

Name or alias already taken. New *aliases* are checked against both existing commands and aliases; a new *name* is only checked against commands — so a command can shadow an existing alias (keep names unique to avoid surprises). Use `registry.get(name)` / `registry.resolve(alias)` or `unregister(name)` first — note aliases registered by an existing command are removed with it.

### Middleware seems to swallow everything

Skip = stop. A middleware that `return`s without `await next()` blocks commands **and** listeners. Put unconditional `await next()` on the happy path; use `try/finally` patterns carefully (calling `next()` twice throws).

## Sending & media

| Error | Code | Fix |
| --- | --- | --- |
| empty/ambiguous payload | `ERR_EMPTY_MESSAGE` / `ERR_AMBIGUOUS_MESSAGE` | exactly one body: `text` *or* media *or* `location` |
| caption without media | `ERR_INVALID_CAPTION` | captions only on image/video/document |
| empty media bytes | `ERR_EMPTY_MEDIA` | you passed `Uint8Array(0)` — check your file read |
| reaction rejected | `ERR_EMPTY_REACTION` | use `null` to clear, `""` is invalid |
| `PermissionError` | `ERR_PERMISSION` | not admin (group ops) |
| `NotFoundError` | `ERR_NOT_FOUND` | message/chat deleted — stop acting on it |
| `UnsupportedOperationError` | `ERR_UNSUPPORTED` | backend lacks the capability: `if (client.backend.react)` |
| `BackendError` | `ERR_BACKEND` | group rename/description, pairing codes, custom backends — inspect `.cause`; send/media failures surface as `MessageError` |

### Media download returns nothing / fails

`attachment.download()` pulls from the backend's **raw-message cache (LRU 500)** — very old messages may have been evicted (and history sync is off by default, so pre-login messages never existed locally). Download promptly on receipt.

## Sessions

| Symptom | Code | Fix |
| --- | --- | --- |
| startup crash on bad `sessionId` | `ERR_SESSION_ID` | ids must match `[A-Za-z0-9_-]{1,64}` |
| corrupted file | `ERR_SESSION_CORRUPT` | delete `.libwa/<id>.json` and re-pair (fail-fast by design) |
| bot logged in as wrong account | — | distinct `sessionId`s share one store; check the slot |
| session ignored after switching backend | — | `provider` mismatch → warn + fresh creds (re-pair) |

## Groups

| Symptom | Fix |
| --- | --- |
| `At least one user is required.` | pass ≥1 target to add/remove/promote/demote |
| `Group name cannot be empty.` | `rename("")` invalid; `setDescription(undefined)` is how you *clear* |
| metadata getters `undefined` | call `await group.refresh()` (or `client.groups.fetch`) first |
| `groupOnly` command silent in DM | by design; `interactionCreate` listeners still run |

## Disconnect reasons

`disconnect` fired and never retried → check [DisconnectReason](/reference/disconnect-reason):

- **fatal**: `loggedOut`, `badSession`, `connectionReplaced`, `forbidden` → re-pair;
- `restartRequired`, `rateLimited`, `timedOut`, `networkError`, … → retried (unless attempts/`reconnect:false` ended it).

## Performance & process

| Symptom | Cause | Fix |
| --- | --- | --- |
| process exits during backoff | timers are `unref`'d | keep the event loop alive (your server/queue) |
| memory growth in long sessions | raw-message LRU bounded (500) — not that | check your own caches (e.g. `Map` rate limiters without eviction) |
| `error` event silent | no listeners registered | add one — the library skips emitting into the void |

## Getting a diagnosis quickly

```ts
const client = new Client({
  logger: createConsoleLogger("bot"),   // see internal activity
  commands: { prefix: "!" },
});
client.on("error", (e) => console.error("ERROR", e instanceof WhatsAppError ? e.code : "—", e.message, "cause:", e.cause));
client.on("disconnect", (r) => console.error("DISCONNECT", r));
client.on("reconnecting", (n, ms) => console.warn(`retry ${n} in ${ms}ms`));
await client.login().catch((e) => console.error("LOGIN FAILED", e.code, e.message));
```

Still stuck? Gather: the exact `error.code`, `message`, `cause`, the `disconnect` reason, your `ClientOptions` redacted of phone numbers, and whether it reproduces with a fresh `sessionId`.

## See also

- [Error handling guide](/guide/error-handling) — patterns
- [Sessions guide](/guide/sessions) — recovery flows
- [Backends guide](/guide/backends) — capability differences
