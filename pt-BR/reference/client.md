# Client {#client}

<ApiBadge kind="class" /> O ponto de entrada da biblioteca. Uma instância = uma conta/slot de sessão do WhatsApp = um backend.

```ts
import { Client, type ClientState } from "libwa.js";

const client = new Client({ commands: { prefix: "!" } });
await client.login();
```

O client é responsável por:

- **Ciclo de vida da conexão** — `login()`, `destroy()`, `logout()`, política de reconexão.
- **Inscrição no backend** — inscreve-se nos seis eventos normalizados do backend exatamente uma vez por instância.
- **Pipeline de dispatch** — factory → middleware → execução de comandos → listeners de `interactionCreate`.
- **Serviços** — compostos no construtor e expostos como campos readonly.
- **Roteamento de erros** — toda falha interna passa por `#handleError(error, context)` → logger + evento `error`.

## Construtor {#constructor}

```ts
new Client(options?: ClientOptions)
```

<ApiTable
  :rows="[
    { name: 'options', type: 'ClientOptions', def: '{}', description: 'Objeto de configuração. Resolvido imediatamente via resolveClientOptions() — prefixos de comando inválidos lançam erro de forma síncrona aqui.' }
  ]"
/>

**Composição realizada nesta ordem:** resolver opções → construir `TypedEventEmitter` (com a proteção contra recursão de erros) → criar backend (instância, chamada de factory ou `createDefaultBackend()`) → criar session store (`options.sessionStore ?? new FileSessionStore()`) → `EntityFactory` → `CommandRegistry` → `InteractionFactory` → `MessageService` / `GroupService` / `UserService`.

**Lança:** `ValidationError` (`ERR_INVALID_PREFIX`) para uma lista de prefixos vazia ou um prefixo string vazia.

```ts
new Client({ commands: { prefix: [] } }); // → ValidationError na construção
```

## Propriedades {#properties}

### `state` {#state}

```ts
get state(): ClientState
```

