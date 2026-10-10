# Groups

Group data flows through three layers: the [`Group`](/reference/entities#group) **entity** (cached, convenient), the [`GroupService`](/reference/groups) (`client.groups`, authoritative operations), and **interactions** (membership/metadata change events).

## Fetching metadata

```ts
const group = await client.groups.fetch("123456789@g.us");
// or: await client.groups.fetch(someGroupEntity);

group.name;         // string | undefined (metadata name, else cached chat name)
group.description;  // string | undefined
group.owner;        // User | undefined
group.memberCount;  // number | undefined
group.members;      // readonly GroupMember[] — { user, role }
group.announceOnly; // boolean | undefined (only admins may post)
group.metadata;     // GroupMetadata | undefined (full record)
```

`fetch()` calls the backend's `getGroupMetadata`, stores the result in the [`EntityFactory`](/reference/entities#entityfactory) cache, and returns the synchronized `Group` instance — so `group === client`'s cached instance for that id. Errors:

- `NotFoundError` — provider says 404 (group gone).
- `PermissionError` — provider says 401/403 (no access).
- `BackendError` — anything else, wrapped with cause.

### The 60-second cache

`fetch()` is the *always-fresh* path — it round-trips on every call. Everything the library does internally goes through `ensure()` instead, which answers from a cache that is **at most 60 seconds** old:

```ts
const group = await client.groups.ensure("123456789@g.us"); // same Group instance either way
```

- **Cache younger than 60s → no I/O.** The last `Group` is returned immediately; the window counts from the last *attempted* fetch (success or failure).
- **Older or missing → one fetch.** Concurrent `ensure()` calls for the same group share a single in-flight request.
- **Failures back off too.** A failed fetch marks the group for the rest of the window — the client keeps serving the last known state (logging `[group refresh]`) instead of hammering a struggling provider, and retries once the window expires.
- **Events keep it current.** Membership and metadata events patch the cached group as they arrive (see [Working with the entity](#working-with-the-entity)), so within the window the cache follows reality.
- `fetch()` and `group.refresh()` always bypass the cache and restart the window — call them when you need guaranteed-fresh data.

Every group interaction resolves its group through `ensure()` before dispatching, so bots pay **at most one round-trip per group per minute** no matter how chatty the group is.

### `GroupMetadata`

```ts
interface GroupMetadata {
  readonly id: ChatId;
  readonly name: string;
  readonly description: string | undefined;
  readonly ownerId: UserId | undefined;
  readonly createdAt: Date | undefined;
  readonly participants: readonly GroupParticipant[]; // { id, altId, role, name, username }
  readonly announceOnly: boolean;
  readonly locked: boolean;
}
```

`GroupRole = "member" | "admin" | "superadmin"`.

## Working with the entity

```ts
if (chat.isGroup()) {
  const group = chat; // narrowed from Chat → Group

  await group.refresh();               // fetch metadata, apply to this instance
  group.applyMetadata(metadata);       // merge externally-fetched metadata
  group.description;
  group.members.forEach((m) => {
    console.log(`${m.user.displayName} (${m.role}) — ${m.user.isMe ? "me" : m.user.phone ?? m.user.id}`);
  });
}
```

Entity actions delegate to the service:

```ts
await group.addMembers(["5511@s.whatsapp.net", someUser]);
await group.removeMembers([someUser]);
await group.promote([someUser]);
await group.demote([someUser]);
await group.rename("New name");
await group.setDescription("New description"); // undefined clears it
```

::: tip Identity
Chats and groups are cached by id: `interaction.chat === interaction.message.chat`, and a group fetched twice is the same object. Cached metadata updates automatically when group-update **and membership** events arrive (the factory applies changes *before* creating the interaction), so the 60-second window costs at most one fetch per group without going stale in between.
:::

## Membership roles

Roles are **group-scoped**: the same account can be an `admin` in one group and a plain member in another — so they live on the group, never on [`User`](/reference/entities#user):

```ts
interface GroupMember {
  readonly user: User;       // account-level entity — the same instance as interaction.author
  readonly role: GroupRole;  // "member" | "admin" | "superadmin" — inside this group
}
```

### On every interaction: `interaction.member`

```ts
client.on("interactionCreate", (i) => {
  if (!i.isFromGroup()) return;

  i.member?.role; // "admin" — the sender's role in this group
  i.member?.user; // === i.author (same User instance)

  if (i.member && i.member.role !== "member") await i.reply("Hello, admin!");
});
```

`member` is computed from `group` + `author`, and is `undefined` when either side is missing: direct chats, author-less events (group metadata updates, some bulk deletes), authors that are not participants of the group, or group metadata the client could not resolve (it goes through `client.groups.ensure` before dispatch — at most one fetch per group per minute; see [The 60-second cache](#the-60-second-cache)).

### On the group: `members` and `member()`

```ts
group.members;                      // readonly GroupMember[]
group.member("222@s.whatsapp.net"); // GroupMember | undefined
group.member(someUser);             // accepts User instances too

// ids match across schemes — a phone id finds a …@lid participant (and back)
group.member("987654321012345@lid")?.role; // → "superadmin"

const bot = client.me && group.member(client.me);
if (bot && bot.role !== "member") {
  // the bot is admin here
}
```

## Membership operations (service level)

```ts
await client.groups.addMembers(groupOrId, users);
await client.groups.removeMembers(groupOrId, users);
await client.groups.promote(groupOrId, users);
await client.groups.demote(groupOrId, users);
await client.groups.rename(groupOrId, "name");
await client.groups.setDescription(groupOrId, "text" | undefined);
```

`GroupTarget = Group | ChatId`. Users accept `User` instances or raw `UserId` strings.

Validation and capability checks happen up front:

| Condition | Error | Code |
| --- | --- | --- |
| Empty user list | `ValidationError` | `ERR_EMPTY_USER_LIST` |
| Empty group name | `ValidationError` | `ERR_EMPTY_GROUP_NAME` |
| Backend lacks `updateGroupParticipants` / `updateGroupName` / `updateGroupDescription` | `UnsupportedOperationError` | `ERR_UNSUPPORTED` |
| Provider rejected **all** participants | `PermissionError` | — |
| Provider rejected **some** participants | succeeds + `logger.warn` per failure | — |

After a successful rename/description update, cached metadata is patched immediately (no refetch needed).

## Detecting group interactions

### The event: `interactionCreate`

Every group interaction — membership changes, metadata changes, plain group messages — arrives on the single [`interactionCreate`](/guide/events) event. libwa.js's event set is deliberately closed: there is **no** separate `groupAdd`/`groupRemove`/`groupPromote` event. Register one listener and filter with the type guards:

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isFromGroup()) return; // only group chats (narrows i.group to Group)

  if (i.isGroupParticipantUpdate()) {
    // membership changed — i.action, i.user, i.users, i.author, i.group
  } else if (i.isGroupUpdate()) {
    // metadata changed — i.changes, i.group
  } else if (i.isMessage()) {
    // ordinary group message — i.text, i.mentions
  }
});
```

### Filtering

| Filter | How |
| --- | --- |
| group chats only | `i.isFromGroup()` — also narrows `i.group` to `Group` |
| membership changes (add/remove/promote/demote) | `i.isGroupParticipantUpdate()` |
| metadata changes (name/description/settings) | `i.isGroupUpdate()` |
| one specific group | after a guard: `i.group.id === "123456789@g.us"` |
| one specific action | `i.action === "add"` (or the `i.isAdd` getter) |
| messages sent in groups | `i.isFromGroup() && i.isMessage()` |

```ts
const MY_GROUP = "123456789@g.us";

client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate()) return; // membership changes only
  if (i.group.id !== MY_GROUP) return;       // one specific group
  if (!i.isAdd) return;                      // only joins

  console.log(`${i.user?.displayName} joined ${i.group.name}`);
});
```

### Which action took place

`GroupParticipantInteraction.action` is a `GroupParticipantAction`:

| `action` | Getter | Meaning |
| --- | --- | --- |
| `"add"` | `i.isAdd` | user(s) joined the group |
| `"remove"` | `i.isRemove` | user(s) left or were kicked |
| `"promote"` | `i.isPromote` | member(s) became admins |
| `"demote"` | `i.isDemote` | admin(s) became regular members |
| `"other"` | — | unmapped provider action (no getter) |

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate()) return;

  switch (i.action) {
    case "add":
    case "remove":
    case "promote":
    case "demote":
      console.log(i.action, "by", i.author?.displayName, "→", i.user?.displayName);
      break;
    default: // "other"
      console.log("unmapped participant action in", i.group.name);
  }
});
```

