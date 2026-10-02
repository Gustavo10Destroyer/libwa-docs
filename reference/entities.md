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
| `displayName` | `string` | `name` → fallback to the full `id`. |

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
  readonly altId?: UserId | undefined;
  readonly role: GroupRole;         // "member" | "admin" | "superadmin"
  readonly name: string | undefined;
  readonly username?: string | undefined;
}
```

`id` is the member's id in whatever scheme the provider reported for this group — phone-number JID or [linked id](/reference/ids#userid). `altId` is the same member's id in the *other* scheme (LID ↔ phone number), present when the provider delivered both forms; it is what lets you resolve a phone number for a linked id even for members who later leave the group. `name` is the participant label from group metadata (when present it seeds the member's remembered `user.name`), `username` the member's `@handle` — both raw provider fields.

### `GroupMember`

```ts
interface GroupMember {
  readonly user: User;              // account-level entity — same instance as interaction.author
  readonly role: GroupRole;         // inside this group only
}
```

Membership is **group-scoped**: roles differ per group, so they never live on [`User`](#user). Produced by [`Group.members`](#metadata-accessors) and [`Group.member()`](#methods), and attached to every group interaction as [`interaction.member`](/reference/interactions#interaction).

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
| `metadata` | `GroupMetadata \| undefined` | Cached; `undefined` until resolved (at most 60s old — see [Groups](/reference/groups#ensure)). Group interactions arrive with it already resolved (see [event pipeline](/architecture/event-pipeline#_4-client-subscription)). |
| `name` | `string \| undefined` (override) | Delegates to metadata, then parent cache. |
| `description` | `string \| undefined` | From metadata. |
| `owner` | `User \| undefined` | Built from `metadata.ownerId`. |
| `members` | `readonly GroupMember[]` | Built from `metadata.participants` — each entry pairs the account's `User` with its `role` here (empty until metadata is fetched). |
| `memberCount` | `number \| undefined` | `members.length` when metadata present. |
| `announceOnly` | `boolean \| undefined` | From metadata. |

### Methods

| Method | Signature | Description |
| --- | --- | --- |
| `member` | `(target: User \| UserId) => GroupMember \| undefined` | Membership of one account here: accepts a `User` (kept as-is inside the member) or a raw id in either scheme — ids match across schemes through recorded id pairs. `undefined` while metadata is unknown or the account is not a participant. |
| `refresh` | `(): Promise<this>` | Fetches metadata via `client.groups.fetch`, applies it (also refreshes `name`), returns `this`. |
| `addMembers` | `(users: (User \| UserId)[]) => Promise<void>` | Admin-only; delegates to `GroupService.addMembers`. |
| `removeMembers` | `(users: (User \| UserId)[]) => Promise<void>` | Admin-only. |
| `promote` | `(users: (User \| UserId)[]) => Promise<void>` | Members → admins. |
| `demote` | `(users: (User \| UserId)[]) => Promise<void>` | Admins → members. |
| `rename` | `(name: string) => Promise<void>` | Changes subject; empty → `ERR_EMPTY_GROUP_NAME`. |
| `setDescription` | `(description: string \| undefined) => Promise<void>` | Sets (or clears, `undefined`) description. |
| `applyMetadata` | `(metadata: GroupMetadata) => void` *(internal)* | Writes metadata + name cache without a network call. |

```ts
if (interaction.isFromGroup()) {
  // group interactions already carry resolved metadata (≤60s cache, kept
  // current by events); call group.refresh() whenever you need a fresh fetch
  console.log(interaction.group.memberCount, interaction.group.announceOnly);
  interaction.member?.role;                 // the author's role in this group
  interaction.group.member("222@s.whatsapp.net")?.role;
  await interaction.group.addMembers(["5511888888888@s.whatsapp.net"]);
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
| `delete` | `(): Promise<void>` | Delete this message (no ownership check in libwa — e.g. group admins deleting others'). |

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
    { name: 'id', type: 'UserId', description: 'WhatsApp user id: phone-number JID (5511999999999@s.whatsapp.net) or linked id (…@lid) — the two schemes of one account, explained on the ids page (UserId).' },
    { name: 'name', type: 'string | undefined', description: 'Provider-reported display name (push name / profile name). Remembered across events: once a name has been seen for an account, later id-only payloads answer with it too (either id scheme). Never a contact-list name — the library does not sync your address book.' },
    { name: 'isMe', type: 'boolean', description: 'True when this is the logged-in account (set by the factory).' },
    { name: 'phone', type: 'string | undefined (getter)', description: 'Phone digits: derived from the id when it is a phone JID, otherwise from a resolved LID ↔ phone pair (populated as pairs arrive, or via client.users.resolvePhone).' },
    { name: 'displayName', type: 'string (getter)', description: 'name → phone → id fallback chain. An unresolved linked id falls back to the raw …@lid value.' },
    { name: 'equals', type: '(other: User | UserId) => boolean', description: 'Id comparison.' }
  ]"
/>

```ts
user.phone;        // "5511999999999"
user.displayName;  // "Alice" → "5511999999999" → "5511999999999@s.whatsapp.net"
user.equals("5511999999999@s.whatsapp.net");
```

Users are value objects recreated per event — nothing is cached, so `phone` reflects the pairs known **when the event was built**. Two things do carry over between events: `name`, remembered from the most recent payload that carried one (see [`client.users`](#userservice) for the id-only → named flow), and pairs recorded under the hood. For lookups at any later point use [`client.users`](#userservice).

## `phoneFromId` <ApiBadge kind="function" />

```ts
function phoneFromId(id: string): string | undefined
```

Extracts digits from a standard user JID. Matches `/^(\d{5,})@(?:s\.whatsapp\.net|c\.us)$/`; any other format (groups, **linked ids**, other backends) → `undefined`.

```ts
phoneFromId("5511999999999@s.whatsapp.net"); // "5511999999999"
phoneFromId("120363012345678901@g.us");       // undefined
phoneFromId("123456789012345@lid");           // undefined — LIDs carry no digits
```

WhatsApp-protocol helper — `User.phone` uses it internally. It never resolves a linked id; that is what [`client.users`](#userservice) is for.

## UserService <ApiBadge kind="class" />

```ts
class UserService {
  phone(id: UserId): string | undefined;
  altId(id: UserId): UserId | undefined;
  resolvePhone(id: UserId): Promise<string | undefined>;
  resolveLid(id: UserId): Promise<UserId | undefined>;
  fetch(id: string): Promise<User | undefined>;
  pictureUrl(id: string, type?: ProfilePictureType): Promise<string | undefined>;
  about(id: string): Promise<string | undefined>;
  accountType(id: string): Promise<AccountType>;
}
```

`client.users` — resolution between WhatsApp's two user-id schemes ([phone JID ↔ linked id](/reference/ids#userid)), plus account fetches and profile enrichment. Id pairs reported alongside messages, group metadata and membership events are recorded by the core as they arrive; these methods answer from that store first and only consult the backend's optional `getPhoneNumberForLid` / `getLidForPhoneNumber` / `fetchUser` / `getProfilePictureUrl` / `getAbout` / `getBusinessProfile` capabilities when nothing is known yet.

<ApiTable
  :rows="[
    { name: 'phone', type: '(id) => string | undefined', description: 'Phone digits for an id — from the id itself or a recorded pair. Synchronous, no I/O; undefined when unknown.' },
    { name: 'altId', type: '(id) => UserId | undefined', description: 'The same account\u0027s id in the other scheme (LID ↔ phone JID), from recorded pairs. Synchronous, no I/O.' },
    { name: 'resolvePhone', type: '(id) => Promise<string | undefined>', description: 'Phone digits, asking the provider when no pair is known. Phone ids answer instantly; unsupported backends and unresolvable ids resolve undefined; provider failures throw BackendError.' },
    { name: 'resolveLid', type: '(id) => Promise<UserId | undefined>', description: 'Linked id for a phone-number id, same fallback rules. A …@lid id answers with itself.' },
    { name: 'fetch', type: '(id) => Promise<User | undefined>', description: 'Account existence + name. Accepts a phone JID (…@s.whatsapp.net, legacy …@c.us, optional :device suffix), bare digits (optional +), or a …@lid. Lids resolve through recorded pairs / getPhoneNumberForLid first, then the phone digits are checked with the fetchUser capability. Resolves undefined when no account exists or the lid cannot be mapped.' },
    { name: 'pictureUrl', type: '(id, type?) => Promise<string | undefined>', description: 'Profile-picture URL (type: \u0022image\u0022 (default, full size) or \u0022preview\u0022). Same id forms as fetch. undefined when the picture is absent or private. Capability: getProfilePictureUrl.' },
    { name: 'about', type: '(id) => Promise<string | undefined>', description: 'About/bio text (\u0022status\u0022). Same id forms as fetch. undefined when unset or hidden. Capability: getAbout.' },
    { name: 'accountType', type: '(id) => Promise<AccountType>', description: '\u0022business\u0022 when the provider reports a business profile, \u0022standard\u0022 when the probe finds none. Same id forms as fetch. Capability: getBusinessProfile (classification is a probe — one extra round-trip).' }
  ]"
/>

```ts
const digits = await client.users.resolvePhone(i.author.id); // "5511999999999" | undefined
const lid = await client.users.resolveLid("5511999999999@s.whatsapp.net"); // "…@lid" | undefined

if (digits !== undefined) {
  await i.reply(`hello @${digits}`, { mentions: [i.author.id] });
}

// existence check under either id scheme — returns the User when the account exists
const user = await client.users.fetch("5511999999999"); // or a full phone JID, or "…@lid"
console.log(user?.id, user?.name);
```

### `fetch(id)` in detail

| Input | Example | Resolution |
| --- | --- | --- |
| phone JID | `5511999999999@s.whatsapp.net` | checked directly |
| legacy / device suffix | `5511999999999@c.us`, `5511999999999:12@s.whatsapp.net` | canonicalized to `digits@s.whatsapp.net` |
| bare digits | `5511999999999`, `+5511999999999` | normalized, then checked |
| linked id | `123456789012345@lid` | recorded pair or `getPhoneNumberForLid` → phone digits → `fetchUser`; unresolvable → `undefined` |

Rules:

- **Return value mirrors the lookup contract.** `undefined` = no account (or an unresolvable lid); an existing account returns a `User` whose `name` prefers the lookup's `name` / `verifiedName` and otherwise falls back to the remembered push name.
- **Capability, not a guess.** A backend without `fetchUser` raises `UnsupportedOperationError`; a backend without linked-id resolution raises `UnsupportedOperationError` for lids only. Existence is never assumed.
- **Errors:** `ValidationError` `ERR_INVALID_USER_ID` (not one of the formats above), `UnsupportedOperationError` (missing capabilities), `BackendError` (provider failure — `WhatsAppError` subclasses pass through).

<ApiNote kind="info" title="Mentions keep the id as received">
Pass mention ids exactly as the event delivered them (a `…@lid` in a LID-addressed group) — that is already the scheme the chat uses. Use `resolvePhone` only for the human-readable `@…` text (see the [groups guide](/guide/groups#linked-ids-lids-and-mentions)).
</ApiNote>

### Profile enrichment in detail

```ts
await client.users.pictureUrl("5511999999999");            // "https://…" | undefined
await client.users.pictureUrl(user.id, "preview");         // small variant
await client.users.about(user.id);                         // "living la vida loca" | undefined
await client.users.accountType(user.id);                   // "standard" | "business"
```

- **Same input table as [`fetch(id)`](#fetch-id-in-detail)** — phone JID, legacy/device suffix, bare digits, `+…`, or `…@lid`; anything else throws `ValidationError` (`ERR_INVALID_USER_ID`) before any I/O.
- **`pictureUrl`** — `type` is `"image"` (default, full size) or `"preview"`. The URL comes straight from the provider: fetch and cache it yourself; the library never downloads pictures. Absent or privacy-hidden pictures resolve `undefined`.
- **`about`** — the account's about/bio text (WhatsApp's "status"). Unset, hidden (`""` from the provider) or unknown resolve `undefined`.
- **`accountType`** — `AccountType = "standard" | "business"`. Providers expose no single "business flag", so this probes the business profile: a profile found → `"business"`, probe completed without one → `"standard"`.
- **Errors:** `UnsupportedOperationError` (backend lacks `getProfilePictureUrl` / `getAbout` / `getBusinessProfile`), `BackendError` on provider failures, `ValidationError` (`ERR_INVALID_USER_ID`) for malformed ids.

```ts
const url = await client.users.pictureUrl(user.id).catch(() => undefined);
const type = await client.users.accountType(user.id); // may throw UnsupportedOperationError
```

## EntityFactory <ApiBadge kind="internal" />

```ts
class EntityFactory {
  constructor(client: Client);
  get me(): User | null;
  setSelf(self: BackendSelf): User;
  recordIdPairs(pairs: readonly BackendIdPair[] | undefined): void;  // cross-scheme pairs only
  phoneFor(id: UserId): string | undefined;                          // id itself or recorded pair
  altIdFor(id: UserId): UserId | undefined;                          // counterpart in the other scheme
  rememberName(id: UserId, name: string | undefined): void;          // store a display name under both id schemes
  user(id: UserId, name?: string | undefined): User;                 // sets isMe + resolved phone; falls back to the remembered name
  selfUser(): User;
  chat(ref: ChatRef): Chat;                                   // picks Group for kind "group"
  knownChat(id: ChatId): Chat | undefined;
  group(id: ChatId, name?: string | undefined): Group;
  applyGroupMetadata(metadata: GroupMetadata): Group;
  groupMetadata(id: ChatId): GroupMetadata | undefined;
  applyGroupChanges(groupId: ChatId, changes: GroupUpdateChanges): Group;
  message(event: BackendMessageEvent): Message;
  sentMessage(
    sent: BackendSentMessage,
    content: MessageContent,
    mentions: readonly UserId[],
    reference: MessageReference | undefined,
  ): Message;                                                 // outbound echo reconstruction
  reference(ref: BackendMessageReference, containingChat: Chat): MessageReference;
}
```

Single place where raw backend shapes become entities; guarantees `Chat` vs `Group` selection, `isMe` tagging, and reference back-linking (`message.reference.chat` points at the same `Chat` instance). It also records LID ↔ phone-number id pairs (`recordIdPairs`, called from the interaction factory for every event's `idPairs` and from `applyGroupMetadata` for `GroupParticipant.altId`) so every `User` it builds carries a resolved `phone` when one is known — and it keeps a **name memory**: every push name (and provider-supplied lookup name) is stored under both id schemes, so `user(id)` without a name still answers with the name seen earlier for that account (mentions, reaction authors, group members, fetch results). `applyGroupChanges` patches a cached group's metadata from a `groupUpdate` event (name/description/announceOnly/locked diff) so handlers see fresh values immediately. Called by `InteractionFactory`, `MessageService`, and the client; **not exported**.

## See also

- [Entities guide](/guide/events) — how entities flow through events
- [Groups reference](/reference/groups) — `GroupService` (the metadata API)
- [Groups guide](/guide/groups#linked-ids-lids-and-mentions) — LID handling around mentions
- [Interactions](/reference/interactions) — entities wrapped into events
