# Primeiros passos {#getting-started}

Este guia leva você de um diretório vazio a um bot em execução.

## Requisitos {#requirements}

- **Node.js ≥ 20.0.0** (o libwa é distribuído como um pacote ESM; `package.json` define `"engines": { "node": ">=20.0.0" }`)
- Uma conta do WhatsApp para vincular (escaneamento de QR ou código de pareamento)
- npm (ou pnpm/yarn/bun — os exemplos usam npm)

O próprio libwa é TypeScript/JavaScript puro — nenhum framework é necessário. Qualquer runner funciona: `node`, `tsx`, `ts-node`, bundlers, wrappers serverless etc.

## Instalação {#installation}

```sh
npm install libwa
```

Isso traz o provedor Baileys (`@whiskeysockets/baileys`) mais o `better-sqlite3` — o segundo só é carregado se você construir um `SqliteSessionStore`, então um bot comum nunca toca no binding nativo.

::: tip Trabalhando neste repositório?
O nome do pacote é `libwa`. Dentro do próprio repositório da biblioteca, `tsconfig.json` mapeia o especificador `libwa` para `src/index.ts` via `paths`, de modo que exemplos e código interno possam importar a superfície pública durante o desenvolvimento. Veja [Convenções de código](/pt-BR/development/conventions).
:::

## Seu primeiro bot {#your-first-bot}

Crie `bot.ts`:

```ts
import { Client } from "libwa";

const client = new Client({
  logger: console, // qualquer objeto com debug/info/warn/error
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
  await client.login(); // resolve no primeiro `ready`
} catch (error) {
  // AuthenticationError → é preciso reaparear (veja abaixo)
  // ConnectionError    → não conseguiu conectar de forma alguma
  console.error("login failed:", error);
  process.exit(1);
}
```

Execute:

```sh
npx tsx bot.ts
```

O que acontece:

1. `new Client(options)` resolve os padrões (logger silencioso, prefixo `!`, sessões em sistema de arquivos em `.libwa/`, backend Baileys incluso).
2. `client.login()` cria a conexão com o backend e retorna uma promise.
3. O backend emite uma atualização `connecting` carregando um **payload de QR** → seu listener `qr` dispara.
4. Você escaneia o QR no telefone. O WhatsApp vincula o dispositivo.
5. A conexão abre → `ready` dispara, `client.me` é preenchido e a promise de `login()` resolve.
6. Mensagens recebidas se tornam `MessageInteraction`s e são despachadas pelos middlewares até seus listeners `interactionCreate`.

::: warning Anexe listeners antes do login
`login()` rejeita se a autenticação falhar — anexe os listeners `qr`, `pairingCode` e `error` **antes** de aguardá-lo, caso contrário você não poderá ver por que falhou. Sempre faça `catch` da rejeição: um `await client.login()` solto no topo encerra o processo com um stack trace.
:::

::: warning AuthenticationError em uma sessão anterior?
`loggedOut` / `badSession` / um pareamento interrompido (ex.: uma tentativa de código de pareamento que nunca foi concluída no telefone) deixa um **arquivo obsoleto em `.libwa/`**. `login()` então rejeita com `AuthenticationError` — nenhuma tentativa vai resolver. Limpe o slot e pare novamente:

```sh
rm -rf .libwa     # ou chame await client.logout() no código
```
:::

### Encerramento gracioso {#graceful-shutdown}

```ts
process.on("SIGINT", () => {
  void client.destroy().then(() => process.exit(0));
});
```

[`destroy()`](/pt-BR/reference/client#destroy) desconecta permanentemente, cancela reconexões pendentes, desvincula os listeners do backend e faz com que chamadas posteriores de `login()` rejeitem.

## Login por número de telefone (código de pareamento) {#phone-number-login-pairing-code}

Em vez de escanear um QR, solicite um código de pareamento e digite-o no telefone em **WhatsApp → Aparelhos vinculados → Vincular aparelho**:

```ts
import { Client } from "libwa";

const client = new Client({
  auth: { pairingPhoneNumber: "5511999999999" }, // internacional, apenas dígitos, sem "+"
});

client.on("pairingCode", (code) => {
  console.log(`Pairing code: ${code}`); // mostre ao usuário e depois confirme no telefone
});

await client.login();
```

Com `auth.pairingPhoneNumber` definido, o backend incluso solicita um código automaticamente durante a conexão. Você também pode solicitar um sob demanda enquanto conecta:

```ts
const code = await client.requestPairingCode("5511999999999");
```

`requestPairingCode` valida o número (`/^\d{7,15}$/`), lança `ValidationError` (`ERR_INVALID_PHONE`) para qualquer outro formato e lança `UnsupportedOperationError` (`ERR_UNSUPPORTED`) se o backend ativo não implementar códigos de pareamento. Detalhes: [referência do Client](/pt-BR/reference/client#requestpairingcode).

## Um comando de verdade {#a-real-command}

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

Agora `!ping` (e `!p`) em qualquer chat responde `pong`. Comandos são explicados por completo em [Comandos](/pt-BR/guide/commands) — incluindo guards `groupOnly` / `dmOnly`, parsing de argumentos e regras de validação.

## Onde as coisas são armazenadas {#where-things-are-stored}

No primeiro login, o [`FileSessionStore`](/pt-BR/reference/sessions#filesessionstore) padrão escreve:

```text
.libwa/
└── default.json     ← um arquivo JSON por slot de sessão
```

Adicione `.libwa/` ao `.gitignore` (o repositório já faz isso). Apagar a pasta força um novo pareamento. Nunca a compartilhe: ela *é* a sessão logada.

Em produção, troque a store de sistema de arquivos pela [`SqliteSessionStore`](/pt-BR/reference/sessions#sqlitesessionstore) — um único arquivo de banco resistente a crashes guarda todos os slots:

```ts
new Client({ sessionStore: new SqliteSessionStore({ filename: "var/bot.db" }) });
```

Seja qual for a store escolhida, desligá-la é com você: chame `store.close()` você mesmo no encerramento se ela mantém um handle.

## Sugestão de estrutura do projeto {#project-layout-suggestion}

```text
my-bot/
├── src/
│   └── index.ts        # ponto de entrada
├── package.json        # dependência: libwa
├── tsconfig.json
└── .libwa/             # arquivos de sessão (ignorados pelo git)
```

## Próximos passos {#next-steps}

- Configure prefixos, reconexão e logging → [Configuração](/pt-BR/guide/configuration)
- Aprenda o modelo de interação → [Interações](/pt-BR/guide/interactions)
- Estruture comandos → [Comandos](/pt-BR/guide/commands)
- Trate falhas → [Tratamento de erros](/pt-BR/guide/error-handling)
- Execute os exemplos inclusos → [Exemplos](/pt-BR/guide/examples)

## Ambiente de desenvolvimento (para contribuidores) {#development-environment-for-contributors}

Se você está mexendo no próprio libwa:

```sh
git clone <repository>
cd libwa
npm install
npm run verify     # typecheck → test → lint → build → check:exports
npm test           # o modo watch é `npm run test:watch`
```

Veja [Fluxo de trabalho e scripts](/pt-BR/development/workflow) para cada script e [Testes](/pt-BR/development/testing) para a estrutura da suíte.