### `author` vs `user` — the actor and the affected user

::: warning author performed it · user was affected by it
On **every** `GroupParticipantInteraction` — for `add`, `remove`, `promote` and `demote` alike:

| | Field | Meaning |
| --- | --- | --- |
| **Who performed the action** | `i.author` | The **actor**: the person who added / removed / promoted / demoted. `undefined` for system or unknown actors. |
| **Who was affected** | `i.user` (and `i.users`) | The **target**: the person who was added / removed / promoted / demoted. `i.user` is `users[0]`; `i.users` covers batches. |

Never swap them: if Ana kicked Beto, then `i.author` is **Ana** (the actor) and `i.user` is **Beto** (the affected user). `i.group` is the group it happened in.
:::

### Membership changes

**Detect an add** — who joined, and who added them:

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isGroupParticipantUpdate() || !i.isAdd) return;

  const joined = i.user; // affected user — who joined
  const addedBy = i.author; // actor — who performed the add

  await i.reply(
    `${joined?.displayName ?? "someone"} joined` +
      (addedBy ? ` (added by ${addedBy.displayName})` : ""),
  );

  // i.group.members / i.group.memberCount are current — the membership
  // event was applied to the cached metadata before the interaction dispatched
  console.log(`${i.group.name} now has ${i.group.memberCount} members`);
});
```

**Detect a remove** — who left or was kicked, and who did it:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate() || !i.isRemove) return;

  const removed = i.user; // affected user — who was removed
  const removedBy = i.author; // actor — who performed the removal

  console.log(
    `${removed?.displayName ?? "someone"} was removed by ${removedBy?.displayName ?? "unknown"}`,
  );
});
```

