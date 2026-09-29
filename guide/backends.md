# Backends

A **backend** adapts a concrete WhatsApp provider to libwa's normalized domain. The core depends only on the [`WhatsAppBackend`](/reference/backend#whatsappbackend) interface, which is what makes providers swappable — and testable — without touching application code.

## Bundled backends

| Factory | Backend id | Notes |
| --- | --- | --- |
| [`createDefaultBackend()`](/reference/backend#createdefaultbackend) | `baileys` | Used when `backend` option is omitted. |
| [`createBaileysBackend(options?)`](/reference/backend#createbaileysbackend) | `baileys` | Explicit construction with [`BaileysBackendOptions`](/reference/backend#baileysbackendoptions). |

```ts
import { Client, createBaileysBackend } from "libwa";

const client = new Client({
  backend: createBaileysBackend({
    browser: ["my-bot", "2.0.0", "Linux"], // login identity shown on the phone
    syncFullHistory: false,                // default: no full history sync
  }),
});
```

`BaileysBackendOptions`:

<ApiTable
  :rows="[
    { name: 'browser', type: 'readonly [name: string, version: string, platform: string]', def: '[&quot;libwa&quot;, &quot;1.0.0&quot;, &quot;1&quot;]', description: 'Browser identity used while logging in — visible on the phone under Linked devices.' },
    { name: 'syncFullHistory', type: 'boolean', def: 'false', description: 'Ask the phone for full chat history on login. libwa still dispatches only live (notify) messages regardless.' }
  ]"
/>

## The contract

Mandatory surface (your backend must implement all of it):

```ts
interface WhatsAppBackend {
  readonly id: string;

  connect(options: BackendConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  sendMessage(request: BackendSendMessage): Promise<BackendSentMessage>;
  downloadMedia(request: BackendMediaDownload): Promise<Uint8Array>;
  getGroupMetadata(chatId: ChatId): Promise<GroupMetadata>;

  on<Name extends BackendEventName>(
    event: Name,
    listener: BackendEventListener<Name>,
  ): Unsubscribe;
}
```

Optional capabilities (checked by the core before use):

```ts
react?(request): Promise<void>;
editMessage?(request): Promise<void>;
deleteMessage?(request): Promise<void>;
updateGroupParticipants?(request): Promise<void>;
updateGroupName?(request): Promise<void>;
updateGroupDescription?(request): Promise<void>;
requestPairingCode?(phoneNumber: string): Promise<string>;
logout?(): Promise<void>;

// identity resolution — LID ↔ phone number (see "Linked ids" below)
getPhoneNumberForLid?(lid: UserId): Promise<string | null>;
getLidForPhoneNumber?(phone: string): Promise<UserId | null>;
fetchUser?(phone: string): Promise<BackendUserLookup>; // existence + name for client.users.fetch
```

<ApiNote kind="info" title="Why optional?">
Providers genuinely differ. Honest optionality + runtime checks give better errors (`UnsupportedOperationError`) than pretending every backend can do everything. See [decision #3](/architecture/design-decisions#_3-provider-behind-an-interface-with-optional-capabilities).
</ApiNote>

### Linked ids (LID ↔ phone number)

WhatsApp identifies accounts either by phone number (`5511999999999@s.whatsapp.net`) or by an opaque linked id (`…@lid`) — [the two schemes refer to the same account](https://baileys.wiki/concepts/jids), and which one arrives depends on the chat. The library keeps them together three ways:

1. **Pairs on events** — backends fill `idPairs` on `message`/`messageUpdate`/`reaction`/`groupParticipants` and `GroupParticipant.altId` on metadata whenever the provider delivered both forms; the client records every pair before dispatching the interaction.
2. **`client.users`** — `phone()`/`altId()` answer from the recorded pairs instantly; `resolvePhone()`/`resolveLid()` fall back to the optional `getPhoneNumberForLid`/`getLidForPhoneNumber` capabilities above; `fetch()` composes recorded pair → `getPhoneNumberForLid` → `fetchUser(phone)` to answer whether an account exists (and under which name).
3. **Baileys does both out of the box** — the adapter reads the provider's `signalRepository.lidMapping` store (persisted with the session, with USync lookups for numbers it has never seen).

A backend without the identity capabilities is still fully valid: `resolvePhone`/`resolveLid` simply resolve `undefined` for ids only it could have known. `fetch` is stricter by design — without `fetchUser` it raises `UnsupportedOperationError`, because existence is something you check, never assume; Baileys implements it through WhatsApp's own `onWhatsApp` query.

### `BackendConnectOptions`

Passed by the client on every `connect()`:

```ts
{
  sessionId: string;           // slot to use
  sessionStore: SessionStore;  // persistence — use ONLY this
  logger: Logger;              // provider-level diagnostics
  pairingPhoneNumber: string | undefined;
}
```

Contract rules:

- `connect()` **may be called again** on the same instance after a disconnect (the client does this for reconnection). Tear down previous state first.
- Persist **only** through the provided `sessionStore` — never your own files/DB.
- Emit normalized events; never provider payload objects.
- Raise library errors (`ConnectionError`, `MessageError`, …) instead of provider ones.

### Events

Six normalized events (see [Backend contract reference](/reference/backend#backendeventmap)):

| Event | Payload | Maps to interaction |
| --- | --- | --- |
| `message` | `BackendMessageEvent` | message / command / button / list |
| `messageUpdate` | `BackendMessageUpdateEvent` | `MessageUpdateInteraction` |
| `reaction` | `BackendReactionEvent` | `ReactionInteraction` |
| `groupParticipants` | `BackendGroupParticipantsEvent` | `GroupParticipantInteraction` |
| `groupUpdate` | `BackendGroupUpdateEvent` | `GroupUpdateInteraction` |
| `connection` | `BackendConnectionUpdate` | `qr`/`pairingCode`/`ready`/`disconnect`/`reconnecting` |

`connection` updates use `status: "connecting" | "open" | "close"`; `close` carries a library [`DisconnectReason`](/reference/disconnect-reason) — backends translate provider codes (the Baileys adapter maps Boom status codes and network errnos).

Whenever a provider event carries both id schemes of the same account, fill the optional `idPairs` field (`message`/`messageUpdate`/`reaction`/`groupParticipants`) or `GroupParticipant.altId` (metadata) — the client records the pairs before dispatch, which is what makes `client.users` and `User.phone` work for linked ids.

## Writing your own backend

Minimal skeleton (also see the test double [`MockBackend`](/development/testing#helpers)):

```ts
import type {
  BackendConnectOptions,
  BackendEventListener,
  BackendEventMap,
  BackendEventName,
  BackendMediaDownload,
  BackendSendMessage,
  BackendSentMessage,
  ChatId,
  GroupMetadata,
  Unsubscribe,
  WhatsAppBackend,
} from "libwa";

type Listener = (...args: never[]) => unknown;

class MyBackend implements WhatsAppBackend {
  readonly id = "my-backend";

  // Minimal event bus — TypedEventEmitter exists in libwa but is internal,
  // so a private map of listeners keeps the example self-contained.
  #listeners = new Map<BackendEventName, Set<Listener>>();
  #connected = false;

  #emit<Name extends BackendEventName>(event: Name, ...args: BackendEventMap[Name]): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      (listener as (...a: BackendEventMap[Name]) => unknown)(...args);
    }
  }

  async connect(options: BackendConnectOptions): Promise<void> {
    const session = await options.sessionStore.load(options.sessionId);
    // ... establish transport, restore state from session?.data
    void session;
    this.#connected = true;
    this.#emit("connection", {
      status: "open",
      qr: undefined,
      me: { id: "5511999999999@s.whatsapp.net", name: "My bot" },
      reason: undefined,
      detail: undefined,
      pairingCode: undefined,
    });
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  isConnected(): boolean {
    return this.#connected;
  }

  async sendMessage(request: BackendSendMessage): Promise<BackendSentMessage> {
    // ... deliver request.content (OutboundContent) to request.chatId
    return {
      id: "generated-id",
      chatId: request.chatId,
      chatKind: "direct",
      timestamp: new Date(),
    };
  }

  async downloadMedia(_request: BackendMediaDownload): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async getGroupMetadata(chatId: ChatId): Promise<GroupMetadata> {
    void chatId;
    throw new Error("group metadata not supported");
  }

  on<Name extends BackendEventName>(
    event: Name,
    listener: BackendEventListener<Name>,
  ): Unsubscribe {
    let set = this.#listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as Listener);
    return () => set?.delete(listener as Listener);
  }

  // optional: react, editMessage, deleteMessage, ...
}
```

Wire it in:

```ts
const client = new Client({ backend: () => new MyBackend() });
```

### Implementation checklist

1. **`id`** — stable, used in logs and in the persisted `session.provider`.
2. **Re-entrant `connect`** — destroy old sockets, ignore late events from them (generation counters, `suppressEvents` flags — see `BaileysBackend`).
3. **Session round-trip** — serialize into `Session.data` (version your format!), restore on connect, handle provider-mismatch/corruption with `ValidationError` (fail fast) or fresh init (your call — document it).
4. **Normalize ids** — produce plain `ChatId`s without device suffixes; classify `ChatKind`.
5. **Normalize content** — emit `MessageContent`; return `null`/skip for payloads that are not user-visible.
6. **Map errors** — throw library errors with `cause`; use `rethrowAsBackendError` for unknowns.
7. **History policy** — do not dispatch backfilled history as live `message` events.
8. **Capabilities** — implement only what you support; omit the rest honestly.
9. **Media** — `downloadMedia` must work for any message you have emitted (cache raw payloads yourself if needed).
10. **Tests** — drive the client end-to-end with your backend like the repo's `client.test.ts` does with `MockBackend`.

## Provider isolation (how the boundary is enforced)

| Mechanism | What it does |
| --- | --- |
| Directory rule | Only `src/backend/baileys/**` may import `@whiskeysockets/baileys`. |
| `npm run check:exports` | Builds the reachable `.d.ts` graph from `dist/index.d.ts`; fails on any provider token (`WAMessage`, `WASocket`, `makeWASocket`, `proto.`, module specifier). |
| `exports` map | Only `.` and `./package.json` — consumers cannot deep-import internal declarations. |
| Tests | Core suites use `MockBackend`; provider mapping is unit-tested with realistic fixtures. |

Details: [Public API guard](/development/public-api-guard).

## Baileys adapter internals

For the curious (all internal, under `src/backend/baileys/`):

| File | Responsibility |
| --- | --- |
| `BaileysBackend.ts` | Socket lifecycle, event wiring, send/react/edit/delete/group ops, pairing, LID ↔ phone resolution via `signalRepository.lidMapping`, 500-entry raw-message LRU, provider content conversion. Module-private class exposed via `createBaileysBackend()`. |
| `BaileysMapper.ts` | Pure payload → domain mapping (wrappers, timestamps, jids, all content kinds, reactions, group events). |
| `BaileysAuth.ts` | `AuthenticationState` over `SessionStore`; coalesced writes; `BufferJSON`; app-state key revival. |
| `BaileysDisconnect.ts` | Boom/status-code/errno → `DisconnectReason` translation. |
| `BaileysLogger.ts` | Library `Logger` → provider logger shape (`child()`, bindings). |

## Related

- [Backend reference](/reference/backend) — every type in the contract
- [Architecture: backend contract](/architecture/backend-contract) — design context
- [Event pipeline](/architecture/event-pipeline) — how backend events become interactions
- [Testing](/development/testing) — driving the client with backend doubles
