# Middleware

<ApiBadge kind="type" /> The dispatch pipeline between factory-built interactions and command/listener execution.

```ts
import type { Middleware } from "libwa.js";
```

## `Middleware`

```ts
type Middleware = (
  interaction: Interaction,
  next: () => Promise<void>,
) => void | Promise<void>;
```

| Parameter | Description |
| --- | --- |
| `interaction` | The candidate interaction (may be narrowed/annotated by earlier middleware by **mutating** it before `next()`). |
| `next` | Continues the chain. Must be called **at most once** — a second call rejects with `Error("next() called multiple times in the same middleware.")`. Not calling it stops dispatch (commands + listeners never run). |

Rules:

1. **Registration order** — `client.use(a).use(b)` runs `a` then `b`.
2. **Skipping = filtering** — return without `next()` to drop the interaction silently (no error event).
3. **Throwing = abort with report** — errors surface as `error` event with the `middleware` context.
4. Async middlewares are awaited; `await next()` keeps ordering guarantees.

```ts
import { type Middleware, type CommandInteraction } from "libwa.js";

const rateLimit: Middleware = async (i, next) => {
  if (bucket.has(i.author?.id) && !i.isCommand()) return; // swallow
  await next();
};

const adminsOnly: Middleware = async (i, next) => {
  if (i.isCommand() && i.name === "kick" && !isAdmin(i.author)) {
    await i.reply("admins only");
    return; // stop before execute() and listeners
  }
  await next();
};

client.use(rateLimit).use(adminsOnly);
```

Registration: [`client.use(middleware)`](/reference/client#use) (chainable, no unuse).

## `runMiddlewareChain` <ApiBadge kind="internal" />

```ts
function runMiddlewareChain(
  middlewares: readonly Middleware[],
  interaction: Interaction,
  last: () => Promise<void>,
): Promise<void>
```

Recursive drain: dispatches position `0…n`, then `last()` (the client's command-execution + listener stage). Each middleware gets a wrapped `next` guarded against double invocation.

**Semantics:**

| Situation | Result |
| --- | --- |
| every middleware calls `next()` | `last()` runs, promise resolves |
| some middleware skips `next()` | promise resolves, `last()` never runs (silent drop) |
| middleware throws | promise rejects → client reports context `middleware` |
| `next()` called twice | rejects with the double-call `Error` |
| `next()` fired but never awaited/handled (detached) | the chain adopts the promise: its rejection rejects this dispatch too → client reports context `middleware` |

Not exported from the package root — the `Client` owns the only pipeline. Documented for contributors extending dispatch (see [Middleware guide](/guide/middleware#semantics)).

## See also

- [Middleware guide](/guide/middleware) — patterns (permissions, logging, rate limits, i18n)
- [Client → use](/reference/client#use) — registration
- [Architecture: event pipeline](/architecture/event-pipeline) — where middleware sits
