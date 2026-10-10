# Exemplos {#examples}

O repositório traz três exemplos executáveis em `examples/`. Eles passam por verificação de tipos como parte do `npm run typecheck` e importam a superfície pública exatamente como o código de um consumidor (`import … from "libwa.js"`).

::: tip Como executá-los
Os exemplos são arquivos TypeScript. A partir do repositório da biblioteca:

```sh
npx tsx examples/basic-bot.ts
WA_PHONE_NUMBER=5511999999999 npx tsx examples/pairing-login.ts
npx tsx examples/middleware-filters.ts
```

No seu próprio projeto, copie o arquivo e execute-o com o seu runner TS preferido (ou compile primeiro).
:::

## `basic-bot.ts` — tour completo {#basic-bot-ts-—-full-tour}

Respostas eco, um conjunto de comandos (incluindo `groupOnly`), QR + reconexão + tratamento de ciclo de vida.
Arquivo: `examples/basic-bot.ts` no repositório da biblioteca.

Configuração e loop de eco:

```ts
const client = new Client({
  logger,                               // feito à mão { debug, info, warn, error }
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
  if (interaction.isCommand()) return;           // tratado pelas definições
  if (!interaction.isMessage() || !interaction.isText()) return;
  if (interaction.isFromMe) return;
  void interaction.reply(`You said: ${interaction.text}`);
});

client.on("error", (error) => console.error("libwa.js error:", error.message));
client.on("disconnect", (reason) => console.warn(`Disconnected (${reason}).`));
```

Comandos (aliases, args crus, `groupOnly`):

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

Pontos principais:

- Um objeto [`Logger`](/pt-BR/reference/logger) feito à mão — qualquer `{ debug, info, warn, error }` serve.
- Listener `qr` registrado **antes** de `login()` (aguardado dentro de `main()`).
- Eco de mensagem protegido por `isCommand()` (pula), `isMessage()`, `isText()` e `isFromMe`.
- O handler de `SIGINT` aguarda [`client.destroy()`](/pt-BR/reference/client#destroy) para um encerramento limpo.
- Listeners `error` e `disconnect` para que as falhas fiquem visíveis.

## `pairing-login.ts` — login por número de telefone {#pairing-login-ts-—-phone-number-login}

Fluxo de código de pareamento, uso manual de `requestPairingCode`, visibilidade de reconexão e um comando `logout`.
Arquivo: `examples/pairing-login.ts`.

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

  // Alternativamente, solicite códigos manualmente enquanto conecta:
  // const code = await client.requestPairingCode("5511999999999");
}

void main();
```

Pontos principais:

- `auth.pairingPhoneNumber` — a única variável de ambiente que qualquer exemplo lê (`WA_PHONE_NUMBER`, placeholder padrão; veja [Configuração](/pt-BR/guide/configuration#environment-variables)).
- O listener `pairingCode` imprime o código; o listener `qr` continua anexado para o caminho sem pareamento.
- O listener `reconnecting` mostra a tentativa + o atraso.
- Comando `logout`: responde, depois `client.logout()` — limpa o slot para que o próximo `login()` refaça o pareamento.
- `login()` embrulhado em try/catch com `process.exit(1)` em caso de falha.

## `middleware-filters.ts` — middleware, filtros, reações {#middleware-filters-ts-—-middleware-filters-reactions}

Rate limiting, filtragem de chat, reações a mídia, boas-vindas de grupo e tratamento de erros em camadas.
Arquivo: `examples/middleware-filters.ts`.

Middlewares:

```ts
const lastSeen = new Map<string, number>();
const RATE_LIMIT_MS = 2_000;

const rateLimit: Middleware = async (interaction, next) => {
  const key = `${interaction.chat.id}:${interaction.author?.id ?? "unknown"}`;
  const now = Date.now();
  const previous = lastSeen.get(key) ?? 0;
  if (now - previous < RATE_LIMIT_MS) return;  // descarta
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

Um listener, muitos tipos de interação:

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

Tratamento de erros em camadas + detecção de logout:

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

Pontos principais:

- **Dois middlewares registrados com `client.use(a).use(b)`** — um limitador de taxa por chat (janela de 2s via um `Map`) e uma deny-list de chats (`status@broadcast`).
- Pular `next()` descarta a interação silenciosamente: sem comandos, sem listeners.
- O guard de imagem estreita o conteúdo para que `react()`/`reply()` funcionem em `MessageInteraction`.

## Receita: esqueleto mínimo de produção {#recipe-minimal-production-skeleton}

Não está no repositório, mas montado a partir das APIs documentadas:

```ts
import { Client, type Interaction } from "libwa.js";

const client = new Client({
  sessionId: process.env.BOT_SESSION ?? "default",
  commands: { prefix: ["!", "/"], ignoreSelf: true },
  reconnect: { attempts: 8, initialDelayMs: 1_000, maxDelayMs: 60_000 },
  logger: console, // troque por um adaptador pino/winston
});

client.on("error", (error) => console.error("[libwa.js]", error.message));
client.on("disconnect", (reason) => {
  console.error("disconnected:", reason);
  if (reason === "loggedOut") process.exit(1); // o orquestrador reinicia após o reset da sessão
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

## Receita: router por tipo de interação {#recipe-interaction-kind-router}

```ts
import type { Client, Interaction } from "libwa.js";

type Handler = (i: Interaction) => void | Promise<void>;
const routes = new Map<string, Handler>();

export function route(client: Client): void {
  client.on("interactionCreate", async (i) => {
    const handler = routes.get(i.type); // discriminante InteractionType
    if (handler) await handler(i);
  });
}
```

`i.type` é o enum [`InteractionType`](/pt-BR/reference/interactions#interactiontype) (`"message" | "command" | "reaction" | "messageUpdate" | "groupParticipant" | "groupUpdate" | "button" | "list"`).

## Receita: harness de comando à prova de erros {#recipe-error-safe-command-harness}

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isCommand()) return;
  try {
    await handle(i); // sua lógica
  } catch (error) {
    await i.reply("Something went wrong.");
    // já reportado ao evento 'error' do cliente pelo dispatcher —
    // registre contexto extra aqui se precisar:
    console.error(`[cmd ${i.name}]`, error);
  }
});
```

## Relacionados {#related}

- [Primeiros passos](/pt-BR/guide/getting-started) — primeiro bot, passo a passo
- [Configuração](/pt-BR/guide/configuration) — cada opção usada nas receitas
- [Referência](/pt-BR/reference/) — APIs usadas aqui
