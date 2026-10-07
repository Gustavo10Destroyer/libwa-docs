# Sessions

<ApiBadge kind="interface" /> Authentication persistence. The core treats session bytes as opaque — only the backend interprets them. Stores are pluggable: file, SQLite, memory, or your own (Redis, SQL, cloud).

```ts
import { Client, FileSessionStore, SqliteSessionStore, MemorySessionStore, type SessionStore } from "libwa";

new Client({ sessionStore: new FileSessionStore({ directory: "/var/lib/bot" }) });
new Client({ sessionStore: new SqliteSessionStore({ filename: "var/bots.db" }) }); // production
new Client({ sessionStore: new MemorySessionStore() }); // tests
```

## Session <ApiBadge kind="interface" />

```ts
interface Session {
  readonly id: string;         // slot id (ClientOptions.sessionId)
  readonly provider: string;   // backend that produced it, e.g. "baileys"
  readonly data: Uint8Array;   // opaque serialized credentials
  readonly updatedAt: Date;    // last save time
}
```

The core never parses `data` — `provider` lets a store (or migration tooling) detect cross-backend reuse.

## SessionStore <ApiBadge kind="interface" />

```ts
interface SessionStore {
  load(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(id: string): Promise<void>;
  close?(): Promise<void> | void; // optional — release locks/files
}
```

| Method | Contract |
| --- | --- |
| `load` | Returns the session or `null` when none exists (missing ≠ error). |
| `save` | Persists by `session.id`; must be safe under concurrent calls for the same id. |
| `clear` | Removes the slot; clearing a missing slot is **not** an error. |
| `close` | Optional. Releases OS resources (file descriptors, database connections). libwa **never** calls it — the store's creator owns it. |

