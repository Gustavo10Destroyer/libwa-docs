# Configuração {#configuration}

Toda a configuração flui pelo objeto [`ClientOptions`](/pt-BR/reference/client-options) passado para `new Client(options?)`. Todas as opções são opcionais; omitir tudo resulta em um bot padrão funcional (backend Baileys, prefixo `!`, sessões em `.libwa.js/`, logger silencioso, reconexão exponencial).

```ts
import { Client } from "libwa.js";

const client = new Client({
  sessionId: "work",
  commands: { prefix: ["!", "/"], ignoreSelf: true },
  reconnect: { attempts: 8, initialDelayMs: 2_000, maxDelayMs: 60_000, factor: 2 },
  logger: myLogger,
  sessionStore: myStore,
  backend: myBackend,
  auth: { pairingPhoneNumber: "5511999999999" },
});
```

## Opções {#options}

<ApiTable
  :rows="[
    { name: 'backend', type: 'WhatsAppBackend | (() => WhatsAppBackend)', def: 'createDefaultBackend()', description: 'Adaptador do provedor. Uma instância é usada diretamente; uma função é invocada uma vez por construção de Client. Padrão: o backend Baileys incluso.' },
    { name: 'sessionStore', type: 'SessionStore', def: 'new FileSessionStore()', description: 'Persistência do estado de login. Padrão: um store de sistema de arquivos escrevendo em .libwa.js/; use SqliteSessionStore em produção.' },
    { name: 'sessionId', type: 'string', def: '&quot;default&quot;', description: 'Id do slot dentro do store. Use ids distintos para múltiplas contas sobre um único store.' },
    { name: 'logger', type: 'Logger', def: 'nullLogger', description: 'Recebe diagnósticos internos. Padrão: um logger silencioso — nada é impresso a menos que você injete um.' },
    { name: 'commands', type: 'CommandOptions | false', def: '{ prefix: &quot;!&quot; }', description: 'Configuração do parsing de comandos, ou false para desativar completamente o parsing de prefixo (cada mensagem de texto permanece um MessageInteraction simples).' },
    { name: 'reconnect', type: 'ReconnectOptions | false', def: '{ attempts: 5, initialDelayMs: 1000, maxDelayMs: 30000, factor: 2 }', description: 'Política de reconexão automática, ou false para desativar as tentativas (o primeiro fechamento emite disconnect imediatamente).' },
    { name: 'auth', type: '{ pairingPhoneNumber?: string }', def: 'undefined', description: 'Configurações de login por código de pareamento. pairingPhoneNumber é internacional, 7-15 dígitos, sem o prefixo +.' }
  ]"
/>

### `commands` {#commands}

<ApiTable
  :rows="[
    { name: 'prefix', type: 'string | readonly string[]', def: '&quot;!&quot;', description: 'Um ou mais prefixos de comando. O prefixo mais longo que casar com a mensagem prevalece; empates mantêm a entrada anterior. Strings vazias ou um array vazio lançam ValidationError (ERR_INVALID_PREFIX) quando o cliente é construído.' },
    { name: 'ignoreSelf', type: 'boolean', def: 'false', description: 'Quando true, mensagens enviadas pela conta logada nunca são parseadas como comandos (elas ainda são despachadas como MessageInteractions).' }
  ]"
/>

Passe `commands: false` para desativar o parsing completamente. O [CommandRegistry](/pt-BR/reference/commands) continua utilizável (você ainda pode registrar comandos programaticamente), mas nenhuma mensagem é promovida a um `CommandInteraction`.

### `reconnect` {#reconnect}

<ApiTable
  :rows="[
    { name: 'attempts', type: 'number', def: '5', description: 'Número máximo de tentativas para desconexões recuperáveis. A contagem de tentativas reinicia toda vez que a conexão abre.' },
    { name: 'initialDelayMs', type: 'number', def: '1000', description: 'Atraso antes da primeira tentativa. Os atrasos seguintes são initialDelayMs * factor ** (attempt - 1).' },
    { name: 'maxDelayMs', type: 'number', def: '30000', description: 'Limite superior aplicado a cada atraso calculado.' },
    { name: 'factor', type: 'number', def: '2', description: 'Multiplicador do backoff exponencial.' }
  ]"
/>

Motivos fatais — [`LoggedOut`, `BadSession`, `ConnectionReplaced`, `Forbidden`](/pt-BR/reference/disconnect-reason) — **nunca** são retentados, independentemente desta configuração. Detalhes completos da política: [Reconexão](/pt-BR/architecture/reconnection).

### `logger` {#logger}

A interface [`Logger`](/pt-BR/reference/logger) tem quatro métodos:

```ts
import { type Logger, createConsoleLogger, nullLogger } from "libwa.js";

// Logger de console embutido com seu prefixo: "my-bot info: ..." (prefixo padrão "libwa.js")
const logger = createConsoleLogger("my-bot");

// Traga o seu (pino, winston, ts-log, ...)
const structured: Logger = {
  debug: (...args) => log.debug(args),
  info: (...args) => log.info(args),
  warn: (...args) => log.warn(args),
  error: (...args) => log.error(args),
};
```

