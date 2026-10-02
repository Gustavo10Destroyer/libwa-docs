# Interactions

<ApiBadge kind="class" /> Every inbound event the library understands is normalized into a subclass of the abstract `Interaction`. This is the only event payload type your handlers ever see.

```ts
import type { Interaction } from "libwa";

client.on("interactionCreate", (i) => {
  if (i.isCommand()) console.log(i.name, i.args);
});
```

## Interaction <ApiBadge kind="abstract class" />

Base class — never instantiated directly. Protected constructor: only subclasses (and `InteractionFactory`, internally) create instances.

### Fields

<ApiTable
  :rows="[
    { name: 'type', type: 'InteractionType (abstract readonly)', description: 'Discriminator enum — see InteractionType.' },
    { name: 'id', type: 'string', description: 'Stable event id (provider message/event id).' },
    { name: 'timestamp', type: 'Date', description: 'When the event happened on the provider.' },
    { name: 'client', type: 'Client', description: 'Owning client — use for services, me, isReady.' },
    { name: 'chat', type: 'Chat', description: 'Chat the event belongs to. Direct or group — check isFromGroup().' },
    { name: 'group', type: 'Group | undefined', description: 'The group when isFromGroup() is true (same instance as chat for group interactions); undefined for direct chats.' },
    { name: 'author', type: 'User | undefined', description: 'Who caused it. undefined for some system events; for own messages it is you.' },
    { name: 'member', type: 'GroupMember | undefined', description: 'The author’s membership in the group — { user, role }. undefined outside groups, for author-less events, or while group metadata is unknown.' },
    { name: 'isFromMe', type: 'boolean', description: 'True when the logged-in account is the author.' }
  ]"
/>

### Type guards

All guards are `this is X` narrowing methods — safe to chain:

| Guard | Narrows to |
| --- | --- |
| `isMessage()` | `MessageInteraction` |
| `isCommand()` | `CommandInteraction` |
| `isReaction()` | `ReactionInteraction` |
| `isMessageUpdate()` | `MessageUpdateInteraction` |
| `isGroupParticipantUpdate()` | `GroupParticipantInteraction` |
| `isGroupUpdate()` | `GroupUpdateInteraction` |
| `isButton()` | `ButtonInteraction` |
| `isList()` | `ListInteraction` |
| `isFromGroup()` | narrows so `group` is `Group` (`Interaction & { group: Group }`) |
| `isFromDirectChat()` | boolean — `chat.kind === "direct"` |

```ts
if (i.isMessage() && i.isCommand() && i.name === "ping") {
  await i.reply("pong");
}
if (i.isFromGroup()) {
  console.log(i.group.name, i.group.memberCount); // group is typed Group here
}
```

### Methods

#### `reply`

```ts
reply(content: ReplyContent): Promise<Message>
```

Sends a reply targeting this interaction's chat (quoted when the interaction carries a message).

<ApiTable
  :rows="[
    { name: 'content', type: 'ReplyContent', description: 'Plain string, content object, content+attachment payload, or an array of them.' }
  ]"
/>

**Returns:** the sent `Message`.

**Errors:** `ValidationError` (`ERR_EMPTY_MESSAGE`, `ERR_AMBIGUOUS_MESSAGE`, `ERR_INVALID_CAPTION`, `ERR_EMPTY_MEDIA`) for bad input; provider failures surface as `MessageError` (bundled adapter) — custom backends may also throw `PermissionError` / `NotFoundError`.

```ts
await i.reply("hi");
await i.reply({ text: "with image", image: "/tmp/x.png" });
await i.reply(["line one", { text: "line two" }]);
```

Details: [Messaging reference](/reference/messaging).

## InteractionType <ApiBadge kind="enum" />

```ts
enum InteractionType {
  Message = "message",
  Command = "command",
  Reaction = "reaction",
  MessageUpdate = "messageUpdate",
  GroupParticipant = "groupParticipant",
  GroupUpdate = "groupUpdate",
  Button = "button",
  List = "list",
}
```

String-valued enum (JSON-safe, log-friendly). Map 1:1 to the classes below.

## MessageInteraction

```ts
class MessageInteraction<C extends MessageContent = MessageContent> extends Interaction
```

A received message with generic content `C` (defaults to `MessageContent`). Also the type of plain (non-command) text messages.

### Extra field

<ApiTable
  :rows="[
    { name: 'message', type: 'Message', description: 'Underlying entity with id/chat/author/content/timestamp/isForwarded/mentions/reference.' }
  ]"
/>

### Getters

| Getter | Type | Notes |
| --- | --- | --- |
| `content` | `C` | Discriminated by `kind`. |
| `text` | `string` | `contentText(message.content)` — text, caption, button/list label, poll name, or `""`. |
| `attachments` | `readonly Attachment[]` | `contentAttachments(...)` — `[]` for non-media. |
| `reference` | `MessageReference \| undefined` | Present when this is a reply/quote or an update to an original message. |
| `isForwarded` | `boolean` | Forward flag from the provider. |
| `mentions` | `readonly User[]` | @-mentioned users. |
| `isReply` | `boolean` | `reference !== undefined`. |