**Detect promote/demote** — same distinction, both roles:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate()) return;

  if (i.isPromote) {
    // i.user = who became admin · i.author = who promoted them
    console.log(`${i.user?.displayName} made admin by ${i.author?.displayName ?? "?"}`);
  }
  if (i.isDemote) {
    // i.user = who lost admin · i.author = who demoted them
    console.log(`${i.user?.displayName} demoted by ${i.author?.displayName ?? "?"}`);
  }
});
```

**Batches** — the provider can move several users in one event:

```ts
if (i.isAdd) {
  const joined = i.users.map((u) => u.displayName).join(", "); // all affected users
  console.log(`joined: ${joined} · by: ${i.author?.displayName ?? "?"}`);
}
```

Provider actions outside `add|remove|promote|demote` arrive as `action: "other"` (no convenience getter). Events without a resolvable group id or without participants are dropped by the mapper.

### Metadata changes

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupUpdate()) return;
  // i.changes: partial { name?, description?, announceOnly?, locked? }
  // i.group already reflects the new values (applied to the cached metadata before dispatch)
});
```

Description clears are normalized: the provider sends `desc: null`, libwa.js maps it to `changes.description === undefined` with the key **present** (`"description" in changes` is `true` — key presence, not value).

A `groupUpdate` whose diff against the cached metadata is empty is dropped before dispatch, so listeners never see a no-op update.

## Mentions

Group messages can @-mention people. Mentions are handled in both directions: **reading** them from incoming messages and **sending** them with your own.

### Reading mentions

`MessageInteraction` (and therefore `CommandInteraction`) exposes `mentions` — the @-mentioned users, extracted from the incoming message:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isMessage()) return; // mentions exist only on message interactions
  if (i.mentions.length === 0) return; // nobody was @-mentioned

  for (const user of i.mentions) {
    console.log(`mentioned: ${user.id} (${user.displayName})`);
  }
});

