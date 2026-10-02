# Changelog

All notable changes to the **libwa** package (this site documents `libwa`, not the docs repo). Versions follow [Semantic Versioning](https://semver.org): minor bumps may contain breaking changes while the major version is `0` — each entry spells them out.

## 0.3.0 (2026-10-01)

### Removed

- **Breaking:** `GroupMember.tag` is gone — providers never delivered member labels, so the field was `undefined` in every real payload. Use the member's `user.displayName` (`name` → `phone` → `id`), or read raw provider labels from `GroupMetadata.participants[].name` / `username`:

  ```ts
  // before (0.2.0)
  group.members.forEach((m) => console.log(m.tag ?? m.user.displayName, m.role));
  // after (0.3.0)
  group.members.forEach((m) => console.log(m.user.displayName, m.role));
  ```

### Added

- **`client.groups.ensure(target)`** — resolve a group through the client's metadata cache: when a fetch for that group was attempted within the last **60 seconds**, the cached `Group` resolves with no I/O; otherwise a single fetch runs (concurrent calls for the same group share one in-flight request). `interaction.member` is still `{ user, role }` — only the label is gone.
- **Membership events patch the cache.** `add`/`remove`/`promote`/`demote` events are applied to the cached group metadata before the interaction builds — participants, roles and `memberCount` follow the event with no refetch. Patches are idempotent, match members across both id schemes (LID ↔ phone number via recorded pairs), and never downgrade a superadmin on a stray `promote`.

### Changed

- **Group metadata is fetched at most once per group per minute.** Every group interaction — participant, update, and message-family in a group — resolves metadata through `ensure()` instead of round-tripping whenever possible; events patch the cache between fetches, so `interaction.group` still reflects the event itself while fetch pressure stays bounded (anti-ban). Expect `group`/`member` data up to 60 seconds stale on quiet groups.
- **Failures back off for the window.** A failed refresh marks the group for the rest of the 60 seconds: dispatches keep serving the last known state (logging `[group refresh]`) instead of retrying on every event, and the next `ensure` after the window retries.
- `fetch()` and `group.refresh()` are unchanged in contract — always a provider round-trip — and now explicitly restart the 60-second window.

## 0.2.0 (2026-09-29)

### Added

- **Group-scoped membership.** Every interaction exposes `member` — the author's `GroupMember { user, role, tag }` inside `group` (`undefined` outside groups, for author-less events, or while group metadata is unknown). `Group.member(id | user)` looks one account up across both id schemes, and group metadata now carries participant `username`s (feeding `tag`).
- **Profile enrichment on `client.users`**, each behind its own optional backend capability:
  - `pictureUrl(id, type?)` — profile-picture URL (`"image"` default / `"preview"`); absent or privacy-hidden → `undefined` (`getProfilePictureUrl`);
  - `about(id)` — about/bio text; unset or hidden → `undefined` (`getAbout`);
  - `accountType(id)` — `"standard" | "business"` by probing the business profile (`getBusinessProfile`).
  New exports: `GroupMember`, `AccountType`, `ProfilePictureType`, `BackendBusinessProfile`.
- **LID ↔ phone id pairs** captured from message keys, reaction/update keys, membership events and group metadata (`idPairs`, `GroupParticipant.altId`), so linked ids resolve under either scheme.
- **`client.users` identity service** — `phone(id)` / `altId(id)` (synchronous, from recorded pairs), `resolvePhone(id)` / `resolveLid(id)` (fall back to the optional `getPhoneNumberForLid` / `getLidForPhoneNumber` capabilities), and `fetch(id)` — account existence + name under either id scheme (`fetchUser` capability; lids resolve through recorded pairs first).
- **Display-name memory.** Every push name (and provider-supplied lookup name) is stored under both id schemes, so later id-only payloads — mentions, reactions, group members, fetch results — still answer with `user.name`.
- **Bare group ids.** `client.groups.*` accept the bare number (`"120363012345678901"`) and append `@g.us`.
- **`interaction.group` on every interaction** with `isFromGroup()` narrowing, plus the `interaction.user` shortcut (affected participant) on group participant events.

### Changed

- **Breaking:** `Group.members` now returns `readonly GroupMember[]` (was `readonly User[]`). Use `member.user` for the account-level entity, `member.role` / `member.tag` for group-scoped data:

  ```ts
  // before
  group.members.forEach((m) => console.log(m.displayName, m.id));
  // after
  group.members.forEach((m) => console.log(m.tag ?? m.user.displayName, m.user.id, m.role));
  ```
- Group metadata is refreshed before participant/update interactions, and fetched **once per group** (cached afterwards) before group message-family dispatches so `interaction.member` can answer; failed refreshes log a warning and dispatch with cached state instead of dropping the event.

### Fixed

- The mapper now surfaces content riding along with sender-key distribution — the first message in a group (which carries the distribution alongside its text) no longer arrives empty.
- Group update changes (name/description/announceOnly/locked) are applied to the cached group metadata before the interaction is built.

## 0.1.0 (2026-09-27)

Initial baseline — the library as first published:

- Interaction-driven core: typed interaction hierarchy with `isMessage()` / `isCommand()` / `isReaction()`-style guards, `InteractionFactory`, middleware pipeline, command registry (prefixes, aliases, args, `groupOnly` / `dmOnly`), typed events and a stable `WhatsAppError` hierarchy.
- Entities: `Chat` / `Group` / `Message` / `User` with cached chat identity, lazy media downloads (`Uint8Array` + `download()`), and entity actions delegating to services.
- Services: `client.messages` (send/react/edit/delete with payload validation), `client.groups` (metadata, participants, rename/description).
- Pluggable backend contract (`WhatsAppBackend`) with honest optional capabilities and normalized events; bundled Baileys adapter (auth on `SessionStore`, mapper, disconnect-reason mapping).
- Sessions (`FileSessionStore` / `MemorySessionStore`), client-owned reconnection with exponential backoff, pairing-code login, public-API leak guard (`check:exports`), docs and typechecked examples.
