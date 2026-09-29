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

  // identity resolution (LID ↔ phone number) + account lookup
  getPhoneNumberForLid?(lid: UserId): Promise<string | null>;
  getLidForPhoneNumber?(phone: string): Promise<UserId | null>;
  fetchUser?(phone: string): Promise<BackendUserLookup>;

  // profile enrichment (either id scheme)
  getProfilePictureUrl?(id: UserId, type: ProfilePictureType): Promise<string | undefined>;
  getAbout?(id: UserId): Promise<string | undefined>;
  getBusinessProfile?(id: UserId): Promise<BackendBusinessProfile | undefined>;
}
```

| Group | Members | Failure when missing |
| --- | --- | --- |
| identity | `id` | — (required, stable, used in sessions/logs) |
| lifecycle | `connect` `disconnect` `isConnected` | core cannot work without them |
| messages | `sendMessage` `downloadMedia` | required; non-`WhatsAppError` throws are wrapped as `BackendError` (`WhatsAppError` subclasses pass through — the bundled adapter reports `MessageError`) |
| groups read | `getGroupMetadata` | required |
| events | `on` | required; core subscribes once per client |
| optional ops | `react` `editMessage` `deleteMessage` `updateGroupParticipants` `updateGroupName` `updateGroupDescription` `requestPairingCode` | `UnsupportedOperationError` (`ERR_UNSUPPORTED`) from the service, or `ValidationError` for pairing codes |
| identity | `getPhoneNumberForLid` `getLidForPhoneNumber` | no error — `client.users.resolvePhone`/`resolveLid` are lookups and resolve `undefined` when the capability is absent |
| account lookup | `fetchUser` | `client.users.fetch` raises `UnsupportedOperationError` (`ERR_UNSUPPORTED`) — existence is checked, never assumed |
| profile enrichment | `getProfilePictureUrl` `getAbout` `getBusinessProfile` | `client.users.pictureUrl` / `about` / `accountType` raise `UnsupportedOperationError` (`ERR_UNSUPPORTED`); *with* the capability, genuinely missing/hidden data resolves `undefined` (never conflated with a missing capability) |

Missing `logout` is the exception: `Client.logout()` silently skips the backend revocation when the method is absent (no error).

The identity pair works the same way by design: `resolvePhone`/`resolveLid` first answer from id pairs the library recorded from events, then fall back to these methods (the Baileys adapter reads `signalRepository.lidMapping`), and resolve `undefined` when neither knows the mapping — a lid the provider has never seen simply has no phone number to give.

### Account lookup type

`fetchUser(phone)` is the one lookup that reports back instead of resolving `undefined` — but only after `client.users` has already turned the input into **phone digits** (lids go through recorded pairs / `getPhoneNumberForLid` first, so a backend never receives a lid it cannot parse):

```ts
interface BackendUserLookup {
  exists: boolean;        // false → fetch resolves undefined
  name?: string;          // provider-known display name; wins over the remembered push name
  verifiedName?: string;  // fallback name channel (used when name is absent)
}
```

The bundled Baileys adapter implements it with WhatsApp's `onWhatsApp` query (`exists: results.some(entry => entry.exists)`).

### Profile enrichment types

Three independent lookups, each answering data-or-`undefined`:

```ts
type ProfilePictureType = "image" | "preview";

interface BackendBusinessProfile {
  description: string;                 // "" when the provider supplies none
  category: string | undefined;
  email: string | undefined;
  website: readonly string[];
  address: string | undefined;
}
```

- **`getProfilePictureUrl(id, type)`** — URL for `"image"` (default) or `"preview"`; `undefined` when the picture is absent or privacy-hidden (the Baileys adapter maps 401/403/404 to `undefined`).
- **`getAbout(id)`** — about/bio text; `undefined` when unset or hidden (`""` from the provider).
- **`getBusinessProfile(id)`** — business profile; `undefined` when the probe completes without one (a standard account). Failures throw; the Baileys adapter resolves `…@lid` inputs to phone numbers first and raises `BackendError` when the provider cannot map them.

All three accept either id scheme — [`client.users`](/reference/entities#userservice) normalizes user input before delegating.

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
| `message` | `id`, `chatId`, `chatKind`, `authorId`, `authorName?`, `timestamp`, `content`, `isFromMe`, `isForwarded`, `mentions`, `reference?`, `idPairs?` |
| `messageUpdate` | `action: "edit"\|"delete"`, `messageId`, `content?`, `authorId?`, `idPairs?` |
| `reaction` | `messageId`, `reactorId`, `emoji: string \| null` (`null` = removed), `idPairs?` |
| `groupParticipants` | `groupId`, `action`, `participantIds`, `actorId?`, `idPairs?` |
| `groupUpdate` | `groupId`, `changes: GroupUpdateChanges` |
| `connection` | `status: "connecting"\|"open"\|"close"`, `qr?`, `me?`, `reason?`, `detail?`, `pairingCode?` |

`idPairs?` (type [`BackendIdPair`](#backendeventmap)) is the optional list of LID ↔ phone-number id pairs the provider attached to the event — message key, reaction/update key, actor and affected participants. The interaction factory records every pair before the interaction is built, so [`client.users`](/reference/entities#userservice) and `User.phone` know the mapping; backends that only ever see one scheme simply omit the field.

Supporting types: `BackendMessageReference`, `BackendSelf` (`{ id, name? }`), `BackendIdPair` (`{ id, altId }` — two ids of the same account in different schemes).

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
  //           updateGroupName, updateGroupDescription, requestPairingCode, logout,
  //           getPhoneNumberForLid, getLidForPhoneNumber, fetchUser,
  //           getProfilePictureUrl, getAbout, getBusinessProfile
}
```

Checklist:

1. emit `connection` `open` once the session is usable (the client subscribes to events before calling `connect()`, so `ready` follows as soon as it arrives);
2. never let provider error classes escape — the services wrap unknown throws via `rethrowAsBackendError`;
3. classify closes into [`DisconnectReason`](/reference/disconnect-reason) values (fatal ones especially);
4. persist sessions **only** through the provided `sessionStore` (`Session { provider: id, data }`);
5. keep event payloads pure library types (no provider JIDs leaking beyond id strings);
6. when your provider reports both id schemes, fill `idPairs` (and `GroupParticipant.altId`) and consider implementing `getPhoneNumberForLid`/`getLidForPhoneNumber` — the core records pairs either way; if your provider can answer "does this phone number have an account", add `fetchUser` so `client.users.fetch` works against it; profile data (pictures, about texts, business classification) is opt-in via `getProfilePictureUrl`/`getAbout`/`getBusinessProfile`.

## See also

- [Backends guide](/guide/backends) — capabilities, QR/pairing, adapter internals
- [Architecture: backend contract](/architecture/backend-contract) — design rationale
- [Sessions](/reference/sessions) — persistence contract used by `connect`
