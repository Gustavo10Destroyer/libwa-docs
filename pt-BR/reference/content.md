# Conteúdo da mensagem {#message-content}

<ApiBadge kind="interface" /> `MessageContent` é uma união discriminada que descreve tudo o que uma mensagem pode carregar. Conteúdo de mídia sempre inclui um `Attachment` baixável; conteúdo de texto nunca inclui.

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

## A união {#the-union}

```ts
type MessageContent =
  | TextContent | ImageContent | VideoContent | AudioContent
  | DocumentContent | StickerContent | LocationContent | ContactContent
  | PollContent | ButtonReplyContent | ListReplyContent | UnknownContent;
```

| Kind | Interface | Campos-chave |
| --- | --- | --- |
| `"text"` | `TextContent` | `text` |
| `"image"` | `ImageContent` | `caption`, `attachment` |
| `"video"` | `VideoContent` | `caption`, `attachment` |
| `"audio"` | `AudioContent` | `attachment` |
| `"document"` | `DocumentContent` | `caption`, `attachment` |
| `"sticker"` | `StickerContent` | `attachment` |
| `"location"` | `LocationContent` | `latitude`, `longitude`, `address: string \| undefined`, `name: string \| undefined` |
| `"contact"` | `ContactContent` | `cards: readonly ContactCard[]` |
| `"poll"` | `PollContent` | `name`, `options`, `selectableCount` |
| `"buttonReply"` | `ButtonReplyContent` | `buttonId`, `title`, `displayText`, `variant` |
| `"listReply"` | `ListReplyContent` | `rowId`, `title`, `description: string \| undefined` |
| `"unknown"` | `UnknownContent` | `description` — nunca quebra com payloads novos do provedor |

`MediaMessageContent` = o subconjunto com um `attachment` (image/video/audio/document/sticker).

## Media <ApiBadge kind="interface" /> {#media}

### MediaKind {#mediakind}

```ts
type MediaKind = "image" | "video" | "audio" | "document" | "sticker";
```

### MediaInfo {#mediainfo}

Metadados base + handle de download lazy:

<ApiTable
  :rows="[
    { name: 'mimeType', type: 'string', description: 'Tipo MIME, ex.: image/jpeg.' },
    { name: 'size', type: 'number | undefined', description: 'Tamanho em bytes quando o provedor o reporta.' },
    { name: 'fileName', type: 'string | undefined', description: 'Nome original do arquivo (documentos); undefined caso contrário.' },
    { name: 'durationSeconds', type: 'number | undefined', description: 'Duração do áudio/vídeo quando conhecida.' },
    { name: 'isVoiceNote', type: 'boolean', description: 'Áudio push-to-talk do WhatsApp.' },
    { name: 'isAnimated', type: 'boolean', description: 'Sinalizador de sticker animado.' },
    { name: 'download', type: '() => Promise&lt;Uint8Array&gt;', description: 'Busca os bytes brutos sob demanda — nunca eager.' }
  ]"
/>

### Attachment {#attachment}

```ts
interface Attachment extends MediaInfo {
  readonly kind: MediaKind;
}
```

```ts
import { writeFile } from "node:fs/promises";

if (i.isMessage() && i.isDocument()) {
  const { attachment } = i.content;
  const bytes = await attachment.download();
  await writeFile(attachment.fileName ?? "file.bin", bytes);
}
```

### ContactCard {#contactcard}

```ts
interface ContactCard {
  readonly name: string;
  readonly phone: string | undefined;
}
```

## Funções auxiliares {#helpers}

### `contentText` {#contenttext}

```ts
function contentText(content: MessageContent): string
```

Retorna o texto simples associado ao conteúdo: `text` para texto, `caption` para image/video/document, `displayText` para `buttonReply`, `title` para `listReply`, `name` para `poll`, e `""` para todo o resto (audio, sticker, location, contact, unknown). Usado internamente por `MessageInteraction.text` — use-o diretamente ao trabalhar com conteúdo puro.

```ts
contentText({ kind: "text", text: "hi" });            // "hi"
contentText({ kind: "image", caption: "look", ... });  // "look"
contentText({ kind: "audio", ... });                   // ""
```

### `contentAttachments` {#contentattachments}

```ts
function contentAttachments(content: MessageContent): readonly Attachment[]
```

Retorna `[content.attachment]` quando o conteúdo tem um, `[]` caso contrário. Campo de apoio de `MessageInteraction.attachments`.

## Veja também {#see-also}

- [Interações](/pt-BR/reference/interactions) — onde o conteúdo é exposto
- [Mensageria](/pt-BR/reference/messaging) — produção de conteúdo no envio
- [Guia de mensagens](/pt-BR/guide/messaging) — formas de envio e exemplos
