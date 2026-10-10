# Examples

The repository ships three runnable examples under `examples/`. They are type-checked as part of `npm run typecheck` and import the public surface exactly like consumer code (`import … from "libwa.js"`).

::: tip How to run them
Examples are TypeScript files. From the library repository:

```sh
npx tsx examples/basic-bot.ts
WA_PHONE_NUMBER=5511999999999 npx tsx examples/pairing-login.ts
npx tsx examples/middleware-filters.ts
```

In your own project, copy the file and run it with your preferred TS runner (or compile first).
:::

## `basic-bot.ts` — full tour

Echo replies, a command set (including `groupOnly`), QR + reconnect + lifecycle handling.
File: `examples/basic-bot.ts` in the library repository.

Setup and echo loop:

```ts
const client = new Client({
  logger,                               // hand-rolled { debug, info, warn, error }
  commands: { prefix: ["!", "/"] },
  reconnect: { attempts: 5, initialDelayMs: 1000 },
});

client.on("ready", () => {
  console.log(`Logged in as ${client.me?.displayName ?? "unknown"} (${client.sessionId})`);
});

client.on("qr", (qr) => {
  console.log("Scan this QR with WhatsApp:\n", qr);
});

client.on("interactionCreate", (interaction: Interaction) => {
  if (interaction.isCommand()) return;           // handled by definitions
  if (!interaction.isMessage() || !interaction.isText()) return;
  if (interaction.isFromMe) return;
  void interaction.reply(`You said: ${interaction.text}`);
});

client.on("error", (error) => console.error("libwa.js error:", error.message));
client.on("disconnect", (reason) => console.warn(`Disconnected (${reason}).`));
```

Commands (aliases, raw args, `groupOnly`):

```ts
client.commands.registerAll([
  { name: "ping", aliases: ["p"], description: "Health check",
    execute: (interaction) => { void interaction.reply("pong"); } },
  { name: "echo", description: "Repeats the given text",
    execute: (interaction) => {
      const text = interaction.rawArgs.length > 0 ? interaction.rawArgs : "…nothing to echo.";
      void interaction.reply(text);
    } },
  { name: "members", groupOnly: true,
    async execute(interaction) {
      if (!interaction.isFromGroup()) return;
      const group = await interaction.chat.client.groups.fetch(interaction.chat.id);
      await interaction.reply(`This group has ${group.memberCount ?? "?"} members.`);
    } },
]);

async function main(): Promise<void> {
  await client.login();
}

process.on("SIGINT", () => {
  void client.destroy().then(() => process.exit(0));
});

void main().catch((error: unknown) => {
  console.error("Failed to start:", error);
  process.exit(1);
});
```

Key points:

