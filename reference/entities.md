# Entities

<ApiBadge kind="class" /> Provider data normalized into small, client-backed objects: `Chat`, `Group`, `Message`, `User`. Entities are created by [`EntityFactory`](#entityfactory) (internal) and passed to interactions.

```ts
import { type Chat, type Group, type Message, type User, phoneFromId } from "libwa";
```

## Chat <ApiBadge kind="class" />

A conversation: direct, group, broadcast, newsletter — or `unknown` for future kinds.

```ts
class Chat {
  readonly client: Client;
  readonly id: ChatId;
  readonly kind: ChatKind;
  constructor(init: ChatInit);
}
```

<ApiNote kind="warning">
The constructor refuses <code>kind: "group"</code> on the base class (throws — use <code>Group</code>, or let the factory pick). This keeps <code>group</code> chats from ever missing group-only members.
</ApiNote>

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `client` | `Client` | Owning client — `send()` delegates through it. |
| `id` | `ChatId` (`string`) | Provider chat id, e.g. `1203630…@g.us`, `5511999999999@s.whatsapp.net`. |
| `kind` | `ChatKind` | `"direct" \| "group" \| "broadcast" \| "newsletter" \| "unknown"`. |

### Getters

| Getter | Type | Notes |
| --- | --- | --- |
| `name` | `string \| undefined` | Locally known name (updated by group updates/refresh). |
| `displayName` | `string` | `name` → fallback id local part (digits before `@`). |

### Kind guards

`isGroup(): this is Group` (narrows!), `isDirect()`, `isBroadcast()`, `isNewsletter()` — each compares `kind`.

### Methods

| Method | Signature | Description |
| --- | --- | --- |
| `send` | `(content: ReplyContent) => Promise<Message>` | Sends here via `client.messages.send(this, content)`. |
| `updateName` | `(name: string \| undefined) => void` | Local-only name update (used by the factory on group updates). |
| `toString` | `() => string` | Returns `displayName`. |

```ts
if (chat.isGroup()) {
  chat.memberCount; // Group-specific member — TypeScript knows it
}
```

## Group types <ApiBadge kind="interface" />

All declared alongside `Chat` in `src/entities/Chat.ts`:

### `ChatKind`

```ts
type ChatKind = "direct" | "group" | "broadcast" | "newsletter" | "unknown";
```

### `GroupParticipant`

```ts
interface GroupParticipant {
  readonly id: UserId;
  readonly role: GroupRole;         // "member" | "admin" | "superadmin"
  readonly name: string | undefined;
}
```

### `GroupRole`

```ts
type GroupRole = "member" | "admin" | "superadmin";
```

### `GroupMetadata`

<ApiTable
  :rows="[
    { name: 'id', type: 'ChatId', description: 'Group id.' },
    { name: 'name', type: 'string', description: 'Current group subject.' },
    { name: 'description', type: 'string | undefined', description: 'Group description when set.' },
    { name: 'ownerId', type: 'UserId | undefined', description: 'Owner id when known.' },
    { name: 'createdAt', type: 'Date | undefined', description: 'Creation date when known.' },
    { name: 'participants', type: 'readonly GroupParticipant[]', description: 'Snapshot of membership + roles.' },
    { name: 'announceOnly', type: 'boolean', description: 'Announcement mode (admins only post).' },
    { name: 'locked', type: 'boolean', description: 'Group info editing locked.' }
  ]"
/>

### `GroupParticipantAction`

```ts
type GroupParticipantAction = "add" | "remove" | "promote" | "demote" | "other";
```

`"other"` is the fallback for provider actions the library does not model — never crash on it.

### `GroupUpdateChanges`

```ts
interface GroupUpdateChanges {
  readonly name?: string;
  readonly description?: string;
  readonly announceOnly?: boolean;
  readonly locked?: boolean;
}
```

Partial diff — only the keys that actually changed are present (compare with `hasNameChange` / `hasDescriptionChange`).

## Group <ApiBadge kind="class" />

```ts
class Group extends Chat
```

