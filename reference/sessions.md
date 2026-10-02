# Sessions

<ApiBadge kind="interface" /> Authentication persistence. The core treats session bytes as opaque — only the backend interprets them. Stores are pluggable: file, memory, or your own (Redis, SQL, cloud).

```ts
import { Client, FileSessionStore, MemorySessionStore, type SessionStore } from "libwa";

new Client({ sessionStore: new FileSessionStore({ directory: "/var/lib/bot" }) });
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
}
```

| Method | Contract |
| --- | --- |
| `load` | Returns the session or `null` when none exists (missing ≠ error). |
| `save` | Persists by `session.id`; must be safe under concurrent calls for the same id. |
| `clear` | Removes the slot; clearing a missing slot is **not** an error. |

Backends call these through `ClientOptions.sessionStore`; `client.logout()` clears the slot.

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

### `assertSafeSessionId` <ApiBadge kind="internal" />

```ts
function assertSafeSessionId(id: string): void
```

Enforces `/^[A-Za-z0-9_-]{1,64}$/` so an id can never escape the store directory (`../`, separators, etc.). Throws `ValidationError` code `ERR_SESSION_ID`:

```
Invalid session id "…": use 1-64 characters from [A-Za-z0-9_-].
```

Exported from `src/auth/FileSessionStore.ts` for tests, but **not** part of the package root exports.

## MemorySessionStore <ApiBadge kind="class" />

```ts
class MemorySessionStore implements SessionStore { /* Map-backed */ }
```

In-memory `Map<string, Session>` — for tests and throwaway processes; sessions do not survive restarts. No id validation (nothing touches the filesystem), no serialization concerns.

## Choosing a store

| Store | Persistence | Concurrency | Id rules | Use |
| --- | --- | --- | --- | --- |
| `FileSessionStore` (default) | disk `.libwa/<id>.json` | atomic + per-slot queue | validated | production single-node |
| `MemorySessionStore` | none | trivial | none | tests, demos |
| custom | yours | your contract | yours | Redis/SQL/multi-node |

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
| `ERR_SESSION_CORRUPT` | `ValidationError` | session file is not valid JSON (cause preserved) |
| `ERR_SESSION_UNREADABLE` | `ValidationError` | session file exists but cannot be read — non-ENOENT (EACCES/EIO/…, cause preserved) |

## See also

- [Sessions guide](/guide/sessions) — multi-account recipes, lifecycle diagram
- [ClientOptions → sessionStore/sessionId](/reference/client-options)
- [Architecture: sessions](/architecture/sessions) — how stores integrate with the backend
