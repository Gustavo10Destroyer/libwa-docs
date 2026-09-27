# Getting started

This guide takes you from an empty directory to a running bot.

## Requirements

- **Node.js ≥ 18.17** (libwa ships as an ESM package; `package.json` sets `"engines": { "node": ">=18.17" }`)
- A WhatsApp account to link (QR scan or pairing code)
- npm (or pnpm/yarn/bun — examples use npm)

libwa itself is plain TypeScript/JavaScript — no framework required. Any runner works: `node`, `tsx`, `ts-node`, bundlers, serverless wrappers, etc.

## Installation

```sh
npm install libwa
```

This pulls in the Baileys provider (`@whiskeysockets/baileys`) as libwa's only runtime dependency.

::: tip Working from this repository?
The package name is `libwa`. Inside the library's own repository, `tsconfig.json` maps the specifier `libwa` to `src/index.ts` via `paths`, so examples and internal code can import the public surface while developing. See [Coding conventions](/development/conventions).
:::

## Your first bot

Create `bot.ts`:

```ts
import { Client } from "libwa";

const client = new Client({
  logger: console, // any object with debug/info/warn/error
  commands: { prefix: ["!", "/"] },
});

client.on("qr", (qr) => {
  console.log("Scan this QR with WhatsApp (Linked devices → Link a device):");
  console.log(qr);
});

client.on("ready", () => {
  console.log(`Logged in as ${client.me?.displayName ?? "unknown"}`);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isMessage() && interaction.isText() && !interaction.isFromMe) {
    await interaction.reply(`You said: ${interaction.text}`);
  }
});

client.on("error", (error) => {
  console.error("libwa error:", error.message);
});

try {
  await client.login(); // resolves on first `ready`
} catch (error) {
  // AuthenticationError → re-pair needed (see below)
  // ConnectionError    → could not connect at all
  console.error("login failed:", error);
  process.exit(1);
}
```

Run it:

```sh
npx tsx bot.ts
```

What happens:

1. `new Client(options)` resolves defaults (silent logger, `!` prefix, filesystem sessions in `.libwa/`, bundled Baileys backend).
2. `client.login()` creates the backend connection and returns a promise.
3. The backend emits a `connecting` update carrying a **QR payload** → your `qr` listener fires.
4. You scan the QR on the phone. WhatsApp links the device.
5. The connection opens → `ready` fires, `client.me` becomes populated, and the `login()` promise resolves.
6. Incoming messages become `MessageInteraction`s and are dispatched through middleware to your `interactionCreate` listeners.

::: warning Attach listeners before login
`login()` rejects if authentication fails — attach `qr`, `pairingCode` and `error` listeners **before** awaiting it, otherwise you cannot see why it failed. Always `catch` the rejection: an uncaught top-level `await client.login()` terminates the process with a stack trace.
:::

::: warning AuthenticationError on a previous session?
`loggedOut` / `badSession` / an interrupted pairing (e.g. a pairing-code attempt that was never completed on the phone) leaves a **stale file in `.libwa/`**. `login()` then rejects with `AuthenticationError` — no retry will fix it. Clear the slot and pair again:

```sh
rm -rf .libwa     # or call await client.logout() in code
```
:::

### Graceful shutdown

```ts
process.on("SIGINT", () => {
  void client.destroy().then(() => process.exit(0));
});
```

[`destroy()`](/reference/client#destroy) disconnects permanently, cancels pending reconnection, detaches backend listeners, and makes further `login()` calls reject.

## Phone-number login (pairing code)

Instead of scanning a QR, request an 8-character pairing code and enter it on the phone under **WhatsApp → Linked devices → Link a device**:

```ts
import { Client } from "libwa";

const client = new Client({
  auth: { pairingPhoneNumber: "5511999999999" }, // international, digits only, no "+"
});

client.on("pairingCode", (code) => {
  console.log(`Pairing code: ${code}`); // e.g. "ABCD-EFGH"
});

await client.login();
```

With `auth.pairingPhoneNumber` set, the bundled backend requests a code automatically during connection. You can also request one on demand while connecting:

```ts
const code = await client.requestPairingCode("5511999999999");
```

`requestPairingCode` validates the number (`/^\d{7,15}$/`), throws `ValidationError` (`ERR_INVALID_PHONE`) for anything else, and throws `ValidationError` (`ERR_UNSUPPORTED`) if the active backend does not implement pairing codes. Details: [Client reference](/reference/client#requestpairingcode).

## A real command

```ts
client.commands.register({
  name: "ping",
  aliases: ["p"],
  description: "Health check",
  execute: (interaction) => {
    void interaction.reply("pong");
  },
});
```

Now `!ping` (and `!p`) in any chat replies `pong`. Commands are explained fully in [Commands](/guide/commands) — including `groupOnly` / `dmOnly` guards, argument parsing, and validation rules.

## Where things are stored

On first login the default [`FileSessionStore`](/reference/sessions#filesessionstore) writes:

```text
.libwa/
└── default.json     ← one JSON file per session slot
```

Commit `.libwa/` to `.gitignore` (the repository already does). Deleting the folder forces a fresh pairing. Never share it: it *is* the logged-in session.

## Project layout suggestion

```text
my-bot/
├── src/
│   └── index.ts        # entry point
├── package.json        # dependency: libwa
├── tsconfig.json
└── .libwa/             # session files (gitignored)
```

## Next steps

- Configure prefixes, reconnection and logging → [Configuration](/guide/configuration)
- Learn the interaction model → [Interactions](/guide/interactions)
- Structure commands → [Commands](/guide/commands)
- Handle failures → [Error handling](/guide/error-handling)
- Run the bundled examples → [Examples](/guide/examples)

## Development environment (for contributors)

If you are hacking on libwa itself:

```sh
git clone <repository>
cd libwa
npm install
npm run verify     # typecheck → test → lint → build → check:exports
npm test           # watch mode is `npm run test:watch`
```

See [Workflow & scripts](/development/workflow) for every script and [Testing](/development/testing) for the suite layout.
