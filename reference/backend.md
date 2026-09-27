# Backend

<ApiBadge kind="interface" /> `WhatsAppBackend` is the provider-adapter contract — the seam that hides Baileys (or any future provider). The core depends on nothing else.

```ts
import type { WhatsAppBackend } from "libwa";
import { createDefaultBackend, createBaileysBackend } from "libwa";

new Client({ backend: createBaileysBackend({ syncFullHistory: false }) });
```

## WhatsAppBackend <ApiBadge kind="interface" />

```ts
interface WhatsAppBackend {
  readonly id: string; // e.g. "baileys"

  // lifecycle
  connect(options: BackendConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // mandatory operations
  sendMessage(request: BackendSendMessage): Promise<BackendSentMessage>;
  downloadMedia(request: BackendMediaDownload): Promise<Uint8Array>;
  getGroupMetadata(chatId: ChatId): Promise<GroupMetadata>;

  // events
  on<Name extends BackendEventName>(event: Name, listener: BackendEventListener<Name>): Unsubscribe;

  // optional capabilities (feature-detectable)
  react?(request: BackendReactRequest): Promise<void>;
  editMessage?(request: BackendEditMessageRequest): Promise<void>;
  deleteMessage?(request: BackendDeleteMessageRequest): Promise<void>;
  updateGroupParticipants?(request: BackendGroupParticipantsRequest): Promise<void>;
  updateGroupName?(request: BackendGroupNameRequest): Promise<void>;
  updateGroupDescription?(request: BackendGroupDescriptionRequest): Promise<void>;
  requestPairingCode?(phoneNumber: string): Promise<string>;
  logout?(): Promise<void>;
}
```

| Group | Members | Failure when missing |
| --- | --- | --- |
| identity | `id` | — (required, stable, used in sessions/logs) |
| lifecycle | `connect` `disconnect` `isConnected` | core cannot work without them |
| messages | `sendMessage` `downloadMedia` | required; core raises `BackendError` on provider errors |
| groups read | `getGroupMetadata` | required |
| events | `on` | required; core subscribes once per client |
| optional ops | `react` `editMessage` `deleteMessage` `updateGroupParticipants` `updateGroupName` `updateGroupDescription` `requestPairingCode` `logout` | `UnsupportedOperationError` (`ERR_UNSUPPORTED`) from the service, or `ValidationError` for pairing codes |

Capability detection in user code:

```ts
if (client.backend.react) { /* supported */ }
```

## BackendConnectOptions <ApiBadge kind="interface" />

Everything a backend needs from the client to connect:

<ApiTable
  :rows="[
    { name: 'sessionId', type: 'string', description: 'Slot id (ClientOptions.sessionId).' },
    { name: 'sessionStore', type: 'SessionStore', description: 'Load/save the opaque provider session.' },
    { name: 'logger', type: 'Logger', description: 'Provider diagnostics — your injected logger instance.' },
    { name: 'pairingPhoneNumber', type: 'string | undefined', description: 'International digits to auto-request a pairing code, when configured.' }
  ]"
/>

`connect()` may be called again after `disconnect()` (reconnect path) — backends must support repeated connects.

## Outbound types

### `OutboundContent`

Content the core hands to `sendMessage` — already validated by `normalizeReplyContent`:

```ts
type OutboundContent =
  | { kind: "text"; text: string }
  | { kind: "image" | "video" | "audio" | "document" | "sticker";
      data: Uint8Array; mimetype: string | undefined; fileName: string | undefined;
      caption: string | undefined; voice: boolean;
      durationSeconds: number | undefined; animated: boolean }
  | { kind: "location"; latitude: number; longitude: number;
      address: string | undefined; name: string | undefined };
```

### Requests <ApiBadge kind="interface" />

| Type | Fields |
| --- | --- |
| `BackendSendMessage` | `chatId`, `content`, `replyToMessageId \| undefined`, `mentionUserIds` |
| `BackendSentMessage` | `id`, `chatId`, `chatKind`, `timestamp` — provider confirmation |
| `BackendMediaDownload` | `chatId`, `messageId` |
| `BackendReactRequest` | `chatId`, `messageId`, `emoji: string \| null` (`null` clears) |
| `BackendEditMessageRequest` | `chatId`, `messageId`, `text` |
| `BackendDeleteMessageRequest` | `chatId`, `messageId` |
| `BackendGroupParticipantsRequest` | `chatId`, `userIds`, `action: "add"\|"remove"\|"promote"\|"demote"` |
| `BackendGroupNameRequest` | `chatId`, `name` |
| `BackendGroupDescriptionRequest` | `chatId`, `description: string \| undefined` (`undefined` clears) |

All fields `readonly`; requests are plain data — no provider structures.

## `BackendEventMap`

