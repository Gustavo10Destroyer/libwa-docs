# ClientOptions {#clientoptions}

<ApiBadge kind="interface" /> Opções aceitas por `new Client(options?)`. Todas as propriedades são opcionais.

```ts
import { Client, type ClientOptions } from "libwa";

const options: ClientOptions = {
  sessionId: "default",
  commands: { prefix: "!", ignoreSelf: false },
  reconnect: { attempts: 5, initialDelayMs: 1000, maxDelayMs: 30000, factor: 2 },
  auth: { pairingPhoneNumber: "5511999999999" },
};

const client = new Client(options);
```

## Propriedades {#properties}

<ApiTable
  :rows="[
    { name: 'backend', type: 'WhatsAppBackend | (() => WhatsAppBackend)', def: 'undefined → createDefaultBackend()', description: 'Adaptador do provedor. Instâncias são usadas diretamente; factories são chamadas uma vez por Client. Nunca compartilhe uma instância entre clients.' },
    { name: 'sessionStore', type: 'SessionStore', def: 'undefined → new FileSessionStore()', description: 'Onde o estado de login persiste. O padrão é um store em disco em .libwa/; troque por SqliteSessionStore em produção, MemorySessionStore em testes, ou o seu próprio.' },
    { name: 'sessionId', type: 'string', def: '&quot;default&quot;', description: 'Id do slot dentro da store; deve casar com [A-Za-z0-9_-]{1,64} (imposto pelas stores de arquivo e SQLite).' },
    { name: 'logger', type: 'Logger', def: 'undefined → nullLogger', description: 'Destino dos diagnósticos internos. O padrão descarta tudo — injete um logger para ver algo.' },
    { name: 'commands', type: 'CommandOptions | false', def: 'undefined → { prefix: &quot;!&quot; }', description: 'Configuração da análise de comandos, ou false para desativá-la completamente.' },
    { name: 'reconnect', type: 'ReconnectOptions | false', def: 'undefined → DEFAULT_RECONNECT object', description: 'Política de reconexão, ou false para desativar as novas tentativas automáticas.' },
    { name: 'auth', type: '{ pairingPhoneNumber?: string }', def: 'undefined', description: 'Configuração de login por código de pareamento. pairingPhoneNumber: internacional, 7-15 dígitos, sem +.' }
  ]"
/>

Nota: com `exactOptionalPropertyTypes`, **não** passe `undefined` explícito para props opcionais — omite-as.

## CommandOptions <ApiBadge kind="interface" /> {#commandoptions}

Opções do sistema de comandos. Passe `commands: false` em `ClientOptions` para desativar a análise (esta interface deixa de se aplicar).

<ApiTable
  :rows="[
    { name: 'prefix', type: 'string | readonly string[]', def: '&quot;!&quot;', description: 'Prefixo(s) de comando. O prefixo correspondente mais longo vence; empates mantêm a entrada anterior. Array vazio ou qualquer string vazia → ValidationError ERR_INVALID_PREFIX na construção.' },
    { name: 'ignoreSelf', type: 'boolean', def: 'false', description: 'Pula a análise de comandos para mensagens enviadas pela conta logada (elas ainda são dispatchadas como MessageInteractions).' }
  ]"
/>

```ts
new Client({ commands: { prefix: ["!", "/", "?"], ignoreSelf: true } });
new Client({ commands: false }); // nunca haverá CommandInteractions
```

## ReconnectOptions <ApiBadge kind="interface" /> {#reconnectoptions}

Política de reconexão automática para desconexões recuperáveis. Motivos fatais ([`FATAL_DISCONNECT_REASONS`](/pt-BR/reference/disconnect-reason#fatal-disconnect-reasons)) a ignoram.

<ApiTable
  :rows="[
    { name: 'attempts', type: 'number', def: '5', description: 'Máximo de novas tentativas por epoch de conexão. O contador volta a 0 sempre que a conexão abre.' },
    { name: 'initialDelayMs', type: 'number', def: '1000', description: 'Atraso antes da tentativa #1.' },
    { name: 'maxDelayMs', type: 'number', def: '30000', description: 'Teto para todo atraso calculado.' },
    { name: 'factor', type: 'number', def: '2', description: 'Base exponencial: delay(n) = min(maxDelayMs, initialDelayMs * factor ** (n - 1)).' }
  ]"
/>

Objeto de padrões (espelhado como `DEFAULT_RECONNECT` no código-fonte):

```ts
const DEFAULT_RECONNECT = { attempts: 5, initialDelayMs: 1000, maxDelayMs: 30000, factor: 2 };
```

```ts
// dev local rápido: sem novas tentativas
new Client({ reconnect: false });

// rede instável: backoff paciente
new Client({ reconnect: { attempts: 10, initialDelayMs: 2000, maxDelayMs: 120000, factor: 2 } });
```

## ResolvedClientOptions <ApiBadge kind="interface" /> {#resolvedclientoptions}

A forma totalmente padrão produzida por [`resolveClientOptions`](#resolveclientoptions) e armazenada no client (`readonly`):

```ts
interface ResolvedClientOptions {
  readonly backend: WhatsAppBackend | (() => WhatsAppBackend) | undefined;
  readonly sessionStore: SessionStore | undefined;
  readonly sessionId: string;
  readonly logger: Logger;
  readonly commandOptions: CommandParsingOptions | null; // null = análise desativada
  readonly reconnect:
    | { readonly attempts: number; readonly initialDelayMs: number;
        readonly maxDelayMs: number; readonly factor: number }
    | false;
  readonly pairingPhoneNumber: string | undefined;
}
```

Diferenças em relação às opções brutas: `commandOptions` é normalizado (`prefix` → `prefixes: readonly string[]`, ou `null` para `commands: false`); `reconnect` é ou um objeto de campos obrigatórios ou `false`; `logger` nunca é `undefined`.

## resolveClientOptions <ApiBadge kind="internal" /> {#resolveclientoptions}

```ts
function resolveClientOptions(options: ClientOptions): ResolvedClientOptions
```

Aplica todos os padrões. Chamado pelo construtor do `Client` — você normalmente nunca o chama.

<ApiTable
  :rows="[
    { name: 'options', type: 'ClientOptions', description: 'Opções brutas fornecidas pelo usuário.' }
  ]"
/>

**Retorna:** `ResolvedClientOptions`.

**Lança:**

| Condição | Erro | Código |
| --- | --- | --- |
| `commands` presente com `prefix: []` | `ValidationError` | `ERR_INVALID_PREFIX` |
| `commands.prefix` contém `""` | `ValidationError` | `ERR_INVALID_PREFIX` |

Mensagem: `Command prefix must be a non-empty string or a non-empty list.`

O helper interno `normalizePrefixes(prefix)` faz a verificação: converte uma string única em um array de um elemento, copia arrays readonly para uma snapshot mutável e depois valida.

```ts
import { resolveClientOptions } from "../src/ClientOptions.js"; // caminho interno do repositório
```

<ApiNote kind="internal">
Não é exportado da raiz do pacote — só importável dentro do repositório (ou via o truque de paths do tsconfig). Código de aplicação deve passar as opções para <code>new Client()</code>.
</ApiNote>

## Veja também {#see-also}

- [Guia de configuração](/pt-BR/guide/configuration) — receitas e justificativas
- [Referência do client](/pt-BR/reference/client) — como as opções são consumidas
- [Arquitetura de reconexão](/pt-BR/architecture/reconnection) — comportamento da política
