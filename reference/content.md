# Message content

<ApiBadge kind="interface" /> `MessageContent` is a discriminated union describing everything a message can carry. Media content always includes a downloadable `Attachment`; text-like content never does.

```ts
import type { MessageContent, TextContent } from "libwa";

function describe(c: MessageContent): string {
  switch (c.kind) {
    case "text": return c.text;
    case "image": return `image: ${c.caption}`;
    case "poll": return `${c.name} (${c.options.length} options)`;
    default: return c.kind;
  }
}
```

## The union

```ts
type MessageContent =
  | TextContent | ImageContent | VideoContent | AudioContent
  | DocumentContent | StickerContent | LocationContent | ContactContent
  | PollContent | ButtonReplyContent | ListReplyContent | UnknownContent;
```

| Kind | Interface | Key fields |
| --- | --- | --- |
| `"text"` | `TextContent` | `text` |
| `"image"` | `ImageContent` | `caption`, `attachment` |
| `"video"` | `VideoContent` | `caption`, `attachment` |
| `"audio"` | `AudioContent` | `attachment` |
| `"document"` | `DocumentContent` | `caption`, `attachment` |
| `"sticker"` | `StickerContent` | `attachment` |
| `"location"` | `LocationContent` | `latitude`, `longitude`, `address?`, `name?` |
| `"contact"` | `ContactContent` | `cards: ContactCard[]` |
| `"poll"` | `PollContent` | `name`, `options`, `selectableCount` |
| `"buttonReply"` | `ButtonReplyContent` | `buttonId`, `title`, `displayText`, `variant` |
| `"listReply"` | `ListReplyContent` | `rowId`, `title`, `description?` |
| `"unknown"` | `UnknownContent` | `description` — never crashes on new provider payloads |

`MediaMessageContent` = the subset with an `attachment` (image/video/audio/document/sticker).

## Media <ApiBadge kind="interface" />

### MediaKind

```ts
type MediaKind = "image" | "video" | "audio" | "document" | "sticker";
```

### MediaInfo

Base metadata + lazy download handle:

<ApiTable
  :rows="[
    { name: 'mimeType', type: 'string', description: 'MIME type, e.g. image/jpeg.' },
    { name: 'size', type: 'number | undefined', description: 'Byte size when the provider reports it.' },
    { name: 'fileName', type: 'string | undefined', description: 'Original file name (documents); undefined otherwise.' },
    { name: 'durationSeconds', type: 'number | undefined', description: 'Audio/video duration when known.' },
    { name: 'isVoiceNote', type: 'boolean', description: 'WhatsApp push-to-talk audio.' },
    { name: 'isAnimated', type: 'boolean', description: 'Animated sticker flag.' },
    { name: 'download', type: '() => Promise&lt;Uint8Array&gt;', description: 'Fetches the raw bytes on demand — never eager.' }
  ]"
/>

### Attachment

```ts
interface Attachment extends MediaInfo {
  readonly kind: MediaKind;
}
```

```ts
if (i.isMessage() && i.isDocument()) {
  const { attachment } = i.content;
  const bytes = await attachment.download();
  await Deno.writeFile(attachment.fileName ?? "file.bin", bytes);
}
```

### ContactCard

```ts
interface ContactCard {
  readonly name: string;
  readonly phone: string | undefined;
}
```

## Helpers

### `contentText`

```ts
function contentText(content: MessageContent): string
```

Returns the plain text associated with content: `text` for text, `caption` for image/video/document, `""` otherwise (including `unknown`). Used internally by `MessageInteraction.text` — use it directly when working with bare content.

```ts
contentText({ kind: "text", text: "hi" });            // "hi"
contentText({ kind: "image", caption: "look", ... });  // "look"
contentText({ kind: "audio", ... });                   // ""
```

### `contentAttachments`

```ts
function contentAttachments(content: MessageContent): readonly Attachment[]
```

Returns `[content.attachment]` when the content has one, `[]` otherwise. Backing field for `MessageInteraction.attachments`.

## See also

- [Interactions](/reference/interactions) — where content is exposed
- [Messaging](/reference/messaging) — producing content on send
- [Messaging guide](/guide/messaging) — send shapes and examples
