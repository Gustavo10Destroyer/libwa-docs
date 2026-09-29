# Messaging

Outgoing messages go through [`client.messages`](/reference/messaging) (a [`MessageService`](/reference/messaging#messageservice)). Entities (`Chat.send`, `Message.reply`, `Message.react`, interactions' `reply()`) are thin wrappers over it — all paths share one validation and normalization step.

## Sending

```ts
const sent = await client.messages.send(target, content, options?);
```

### Targets

`SendTarget = Chat | User | ChatId`:

| Target | Resolved chat |
| --- | --- |
| `Chat` / `Group` instance | Used directly (its `id` and `kind`). |
| `User` instance | Treated as a direct chat (`kind: "direct"`, chat id = user id). |
| `string` chat id | Known chats reuse their cached instance; unknown ids create an `"unknown"`-kind chat that upgrades when better data arrives. |

```ts
import { Client } from "libwa";

const client = new Client();

await client.messages.send("5511999999999@s.whatsapp.net", "Hello!");
await client.messages.send("123456789@g.us", { text: "Hello group!" });

const chat = /* from an interaction */;
await chat.send("sent via entity");            // chat.send(content) → messages.send(chat, content)
await interaction.reply("sent via interaction"); // quotes the relevant message
```

### Content: strings and payloads

`ReplyContent = string | MessagePayload`.

```ts
await client.messages.send(chat, "plain text");
```

A structured payload must contain **exactly one body** — `text`, `image`, `video`, `audio`, `document`, `sticker` or `location`:

```ts
await client.messages.send(chat, {
  image: imageBytes,                       // Uint8Array
  caption: "Look at this!",
  mentions: ["5511999999999@s.whatsapp.net"],
});

await client.messages.send(chat, {
  image: { data: bytes, mimetype: "image/png" }, // explicit MIME
  caption: "png",
});

await client.messages.send(chat, {
  audio: { data: voiceBytes, voice: true },      // voice note (push-to-talk)
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

#### Validation rules (`normalizeReplyContent`)

Normalization runs **before** the backend is touched. Violations throw [`ValidationError`](/reference/errors#validationerror):

| Rule | Code |
| --- | --- |
| String content must be non-empty | `ERR_EMPTY_MESSAGE` |
| Payload must have exactly one body | `ERR_EMPTY_MESSAGE` (0) / `ERR_AMBIGUOUS_MESSAGE` (>1) |
| `text` body must be non-empty | `ERR_EMPTY_MESSAGE` |
| `caption` only with `image` / `video` / `document` | `ERR_INVALID_CAPTION` |
| Media bytes must be non-empty (`byteLength > 0`) | `ERR_EMPTY_MEDIA` |

Defaults applied when omitted:

| Field | Default |
| --- | --- |
| `image` mimetype | `image/jpeg` |
| `video` | `video/mp4` |
| `audio` | `audio/ogg; codecs=opus` |
| `document` | `application/octet-stream` |
| `sticker` | `image/webp` |
| `document.fileName` | `"document"` |
| `audio.voice` | `false` |

Mentions are collected from **both** `payload.mentions` and `options.mentions`, deduplicated, and passed to the backend. Ids may be phone-number jids or LIDs — pass them exactly as the event delivered them (see [Linked ids](/guide/groups#linked-ids-lids-and-mentions)).

### Send options

<ApiTable
  :rows="[
    { name: 'quote', type: 'Message', def: 'undefined', description: 'Quote an explicit message instance (takes precedence over replyToMessageId).' },
    { name: 'replyToMessageId', type: 'string', def: 'undefined', description: 'Quote by id alone — used when only an id is known (e.g. replying to the message a reaction targeted).' },
    { name: 'mentions', type: 'readonly (User | UserId)[]', def: 'undefined', description: 'Extra users to @-mention, merged with payload mentions.' }
  ]"
/>

```ts
const sent = await client.messages.send(chat, "about this", { quote: someMessage });
```

### What you get back

`send()` resolves to a domain [`Message`](/reference/entities#message) built from the backend confirmation:

- id/timestamp/chatKind from the provider,
- `author` = the logged-in user, `isFromMe: true`,
- content converted back into the `MessageContent` union — media attachments get a **lazy `download()`** that fetches bytes through the backend using the assigned message id.

```ts
const sent = await client.messages.send(chat, { image: bytes, caption: "x" });
sent.content.kind;                 // "image"
sent.text;                         // "x"
const again = await sent.attachments[0]?.download();
```

Backend failures are wrapped: provider errors surface as [`MessageError`](/reference/errors#messageerror) (`"Failed to send message: …"` — `rethrowAsBackendError` passes `WhatsAppError` subclasses through unchanged). Validation failures throw before the backend is called.

## Reacting

```ts
await client.messages.react(message, "👍");     // via Message instance
await client.messages.react(message, null);     // remove the bot's reaction
await client.messages.reactTo(chat, messageId, "👍"); // via raw ids
```

- Empty string emoji → `ValidationError` (`ERR_EMPTY_REACTION`).
- Missing backend capability → `UnsupportedOperationError` (`Backend "…" does not support reactions.`).
- Provider failure → surfaces as `MessageError` (library `WhatsAppError`s pass through `rethrowAsBackendError` unchanged).

Entities: `message.react("👍")`, `interaction.react("👍")` (on message-ish interactions), and `reactionInteraction.react("👍")` (reacts to the *reacted* message).

## Editing

```ts
const updated = await client.messages.edit(sentMessage, "new text");
// or: await interaction.edit("new text");
```

- Empty text → `ValidationError` (`ERR_EMPTY_MESSAGE`).
- No backend support → `UnsupportedOperationError`.
- Returns a **new** `Message` with `{ kind: "text", text }` content; same id/chat/author/timestamp/reference as the original. Only the bot's own messages can be edited at the provider level (the backend/provider enforces that).

## Deleting

```ts
await client.messages.delete(message);
// or: await message.delete();
// or: await interaction.delete();
```

- No backend support → `UnsupportedOperationError`.
- Provider rules: your own messages always; others only if you are a group admin (the backend surfaces failures as `MessageError`/`PermissionError`).

## Media downloads

Attachments are **lazy**: nothing downloads until you call `download()`.

```ts
if (interaction.isImage()) {
  const attachment = interaction.attachments[0];
  if (attachment) {
    const bytes = await attachment.download(); // → Uint8Array
    await writeFile("photo.jpg", bytes);
  }
}
```

Under the hood the Baileys backend looks the raw message up in its bounded LRU cache (500 entries) and downloads via the provider. If the message is no longer cached, `download()` rejects with [`NotFoundError`](/reference/errors#notfounderror).

::: tip Quoted messages download too
The mapper caches quoted messages synthetically when they arrive inline, so `interaction.reference?.content` media can often be downloaded as well.
:::

## Errors at a glance

| Operation | Validation | Missing capability | Provider failure |
| --- | --- | --- | --- |
| `send` | `ValidationError` *before* backend | — | `MessageError` |
| `react` | `ERR_EMPTY_REACTION` | `UnsupportedOperationError` | `MessageError` |
| `edit` | `ERR_EMPTY_MESSAGE` | `UnsupportedOperationError` | `MessageError` |
| `delete` | — | `UnsupportedOperationError` | `MessageError` |
| `attachment.download()` | — | — | `NotFoundError` / `MessageError` |

## Complete example

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

## Related

- [Messaging reference](/reference/messaging) — `MessageService`, `MessagePayload`, `SendOptions`, `MediaSource`
- [Message content reference](/reference/content) — inbound shapes (`Attachment`, `MediaInfo`)
- [Backend contract](/reference/backend#requests) — what the backend actually receives
- [Groups guide](/guide/groups) — group-specific operations
