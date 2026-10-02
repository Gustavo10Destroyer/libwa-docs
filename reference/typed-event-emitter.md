# TypedEventEmitter <ApiBadge kind="internal" />

The strongly-typed event emitter behind both [`client`](/reference/client#on-once-off) and the [backend event bus](/reference/backend#whatsappbackend). **Not exported from the package root** — documented for contributors and for understanding runtime semantics.

```ts
// repo-internal import only
import { TypedEventEmitter } from "../events/TypedEventEmitter.js";
```

## Types

```ts
type EventMap = Record<string, readonly unknown[]>;
type EventMapConstraint<Map> = Record<keyof Map, readonly unknown[]>;
type ListenerOf<Map, Key> = (...args: Map[Key]) => void | Promise<void>;

interface TypedEventEmitterOptions {
  onListenerError?: (error: unknown, event: string) => void;
}
```

`Map` declares each event as a **tuple of arguments**. The `EventMapConstraint` alias exists because interfaces (not object literal types) are used as maps (`ClientEvents`, `BackendEventMap`).

## Class

```ts
class TypedEventEmitter<Map extends EventMapConstraint<Map>> {
  constructor(options?: TypedEventEmitterOptions);
  on<Key>(event: Key, listener: ListenerOf<Map, Key>): Unsubscribe;
  once<Key>(event: Key, listener: ListenerOf<Map, Key>): Unsubscribe;
  off<Key>(event: Key, listener?: ListenerOf<Map, Key>): void;
  emit<Key>(event: Key, ...args: Map[Key]): void;
  emitAsync<Key>(event: Key, ...args: Map[Key]): Promise<void>;
  listenersOf<Key>(event: Key): readonly ListenerOf<Map, Key>[];
  hasListeners<Key>(event: Key): boolean;
  removeAllListeners(): void;
}
```

### `on` / `once`

Register permanent / one-shot listeners. Return an `Unsubscribe` closure (idempotent). Storage: **one** `Map<key, ListenerEntry[]>` per emitter, each entry `{ listener, once }` — so `on` and `once` listeners dispatch strictly in registration order: a `once` registered between two permanent listeners runs **between** them, not after all of them.

### `off`

```ts
off(event): void            // removes ALL listeners for the event
off(event, listener): void  // removes one
```

### `emit` vs `emitAsync`

| Method | Behavior |
| --- | --- |
| `emitAsync` | snapshot the ordered array (so `off` during emit is safe), splice **only the `once` entries** out of it (permanent entries stay in place), then `await` each snapshotted listener **sequentially**; per-listener try/catch → `onListenerError(error, event)` |
| `emit` | fire-and-forget: `void emitAsync(...).catch(err => onListenerError(err, event))` |

**Never rejects to the caller of `emit`**; listener failures are always routed to `onListenerError`. With no listeners, `emitAsync` returns immediately.

```ts
const emitter = new TypedEventEmitter<{ ping: [n: number] }>({
  onListenerError: (e, ev) => console.error(ev, e),
});
const stop = emitter.on("ping", (n) => console.log(n));
emitter.emit("ping", 1);   // 1
stop();
emitter.emit("ping", 2);   // silent
```

### `listenersOf` / `hasListeners` / `removeAllListeners`

- `listenersOf` — snapshot array (permanent + pending once).
- `hasListeners` — cheap guard; the client uses it to decide whether to emit `error` events.
- `removeAllListeners` — full teardown (available but unused by the client: `destroy()` detaches only the backend listeners, leaving application listeners registered).

## Wiring inside `Client`

The client constructs one emitter with an error hook:

```ts
new TypedEventEmitter<ClientEvents>({
  onListenerError: (error, event) => {
    if (event === "error") {
      logger.error("[error listener]", toError(error).message);
      // for the "error" event itself: log only, never re-emit (recursion guard)
      return;
    }
    // logs `[listener for "<event>"]` at error level, then emits "error"
    handleError(error, `listener for "${event}"`);
  },
});
```

Guarantees this buys:

1. a throwing listener can never crash the emitting code path;
2. an `error`-listener failure cannot loop the `error` event;
3. dispatch stays deterministic (sequential, snapshot-isolated).

## Design notes

- Types are erased at runtime — zero reflection cost.
- One ordered array per event keeps `on` and `once` listeners interleaved in registration order; removal is a linear `splice`, which is irrelevant at realistic listener counts (and it is what lets `once` entries be consumed individually without disturbing their permanent neighbours).
- `(...args: never[])` stored listeners avoid variance friction; casts happen only at the call boundary.
- Same class powers `BackendEventMap` in the Baileys backend (its `on` is part of `WhatsAppBackend`).

## See also

- [Typed events guide](/guide/events#the-event-map) — usage patterns
- [Client events](/reference/client-events) — the map the client uses
- [Architecture: event pipeline](/architecture/event-pipeline) — emitter placement