O backend encaminha o logging do provedor pelo mesmo objeto (veja [`createProviderLogger`](/pt-BR/reference/logger#createconsolelogger)).

## Validação feita na construção {#validation-performed-at-construction}

`resolveClientOptions()` roda quando `new Client()` é executado e pode lançar imediatamente:

| Condição | Erro | Código |
| --- | --- | --- |
| `commands.prefix` é um array vazio ou contém uma string vazia | `ValidationError` | `ERR_INVALID_PREFIX` |

Todo o resto é validado depois, quando usado (veja a [referência de erros](/pt-BR/reference/errors#validation-codes)).

::: tip Falhe rápido, depois normalize
Os padrões de reconexão e de comandos são aplicados aqui; `ResolvedClientOptions` (exportado) é a forma com todos os padrões já aplicados, usada internamente.
:::

## Receitas {#recipes}

### Bot de desenvolvimento com logging visível {#development-bot-with-visible-logging}

```ts
import { Client, createConsoleLogger } from "libwa.js";

const client = new Client({
  logger: createConsoleLogger("dev-bot"),
  commands: { prefix: ["!", "/"] },
});
```

### Bot multi-conta compartilhando um único store {#multi-account-bot-sharing-one-store}

```ts
import { Client, FileSessionStore } from "libwa.js";

const store = new FileSessionStore({ directory: ".sessions" });

const sales = new Client({ sessionStore: store, sessionId: "sales" });
const support = new Client({ sessionStore: store, sessionId: "support" });
```

Cada slot recebe seu próprio arquivo `<directory>/<id>.json`. Os ids de slot devem corresponder a `/^[A-Za-z0-9_-]{1,64}$/` (exigido pelo store — veja [`assertSafeSessionId`](/pt-BR/reference/sessions#assertsafesessionid)).

### Produção: um único banco SQLite {#production-one-sqlite-database}

```ts
import { Client, SqliteSessionStore } from "libwa.js";

const store = new SqliteSessionStore({ filename: "var/bots.db", busyTimeoutMs: 5000 });

const sales = new Client({ sessionStore: store, sessionId: "sales" });
const support = new Client({ sessionStore: store, sessionId: "support" });

// … no encerramento:
await sales.destroy();
await support.destroy();
store.close(); // você é dono do handle — o libwa.js nunca o fecha
```

Cada slot é uma linha em um único banco em modo WAL: resistente a crashes (`synchronous = FULL`), seguro para compartilhar entre processos (`busy_timeout`) e um único upsert transacional por save. Veja [Sessões → SqliteSessionStore](/pt-BR/reference/sessions#sqlitesessionstore).

### Bot de teste sem persistência {#test-bot-with-no-persistence}

```ts
import { Client, MemorySessionStore } from "libwa.js";

const client = new Client({
  sessionStore: new MemorySessionStore(),
  reconnect: false,          // falhar rápido em vez de tentar novamente nos testes
  commands: { prefix: "!" },
});
```

### Desativar comandos, tratar apenas mensagens {#disable-commands-handle-messages-only}

```ts
const client = new Client({ commands: false });
```

### Instância de backend personalizada vs factory {#custom-backend-instance-vs-factory}

```ts
// instância — compartilhada, útil em testes
new Client({ backend: myMockBackend });

// factory — invocada uma vez, dá isolação por client
new Client({ backend: () => createBaileysBackend({ browser: ["my-bot", "2.0", "Linux"] }) });
```

::: warning Não compartilhe uma instância de backend entre clients
Um backend possui um socket do provedor ativo. Um `Client` por instância de backend.
:::

## Variáveis de ambiente {#environment-variables}

O próprio libwa.js **não** lê variáveis de ambiente. O exemplo incluso `examples/pairing-login.ts` lê uma por conveniência:

| Nome | Tipo | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- | --- |
| `WA_PHONE_NUMBER` | string (dígitos) | não | `"5511999999999"` (placeholder) | Número de telefone usado para login por código de pareamento no exemplo. Formato: internacional, 7–15 dígitos, sem `+`. |

```sh
WA_PHONE_NUMBER=5511999999999 npx tsx examples/pairing-login.ts
```

## Arquivos de configuração {#configuration-files}

| Arquivo | Função |
| --- | --- |
| `package.json` | Declara a dependência `libwa.js`; `"type": "module"` recomendado (libwa.js é ESM). |
| `tsconfig.json` | As flags de compiler recomendadas estão documentadas em [Convenções de código](/pt-BR/development/conventions). |
| `.libwa.js/*.json` | Arquivos de sessão de runtime escritos pelo `FileSessionStore` padrão (não são configuração — não edite à mão). |

Não existe arquivo de configuração do libwa.js: **código é configuração** (`new Client({...})`).

## Erros comuns {#common-mistakes}

| Erro | Sintoma | Correção |
| --- | --- | --- |
| `await client.login()` antes de anexar `qr` | Você nunca vê o QR / o erro | Registre os listeners primeiro ([primeiros passos](/pt-BR/guide/getting-started)) |
| `commands: { prefix: [] }` | `ValidationError: Command prefix must be a non-empty string...` na construção | Passe pelo menos um prefixo não vazio |
| Reutilizar um `sessionId` para dois clients ativos | Conflito no arquivo de sessão; os dois bots disputam um mesmo login | Um slot por conta |
| `reconnect: false` em produção | O primeiro problema de rede emite `disconnect` | Mantenha os padrões ou ajuste `ReconnectOptions` |
| Commitar `.libwa.js/` | Vaza sua sessão | Adicione-o ao `.gitignore` |
