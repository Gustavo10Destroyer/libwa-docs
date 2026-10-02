# Mensageria {#messaging}

<ApiBadge kind="class" /> `MessageService` (`client.messages`) envia, reage, edita e apaga mensagens — o único caminho de saída (interações e entidades delegam a ele).

```ts
await client.messages.send("5511999999999@s.whatsapp.net", "hello");
await chat.send({ image: bytes, caption: "hi" });
await i.reply("pong");
```

## Tipos <ApiBadge kind="type" /> {#types}

### `SendTarget` {#sendtarget}

```ts
type SendTarget = Chat | User | ChatId;
```

Qualquer um deles: uma entidade `Chat`/`Group`, um `User` (resolve para o id do chat direto dele) ou uma string `ChatId` crua.

### `ReplyContent` {#replycontent}

```ts
type ReplyContent = string | MessagePayload;
```

O que as APIs voltadas ao usuário aceitam — uma string abreviada (corpo de texto) ou um payload estruturado.

### `MessagePayload` <ApiBadge kind="interface" /> {#messagepayload}

Exige exatamente **um corpo** (`text` / `image` / `video` / `audio` / `document` / `sticker` / `location`); legendas/menções são modificadores.

<ApiTable
  :rows="[
    { name: 'text', type: 'string', def: 'undefined', description: 'Corpo de texto.' },
    { name: 'image / video / audio / sticker', type: 'MediaSource', def: 'undefined', description: 'Corpo de mídia bruto (Uint8Array ou { data, mimetype? }).' },
    { name: 'audio', type: 'MediaSource &amp; { voice?: boolean }', def: 'undefined', description: 'voice: true marca uma nota de voz push-to-talk.' },
    { name: 'document', type: 'MediaSource &amp; { fileName?: string }', def: 'undefined', description: 'fileName substitui o nome do anexo.' },
    { name: 'caption', type: 'string', def: 'undefined', description: 'Legenda para image/video/document; string vazia ou legenda presente em outros kinds → ERR_INVALID_CAPTION.' },
    { name: 'location', type: '{ latitude, longitude, address?, name? }', def: 'undefined', description: 'Corpo de localização.' },
    { name: 'mentions', type: 'readonly (User | UserId)[]', def: 'undefined', description: 'Usuários para menção @; mesclados com options.mentions (sem duplicatas).' }
  ]"
/>

### `MediaSource` {#mediasource}

```ts
type MediaSource = Uint8Array | { data: Uint8Array; mimetype?: string };
```

Bytes puros — sem estruturas de provedor. Tipos MIME padrão quando não fornecidos: image `image/jpeg`, video `video/mp4`, audio `audio/ogg; codecs=opus`, document `application/octet-stream`, sticker `image/webp`.

### `SendOptions` <ApiBadge kind="interface" /> {#sendoptions}

<ApiTable
  :rows="[
    { name: 'quote', type: 'Message', def: 'undefined', description: 'Cita uma entidade de mensagem explícita (tem precedência sobre replyToMessageId).' },
    { name: 'replyToMessageId', type: 'string', def: 'undefined', description: 'Cita apenas pelo id (ex.: responde ao alvo de uma reação).' },
    { name: 'mentions', type: 'readonly (User | UserId)[]', def: 'undefined', description: 'Menções extras mescladas no payload.' }
  ]"
/>

## MessageService <ApiBadge kind="class" /> {#messageservice}

```ts
class MessageService {
  constructor(backend: WhatsAppBackend, entities: EntityFactory); // interno
  send(target: SendTarget, content: ReplyContent, options?: SendOptions): Promise<Message>;
  react(message: Message, emoji: string | null): Promise<void>;
  reactTo(chat: Chat | ChatId, messageId: string, emoji: string | null): Promise<void>;
  edit(message: Message, text: string): Promise<Message>;
  delete(message: Message): Promise<void>;
}
```

Exposto como `client.messages`. O construtor é interno — pegue a instância de um client.

### `send` {#send}

```ts
send(target, content, options?): Promise<Message>
```

Fluxo de saída de ponta a ponta: resolver o target → `normalizeReplyContent(content, options)` → `backend.sendMessage(...)` → reconstruir um `Message` local (`#toMessageContent`) para que os echos correspondam às formas de entrada (anexos incluídos quando o backend retorna informações de mídia).

<ApiTable
  :rows="[
    { name: 'target', type: 'SendTarget', description: 'Para onde enviar. Ids crus desconhecidos são embrulhados em um Chat pela factory de entidades.' },
    { name: 'content', type: 'ReplyContent', description: 'String abreviada ou MessagePayload.' },
    { name: 'options', type: 'SendOptions', def: 'undefined', description: 'Citação e menções extras.' }
  ]"