```ts
interface BackendEventMap {
  message: [event: BackendMessageEvent];
  messageUpdate: [event: BackendMessageUpdateEvent];
  reaction: [event: BackendReactionEvent];
  groupParticipants: [event: BackendGroupParticipantsEvent];
  groupUpdate: [event: BackendGroupUpdateEvent];
  connection: [event: BackendConnectionUpdate];
}
```

The six normalized events — the **only** channel through which state flows in. Payloads:

| Event | Payload highlights |
| --- | --- |
| `message` | `id`, `chatId`, `chatKind`, `authorId`, `authorName?`, `timestamp`, `content`, `isFromMe`, `isForwarded`, `mentions`, `reference?` |
| `messageUpdate` | `action: "edit"\|"delete"`, `messageId`, `content?`, `authorId?` |
| `reaction` | `messageId`, `reactorId`, `emoji: string \| null` (`null` = removed) |
| `groupParticipants` | `groupId`, `action`, `participantIds`, `actorId?` |
| `groupUpdate` | `groupId`, `changes: GroupUpdateChanges` |
| `connection` | `status: "connecting"\|"open"\|"close"`, `qr?`, `me?`, `reason?`, `detail?`, `pairingCode?` |

Supporting types: `BackendMessageReference`, `BackendSelf` (`{ id, name? }`).

Event **listener type**: `BackendEventListener<Name> = (...args: BackendEventMap[Name]) => void`; `on()` returns an `Unsubscribe`.

```ts
const stop = backend.on("connection", (u) => {
  if (u.status === "open") console.log("open as", u.me?.id);
});
stop();
```

## `createDefaultBackend`

```ts
function createDefaultBackend(): WhatsAppBackend
```

Returns `createBaileysBackend()` with defaults. The **only** core module that references the provider factory (keeps the rest provider-free) — and it is exported so you can inspect/replace the default explicitly:

```ts
new Client();                                  // resolveClientOptions → undefined → this
new Client({ backend: createDefaultBackend() }); // explicit, identical
```

## `createBaileysBackend` <ApiBadge kind="function" />

```ts
function createBaileysBackend(options?: BaileysBackendOptions): WhatsAppBackend
```

The bundled Baileys adapter (`id: "baileys"`). The class itself is module-private — only this factory exists.

### `BaileysBackendOptions` <ApiBadge kind="interface" />

<ApiTable
  :rows="[
    { name: 'browser', type: 'readonly [name: string, version: string, platform: string]', def: '[&quot;libwa&quot;, &quot;1.0.0&quot;, &quot;1&quot;]', description: 'Browser identity shown on the phone under Linked devices.' },
    { name: 'syncFullHistory', type: 'boolean', def: 'false', description: 'Ask WhatsApp for full chat history on login — usually unwanted for bots.' }
  ]"
/>

```ts
createBaileysBackend({ browser: ["mybot", "2.0.0", "Chrome"], syncFullHistory: true });
```

Adapter internals (mapping, auth, disconnect classification) live in `src/backend/baileys/` — see [Backends guide](/guide/backends#baileys-adapter-internals) and [Architecture: backend contract](/architecture/backend-contract).

## Implementing a backend

```ts
import type { WhatsAppBackend, BackendEventMap, Unsubscribe } from "libwa";
import { TypedEventEmitter } from "./emitter.js"; // your own emitter (not exported)

class MyBackend implements WhatsAppBackend {
  readonly id = "myprovider";
  #events = new EventEmitter<BackendEventMap>();

  async connect(o: BackendConnectOptions) { /* open socket, hydrate o.sessionStore */ }
  async disconnect() { /* close, keep session */ }
  isConnected() { return this.#open; }

  async sendMessage(r: BackendSendMessage) { /* … → BackendSentMessage */ }
  async downloadMedia(r: BackendMediaDownload) { return bytes; }
  async getGroupMetadata(chatId: string) { /* … → GroupMetadata */ }

  on<Name extends keyof BackendEventMap>(event: Name, l: (...a: BackendEventMap[Name]) => void): Unsubscribe {
    return this.#events.on(event, l);
  }

  // optional: react, editMessage, deleteMessage, updateGroupParticipants,
  //           updateGroupName, updateGroupDescription, requestPairingCode, logout
}
```

Checklist:

1. emit `connection` `open` **before** `connect()` resolves (the client's first `ready` depends on it);
2. never let provider error classes escape — the services wrap unknown throws via `rethrowAsBackendError`;
3. classify closes into [`DisconnectReason`](/reference/disconnect-reason) values (fatal ones especially);
4. persist sessions **only** through the provided `sessionStore` (`Session { provider: id, data }`);
5. keep event payloads pure library types (no provider JIDs leaking beyond id strings).

## See also

- [Backends guide](/guide/backends) — capabilities, QR/pairing, adapter internals
- [Architecture: backend contract](/architecture/backend-contract) — design rationale
- [Sessions](/reference/sessions) — persistence contract used by `connect`
