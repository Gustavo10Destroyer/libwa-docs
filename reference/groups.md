# Groups

<ApiBadge kind="class" /> `GroupService` (`client.groups`) fetches metadata and performs membership/setting operations. Everything it can't do surfaces as `UnsupportedOperationError`.

```ts
const group = await client.groups.fetch("1203630…@g.us");
await client.groups.addMembers(group, ["5511888888888@s.whatsapp.net"]);
```

## `GroupTarget`

```ts
type GroupTarget = Group | ChatId;
```

Every method accepts either a `Group` entity or a raw chat id string — internally `#chatId(target)` picks `.id` or the string itself.

## GroupService <ApiBadge kind="class" />

```ts
class GroupService {
  constructor(backend: WhatsAppBackend, entities: EntityFactory); // internal
  fetch(target: GroupTarget): Promise<Group>;
  addMembers(target: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  removeMembers(target: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  promote(target: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  demote(target: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  rename(target: GroupTarget, name: string): Promise<void>;
  setDescription(target: GroupTarget, description: string | undefined): Promise<void>;
}
```

`UserLike` (internal) is any `{ readonly id: UserId }` — a `User` qualifies, so pass entities or raw ids interchangeably.

Exposed as `client.groups`; constructed by the `Client`. `Group` entity methods (`addMembers`, `promote`, …) delegate here.

### `fetch`

```ts
fetch(target): Promise<Group>
```

Fetches full metadata and returns a **synchronized** `Group`: metadata applied, `name` cache updated, participants mapped to `User`s (with `isMe` set).

**Errors:** `BackendError` (context `Failed to fetch group <id>`), `UnsupportedOperationError` if the backend lacks `getGroupMetadata`.

```ts
const g = await client.groups.fetch(chat.id);
g.memberCount; g.announceOnly; g.owner?.displayName;
```

### `addMembers` / `removeMembers`

```ts
addMembers(target, users): Promise<void>
removeMembers(target, users): Promise<void>
```

Membership changes — **admin rights required** (provider-side `PermissionError` when missing).

**Errors:**

| Condition | Error | Code |
| --- | --- | --- |
| `users` empty | `ValidationError` | `ERR_EMPTY_USER_LIST` |
| backend lacks `updateGroupParticipants` | `UnsupportedOperationError` | `ERR_UNSUPPORTED` |
| provider failure | `BackendError` (context `Failed to add group participants` / `Failed to remove group participants`) | `ERR_BACKEND` |

### `promote` / `demote`

```ts
promote(target, users): Promise<void>
demote(target, users): Promise<void>
```

Role changes — same error semantics as membership (`Failed to promote/demote group participants` contexts).

### `rename`

```ts
rename(target, name): Promise<void>
```

<ApiTable
  :rows="[
    { name: 'name', type: 'string', description: 'New subject. Empty string → ValidationError ERR_EMPTY_GROUP_NAME.' }
  ]"
/>

On success the factory's cached metadata (when known) is patched with the new name so `group.name` reflects reality without a refetch.

**Errors:** `ERR_EMPTY_GROUP_NAME`, `ERR_UNSUPPORTED` (no `updateGroupName`), `BackendError` (context `Failed to rename group <id>`).

### `setDescription`

```ts
setDescription(target, description: string | undefined): Promise<void>
```

Sets the group description — `undefined` **clears** it (validated before the capability check, so empty/undefined behaves consistently).

**Errors:** `ERR_UNSUPPORTED` (no `updateGroupDescription`), `BackendError` (context `Failed to update description of group <id>`). Cached metadata patched on success.

## Validation summary

| Code | Condition |
| --- | --- |
| `ERR_EMPTY_USER_LIST` | `addMembers`/`removeMembers`/`promote`/`demote` with zero users |
| `ERR_EMPTY_GROUP_NAME` | `rename("")` |

## Recipes

```ts
// Sync everything about a group
const g = await client.groups.fetch(i.chat.id);
await g.refresh();                       // same as client.groups.fetch + apply
console.log(g.displayName, g.memberCount, g.metadata?.announceOnly);

// Guarded moderation command
if (i.isCommand() && i.groupOnly && i.isFromGroup()) {
  const target = i.args[0];
  await client.groups.removeMembers(i.chat.id, [target]);
}

// Rename + announce
await client.groups.rename(groupId, "New name");
await client.groups.setDescription(groupId, "Rules live here.");
```

See the [Groups guide](/guide/groups) for the full walkthrough including entity-level methods.

## See also

- [Entities → Group](/reference/entities#group) — entity-level convenience methods
- [Group types](/reference/entities#group-types) — metadata/roles/changes
- [Backend capability map](/guide/backends#the-contract) — which operations are optional