A `Chat` with `kind` always `"group"` plus cached [`GroupMetadata`](#groupmetadata).

### Metadata accessors

| Getter | Type | Notes |
| --- | --- | --- |
| `metadata` | `GroupMetadata \| undefined` | Cached; `undefined` until fetched. |
| `name` | `string \| undefined` (override) | Delegates to metadata, then parent cache. |
| `description` | `string \| undefined` | From metadata. |
| `owner` | `User \| undefined` | Built from `metadata.ownerId`. |
| `members` | `readonly User[]` | Built from `metadata.participants` (with `isMe` set). |
| `memberCount` | `number \| undefined` | `members.length` when metadata present. |
| `announceOnly` | `boolean \| undefined` | From metadata. |

### Methods

| Method | Signature | Description |
| --- | --- | --- |
| `refresh` | `(): Promise<this>` | Fetches metadata via `client.groups.fetch`, applies it (also refreshes `name`), returns `this`. |
| `addMembers` | `(users: (User \| UserId)[]) => Promise<void>` | Admin-only; delegates to `GroupService.addMembers`. |
| `removeMembers` | `(users: (User \| UserId)[]) => Promise<void>` | Admin-only. |
| `promote` | `(users: (User \| UserId)[]) => Promise<void>` | Members → admins. |
| `demote` | `(users: (User \| UserId)[]) => Promise<void>` | Admins → members. |
| `rename` | `(name: string) => Promise<void>` | Changes subject; empty → `ERR_EMPTY_GROUP_NAME`. |
| `setDescription` | `(description: string \| undefined) => Promise<void>` | Sets (or clears, `undefined`) description. |
| `applyMetadata` | `(metadata: GroupMetadata) => void` *(internal)* | Writes metadata + name cache without a network call. |

```ts
const group = interaction.chat.isGroup() ? interaction.chat : null;
if (group) {
  await group.refresh();
  console.log(group.memberCount, group.announceOnly);
  await group.addMembers(["5511888888888@s.whatsapp.net"]);
}
```

Full walkthrough: [Groups guide](/guide/groups).

## Message <ApiBadge kind="class" />

```ts
class Message {
  readonly id: string;
  readonly chat: Chat;
  readonly author: User;
  readonly content: MessageContent;
  readonly timestamp: Date;
  readonly isFromMe: boolean;
  readonly isForwarded: boolean;
  readonly mentions: readonly User[];
  readonly reference: MessageReference | undefined;
}
```

| Member | Type | Description |
| --- | --- | --- |
| `id` | `string` | Provider message id. |
| `chat` | `Chat` | Conversation it belongs to (a `Group` for group messages). |
| `author` | `User` | Sender (your own account for outbound echoes). |
| `content` | `MessageContent` | Discriminated payload ([reference](/reference/content)). |
| `timestamp` | `Date` | Send time. |
| `isFromMe` | `boolean` | Sent by the logged-in account. |
| `isForwarded` | `boolean` | Forward flag. |
| `mentions` | `readonly User[]` | @-mentioned users. |
| `reference` | `MessageReference \| undefined` | Quoted/updated original, when present. |

### Getters and methods

| Member | Signature | Description |
| --- | --- | --- |
| `text` | `string` | `contentText(content)`. |
| `attachments` | `readonly Attachment[]` | `contentAttachments(content)`. |
| `isReply` | `boolean` | Has a reference. |
| `reply` | `(content: ReplyContent) => Promise<Message>` | Quote-reply in this chat. |
| `react` | `(emoji: string \| null) => Promise<void>` | Add/clear your reaction. |
| `delete` | `(): Promise<void>` | Delete your own message. |

### `MessageReference` <ApiBadge kind="interface" />

```ts
interface MessageReference {
  readonly messageId: string;
  readonly chat: Chat;
  readonly author: User | undefined;
  readonly content: MessageContent | undefined;
}
```

The original message context behind replies, edits, button taps, and list selections.

## User <ApiBadge kind="class" />

```ts
class User {
  readonly id: UserId;
  readonly name: string | undefined;
  readonly isMe: boolean;
  constructor(init: UserInit);
}
```

<ApiTable
  :rows="[
    { name: 'id', type: 'UserId', description: 'Provider user id (e.g. 5511999999999@s.whatsapp.net).' },
    { name: 'name', type: 'string | undefined', description: 'Locally known display name.' },
    { name: 'isMe', type: 'boolean', description: 'True when this is the logged-in account (set by the factory).' },
    { name: 'phone', type: 'string | undefined (getter)', description: 'Digits extracted from the id, when it matches the user-JID shape.' },
    { name: 'displayName', type: 'string (getter)', description: 'name → phone → id fallback chain.' },
    { name: 'equals', type: '(other: User | UserId) => boolean', description: 'Id comparison.' }
  ]"
/>

```ts
user.phone;        // "5511999999999"
user.displayName;  // "Alice" → "5511999999999" → "5511999999999@s.whatsapp.net"
user.equals("5511999999999@s.whatsapp.net");
```

## `phoneFromId` <ApiBadge kind="function" />

```ts
function phoneFromId(id: string): string | undefined
```

Extracts digits from a standard user JID. Matches `/^(\d{5,})@(?:s\.whatsapp\.net|c\.us)$/`; any other format (groups, linked ids, other backends) → `undefined`.

```ts
phoneFromId("5511999999999@s.whatsapp.net"); // "5511999999999"
phoneFromId("120363012345678901@g.us");       // undefined
```

WhatsApp-protocol helper — `User.phone` uses it internally.

## EntityFactory <ApiBadge kind="internal" />

```ts
class EntityFactory {
  constructor(client: Client);
  user(id: UserId, name?: string | undefined): User;          // sets isMe against client.me
  chat(ref: ChatRef): Chat;                                   // picks Group for kind "group"
  message(event: BackendMessageEvent): Message;
  sentMessage(sent, content, mentions, reference): Message;   // outbound echo reconstruction
  groupMetadata(id: ChatId): GroupMetadata | undefined;
  applyGroupChanges(groupId: ChatId, changes: GroupUpdateChanges): Group;
}
```

Single place where raw backend shapes become entities; guarantees `Chat` vs `Group` selection, `isMe` tagging, and reference back-linking (`message.reference.chat` points at the same `Chat` instance). `applyGroupChanges` patches a cached group's metadata from a `groupUpdate` event (name/description/announceOnly/locked diff) so handlers see fresh values immediately. Called by `InteractionFactory`, `MessageService`, and the client; **not exported**.

## See also

- [Entities guide](/guide/events) — how entities flow through events
- [Groups reference](/reference/groups) — `GroupService` (the metadata API)
- [Interactions](/reference/interactions) — entities wrapped into events
