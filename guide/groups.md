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
group.members;      // readonly User[]
group.announceOnly; // boolean | undefined (only admins may post)
group.metadata;     // GroupMetadata | undefined (full record)
```

`fetch()` calls the backend's `getGroupMetadata`, stores the result in the [`EntityFactory`](/reference/entities#entityfactory) cache, and returns the synchronized `Group` instance — so `group === client`'s cached instance for that id. Errors:

- `NotFoundError` — provider says 404 (group gone).
- `PermissionError` — provider says 401/403 (no access).
- `BackendError` — anything else, wrapped with cause.

### `GroupMetadata`

```ts
interface GroupMetadata {
  readonly id: ChatId;
  readonly name: string;
  readonly description: string | undefined;
  readonly ownerId: UserId | undefined;
  readonly createdAt: Date | undefined;
  readonly participants: readonly GroupParticipant[]; // { id, role, name }
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
    console.log(`${m.displayName} — ${m.isMe ? "me" : m.phone ?? m.id}`);
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
Chats and groups are cached by id: `interaction.chat === interaction.message.chat`, and a group fetched twice is the same object. Cached metadata updates automatically when group-update events arrive (the factory applies changes *before* creating the interaction).
:::

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

Every group interaction — membership changes, metadata changes, plain group messages — arrives on the single [`interactionCreate`](/guide/events) event. libwa's event set is deliberately closed: there is **no** separate `groupAdd`/`groupRemove`/`groupPromote` event. Register one listener and filter with the type guards:

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

  // i.group.members / i.group.memberCount are current — metadata is
  // fetched from the provider right before the interaction dispatches
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
  // i.group already reflects the new values (metadata refreshed before dispatch)
});
```

Description clears are normalized: the provider sends `desc: null`, libwa maps it to `changes.description === ""`.

