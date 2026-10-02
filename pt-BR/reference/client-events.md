# Eventos do client {#client-events}

<ApiBadge kind="interface" /> O mapa de eventos fechado e independente de provedor consumido por [`client.on / once / off`](/pt-BR/reference/client#on-once-off). Os argumentos do listener são totalmente inferidos a partir do nome do evento.

```ts
import type { ClientEvents } from "libwa";
import type { Client, DisconnectReason, Interaction } from "libwa";

type ClientEvents = {
  ready: [client: Client];
  interactionCreate: [interaction: Interaction];
  error: [error: Error];
  disconnect: [reason: DisconnectReason];
  reconnecting: [attempt: number, delayMs: number];
  qr: [qr: string];
  pairingCode: [code: string];
};
```

Cada evento é declarado como uma **tupla de argumentos** — o emitter invoca os listeners exatamente com essa tupla. Eventos brutos do backend/provedor nunca fazem parte deste mapa.

## Eventos {#events}

### `ready` {#ready}

<ApiBadge kind="event" />

```ts
client.on("ready", (client) => { /* client === o Client que emitiu */ });
```

<ApiTable
  :rows="[
    { name: 'client', type: 'Client', description: 'O client que (re)conectou — a mesma instância daquela em que você chamou login().' }
  ]"
/>

**Quando:** toda vez que a conexão abre — incluindo reconexões. Na primeira abertura, dispara **depois** que `login()` resolve (o deferred de login é resolvido dentro do mesmo handler de conexão, antes da emissão). `client.me` já está preenchido; `client.state === "ready"`; o contador de tentativas de reconexão foi zerado.

### `interactionCreate` {#interactioncreate}

<ApiBadge kind="event" />

```ts
client.on("interactionCreate", async (interaction) => { /* … */ });
```

<ApiTable
  :rows="[
    { name: 'interaction', type: 'Interaction', description: 'Uma interação criada pela factory que passou pelo pipeline de middleware. Restrinja com isMessage()/isCommand()/isReaction()/…' }
  ]"
/>

**Quando:** depois que um evento do backend foi mapeado, convertido pelo `InteractionFactory` e todo middleware registrado chamou `next()`. O `execute()` de um comando correspondente roda **antes** destes listeners (e mesmo quando `groupOnly`/`dmOnly` o pula, os listeners ainda rodam).

**Ordem:** os listeners rodam sequencialmente na ordem de registro; cada um pode ser assíncrono (aguardado). Erros lançados → contexto `listener for "interactionCreate"` no evento `error`.

### `error` {#error}

<ApiBadge kind="event" />

```ts
client.on("error", (error) => {
  console.error(error.name, error.code, error.message, error.cause);
});
```

<ApiTable
  :rows="[
    { name: 'error', type: 'Error', description: 'Normalmente uma subclasse de WhatsAppError. Strings de contexto (nome do comando, middleware, …) aparecem na linha do logger, não no objeto de erro.' }
  ]"
/>

**Quando:** qualquer falha de biblioteca/middleware/comando/listener, além de condições terminais como `Gave up reconnecting after N attempt(s) (reason).`

**Semântica crítica:**

- Emitido **somente se existir pelo menos um listener de `error`** — sem ele, as falhas apenas geram log (e o logger padrão é silencioso).
- Se um listener de `error` em si lançar uma exceção, essa falha é registrada como `[error listener] …` e **não** é re-emitida (sem recursão).
- Fontes típicas: execução de comandos, middleware, outros listeners, falhas de `connect`, `reconnect exhausted`, falhas de `login`, `backend logout`, `disconnect during destroy`.

### `disconnect` {#disconnect}

<ApiBadge kind="event" />

```ts
client.on("disconnect", (reason) => {
  if (reason === "loggedOut") process.exit(1);
});
```

<ApiTable
  :rows="[
    { name: 'reason', type: 'DisconnectReason', description: 'Por que a conexão fechou de vez. Veja a referência de DisconnectReason para o enum completo.' }
  ]"
/>

**Quando:** a conexão fechou e **não** será tentada novamente — porque o motivo está no conjunto fatal, `reconnect: false` ou `attempts` se esgotaram. Para motivos fatais durante um `login()` pendente, a promise de login rejeita com `AuthenticationError` *e* este evento dispara. Não é emitido após `destroy()` (guard de estado).

