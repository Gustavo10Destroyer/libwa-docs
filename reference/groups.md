# Groups

<ApiBadge kind="class" /> `GroupService` (`client.groups`) resolves metadata through a 60-second cache (`ensure`), round-trips on demand (`fetch`), and performs membership/setting operations. Everything it can't do surfaces as `UnsupportedOperationError`.

```ts
const group = await client.groups.fetch("1203630…@g.us"); // always a round-trip
const fresh = await client.groups.ensure("1203630…@g.us"); // cache when ≤60s old
await client.groups.addMembers(group, ["5511888888888@s.whatsapp.net"]);
```

## `GroupTarget`

```ts
type GroupTarget = Group | ChatId;
```

Every method accepts either a `Group` entity or a raw chat id string — internally `#chatId(target)` picks `.id` or the string itself, and appends `@g.us` when the bare id form is passed: `120363012345678901` or a legacy `120363012345678901-1601234567890` value (as it appears in a group link) become the canonical `…@g.us` chat id.

## GroupService <ApiBadge kind="class" />

```ts
class GroupService {
  constructor(backend: WhatsAppBackend, entities: EntityFactory); // internal
  ensure(target: GroupTarget): Promise<Group>;
  fetch(target: GroupTarget): Promise<Group>;
  addMembers(group: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  removeMembers(group: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  promote(group: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  demote(group: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  rename(group: GroupTarget, name: string): Promise<void>;
  setDescription(group: GroupTarget, description: string | undefined): Promise<void>;
}
```

`UserLike` (internal) is any `{ readonly id: UserId }` — a `User` qualifies, so pass entities or raw ids interchangeably.

Exposed as `client.groups`; constructed by the `Client`. `Group` entity methods (`addMembers`, `promote`, …) delegate here.

### `ensure`

```ts
ensure(target): Promise<Group>
```

Resolves a group through the **60-second metadata cache** — the path the client itself uses before every group dispatch:

- a fetch for this group was *attempted* (success or failure) less than 60 seconds ago → the cached `Group` resolves immediately, **no I/O**;
- otherwise → `fetch` runs once; concurrent `ensure` calls for the same group share a single in-flight request;
- a failed fetch counts as an attempt: the window backs off (dispatches keep serving the last known state) and the next `ensure` after the window retries.

Never throws for cache misses — failures surface exactly like [`fetch`](#fetch) (`NotFoundError` / `PermissionError` / `BackendError`).

```ts
const g = await client.groups.ensure("120363012345678901@g.us");
g.memberCount; // answered from the cache when the window is young
```

### `fetch`

```ts
fetch(target): Promise<Group>
```

Fetches full metadata and returns a **synchronized** `Group`: metadata applied, `name` cache updated, participants mapped to `User`s (with `isMe` set) — so a group fetched under a bare id round-trips with `group.id` in canonical `…@g.us` form. Always a provider round-trip: it bypasses the 60-second cache and (re)starts the window (same for `group.refresh()`).

**Errors:** `NotFoundError` / `PermissionError` (library errors from the backend pass through: `ERR_NOT_FOUND` / `ERR_PERMISSION`) and `BackendError` otherwise (context `Failed to fetch group <id>`).

```ts
const g = await client.groups.fetch("120363012345678901"); // bare id from a group link
g.id; // "120363012345678901@g.us" — canonical form
g.memberCount; g.announceOnly; g.owner?.displayName;
```

### `addMembers` / `removeMembers`

```ts
addMembers(group, users): Promise<void>
removeMembers(group, users): Promise<void>
```

Membership changes — **admin rights required** (provider-side `PermissionError` when missing).

**Errors** (the capability check runs before the empty-list check):

| Condition | Error | Code |
| --- | --- | --- |
| backend lacks `updateGroupParticipants` | `UnsupportedOperationError` | `ERR_UNSUPPORTED` |
| `users` empty | `ValidationError` | `ERR_EMPTY_USER_LIST` |
| provider failure | `PermissionError` (admin rights, 401–403) / `NotFoundError` (404) / `BackendError` otherwise | `ERR_PERMISSION` / `ERR_NOT_FOUND` / `ERR_BACKEND` |

### `promote` / `demote`

```ts
promote(group, users): Promise<void>
demote(group, users): Promise<void>
```

Role changes — same error semantics as membership (`Failed to promote/demote group participants` contexts).

### `rename`

```ts
rename(group, name): Promise<void>
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
setDescription(group, description: string | undefined): Promise<void>
```

Sets the group description — `undefined` **clears** it (the capability check runs first; there is no empty-value validation, unlike `rename`).

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
if (i.isCommand() && i.command?.groupOnly && i.isFromGroup()) {
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