/>

**Retorna:** o `Message` enviado.

**Erros:** `ValidationError` (veja a [tabela de validação](#validation-errors)), falhas do provedor como `MessageError` (mensagem `"Failed to send message: …"` — backends customizados também podem lançar `PermissionError` / `NotFoundError` / `BackendError`). `sendMessage` é um membro obrigatório do backend, então não existe erro de capacidade para ele.

```ts
await client.messages.send(chatId, "plain text");

await client.messages.send(user, {
  image: new Uint8Array(await readFile("cat.jpg")),
  caption: "my cat",
  mentions: [authorId],
}, { replyToMessageId: someId });
```

Um payload carrega exatamente um corpo — `text`, `image`, `video`, `audio`, `document`, `sticker` ou `location`. Combinar dois deles lança `ValidationError` `ERR_AMBIGUOUS_MESSAGE`; `caption` não é um corpo e só faz sentido junto com uma image, video ou document.

### `react` / `reactTo` {#react-reactto}

```ts
react(message: Message, emoji: string | null): Promise<void>
reactTo(chat: Chat | ChatId, messageId: string, emoji: string | null): Promise<void>
```

Adiciona (`"👍"`) ou limpa (`null`) **sua própria** reação. `reactTo` é a variante baseada em id quando você não tem uma entidade `Message` (ex.: reagir ao alvo de uma reação). String de emoji vazia → `ERR_EMPTY_REACTION`.

### `edit` {#edit}

```ts
edit(message: Message, text: string): Promise<Message>
```

Edita **sua própria** mensagem de texto; retorna o `Message` atualizado.

**Erros:** `ValidationError` `ERR_EMPTY_MESSAGE` (texto vazio), `ERR_UNSUPPORTED` quando o backend não tem `editMessage`; falhas do provedor aparecem como `MessageError` com o backend embutido (o próprio `MessageError` dele passa por `rethrowAsBackendError` sem alterações) — `BackendError` (mensagem `Failed to edit message: …`) aplica-se apenas a backends customizados que lançam um erro que não é da biblioteca.

### `delete` {#delete}

```ts
delete(message: Message): Promise<void>
```

Apaga **sua própria** mensagem (`ERR_UNSUPPORTED` quando não suportado; falhas do provedor → `MessageError` com o backend embutido, ou `BackendError` (mensagem `Failed to delete message: …`) apenas quando um backend customizado lança um erro que não é da biblioteca).

## `normalizeReplyContent` <ApiBadge kind="internal" /> {#normalizereplycontent}

```ts
function normalizeReplyContent(content: ReplyContent, options?: SendOptions): NormalizedPayload
```

Valida e converte a entrada do usuário em `{ content: OutboundContent, mentions: UserId[] }`:

- string → `{ text }`;
- conta corpos — 0 → `ERR_EMPTY_MESSAGE`, >1 → `ERR_AMBIGUOUS_MESSAGE`;
- regras de caption (`ERR_INVALID_CAPTION`), mídia vazia `Uint8Array(0)` → `ERR_EMPTY_MEDIA`;
- resolve menções do payload + options (entidades → ids, sem duplicatas);
- copia `document.fileName`, `audio.voice`.

Executa **antes** de qualquer chamada ao backend — todo caminho de `send` passa por ele. Testado unitariamente de forma direta (10 testes de payload).

## Erros de validação {#validation-errors}

| Code | Lançado quando |
| --- | --- |
| `ERR_EMPTY_MESSAGE` | Sem corpo (string/payload vazio) ou texto de `edit` vazio. |
| `ERR_AMBIGUOUS_MESSAGE` | Mais de um corpo em um payload. |
| `ERR_INVALID_CAPTION` | `caption` presente sem um corpo de image/video/document. |
| `ERR_EMPTY_MEDIA` | Bytes de mídia com tamanho zero. |
| `ERR_EMPTY_REACTION` | Emoji com string vazia (`""`); `null` é válido e limpa a reação. |

Todas são `ValidationError` carregando o código listado, lançadas **antes** de qualquer chamada ao backend.

## Veja também {#see-also}

- [Guia de mensageria](/pt-BR/guide/messaging) — receitas (menção, citação, nota de voz, echos)
- [Conteúdo da mensagem](/pt-BR/reference/content) — união de conteúdo de entrada
- [Entidades](/pt-BR/reference/entities#message) — o `Message` retornado