Estado atual do ciclo de vida — veja [`ClientState`](#clientstate). Inicia em `"idle"`.

| Transição | Gatilho |
| --- | --- |
| `idle → connecting` | `login()` |
| `connecting → ready` | primeira abertura da conexão |
| `ready → connecting` | fechamento recuperável, nova tentativa agendada |
| `connecting → ready` | reconexão bem-sucedida (também emite `ready` novamente) |
| `ready/connecting → idle` | fechamento fatal, tentativas esgotadas, `logout()` |
| `any → destroyed` | `destroy()` (terminal) |

### `isReady` {#isready}

```ts
get isReady(): boolean
```

`true` somente enquanto a conexão está aberta. Resetado a cada fechamento (inclusive antes de uma nova tentativa).

### `me` {#me}

```ts
get me(): User | null
```

A conta logada, preenchida quando o backend reporta `me` na abertura da conexão. `null` antes da primeira conexão bem-sucedida.

```ts
client.on("ready", () => console.log(client.me?.displayName));
```

### `backend` {#backend}

```ts
get backend(): WhatsAppBackend
```

O backend ativo — para integrações avançadas (detecção de capacidade, acesso direto a eventos). Bots comuns nunca precisam dele. Referência somente leitura: o client nunca troca de backend.

### `sessionId` {#sessionid}

```ts
get sessionId(): string
```

O slot de sessão que este client usa (`ClientOptions.sessionId`, padrão `"default"`).

### Serviços (campos readonly) {#services-readonly-fields}

| Campo | Tipo | Função |
| --- | --- | --- |
| `messages` | `MessageService` | enviar / reagir / editar / excluir ([referência](/pt-BR/reference/messaging)) |
| `groups` | `GroupService` | resolução de metadados (`ensure`/`fetch`) + gerenciamento de grupos ([referência](/pt-BR/reference/groups)) |
| `commands` | `CommandRegistry` | registro e análise de comandos ([referência](/pt-BR/reference/commands)) |
| `users` | `UserService` | resolução de número de telefone ↔ linked id, busca de contas ([referência](/pt-BR/reference/entities#userservice)) |

## Métodos {#methods}

### `on` / `once` / `off` {#on-once-off}

```ts
on<Key extends keyof ClientEvents>(event: Key, listener: ListenerOf<ClientEvents, Key>): Unsubscribe
once<Key extends keyof ClientEvents>(event: Key, listener: ListenerOf<ClientEvents, Key>): Unsubscribe
off<Key extends keyof ClientEvents>(event: Key, listener?: ListenerOf<ClientEvents, Key>): void
```

Inscrição tipada de eventos nos sete [eventos do client](/pt-BR/reference/client-events).

<ApiTable
  :rows="[
    { name: 'event', type: 'keyof ClientEvents', description: 'Nome do evento. Os argumentos do listener são inferidos a partir dele.' },
    { name: 'listener', type: '(...args) => void | Promise<void>', description: 'Pode ser assíncrono. Rejeições são capturadas: registradas em log + roteadas para o evento error (exceto o próprio evento error, que só gera log).' }
  ]"
/>

**Retorna:** `Unsubscribe` (`() => void`) para `on`/`once`; `void` para `off`. Chamar `off(event)` sem um listener remove **todos** os listeners daquele evento.

```ts
const stop = client.on("ready", () => {});
stop();
client.off("interactionCreate"); // remove todos
```

Erros lançados por listeners nunca se propagam para o chamador do emitter.

### `use` {#use}

```ts
use(middleware: Middleware): this
```

Acrescenta um middleware ao pipeline de dispatch. Os middlewares rodam na ordem de registro **antes** dos comandos e dos listeners de `interactionCreate`; pular `next()` interrompe o dispatch por completo. Retorna `this` para encadeamento.

<ApiTable
  :rows="[
    { name: 'middleware', type: 'Middleware', description: '(interaction, next) => void | Promise<void>. Lançar uma exceção aborta o dispatch e reporta o contexto do middleware através do evento error.' }
  ]"
/>

Não existe `unuse` — monte sua própria chain antes de registrar:

```ts
for (const mw of buildChain()) client.use(mw);
```

Detalhes: [Guia de middleware](/pt-BR/guide/middleware).

### `isSelf` {#isself}

```ts
isSelf(id: UserId): boolean
```

Se `id` é a conta do próprio client — sob **qualquer** um dos esquemas de endereçamento (ciente do par LID ↔ telefone). Em grupos endereçados por LID, as ações do próprio bot chegam com o linked id, então comparar apenas com `me.id` as perderia.

<ApiTable
  :rows="[
    { name: 'id', type: 'UserId', description: 'Id a testar — um JID de telefone ou um linked id (…@lid).' }
  ]"
/>

**Retorna:** `true` quando `id` é a conta logada (ou o id contrário de um par conhecido). `false` enquanto `me` é `null` (antes da primeira conexão).

### `login` {#login}

```ts
login(): Promise<void>
```

Conecta ao WhatsApp. **Resolve** quando a conexão é aberta pela primeira vez (primeiro `ready`). **Rejeita** se a autenticação falhar ou a reconexão se esgotar antes do primeiro sucesso.

Matriz de comportamento:

| Situação atual | Resultado |
| --- | --- |
| `state === "destroyed"` | rejeita `ConnectionError("This client has been destroyed...")` |
| já está ready | resolve imediatamente |
| `login()` já pendente | retorna a **mesma** promise |
| caso contrário | cancela qualquer timer de reconexão pendente (este `login()` assume o lugar dele), inscreve o backend, `state = "connecting"`, inicia `connect()` |

Roteamento de falhas interno:

