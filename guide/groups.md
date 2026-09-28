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

## Reacting to group events

### Membership changes

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isGroupParticipantUpdate()) return;

  const who = i.users.map((u) => u.displayName).join(", ");

  if (i.isAdd) await i.reply(`Welcome ${who}!`);
  if (i.isRemove) console.log(`${who} left/was removed`);
  if (i.isPromote) console.log(`${who} promoted by ${i.author?.displayName ?? "?"}`);
  if (i.isDemote) console.log(`${who} demoted`);
});
```

Provider actions outside `add|remove|promote|demote` arrive as `action: "other"` (no convenience getter). Events without a resolvable group id or without participants are dropped by the mapper.

### Metadata changes

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupUpdate()) return;
  // i.changes: partial { name?, description?, announceOnly?, locked? }
  // i.group already reflects the new values
});
```

Description clears are normalized: the provider sends `desc: null`, libwa maps it to `changes.description === ""`.

## Announce-only (admin) groups

```ts
const group = await client.groups.fetch(chat.id);
if (group.announceOnly && !i.author?.isMe) {
  const meIsAdmin = group.members.some(
    (m) => m.id === group.owner?.id || /* compare against your own id */ false,
  );
  // …moderation logic of your choosing
}
```

libwa deliberately does **not** ship a permissions engine: metadata tells you *what is*, your code decides *what to do*. A group-only command guard (`groupOnly: true`) covers the common case.

## A complete group-aware command

```ts
import { Client, NotFoundError, PermissionError, type CommandInteraction } from "libwa";

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