- A hand-rolled [`Logger`](/reference/logger) object — any `{ debug, info, warn, error }` works.
- `qr` listener registered **before** `login()` (awaited inside `main()`).
- Message echo guarded by `isCommand()` (skip), `isMessage()`, `isText()`, and `isFromMe`.
- `SIGINT` handler awaits [`client.destroy()`](/reference/client#destroy) for a clean shutdown.
- `error` and `disconnect` listeners so failures are visible.

## `pairing-login.ts` — phone-number login

Pairing-code flow, manual `requestPairingCode` usage, reconnection visibility, and a `logout` command.
File: `examples/pairing-login.ts`.

```ts
const client = new Client({
  auth: { pairingPhoneNumber: process.env.WA_PHONE_NUMBER ?? "5511999999999" },
  commands: { prefix: "!" },
});

client.on("pairingCode", (code) => console.log(`Pairing code: ${code}`));
client.on("qr", (qr) => console.log("QR payload:", qr));
client.on("ready", () => console.log("Connected as", client.me?.displayName));
client.on("error", (error) => console.error("error:", error.message));
client.on("reconnecting", (attempt, delayMs) => {
  console.log(`Reconnecting (attempt ${attempt}) in ${delayMs}ms…`);
});

client.commands.register({
  name: "logout",
  description: "Logs the bot out and clears the session",
  async execute(interaction) {
    await interaction.reply("Logging out…");
    await client.logout();
  },
});

async function main(): Promise<void> {
  try {
    await client.login();
  } catch (error) {
    console.error("Login failed:", error);
    process.exit(1);
  }

  // Alternatively request codes manually while connecting:
  // const code = await client.requestPairingCode("5511999999999");
}

void main();
```

Key points:

- `auth.pairingPhoneNumber` — the only environment variable any example reads (`WA_PHONE_NUMBER`, placeholder default; see [Configuration](/guide/configuration#environment-variables)).
- `pairingCode` listener prints the code; `qr` listener still attached for the non-pairing path.
- `reconnecting` listener surfaces attempt + delay.
- `logout` command: replies, then `client.logout()` — clears the slot so the next `login()` re-pairs.
- `login()` wrapped in try/catch with `process.exit(1)` on failure.

## `middleware-filters.ts` — middleware, filters, reactions

Rate limiting, chat filtering, media reactions, group welcomes, and layered error handling.
File: `examples/middleware-filters.ts`.

Middlewares:

```ts
const lastSeen = new Map<string, number>();
const RATE_LIMIT_MS = 2_000;

const rateLimit: Middleware = async (interaction, next) => {
  const key = `${interaction.chat.id}:${interaction.author?.id ?? "unknown"}`;
  const now = Date.now();
  const previous = lastSeen.get(key) ?? 0;
  if (now - previous < RATE_LIMIT_MS) return;  // drop
  lastSeen.set(key, now);
  await next();
};

const IGNORED_CHATS = new Set(["status@broadcast"]);
const ignoreChats: Middleware = (interaction, next) => {
  if (IGNORED_CHATS.has(interaction.chat.id)) return;
  return next();
};

client.use(rateLimit).use(ignoreChats);
```

One listener, many interaction kinds:

```ts
client.on("interactionCreate", async (interaction) => {
  if (interaction.isMessage() && interaction.isImage()) {
    await interaction.react("📷");
    await interaction.reply("Nice photo!");
    return;
  }
  if (interaction.isReaction()) {
    console.log(`${interaction.author?.displayName ?? "someone"} reacted`);
    return;
  }
  if (interaction.isGroupParticipantUpdate()) {
    if (interaction.action === "add") {
      await interaction.reply(
        `Welcome ${interaction.users.map((u) => u.displayName).join(", ")}!`,
      );
    }
    return;
  }
  if (interaction.isCommand() && interaction.name === "whoami") {
    await interaction.reply(
      `You are ${interaction.author.displayName} (${interaction.author.phone ?? "no phone"})`,
    );
  }
});
```

Layered error handling + logout detection:

```ts
client.on("error", (error) => {
  if (error instanceof PermissionError) return console.warn("Missing permissions:", error.message);
  if (error instanceof NotFoundError) return console.warn("Not found:", error.message);
  if (error instanceof MessageError) return console.warn("Message failed:", error.message);
  console.error("unexpected error:", error);
});

client.on("disconnect", (reason) => {
  if (reason === DisconnectReason.LoggedOut) {
    console.error("Session revoked — delete .libwa.js/ and log in again.");
  }
});
```

Key points:

- **Two middlewares registered with `client.use(a).use(b)`** — a per-chat rate limiter (2s window via a `Map`) and a chat deny-list (`status@broadcast`).
- Skipping `next()` silently drops the interaction: no commands, no listeners.
- Image guard narrows content so `react()`/`reply()` work on `MessageInteraction`.

## Recipe: minimal production skeleton

Not in the repository, but assembled from documented APIs:

```ts
import { Client, type Interaction } from "libwa.js";

const client = new Client({
  sessionId: process.env.BOT_SESSION ?? "default",
  commands: { prefix: ["!", "/"], ignoreSelf: true },
  reconnect: { attempts: 8, initialDelayMs: 1_000, maxDelayMs: 60_000 },
  logger: console, // swap for pino/winston adapter
});

client.on("error", (error) => console.error("[libwa.js]", error.message));
client.on("disconnect", (reason) => {
  console.error("disconnected:", reason);
  if (reason === "loggedOut") process.exit(1); // orchestrator restarts after session reset
});

client.use(async (interaction, next) => {
  if (interaction.chat.id === "status@broadcast") return;
  await next();
});

client.commands.registerAll([
  { name: "ping", execute: (i) => void i.reply("pong") },
  {
    name: "shutdown",
    dmOnly: true,
    async execute(i) {
      await i.reply("bye");
      await client.destroy();
      process.exit(0);
    },
  },
]);

client.on("interactionCreate", (i: Interaction) => {
  if (i.isMessage() && i.isImage() && !i.isFromMe) void i.react("📷");
});

client.on("ready", () => console.log("online as", client.me?.displayName));

await client.login();
```

## Recipe: interaction-kind router

```ts
import type { Client, Interaction } from "libwa.js";

type Handler = (i: Interaction) => void | Promise<void>;
const routes = new Map<string, Handler>();

export function route(client: Client): void {
  client.on("interactionCreate", async (i) => {
    const handler = routes.get(i.type); // InteractionType discriminant
    if (handler) await handler(i);
  });
}
```

`i.type` is the [`InteractionType`](/reference/interactions#interactiontype) enum (`"message" | "command" | "reaction" | "messageUpdate" | "groupParticipant" | "groupUpdate" | "button" | "list"`).

## Recipe: error-safe command harness

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isCommand()) return;
  try {
    await handle(i); // your logic
  } catch (error) {
    await i.reply("Something went wrong.");
    // already reported to client 'error' event by the dispatcher —
    // log extra context here if you need it:
    console.error(`[cmd ${i.name}]`, error);
  }
});
```

## Related

- [Getting started](/guide/getting-started) — first bot, step by step
- [Configuration](/guide/configuration) — every option used in the recipes
- [Reference](/reference/) — APIs used here