client.commands.register({
  name: "ban",
  groupOnly: true,
  async execute(i) {
    const target = i.mentions[0]; // first @-mentioned user
    if (!target) return void (await i.reply("Mention someone: !ban @user"));
    // …
  },
});
```

Notes:

- mentions are plain [`User`](/reference/entities#user) objects — the payload carries ids only, so `user.name` is usually `undefined` here and `displayName` falls back to the phone number, or to the raw `…@lid` id when no phone number is known (see [Fetching group and user names](#fetching-group-and-user-names) for name sources);
- reactions, edits and group updates never carry mentions — guard with `i.isMessage()` first;
- the bot can be mentioned too — check `user.isMe`.

### Sending with mentions

Put users in `mentions` — either on the payload or in `send`'s options (both are merged and deduplicated):

```ts
await i.reply({
  text: `Welcome @${member.phone ?? member.id}!`,
  mentions: [member], // MessagePayload.mentions
});

await client.messages.send(chat, "ping", { mentions: [member] }); // SendOptions.mentions
```

Welcome the affected member of a join event by mention — `i.user` again being the affected user:

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isGroupParticipantUpdate() || !i.isAdd || !i.user) return;

  await i.reply({
    text: `Welcome @${i.user.phone ?? i.user.id}!`,
    mentions: [i.user],
  });
});
```

### Linked ids (LIDs) and mentions

