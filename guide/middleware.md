# Middleware

Middleware are ordered functions that every interaction passes through **before** commands execute and `interactionCreate` listeners run. They are libwa's extension point for rate limiting, filtering, logging, permissions, and metrics.

## The contract

```ts
type Middleware = (
  interaction: Interaction,
  next: () => Promise<void>,
) => void | Promise<void>;
```

Register with `client.use()` (chainable):

```ts
import { type Middleware, Client } from "libwa";

const logger: Middleware = async (interaction, next) => {
  const started = Date.now();
  await next(); // continue the chain
  console.log(`${interaction.type} handled in ${Date.now() - started}ms`);
};

const ignoreBots: Middleware = (interaction, next) => {
  if (interaction.isFromMe) return; // stop: no command, no listeners
  return next();
};

const client = new Client();
client.use(ignoreBots).use(logger);
```

## Semantics

| Behavior | Rule |
| --- | --- |
| Order | Registration order, outermost first. `use(a).use(b)` → `a` wraps `b` wraps dispatch. |
| Continue | Call `next()` exactly once. |
| Stop | Don't call `next()` — commands and listeners never see the interaction. |
| Async | Awaiting `next()` is how you run code after the chain (Koa-style). |
| Double `next()` | Rejected: `next() called multiple times in the same middleware.` — surfaces through the `error` event as context `middleware`. |
| Thrown error | Aborts the chain; reported through `error` with context `middleware`. Later middlewares, the command and listeners do not run. |
| Return value | Ignored; the type allows `void` for simple filters. |

### Dispatch pipeline position

```mermaid
flowchart LR
    E[Backend event] --> F[InteractionFactory]
    F --> R[runMiddlewareChain]
    R -->|all next() calls| D[command.execute if matched & allowed]
    D --> L[interactionCreate listeners]
    R -->|any middleware stops| X[interaction dropped]
```

Middlewares see **every** interaction type — messages, commands, reactions, group events — not just messages.

## Patterns

### Rate limiting (per chat + author)

```ts
import { type Middleware, Client } from "libwa";

const lastSeen = new Map<string, number>();
const WINDOW_MS = 2_000;

const rateLimit: Middleware = (interaction, next) => {
  const key = `${interaction.chat.id}:${interaction.author?.id ?? "?"}`;
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < WINDOW_MS) return; // drop
  lastSeen.set(key, now);
  return next();
};

new Client().use(rateLimit);
```

### Chat allow/deny lists

```ts
const IGNORED = new Set(["status@broadcast"]);

const ignoreChats: Middleware = (interaction, next) =>
  IGNORED.has(interaction.chat.id) ? undefined : next();
```

### Group-only bot

```ts
const groupsOnly: Middleware = (interaction, next) =>
  interaction.isFromGroup() ? next() : undefined;
```

### Command guard with reply

```ts
const adminOnly: Middleware = async (interaction, next) => {
  if (
    interaction.isCommand() &&
    ["ban", "kick"].includes(interaction.name) &&
    !isAdmin(interaction.author)
  ) {
    await interaction.reply("Admins only.");
    return; // command never executes
  }
  await next();
};
```

### Timings & error context

```ts
const timed: Middleware = async (interaction, next) => {
  try {
    await next();
  } catch (error) {
    console.error("chain failed for", interaction.id, error);
    throw error; // rethrow → still reported as context "middleware"
  }
};
```

## Pitfalls

- **Middleware runs before `groupOnly`/`dmOnly` enforcement.** A skipped `next()` hides *everything*, including `interactionCreate` — use it for hard filters; use command guards for scope.
- **Don't hold locks across `await next()`.** Other events may dispatch concurrently while your chain is parked.
- **Registration is static-ish.** `use()` appends; there is no `removeUse`. Keep an array and compose:

  ```ts
  const chain: Middleware[] = [rateLimit, logging];
  if (isDev) chain.push(debug);
  for (const mw of chain) client.use(mw);
  ```

- **Errors in middleware skip the command but not the `error` event** — always listen for `error`.

## Testing a middleware

Middleware is a pure function of `(interaction, next)` — unit-test it directly:

```ts
import { expect, it, vi } from "vitest";
import { runMiddlewareChain } from "../src/middleware/compose.js"; // internal path (repo tests)

it("stops when next is not called", async () => {
  const final = vi.fn();
  await runMiddlewareChain([() => undefined], fakeInteraction, final);
  expect(final).not.toHaveBeenCalled();
});
```

Application-level tests can instead use a `MockBackend` and emit events through your own backend double — see [Testing](/development/testing).

## Related

- [Middleware reference](/reference/middleware) — `Middleware` type, `runMiddlewareChain` internals
- [Commands guide](/guide/commands) — what runs after the chain
- [Client.use](/reference/client#use) — registration method