### Content guards

`isText()`, `isImage()`, `isVideo()`, `isAudio()`, `isDocument()`, `isSticker()`, `isLocation()`, `isContact()`, `isPoll()`, `isMedia()` — each narrows `content` (and `this`) to the corresponding content type:

```ts
if (i.isMessage() && i.isImage()) {
  const bytes = await i.content.attachment.download();
  // i.content: ImageContent
}
```

### Methods

| Method | Signature | Description |
| --- | --- | --- |
| `react` | `(emoji: string \| null) => Promise<void>` | Add (`"👍"`) or clear (`null`) your own reaction. |
| `delete` | `() => Promise<void>` | Delete this message — no ownership check in libwa (e.g. group admins deleting others' messages). |
| `edit` | `(text: string) => Promise<Message>` | Edit **your own** message; returns the updated `Message`. |
| `reply` | inherited | Reply in the same chat. |

## CommandInteraction

```ts
class CommandInteraction extends MessageInteraction<TextContent>
```

A `MessageInteraction` whose text matched a command prefix. `content` is always `TextContent`.

### Fields

<ApiTable
  :rows="[
    { name: 'name', type: 'string', description: 'Lowercased command name as typed, without prefix (alias-resolved via i.command).' },
    { name: 'args', type: 'readonly string[]', description: 'Whitespace-split arguments after the command name.' },
    { name: 'rawArgs', type: 'string', description: 'Everything after the command token, trimmed but otherwise untouched (good for quoted text).' },
    { name: 'command', type: 'CommandDefinition | undefined', description: 'Resolved registered command (alias-aware). undefined when parsing produced a name nobody registered.' }
  ]"
/>

```ts
client.on("interactionCreate", (i) => {
  if (!i.isCommand()) return;
  console.log(i.name, i.args, JSON.stringify(i.rawArgs));
});
// "!kick alice bob reason here"
// → "kick", ["alice", "bob", "reason", "here"], "alice bob reason here"
```

`execute()` runs before `interactionCreate` listeners; see [Commands guide](/guide/commands).

## ReactionInteraction

```ts
class ReactionInteraction extends Interaction
```

A reaction was added to or removed from a message.

<ApiTable
  :rows="[
    { name: 'messageId', type: 'string', description: 'Target message id.' },
    { name: 'emoji', type: 'string | null', description: 'Emoji added, or null when a reaction was removed.' },
    { name: 'isRemoved', type: 'boolean (getter)', description: 'true when emoji === null.' }
  ]"
/>

`react(emoji | null)` mirrors the reaction back (useful for ✅-style acknowledgements).

```ts
if (i.isReaction() && i.emoji === "🔥") {
  await i.react("🔥"); // echo back on the same message
}
```

## MessageUpdateInteraction

```ts
class MessageUpdateInteraction extends Interaction
```

A message was edited or deleted by someone (or yourself on another device).

<ApiTable
  :rows="[
    { name: 'messageId', type: 'string', description: 'Affected message id.' },
    { name: 'action', type: '&quot;edit&quot; | &quot;delete&quot;', description: 'What happened.' },
    { name: 'content', type: 'MessageContent | undefined', description: 'New content for edits; undefined for deletes.' },
    { name: 'isEdit', type: 'boolean (getter)', description: 'action === &quot;edit&quot;.' },
    { name: 'isDelete', type: 'boolean (getter)', description: 'action === &quot;delete&quot;.' }
  ]"
/>

## GroupParticipantInteraction

```ts
class GroupParticipantInteraction extends Interaction
```

Participants were added/removed/promoted/demoted in a group.

<ApiTable
  :rows="[
    { name: 'group', type: 'Group', description: 'Target group — metadata is resolved before dispatch (≤60s cache) and this event patched onto it, so members are current.' },
    { name: 'action', type: 'GroupParticipantAction', description: '&quot;add&quot; | &quot;remove&quot; | &quot;promote&quot; | &quot;demote&quot; | &quot;other&quot;.' },
    { name: 'user', type: 'User | undefined (getter)', description: 'The affected user (users[0]) — exactly who was added/removed/promoted/demoted for single-participant changes.' },
    { name: 'users', type: 'readonly User[]', description: 'Affected participants (all of them; batches possible).' },
    { name: 'author', type: 'User | undefined', description: 'Who performed it, when known (system events → undefined).' },
    { name: 'isAdd / isRemove / isPromote / isDemote', type: 'boolean getters', description: 'Convenience narrowers over action.' }
  ]"
/>

```ts
if (i.isGroupParticipantUpdate() && i.isRemove()) {
  console.log(`left: ${i.user?.displayName}`, i.users.map((u) => u.displayName));
}
```