WhatsApp addresses accounts in one of two ways — by phone number (`5511999999999@s.whatsapp.net`) or by an opaque linked id (`123456789012345@lid`) that hides the number ([JID vs LID explained](https://baileys.wiki/concepts/jids)). Modern groups are typically LID-addressed, so `i.author.id`, `i.mentions` and `group.members[].user.id` may well be `…@lid` values with no digits in them.

The rules that keep mentions working:

- **Pass ids as received.** `mentions: [user]` works with whatever scheme the event delivered — WhatsApp expects the chat's own addressing form, so do *not* try to convert a lid into a phone JID before sending.
- **Use `user.phone` for the `@…` text.** The library pairs ids with phone numbers as messages, metadata and membership events arrive, so `user.phone` is already resolved in most cases:

  ```ts
  await i.reply(`hello @${user.phone ?? user.displayName}`, { mentions: [user] });
  ```

- **Ask `client.users` for the rest.** When a pair has not arrived yet:

  ```ts
  const digits = await client.users.resolvePhone(user.id); // "5511999999999" | undefined
  const lid = await client.users.resolveLid(user.id);      // "…@lid" | undefined (self for lids)
  const knownLid = client.users.altId(user.id);            // recorded counterpart, no I/O
  ```

  `resolvePhone`/`resolveLid` answer from recorded pairs first, then ask the backend (Baileys resolves through its `lidMapping` store), and resolve `undefined` when nothing knows the mapping — fall back to `user.id` in the text, as the examples above do.

- **`displayName` degrades honestly.** A lid without a name and without a resolved phone shows the raw `…@lid` id — prefer `user.phone ?? user.displayName` in user-facing text, never `user.id` directly.

## Fetching group and user names

### Group names

```ts
// 1. On demand — always a provider round-trip, bypassing the cache
const group = await client.groups.fetch("120363012345678901"); // bare id works — @g.us is appended
group.name; // group subject, e.g. "Weekend plans"
group.displayName; // name ?? id — never empty

// 2. From a group interaction — resolved through the ≤60s cache, kept current by events
client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate()) return;
  console.log(i.group.name, i.group.memberCount);
});

// 3. Re-sync an entity you already hold (also bypasses the cache)
await group.refresh();
```

`fetch` (and every other group method) accepts the id in any of its usual forms: a full `…@g.us` chat id, the bare number as it appears in a group link, or a `Group`/`Chat` entity you already hold.

### User names

A `User` carries whatever name the provider supplied:

| Accessor | Meaning |
| --- | --- |
| `user.name` | Known name — remembered across events (either id scheme) once seen; `undefined` only when no name has ever arrived for that account |
| `user.displayName` | `name` → `phone` → `id` — always something readable |
| `user.phone` | Digits from a phone-number id, or from a resolved LID ↔ phone pair ([Linked ids](#linked-ids-lids-and-mentions)); `undefined` while unknown |
| `user.id` | `5511999999999@s.whatsapp.net` or `123456789012345@lid` |

**The display name the user customized on WhatsApp** (their profile name, also called the push name) arrives with every incoming message:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isMessage()) return;
  i.author?.name; // "Gustavo" — the sender's WhatsApp profile name
  i.author?.displayName; // "Gustavo", or phone fallback when unknown
});

client.me?.name; // your own profile name
```

Names are **remembered automatically**: every push name the library sees (a message's sender, a provider-supplied lookup name) is stored under both id schemes, so later id-only payloads still answer with `user.name` — the mention in a follow-up message, a reaction author, a group member fetched from metadata:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isMessage()) return;
  i.mentions[0]?.name; // "Gustavo" — remembered from that user's own earlier message, when one arrived
});
```

To ask the provider whether an account exists (and learn its current name), use `client.users.fetch`:

```ts
const user = await client.users.fetch("5511999999999"); // phone JID, bare digits or …@lid all work
if (user) {
  console.log(`${user.displayName} exists`); // "Gustavo" / phone / id fallback
}
```

`fetch` resolves `undefined` when no account exists (or a linked id cannot be mapped), throws `ValidationError` (`ERR_INVALID_USER_ID`) for malformed ids, and `UnsupportedOperationError` when the backend cannot check — it never guesses. Full input table and error list in the [UserService reference](/reference/entities#userservice).

Profile data rides the same ids, each behind its own optional capability: `client.users.pictureUrl(id, type?)` (profile picture URL, `undefined` when absent or private), `client.users.about(id)` (bio/status text) and `client.users.accountType(id)` (`"standard" | "business"`). They accept the same id forms as `fetch`; see [UserService](/reference/entities#userservice) for errors.

::: tip Contact-list names are not synced
The name **you** saved in your phone's contact book ("Mom", "Ana — work") lives on your device and is **not** part of libwa.js's six normalized events — it cannot be read from a `User`. Use WhatsApp profile names (above) or keep your own `UserId → name` map. Group participants may carry a provider-supplied name on `GroupMetadata.participants[].name`, but it is commonly `undefined` with the Baileys backend; `displayName` always falls back gracefully (name → phone → id).
:::

## Announce-only (admin) groups

```ts
const group = await client.groups.fetch(chat.id);
if (group.announceOnly && !i.author?.isMe) {
  const mine = client.me ? group.member(client.me) : undefined;
  const meIsAdmin = mine?.role === "admin" || mine?.role === "superadmin";
  // …moderation logic of your choosing
}
```

libwa.js deliberately does **not** ship a permissions engine: metadata tells you *what is*, your code decides *what to do*. A group-only command guard (`groupOnly: true`) covers the common case.

## A complete group-aware command

```ts
import { Client, NotFoundError, PermissionError, type CommandInteraction } from "libwa.js";

const client = new Client({ commands: { prefix: "!" } });

client.commands.register({
  name: "ban",
  description: "Removes a mentioned user (admin only)",
  groupOnly: true,
  async execute(interaction: CommandInteraction) {
    const chat = interaction.chat;
    if (!chat.isGroup()) return; // compile-time narrowing

    const target = interaction.mentions[0];
    if (!target) {
      await interaction.reply("Mention the user: !ban @someone");
      return;
    }

    try {
      await chat.removeMembers([target]);
      await interaction.reply(`${target.displayName} removed.`);
    } catch (error) {
      if (error instanceof PermissionError) {
        await interaction.reply("I need admin rights for that.");
        return;
      }
      if (error instanceof NotFoundError) {
        await interaction.reply("That user is not in this group.");
        return;
      }
      throw error; // reported through the client error event
    }
  },
});
```

## Backend capability matrix

| Operation | Baileys backend | Capability method |
| --- | --- | --- |
| Fetch metadata | ✅ | `getGroupMetadata` (mandatory) |
| Add/remove/promote/demote | ✅ | `updateGroupParticipants?` |
| Rename | ✅ | `updateGroupName?` |
| Set/clear description | ✅ | `updateGroupDescription?` |

A backend without these makes the corresponding calls throw `UnsupportedOperationError` — feature-detect by attempting the call, or check the method on the backend instance (`client.backend.updateGroupName !== undefined`).

## Related

- [Entities reference](/reference/entities#group) — full `Group` API
- [GroupService reference](/reference/groups) — full service API
- [GroupParticipantInteraction](/reference/interactions#groupparticipantinteraction) / [GroupUpdateInteraction](/reference/interactions#groupupdateinteraction)
- [Backend events](/reference/backend#backendeventmap) — the normalized events behind these interactions