Backends call `load`/`save`/`clear` through `ClientOptions.sessionStore`; `client.logout()` clears the slot. `close()` is yours to call on shutdown (see [Choosing a store](#choosing-a-store)).

## FileSessionStore <ApiBadge kind="class" />

```ts
class FileSessionStore implements SessionStore {
  constructor(options?: FileSessionStoreOptions);
  get directory(): string;
  load(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(id: string): Promise<void>;
}
```

The default store. One JSON file per slot: `<directory>/<id>.json`.

```json
{ "provider": "baileys", "data": "<base64>", "updatedAt": "2026-09-25T12:00:00.000Z" }
```

### `FileSessionStoreOptions` <ApiBadge kind="interface" />

```ts
interface FileSessionStoreOptions {
  directory?: string; // default ".libwa"
}
```

### Guarantees

| Property | Mechanism |
| --- | --- |
| Atomic writes | write `<file>.<writerId>.tmp` → `rename()` (readers never see partial files; `writerId` = `randomUUID()` per store instance, so two stores in one process never share a temp file) |
| Serialized per slot | internal promise queue per id (`#serialize`) — concurrent save/clear on one id run in order |
| Safe ids | every operation runs `assertSafeSessionId()` first (see below) |
| Missing file | `load()` → `null` **only** for ENOENT; any other read error throws `ValidationError` `ERR_SESSION_UNREADABLE` (never swallowed) |
| Corrupt JSON | `load()` → `ValidationError` `ERR_SESSION_CORRUPT` (with `cause`) |

```ts
const store = new FileSessionStore({ directory: ".libwa" });
store.directory; // ".libwa"
await store.load("default");     // Session | null
await store.clear("default");    // rm -f semantics, no throw when absent
```

## SqliteSessionStore <ApiBadge kind="class" />

```ts
class SqliteSessionStore implements SessionStore {
  constructor(options?: SqliteSessionStoreOptions);
  get filename(): string;
  get closed(): boolean;
  load(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(id: string): Promise<void>;
  close(): void;
}
```

The production store: **one SQLite database holding every slot**. Credentials survive restarts, several bot processes can share one deployment, and moving the bot means copying one file instead of a directory tree.

```ts
import { Client, SqliteSessionStore } from "libwa";

const store = new SqliteSessionStore({ filename: "/var/lib/bot/bot.db" });
const alice = new Client({ sessionStore: store, sessionId: "alice" });
const bob = new Client({ sessionStore: store, sessionId: "bob" });

await Promise.all([alice.login(), bob.login()]);
// … on shutdown:
await alice.destroy();
store.close();
```

### `SqliteSessionStoreOptions` <ApiBadge kind="interface" />

```ts
interface SqliteSessionStoreOptions {
  filename?: string;      // default "libwa-sessions.db"; ":memory:" and "file:…" URIs work too
  busyTimeoutMs?: number; // default 5000 — how long a writer waits for a lock
}
```

Missing parent directories are created on demand. `busyTimeoutMs` must be a non-negative integer; the wait happens synchronously on the event loop, so treat it as a backstop against a stray lock rather than a queue to sit in.

### Guarantees

| Property | Mechanism |
| --- | --- |
| Crash safety | WAL journal + `synchronous = FULL` — the last credential write survives a power loss; readers keep working while a writer commits |
| Concurrent processes | `busy_timeout = busyTimeoutMs` — a second bot or a migration tool blocks instead of failing with `SQLITE_BUSY` |
| Serialized per slot | one `INSERT … ON CONFLICT(id) DO UPDATE` statement — no read-modify-write race |
| Safe ids | every operation runs `assertSafeSessionId()` first (see below) |
| Missing slot | `load()` → `null` |
| Corrupt row | `load()` → `ValidationError` `ERR_SESSION_CORRUPT` (with `cause`) |
| Forward compatible | schema version stored in `PRAGMA user_version`; a database written by a **newer** libwa is refused rather than migrated downwards |
| Missing parent directory | created (`mkdir -p` semantics) |

Schema, kept deliberately minimal:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  provider   TEXT    NOT NULL,
  data       BLOB    NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
```

### Lifecycle

```ts
const store = new SqliteSessionStore({ filename: "sessions.db" });
store.filename; // "sessions.db" — the configured path, or ":memory:"
store.closed;   // false
store.close();  // flushes and releases the handle; safe to call twice
store.closed;   // true
```

`close()` is **not** called by libwa: `Client.destroy()` never closes a store it did not create, so the store's creator owns the handle (call `close()` in your shutdown hook). Every operation after `close()` throws `ValidationError` `ERR_SESSION_STORE`, so a store used past shutdown fails loudly instead of reopening the file behind your back.

> **Native driver.** The store is backed by `better-sqlite3`, a regular dependency of libwa that is loaded **lazily** — importing `libwa` never touches the native binding, so a broken build cannot break the rest of the library. If your install ran with `npm install --ignore-scripts`, constructing a store throws `ERR_SESSION_STORE` telling you to reinstall without that flag.

## MemorySessionStore <ApiBadge kind="class" />

```ts
class MemorySessionStore implements SessionStore { /* Map-backed */ }
```

In-memory `Map<string, Session>` — for tests and throwaway processes; sessions do not survive restarts. No id validation (nothing touches the filesystem), no serialization concerns.

## `assertSafeSessionId` <ApiBadge kind="internal" />

```ts
function assertSafeSessionId(id: string): void
```

Enforces `/^[A-Za-z0-9_-]{1,64}$/` so an id can never escape the store directory (`../`, separators, etc.). Throws `ValidationError` code `ERR_SESSION_ID`:

```
Invalid session id "…": use 1-64 characters from [A-Za-z0-9_-].
```

Shared by `FileSessionStore` and `SqliteSessionStore`; `MemorySessionStore` skips it (nothing touches the filesystem). Exported from `src/auth/SessionStore.ts` for tests, but **not** part of the package root exports.

## Choosing a store

| Store | Persistence | Concurrency | Id rules | Use |
| --- | --- | --- | --- | --- |
| `FileSessionStore` (default) | disk `.libwa/<id>.json` | atomic + per-slot queue | validated | small single-node bots |
| `SqliteSessionStore` | one WAL-mode database | SQLite transactions + busy-timeout | validated | **production** — durability, many slots, multi-process |
| `MemorySessionStore` | none | trivial | none | tests, demos |
| custom | yours | your contract | yours | Redis/multi-node/managed SQL |

> **Closing a store.** `SqliteSessionStore.close()` (and any `close()` your own store adds to the optional `SessionStore.close`) is called by **you**, on shutdown — libwa never closes a handle it did not create. The default file store needs no teardown.

Custom store sketch:

```ts
import type { Session, SessionStore } from "libwa";

interface WireSession {
  id: string;
  provider: string;
  data: string; // base64
  updatedAt: string;
}

class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<unknown>; del(k: string): Promise<unknown> }) {}

  async load(id: string): Promise<Session | null> {
    const raw = await this.redis.get(`wa:session:${id}`);
    if (raw === null) return null;
    const p = JSON.parse(raw) as WireSession;
    return { id: p.id, provider: p.provider, data: Uint8Array.from(Buffer.from(p.data, "base64")), updatedAt: new Date(p.updatedAt) };
  }

  async save(session: Session): Promise<void> {
    const wire: WireSession = {
      id: session.id,
      provider: session.provider,
      data: Buffer.from(session.data).toString("base64"),
      updatedAt: session.updatedAt.toISOString(),
    };
    await this.redis.set(`wa:session:${session.id}`, JSON.stringify(wire));
  }

  async clear(id: string): Promise<void> {
    await this.redis.del(`wa:session:${id}`);
  }
}
```

## Errors

| Code | Class | When |
| --- | --- | --- |
| `ERR_SESSION_ID` | `ValidationError` | id fails `[A-Za-z0-9_-]{1,64}` |
| `ERR_SESSION_CORRUPT` | `ValidationError` | session file is not valid JSON, or a SQLite row has the wrong column types (cause preserved) |
| `ERR_SESSION_UNREADABLE` | `ValidationError` | session file exists but cannot be read — non-ENOENT (EACCES/EIO/…, cause preserved) |
| `ERR_SESSION_STORE` | `ValidationError` | SQLite store cannot open/close/read/write the database, is used after `close()`, was given bad options, or the native `better-sqlite3` binding is missing |

## See also

- [Sessions guide](/guide/sessions) — multi-account recipes, lifecycle diagram
- [ClientOptions → sessionStore/sessionId](/reference/client-options)
- [Architecture: sessions](/architecture/sessions) — how stores integrate with the backend
