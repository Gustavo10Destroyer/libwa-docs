# Changelog

All notable changes to the **libwa.js** package (this site documents `libwa.js`, not the docs repo). Versions follow [Semantic Versioning](https://semver.org): minor bumps may contain breaking changes while the major version is `0` — each entry spells them out.

## 0.4.0 (2026-10-07)

Work on `libwa.js`'s main branch since 0.3.0, now released.

### Added

- **`SqliteSessionStore`** — the store to run a bot on in production. One SQLite database file holds every session slot, so credentials survive restarts, several bot processes can share a deployment, and moving the bot means copying one file instead of a directory tree.
  - WAL journal + `synchronous = FULL` for crash safety, `busy_timeout` (default 5000 ms) so a second writer blocks instead of failing with `SQLITE_BUSY`, and one transactional `INSERT … ON CONFLICT` upsert per save.
  - Schema version in `PRAGMA user_version`: a database written by a newer libwa.js is refused rather than opened with a schema this build does not understand.
  - Ids validated exactly like `FileSessionStore`; a row with the wrong column types → `ERR_SESSION_CORRUPT`; every failure after `close()` → `ERR_SESSION_STORE`.
  - Backed by `better-sqlite3` (a regular dependency), loaded lazily through `createRequire` — `import "libwa.js"` never touches the native binding. An install done with `--ignore-scripts` fails with an actionable `ERR_SESSION_STORE`, not a load crash.
  - Options: `filename` (default `libwa.js-sessions.db`, `":memory:"` and `file:` URIs supported, parent directories created) and `busyTimeoutMs`.
- **`SessionStore.close?()`** — an optional teardown hook on the store contract. libwa.js never calls it: the store's creator owns the handle and calls `close()` on shutdown, and every operation on a closed `SqliteSessionStore` rejects with `ERR_SESSION_STORE` instead of reopening the file behind your back.
- **`Client.isSelf(id)`** — synchronous "is this the bot account?" check that answers under either id scheme (recorded pairs included).
- **`Interaction.reply(content, options?)` and `Message.reply(content, options?)`** — interaction-aware replies that quote the message being answered, with `replyToMessageId` / `quote` precedence spelled out.
- **`ERR_SESSION_UNREADABLE`** — a session file that exists but cannot be read (permissions, I/O) now raises `ValidationError` with this code and the original cause, instead of looking like "no session".
- **`prepare` script** — `npm install` from a git checkout now runs `npm run build`, so a checkout is usable without a manual build step.
- **CI workflow** — `.github/workflows/ci.yml`: Node 20, `npm ci`, `npm run verify`, on pushes to `main` and on pull requests.

### Changed

- **Breaking:** engines raised from `>=18.17` to `>=20.0.0` — the bundled Baileys provider declares the same floor.
- **`npm run build` clears `dist/` first** via `scripts/clean-dist.mjs` (`node scripts/clean-dist.mjs && tsc -p tsconfig.build.json`), so renamed or removed files cannot survive as stale output.
- **`@whiskeysockets/baileys` pinned to `7.0.0-rc14`** instead of a caret range, so a floating prerelease cannot drift underneath a released version.
- **Deterministic listener ordering** — listeners dispatch in registration order over a snapshot, with `once` listeners consumed before dispatch, so re-entrant emissions cannot reorder handlers.
- **Whole-definition command registration validation** — `commands.register()` validates the name, aliases and every conflict before committing anything, so a rejected registration leaves the registry exactly as it was; `parse()` now picks the **longest** matching prefix (array order only breaks ties).
- **`login()` and `logout()` race-proofing** — a `connecting` latch makes concurrent `login()` calls share one attempt, a `loggingOut` latch stops a logout that raced a disconnect from reconnecting, a pending reconnect timer is cancelled when a login lands, and the backend is built once per connect instead of once per attempt.
- **Stale-socket guard in the Baileys backend** — every `makeWASocket()` bumps a connect generation and every handler, disconnect path and handshake timeout bails when it belongs to a stale one, so a reconnect raced by a disconnect can no longer resurrect a dead socket.
- **Pairing-code requests are no longer one-shot** per session file: `needs-pairing` consults the credentials instead of a latched flag, a failed request re-arms the next attempt, and replies that a newer attempt superseded are discarded.
- **String content resolves mentions** — `send(chat, "@1234…", { mentions })` now tags the target the same way an object payload does.
- **Bounded entity caches** — `EntityFactory` caps chats (LRU 512), group metadata (512), id pairs (4096) and display names (4096) instead of growing without limit; `logout()` and `destroy()` reset them so the next account never answers from the previous one.
- **`GroupUpdateInteraction.changes` is a real diff** — `added`, `removed` and role-only lists computed from the before/after participant sets, with a cleared field arriving as `undefined` so consumers can tell "cleared" from "untouched".
- **`FileSessionStore` maps only `ENOENT` to "no session"** — a corrupt file surfaces `ERR_SESSION_CORRUPT` instead of being silently discarded, and temp files are named with `randomUUID()` so two stores in one process never share a path.
- **`BaileysAuth.flush()` drains the write chain** until it is actually empty instead of resolving on the first settled batch.
- **`requestPairingCode()` without `auth.pairingPhoneNumber`** now throws `UnsupportedOperationError` instead of silently doing nothing.

### Fixed

- **Rejected middleware surfaces on the `error` event** — a detached `next()` that rejects is reported (context `middleware`) instead of escaping as an unhandled rejection.
- **Concurrent `login()` no longer starts overlapping connects**, and a `logout()` racing an in-flight `connect()` no longer leaves the login promise pending forever.
- **`send(chat, "text", { mentions })` stops dropping mentions.**
- **Group update events report diffs, not snapshots** — participant lists no longer claim that unchanged members were added or removed, and clearing a description now produces a `groupUpdate` event.
- **`UserService`'s JSDoc example compiles**; capability-gated calls throw the documented `UnsupportedOperationError` rather than a raw error.

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