- `ValidationError` / `AuthenticationError` vindos de `connect()` → falha rápida: rejeita (sem novas tentativas; problemas de auth/sessão não se consertam sozinhos).
- qualquer outra falha de `connect()` → log + fechamento sintetizado com `DisconnectReason.NetworkError` → política normal de novas tentativas.
- enquanto pendente, um fechamento fatal rejeita com `AuthenticationError`; um fechamento terminal não fatal rejeita com `ConnectionError`.
- uma rejeição sem `await` é pré-capturada internamente para que chamadas fire-and-forget nunca derrubem o processo (quem faz await ainda a observa).

**Efeitos colaterais:** transições de estado, eventos `error`, listeners do backend anexados (uma vez).

```ts
client.on("qr", showQr);
client.on("pairingCode", showCode);
try {
  await client.login();
} catch (error) {
  // AuthenticationError | ConnectionError | ValidationError
}
```

### `destroy` {#destroy}

```ts
async destroy(): Promise<void>
```

Para o client permanentemente:

1. não faz nada se já estiver `destroyed`;
2. `state = "destroyed"`, `isReady = false`;
3. cancela um timer de reconexão pendente;
4. rejeita um `login()` pendente com `ConnectionError("Client was destroyed.")` — **sem** emitir `error` para ele (report = false);
5. remove a inscrição de todos os listeners do backend;
6. `#entities.reset()` + `groups.reset()` — identidades e metadados em cache descrevem a conta que estava conectada; eles são descartados para que um `destroy()` não os vazem para quem reutilizar este processo;
7. `await backend.disconnect()` — falhas reportadas através de `error` (contexto `disconnect during destroy`), nunca lançadas.

Depois de `destroy()`, `login()` sempre rejeita. Este é o único estado terminal.

### `logout` {#logout}

```ts
async logout(): Promise<void>
```

Invalida a sessão e devolve o client para `idle`:

1. `#loggingOut = true` — a trava que impede a reconexão de ser armada enquanto a sessão está sendo apagada (liberada no `finally`);
2. cancela qualquer timer de reconexão pendente;
3. rejeita um `login()` em andamento com `ConnectionError("Client logged out before login completed.")` — sem emitir `error` (report = false);
4. `backend.logout()` se implementado (revogação remota) — falhas → `error` (contexto `backend logout`);
5. `sessionStore.clear(sessionId)` — o slot é apagado;
6. `backend.disconnect()` — falhas → `error` (contexto `disconnect after logout`);
7. `isReady = false`; `state = "idle"` (a menos que destroyed);
8. `#entities.reset()` + `groups.reset()` — um `login()` a partir daqui é uma conta *diferente*, então os chats, membros, push names e TTLs de grupos da conta anterior não podem responder por eles.

Falhas de `logout()`/`disconnect()` do backend são engolidas (reportadas através de `error` com contextos `backend logout` / `disconnect after logout`), mas um `sessionStore.clear()` que rejeita **faz** a chamada rejeitar. Um `login()` subsequente inicia um **fluxo de pareamento novo**. Não desanexa listeners (ao contrário de `destroy()`).

### `requestPairingCode` {#requestpairingcode}

```ts
async requestPairingCode(phoneNumber: string): Promise<string>
```

Solicita um código de pareamento ao servidor para login por número de telefone (o formato do código é definido pelo provedor).

<ApiTable
  :rows="[
    { name: 'phoneNumber', type: 'string', description: 'Formato internacional, 7-15 dígitos, sem +. Validado contra /^\\d{7,15}$/.' }
  ]"
/>

**Retorna:** o código exatamente como reportado pelo servidor. O backend também emite um evento `pairingCode` quando gera um código.

**Erros:**

| Condição | Erro | Código |
| --- | --- | --- |
| formato inválido | `ValidationError` | `ERR_INVALID_PHONE` |
| backend não possui `requestPairingCode` | `UnsupportedOperationError` | `ERR_UNSUPPORTED` |
| falha do provedor | `BackendError` (embrulhado, contexto `Failed to request pairing code`) | `ERR_BACKEND` |

