# Changelog

All notable changes to the **libwa** package (this site documents `libwa`, not the docs repo). Versions follow [Semantic Versioning](https://semver.org): minor bumps may contain breaking changes while the major version is `0` — each entry spells them out.

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
