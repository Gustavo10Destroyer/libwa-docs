# Sessions architecture

Authentication state is **provider-owned bytes** moving through a **core-owned contract**. The core never interprets it; stores never interpret it; only the backend that wrote it reads it back.

```mermaid
flowchart TD
    subgraph Backend["Baileys backend"]
        Auth["BaileysAuth<br/>AuthenticationState adapter"]
        Ser["BufferJSON serialization<br/>{ v, creds, keys }"]
        Coalesce["Coalesced write chain<br/>scheduled flag + promise chain"]
    end
    subgraph Core["Core"]
        SS["SessionStore contract<br/>load · save · clear"]
    end
    subgraph Stores["Implementations"]
        FS["FileSessionStore<br/>.libwa/id.json · temp+rename"]
        SQ["SqliteSessionStore<br/>one WAL db · upsert per slot"]
        MS["MemorySessionStore<br/>Map (tests)"]
        Custom["Your Redis/SQL store"]
    end
    Auth --> Ser --> Coalesce
    Coalesce -->|"save(Session)"| SS
    SS --> FS
    SS --> SQ
    SS --> MS
    SS --> Custom
    FS -.->|"load()"| Auth
```

## The contract

```ts
interface Session {
  readonly id: string;         // slot id
  readonly provider: string;   // backend id, e.g. "baileys"
  readonly data: Uint8Array;   // opaque
  readonly updatedAt: Date;
}

interface SessionStore {
  load(id): Promise<Session | null>;
  save(session): Promise<void>;
  clear(id): Promise<void>;
  close?(): Promise<void> | void; // optional — caller-owned teardown
}
```

Design rules:

1. **Opaque `data`** — the core treats it as a blob; cross-module type safety comes from `provider` (mismatch detection), not from parsing.
2. **Slot = `sessionId`** — multiple accounts share one store (`sessionId: "alice"` / `"bob"`).
3. **Missing ≠ error** — `load()` returns `null`; `clear()` of a missing slot is a no-op.
4. **Only through the given store** — a backend never opens files or reads env; `BackendConnectOptions.sessionStore` is the single channel.
5. **Caller owns teardown** — libwa never calls `close()`; a store that holds an fd or a connection exposes it, and the code that created the store invokes it.

## Baileys persistence

The Baileys adapter serializes `{ v, creds, keys }` with `BufferJSON` into `Session.data`, and revives app-state keys back into protobuf objects on read.

| Concern | Mechanism |
| --- | --- |
| bursty key updates | **coalesced writes**: a `scheduled` flag + promise chain collapses N updates into 1 store write |
| drain on disconnect | `flush()` awaits the write chain before the socket dies |
| corrupt/unsupported blob | `ValidationError` — fail fast; clear the slot to recover |
| provider mismatch (`session.provider !== "baileys"`) | warn + start from fresh creds (never crash on someone else's bytes) |

```mermaid
sequenceDiagram
    participant S as Socket/auth
    participant A as BaileysAuth
    participant Q as Write chain
    participant ST as SessionStore

    S->>A: keys updated (x5 rapidly)
    A->>Q: schedule save (flag: one at a time)
    Q->>ST: save(Session) — single write
    Note over S,A: bursts collapse to one write
    S->>A: disconnect
    A->>Q: flush()
    Q-->>A: chain drained
```

## Stores

### FileSessionStore (default)

- path `<directory>/<id>.json` (`directory` default `.libwa`);
- payload `{ provider, data: base64, updatedAt }`;
- **atomic**: write `<file>.<writerId>.tmp` → `rename()` (`writerId` = a `randomUUID()` per store instance, so concurrent stores never share one temp file);
- **serialized per slot**: internal promise queue per id;
- **safe ids**: `assertSafeSessionId` (`[A-Za-z0-9_-]{1,64}`) on every op → `ERR_SESSION_ID`;
- corrupt JSON → `ValidationError` `ERR_SESSION_CORRUPT` (cause preserved);
- file exists but cannot be read (`EACCES`, `EIO`, … — anything but `ENOENT`) → `ValidationError` `ERR_SESSION_UNREADABLE` (cause preserved): a stored session is never mistaken for "no session".

### SqliteSessionStore

- one database file for every slot (`filename` default `libwa-sessions.db`), table `sessions(id, provider, data, updated_at) WITHOUT ROWID`;
- **durable**: `journal_mode = WAL` + `synchronous = FULL`; skipped for `":memory:"`;
- **multi-process**: `busy_timeout = busyTimeoutMs` (default 5000 ms) so a second writer blocks instead of raising `SQLITE_BUSY`;
- **serialized per save**: a single `INSERT … ON CONFLICT(id) DO UPDATE` — SQLite serializes writers, so there is no read-modify-write window;
- **safe ids**: the same `assertSafeSessionId` as the file store → `ERR_SESSION_ID`;
- **schema version** in `PRAGMA user_version` — opening a database written by a newer libwa fails with `ERR_SESSION_STORE` instead of guessing at unknown columns;
- **closed handle** → `ERR_SESSION_STORE` on every subsequent call (`#assertOpen`), never a silent reopen;
- corrupt column types → `ERR_SESSION_CORRUPT`; driver load failure (missing `better-sqlite3` binding) → `ERR_SESSION_STORE` with the reinstall hint.

The driver is loaded lazily through `createRequire`, so `import "libwa"` never touches the native binding — a store construction is the only thing that can fail on it.

### MemorySessionStore

`Map<string, Session>` — tests and throwaway processes; no id validation (no filesystem), no persistence.

### Custom stores

Any three-method implementation works (see the [Redis sketch](/reference/sessions#choosing-a-store)). Requirements: per-id write safety and honest `null` for missing slots.

## Lifecycle touchpoints

| Event | Session effect |
| --- | --- |
| first `login()` | `load()` → backend hydrates creds (or starts pairing) |
| during connection | coalesced `save()` on key/cred changes |
| recoverable close | backend instance kept; session untouched; retry `connect()` |
| fatal close (`loggedOut` etc.) | session bytes may remain — `client.logout()` clears them |
| `logout()` | `backend.logout()` (remote revoke, optional) → `store.clear(sessionId)` → disconnect |
| `destroy()` | disconnect only — **session preserved** for next process run |
| `provider` mismatch on load | warn + fresh creds (old bytes effectively abandoned) |

Multi-account: one store, distinct `sessionId`s — each gets an independent slot and connection.

```ts
const file = new FileSessionStore({ directory: "/var/lib/bots" });
const alice = new Client({ sessionStore: file, sessionId: "alice" });
const bob = new Client({ sessionStore: file, sessionId: "bob" });
// .libwa/alice.json · .libwa/bob.json

const db = new SqliteSessionStore({ filename: "/var/lib/bots/sessions.db" });
const carol = new Client({ sessionStore: db, sessionId: "carol" });
const dave = new Client({ sessionStore: db, sessionId: "dave" });
// sessions.db → two rows · close() is yours to call on shutdown
```

## Why not parse sessions in the core?

- **Swap-ability**: a future Signal/Telegram-style backend brings its own auth model; the core must not encode Baileys' `{ v, creds, keys }`.
- **Store simplicity**: Redis/SQL stores store bytes — they never need schema knowledge of auth.
- **Security surface**: core code paths never deserialize credentials (only the owning backend does).

See [Design decisions #6](/architecture/design-decisions#_6-opaque-session-blobs-coalesced-persistence).

## See also

- [Sessions guide](/guide/sessions) — recipes
- [Sessions reference](/reference/sessions) — API details
- [Reconnection](/architecture/reconnection) — how retries interact with sessions
