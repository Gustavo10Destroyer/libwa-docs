# Mensageria {#messaging}

Mensagens de saída passam por [`client.messages`](/pt-BR/reference/messaging) (um [`MessageService`](/pt-BR/reference/messaging#messageservice)). As entidades (`Chat.send`, `Message.reply`, `Message.react`, o `reply()` das interações) são wrappers finos sobre ele — todos os caminhos compartilham uma única etapa de validação e normalização.

## Envio {#sending}

```ts
const sent = await client.messages.send(target, content, options?);
```

### Destinos {#targets}

`SendTarget = Chat | User | ChatId`:

| Destino | Chat resolvido |
| --- | --- |
| Instância `Chat` / `Group` | Usada diretamente (seu `id` e `kind`). |
| Instância `User` | Tratada como um chat direto (`kind: "direct"`, chat id = user id). |
| chat id `string` | Chats conhecidos reutilizam a instância em cache; ids desconhecidos criam um chat de kind `"unknown"` que é atualizado quando dados melhores chegam. |

```ts
import { Client } from "libwa";

const client = new Client();

await client.messages.send("5511999999999@s.whatsapp.net", "Hello!");
await client.messages.send("123456789@g.us", { text: "Hello group!" });

const chat = /* vindo de uma interação */;
await chat.send("sent via entity");            // chat.send(content) → messages.send(chat, content)
await interaction.reply("sent via interaction"); // cita a mensagem relevante
```

### Conteúdo: strings e payloads {#content-strings-and-payloads}

`ReplyContent = string | MessagePayload`.

```ts
await client.messages.send(chat, "plain text");
```

Um payload estruturado deve conter **exatamente um corpo** — `text`, `image`, `video`, `audio`, `document`, `sticker` ou `location`:

```ts
await client.messages.send(chat, {
  image: imageBytes,                       // Uint8Array
  caption: "Look at this!",
  mentions: ["5511999999999@s.whatsapp.net"],
});

await client.messages.send(chat, {
  image: { data: bytes, mimetype: "image/png" }, // MIME explícito
  caption: "png",
});

await client.messages.send(chat, {
  audio: { data: voiceBytes, voice: true },      // nota de voz (push-to-talk)
});

await client.messages.send(chat, {
  document: { data: fileBytes, fileName: "report.pdf" },
  caption: "Monthly report",
});

await client.messages.send(chat, {
  text: "Meet here",
  location: { latitude: -23.55, longitude: -46.63, name: "Office", address: "Av. Paulista" },
});
```

#### Regras de validação (`normalizeReplyContent`) {#validation-rules-normalizereplycontent}

A normalização roda **antes** de tocar o backend. Violações lançam [`ValidationError`](/pt-BR/reference/errors#validationerror):

| Regra | Código |
| --- | --- |
| Conteúdo string deve ser não vazio | `ERR_EMPTY_MESSAGE` |
| Payload deve ter exatamente um corpo | `ERR_EMPTY_MESSAGE` (0) / `ERR_AMBIGUOUS_MESSAGE` (>1) |
| O corpo `text` deve ser não vazio | `ERR_EMPTY_MESSAGE` |
| `caption` apenas com `image` / `video` / `document` | `ERR_INVALID_CAPTION` |
| Os bytes da mídia devem ser não vazios (`byteLength > 0`) | `ERR_EMPTY_MEDIA` |

Padrões aplicados quando omitidos:

| Campo | Padrão |
| --- | --- |
| mimetype de `image` | `image/jpeg` |
| `video` | `video/mp4` |
| `audio` | `audio/ogg; codecs=opus` |
| `document` | `application/octet-stream` |
| `sticker` | `image/webp` |
| `document.fileName` | `"document"` |
| `audio.voice` | `false` |

Menções são coletadas de **ambos** `payload.mentions` e `options.mentions`, deduplicadas e passadas ao backend. Os ids podem ser jids de número de telefone ou LIDs — passe-os exatamente como o evento os entregou (veja [Ids vinculados](/pt-BR/guide/groups#linked-ids-lids-and-mentions)).

### Opções de envio {#send-options}

<ApiTable
  :rows="[
    { name: 'quote', type: 'Message', def: 'undefined', description: 'Cita uma instância explícita de mensagem (tem precedência sobre replyToMessageId).' },
    { name: 'replyToMessageId', type: 'string', def: 'undefined', description: 'Cita apenas pelo id — usado quando só se conhece o id (ex.: respondendo à mensagem que uma reação teve como alvo).' },
    { name: 'mentions', type: 'readonly (User | UserId)[]', def: 'undefined', description: 'Usuários adicionais para mencionar com @, mesclados com as menções do payload.' }
  ]"
/>

```ts
const sent = await client.messages.send(chat, "about this", { quote: someMessage });
```

### O que você recebe de volta {#what-you-get-back}

`send()` resolve para uma [`Message`](/pt-BR/reference/entities#message) de domínio construída a partir da confirmação do backend:

- id/timestamp/chatKind vindo do provedor,
- `author` = o usuário logado, `isFromMe: true`,
- conteúdo convertido de volta para a união `MessageContent` — anexos de mídia ganham um **`download()` lazy** que busca os bytes pelo backend usando o id da mensagem atribuída.

```ts
const sent = await client.messages.send(chat, { image: bytes, caption: "x" });
sent.content.kind;                 // "image"
sent.text;                         // "x"
const again = await sent.attachments[0]?.download();
```

Falhas de backend são embrulhadas: erros do provedor aparecem como [`MessageError`](/pt-BR/reference/errors#messageerror) (`"Failed to send message: …"` — `rethrowAsBackendError` deixa as subclasse de `WhatsAppError` passarem inalteradas). Falhas de validação lançam erro antes de o backend ser chamado.

## Reagindo {#reacting}

```ts
await client.messages.react(message, "👍");     // via instância Message
await client.messages.react(message, null);     // remove a reação do bot
await client.messages.reactTo(chat, messageId, "👍"); // via ids brutos
```

- Emoji de string vazia → `ValidationError` (`ERR_EMPTY_REACTION`).
- Capacidade ausente no backend → `UnsupportedOperationError` (`Backend "…" does not support reactions.`).
- Falha do provedor → aparece como `MessageError` (os `WhatsAppError` da biblioteca passam por `rethrowAsBackendError` inalterados).

Entidades: `message.react("👍")`, `interaction.react("👍")` (em interações do tipo mensagem) e `reactionInteraction.react("👍")` (reage à mensagem *reagida*).

## Edição {#editing}

```ts
const updated = await client.messages.edit(sentMessage, "new text");
// ou: await interaction.edit("new text");
```

- Texto vazio → `ValidationError` (`ERR_EMPTY_MESSAGE`).
- Sem suporte no backend → `UnsupportedOperationError`.
- Retorna uma `Message` **nova** com conteúdo `{ kind: "text", text }`; mesmo id/chat/author/timestamp/referência do original. Só as mensagens do próprio bot podem ser editadas no nível do provedor (o backend/provedor impõe isso).

## Exclusão {#deleting}

```ts
await client.messages.delete(message);
// ou: await message.delete();
// ou: await interaction.delete();
```

- Sem suporte no backend → `UnsupportedOperationError`.
- Regras do provedor: suas próprias mensagens sempre; as de outros apenas se você for admin de grupo (o backend reporta falhas como `MessageError`/`PermissionError`).

## Downloads de mídia {#media-downloads}

Anexos são **lazy**: nada é baixado até você chamar `download()`.

```ts
if (interaction.isImage()) {
  const attachment = interaction.attachments[0];
  if (attachment) {
    const bytes = await attachment.download(); // → Uint8Array
    await writeFile("photo.jpg", bytes);
  }
}
```

Por baixo dos panos, o backend Baileys procura a mensagem bruta em seu cache LRU limitado (500 entradas) e baixa via provedor. Se a mensagem não estiver mais em cache, `download()` rejeita com [`NotFoundError`](/pt-BR/reference/errors#notfounderror).

::: tip Mensagens citadas também são baixadas
O mapper coloca mensagens citadas em cache sinteticamente quando chegam inline, então a mídia de `interaction.reference?.content` também costuma poder ser baixada.
:::

## Erros em um panorama {#errors-at-a-glance}

| Operação | Validação | Capacidade ausente | Falha do provedor |
| --- | --- | --- | --- |
| `send` | `ValidationError` *antes* do backend | — | `MessageError` |
| `react` | `ERR_EMPTY_REACTION` | `UnsupportedOperationError` | `MessageError` |
| `edit` | `ERR_EMPTY_MESSAGE` | `UnsupportedOperationError` | `MessageError` |
| `delete` | — | `UnsupportedOperationError` | `MessageError` |
| `attachment.download()` | — | — | `NotFoundError` / `MessageError` |

## Exemplo completo {#complete-example}

```ts
import { Client } from "libwa";

const client = new Client();

client.on("interactionCreate", async (i) => {
  if (!i.isMessage() || !i.isText() || i.isFromMe) return;

  const text = i.text.trim();

  if (text === "!file") {
    await i.reply({
      document: { data: new TextEncoder().encode("hello world"), fileName: "hello.txt" },
      caption: "Here you go",
    });
    return;
  }

  if (text === "!edit") {
    const sent = await i.reply("v1");
    await new Promise((r) => setTimeout(r, 1000));
    await client.messages.edit(sent, "v2");
    return;
  }

  await i.reply({ text: `Echo: ${text}`, mentions: [i.author.id] });
});

await client.login();
```

## Relacionados {#related}

- [Referência de mensageria](/pt-BR/reference/messaging) — `MessageService`, `MessagePayload`, `SendOptions`, `MediaSource`
- [Referência de conteúdo de mensagens](/pt-BR/reference/content) — formatos de entrada (`Attachment`, `MediaInfo`)
- [Contrato do backend](/pt-BR/reference/backend#requests) — o que o backend realmente recebe
- [Guia de grupos](/pt-BR/guide/groups) — operações específicas de grupos
