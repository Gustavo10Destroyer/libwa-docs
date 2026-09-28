# Messaging

<ApiBadge kind="class" /> `MessageService` (`client.messages`) sends, reacts, edits, and deletes messages — the only outbound path (interactions and entities delegate to it).

```ts
await client.messages.send("5511999999999@s.whatsapp.net", "hello");
await chat.send({ text: "hi", image: bytes });
await i.reply("pong");
```

## Types <ApiBadge kind="type" />

### `SendTarget`

```ts
type SendTarget = Chat | User | ChatId;
```

Any of: a `Chat`/`Group` entity, a `User` (resolves to their direct-chat id), or a raw `ChatId` string.

### `ReplyContent`

```ts
type ReplyContent = string | MessagePayload;
```

What user-facing APIs accept — a shorthand string (text body) or a structured payload.

### `MessagePayload` <ApiBadge kind="interface" />

Exactly **one body** (`text` / `image` / `video` / `audio` / `document` / `sticker` / `location`) required; captions/mentions are modifiers.

<ApiTable
  :rows="[
    { name: 'text', type: 'string', def: 'undefined', description: 'Text body.' },
    { name: 'image / video / audio / sticker', type: 'MediaSource', def: 'undefined', description: 'Raw media body (Uint8Array or { data, mimetype? }).' },
    { name: 'audio', type: 'MediaSource &amp; { voice?: boolean }', def: 'undefined', description: 'voice: true marks a push-to-talk voice note.' },
    { name: 'document', type: 'MediaSource &amp; { fileName?: string }', def: 'undefined', description: 'fileName overrides the attachment name.' },
    { name: 'caption', type: 'string', def: 'undefined', description: 'Caption for image/video/document; empty string or one for other kinds → ERR_INVALID_CAPTION.' },
    { name: 'location', type: '{ latitude, longitude, address?, name? }', def: 'undefined', description: 'Location body.' },
    { name: 'mentions', type: 'readonly (User | UserId)[]', def: 'undefined', description: 'Users to @-mention; merged with options.mentions (deduplicated).' }
  ]"
/>

### `MediaSource`

```ts
type MediaSource = Uint8Array | { data: Uint8Array; mimetype?: string };
```

Plain bytes — no provider structures. Default MIME types when not provided: image `image/jpeg`, video `video/mp4`, audio `audio/ogg; codecs=opus`, document `application/octet-stream`, sticker `image/webp`.

### `SendOptions` <ApiBadge kind="interface" />

<ApiTable
  :rows="[
    { name: 'quote', type: 'Message', def: 'undefined', description: 'Quote an explicit message entity (takes precedence over replyToMessageId).' },
    { name: 'replyToMessageId', type: 'string', def: 'undefined', description: 'Quote by id alone (e.g. reply to what a reaction targeted).' },
    { name: 'mentions', type: 'readonly (User | UserId)[]', def: 'undefined', description: 'Extra mentions merged into the payload.' }
  ]"
/>

## MessageService <ApiBadge kind="class" />

```ts
class MessageService {
  constructor(backend: WhatsAppBackend, entities: EntityFactory); // internal
  send(target: SendTarget, content: ReplyContent, options?: SendOptions): Promise<Message>;
  react(message: Message, emoji: string | null): Promise<void>;
  reactTo(chat: Chat | ChatId, messageId: string, emoji: string | null): Promise<void>;
  edit(message: Message, text: string): Promise<Message>;
  delete(message: Message): Promise<void>;
}
```

Exposed as `client.messages`. Constructor is internal — take the instance from a client.

### `send`

```ts
send(target, content, options?): Promise<Message>
```

End-to-end outbound flow: resolve target → `normalizeReplyContent(content, options)` → `backend.sendMessage(...)` → rebuild a local `Message` (`#toMessageContent`) so echoes match inbound shapes (attachments included when the backend returns media info).

<ApiTable
  :rows="[
    { name: 'target', type: 'SendTarget', description: 'Where to send. Unknown raw ids are wrapped into a Chat by the entity factory.' },
    { name: 'content', type: 'ReplyContent', description: 'String shorthand or MessagePayload.' },
    { name: 'options', type: 'SendOptions', def: 'undefined', description: 'Quoting and extra mentions.' }
  ]"
/>

**Returns:** the sent `Message`.

**Errors:** `ValidationError` (see [validation table](#validation-errors)), provider failures as `MessageError` (message `"Failed to send message: …"` — custom backends may also throw `PermissionError` / `NotFoundError` / `BackendError`). `sendMessage` is a required backend member, so there is no capability error for it.

```ts
await client.messages.send(chatId, "plain text");

await client.messages.send(user, {
  text: "with image",
  image: new Uint8Array(await readFile("cat.jpg")),
  caption: "my cat",
  mentions: [authorId],
}, { replyToMessageId: someId });
```

### `react` / `reactTo`

```ts
react(message: Message, emoji: string | null): Promise<void>
reactTo(chat: Chat | ChatId, messageId: string, emoji: string | null): Promise<void>
```

Adds (`"👍"`) or clears (`null`) **your own** reaction. `reactTo` is the id-based variant when you have no `Message` entity (e.g. reacting to a reaction's target). Empty emoji string → `ERR_EMPTY_REACTION`.

### `edit`

```ts
edit(message: Message, text: string): Promise<Message>
```

Edits **your own** text message; returns the updated `Message`.

**Errors:** `ValidationError` `ERR_EMPTY_MESSAGE` (empty text), `ERR_UNSUPPORTED` when the backend has no `editMessage`; provider failures as `BackendError` (context `Failed to edit message`).

### `delete`

```ts
delete(message: Message): Promise<void>
```

Deletes **your own** message (`ERR_UNSUPPORTED` when unsupported; provider failures → `BackendError`, context `Failed to delete message`).

## `normalizeReplyContent` <ApiBadge kind="internal" />

```ts
function normalizeReplyContent(content: ReplyContent, options?: SendOptions): NormalizedPayload
```

Validates and converts user input into `{ content: OutboundContent, mentions: UserId[] }`:

- string → `{ text }`;
- counts bodies — 0 → `ERR_EMPTY_MESSAGE`, >1 → `ERR_AMBIGUOUS_MESSAGE`;
- caption rules (`ERR_INVALID_CAPTION`), empty media `Uint8Array(0)` → `ERR_EMPTY_MEDIA`;
- resolves mentions from payload + options (entities → ids, deduplicated);
- copies `document.fileName`, `audio.voice`.

Runs **before** any backend call — every `send` path goes through it. Unit-tested directly (10 payload tests).

## Validation errors

| Code | Raised when |
| --- | --- |
| `ERR_EMPTY_MESSAGE` | No body (empty string/payload) or empty `edit` text. |
| `ERR_AMBIGUOUS_MESSAGE` | More than one body in a payload. |
| `ERR_INVALID_CAPTION` | `caption` present without an image/video/document body. |
| `ERR_EMPTY_MEDIA` | Zero-length media bytes. |
| `ERR_EMPTY_REACTION` | Empty-string emoji (`""`); `null` is valid and clears the reaction. |

All are `ValidationError` carrying the listed code, raised **before** any backend call.

## See also

- [Messaging guide](/guide/messaging) — recipes (mention, quote, voice note, echoes)
- [Message content](/reference/content) — inbound content union
- [Entities](/reference/entities#message) — the returned `Message`