::: tip Fresh group data
Before any group interaction dispatches — participant, update, or message-family — the client resolves the group through `client.groups.ensure`: a cached copy **up to 60 seconds** old is served without I/O, anything older (or missing) triggers a single fetch, and concurrent events share it — at most one round-trip per group per minute. Membership and metadata events patch the cache as they arrive, so `i.group.members` / `i.group.memberCount` reflect the event itself, and `i.member` answers with the author's `{ user, role }`. If a refresh fails, the interaction is still dispatched over the last known state (a `[group refresh]` warning is logged; `member` stays `undefined` only while no metadata has ever been resolved).
:::

## GroupUpdateInteraction

```ts
class GroupUpdateInteraction extends Interaction
```

Group metadata changed.

<ApiTable
  :rows="[
    { name: 'group', type: 'Group', description: 'Target group — metadata resolved before dispatch (≤60s cache), changes applied on top.' },
    { name: 'changes', type: 'GroupUpdateChanges', description: 'Partial diff: { name?, description?, announceOnly?, locked? } — only changed keys present.' },
    { name: 'hasNameChange', type: 'boolean (getter)', description: 'changes.name !== undefined.' },
    { name: 'hasDescriptionChange', type: 'boolean (getter)', description: 'changes.description !== undefined.' }
  ]"
/>

```ts
if (i.isGroupUpdate() && i.hasNameChange) {
  await i.reply(`group is now "${i.changes.name}"`);
}
```

## ButtonInteraction

<ApiBadge kind="class" /> Legacy interactive-button taps (non-WhatsApp-Business protocol).

<ApiTable
  :rows="[
    { name: 'messageId', type: 'string', description: 'Message carrying the button.' },
    { name: 'buttonId', type: 'string', description: 'Provider id of the tapped button.' },
    { name: 'title', type: 'string', description: 'Prompt/title of the button message.' },
    { name: 'displayText', type: 'string', description: 'Label of the tapped button.' },
    { name: 'variant', type: '&quot;template&quot; | &quot;plain&quot;', description: 'Button message flavour.' },
    { name: 'reference', type: 'MessageReference | undefined', description: 'Quoted context when present.' }
  ]"
/>

## ListInteraction

<ApiBadge kind="class" /> Legacy list-picker row selections.

<ApiTable
  :rows="[
    { name: 'messageId', type: 'string', description: 'Message carrying the list.' },
    { name: 'rowId', type: 'string', description: 'Id of the chosen row.' },
    { name: 'title', type: 'string', description: 'Row title.' },
    { name: 'description', type: 'string | undefined', description: 'Row subtitle when provided.' },
    { name: 'reference', type: 'MessageReference | undefined', description: 'Quoted context when present.' }
  ]"
/>

## CommandParsingOptions <ApiBadge kind="interface" />

```ts
interface CommandParsingOptions {
  readonly prefixes: readonly string[];
  readonly ignoreSelf: boolean;
}
```

Exported normalized form of [`ClientOptions.commands`](/reference/client-options#commandoptions) — a single prefix becomes `prefixes: ["…"]`; `ignoreSelf` decides whether own messages are parsed as commands. Passed to `InteractionFactory`, which uses it to decide *message* vs *command* classification:

```ts
// commands: { prefix: ["!", "/"], ignoreSelf: true } resolves to:
const parsing: CommandParsingOptions = { prefixes: ["!", "/"], ignoreSelf: true };
```

With `commands: false` the client passes `null` and no message is ever parsed as a command.

## InteractionFactory <ApiBadge kind="internal" />

```ts
class InteractionFactory {
  constructor(
    client: Client,
    entities: EntityFactory,
    commands: CommandRegistry,
    commandOptions: CommandParsingOptions | null,
  );
  fromMessage(event: BackendMessageEvent): Interaction;
  fromReaction(event: BackendReactionEvent): ReactionInteraction;
  fromMessageUpdate(event: BackendMessageUpdateEvent): MessageUpdateInteraction;
  fromGroupParticipants(event: BackendGroupParticipantsEvent): GroupParticipantInteraction;
  fromGroupUpdate(event: BackendGroupUpdateEvent): GroupUpdateInteraction;
}
```

Converts normalized backend events into the classes above — one method per event kind, each returning a concrete instance (never `null`; unrecognized message shapes still become a `MessageInteraction`). `fromMessage` returns `ButtonInteraction`/`ListInteraction` for those content kinds, and promotes the message to `CommandInteraction` when it passes `CommandRegistry.parse()` (subject to `ignoreSelf`). Only `Client` calls it — exported nowhere.

## See also

- [Interactions guide](/guide/interactions) — dispatch flow and recipes
- [Message content](/reference/content) — the `MessageContent` union
- [Entities](/reference/entities) — `Message`, `Chat`, `User`, `Group`