Relevante apenas durante a conexão; com `auth.pairingPhoneNumber` configurado, o backend incluso solicita um automaticamente.

## `ClientState` {#clientstate}

```ts
type ClientState = "idle" | "connecting" | "ready" | "destroyed";
```

| Valor | Significado |
| --- | --- |
| `"idle"` | Não conectado; `login()` pode iniciar uma nova tentativa (estado inicial, após fechamento terminal, após logout). |
| `"connecting"` | `connect()` em andamento ou timer de backoff pendente. |
| `"ready"` | Conexão aberta; `isReady === true`. |
| `"destroyed"` | Terminal; listeners do backend desanexados (listeners da aplicação permanecem); `login()` rejeita. |

## Mecanismo interno <ApiBadge kind="internal" /> {#internal-machinery}

Para colaboradores que leem `src/Client.ts` (624 linhas):

| Membro | Propósito |
| --- | --- |
| `#subscribeBackend()` | Anexa os seis listeners do backend uma vez (protegido por `#subscribed`). Cada payload é alimentado à factory e dispatchado via `void #dispatch(...)`. |
| `#connectBackend()` | Envolve `backend.connect({ sessionId, sessionStore, logger, pairingPhoneNumber })`. |
| `#dispatch(interaction)` | `runMiddlewareChain` → verificação `#commandAllowed` → `command.execute` → listeners de `interactionCreate`; cada etapa com try/caught individual para `#handleError`. |
| `#commandAllowed(command, i)` | Aplica `groupOnly`/`dmOnly` contra `isFromGroup()`/`isFromDirectChat()`. |
| `#onConnectionUpdate(u)` | Roteia as emissões de `qr`/`pairingCode`; em `open` zera o contador de tentativas, define `me`, resolve o deferred de login (somente na primeira abertura), emite `ready`. |
| `#onClose(u)` | Política de reconexão: conjunto fatal / `reconnect: false` / tentativas esgotadas → evento `disconnect` + rejeição do login; caso contrário agenda o backoff (`delay = min(max, initial * factor^(n-1))`, timer com `unref`). |
| `#failLogin(e, report)` | Rejeita e limpa o deferred de login exatamente uma vez; reporta através de `error` quando `report` (padrão true). |
| `#handleError(e, context)` | `logger.error("[context]", message)`; emite `error` apenas quando existem listeners. Falhas de listeners de `error` são rebaixadas para logs dentro do hook do emitter. |

## Exemplo completo {#full-example}

```ts
import { Client, DisconnectReason, type Interaction } from "libwa.js";

const client = new Client({
  sessionId: "main",
  commands: { prefix: ["!", "/"], ignoreSelf: true },
  reconnect: { attempts: 5, initialDelayMs: 1000, maxDelayMs: 30000, factor: 2 },
});

const stopError = client.on("error", (error) => {
  console.error("[libwa.js]", error.name, error.code, error.message);
});

client.on("ready", () => console.log("online:", client.me?.displayName));
client.on("reconnecting", (attempt, delay) =>
  console.warn(`reconnect #${attempt} in ${delay}ms`),
);
client.on("disconnect", (reason) => {
  console.error("disconnected:", reason);
  if (reason === DisconnectReason.LoggedOut) process.exit(1);
});

client.on("interactionCreate", (i: Interaction) => {
  if (i.isCommand() && i.name === "status") {
    void i.reply(`state=${client.state} ready=${client.isReady}`);
  }
});

await client.login();          // resolve no primeiro ready
await client.destroy();        // depois: limpeza terminal
stopError();
```

## Veja também {#see-also}

- [ClientOptions](/pt-BR/reference/client-options) — todas as opções do construtor
- [Eventos do client](/pt-BR/reference/client-events) — o mapa de eventos
- [Primeiros passos](/pt-BR/guide/getting-started) — passo a passo da primeira conexão
- [Arquitetura de reconexão](/pt-BR/architecture/reconnection) — detalhes internos da política