### `reconnecting` {#reconnecting}

<ApiBadge kind="event" />

```ts
client.on("reconnecting", (attempt, delayMs) => {
  console.warn(`retry ${attempt} in ${delayMs}ms`);
});
```

<ApiTable
  :rows="[
    { name: 'attempt', type: 'number', description: 'Número da tentativa (iniciando em 1) para o epoch de conexão atual. Zera a 0 em cada abertura bem-sucedida.' },
    { name: 'delayMs', type: 'number', description: 'Espera de backoff antes da nova tentativa: min(maxDelayMs, initialDelayMs * factor ** (attempt - 1)).' }
  ]"
/>

**Quando:** um fechamento recuperável foi aceito pela política e um timer foi agendado (o timer tem `unref` — ele não mantém o Node vivo). Se o `connect()` agendado lançar uma exceção, ela é reportada como `reconnection` no evento de erro e a lógica de fechamento roda de novo com o mesmo motivo.

### `qr` {#qr}

<ApiBadge kind="event" />

```ts
client.on("qr", (qr) => console.log(qr)); // renderizar / enviar para um leitor
```

<ApiTable
  :rows="[
    { name: 'qr', type: 'string', description: 'Payload QR bruto do backend (string opaca — renderize com uma biblioteca de QR ou exiba como texto).' }
  ]"
/>

**Quando:** o backend reporta `status: "connecting"` com um `qr` enquanto não autenticado. O libwa encaminha todo QR que recebe — mesmo durante fluxos de pareamento, então no modo pareamento ignore `qr` e aguarde `pairingCode`. **Anexe antes do `login()`.**

### `pairingCode` {#pairingcode}

<ApiBadge kind="event" />

```ts
client.on("pairingCode", (code) => console.log(code)); // mostrar para o usuário, confirmar no telefone
```

<ApiTable
  :rows="[
    { name: 'code', type: 'string', description: 'Código de pareamento a digitar no telefone (WhatsApp → Aparelhos conectados → Conectar aparelho).' }
  ]"
/>

**Quando:** o backend gera um código — solicitado automaticamente quando `auth.pairingPhoneNumber` está definido, ou via `client.requestPairingCode()`. O método manual também resolve com o mesmo código.

## Tabela de referência rápida {#quick-reference-table}

| Evento | Argumentos | Fontes de emissão | Uso típico |
| --- | --- | --- | --- |
| `ready` | `(client)` | conexão aberta | anunciar prontidão, sincronizar estado |
| `interactionCreate` | `(interaction)` | pipeline de dispatch | manipulador principal |
| `error` | `(error)` | `#handleError` | logging/alertas |
| `disconnect` | `(reason)` | fechamento terminal | limpeza, saída do processo |
| `reconnecting` | `(attempt, delayMs)` | nova tentativa agendada | observabilidade |
| `qr` | `(qr)` | backend connecting+qr | exibir QR |
| `pairingCode` | `(code)` | backend/solicitação manual | exibir código |

## Exemplo completo {#full-example}

```ts
import { Client, DisconnectReason, type Interaction } from "libwa";

const client = new Client();

client.on("qr", (qr) => process.stdout.write(`${qr}\n`));
client.on("pairingCode", (code) => console.log("code:", code));
client.on("ready", (c) => console.log("ready as", c.me?.displayName));
client.on("reconnecting", (n, ms) => console.warn(`retry ${n} in ${ms}ms`));
client.on("disconnect", (r) =>
  console.error("bye:", r, r === DisconnectReason.LoggedOut ? "(re-pair needed)" : ""),
);
client.on("error", (e) => console.error("!", e.name, e.message));

client.on("interactionCreate", (i: Interaction) => {
  if (i.isMessage() && i.isText()) void i.reply(`echo: ${i.text}`);
});

await client.login();
```

## Veja também {#see-also}

- [Guia de eventos](/pt-BR/guide/events) — padrões, ordem, teardown
- [Métodos do client](/pt-BR/reference/client#on-once-off) — API de inscrição
- [TypedEventEmitter](/pt-BR/reference/typed-event-emitter) — a implementação do emitter por trás destes eventos
