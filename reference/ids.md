# IDs & helpers

<ApiBadge kind="type" /> Identifier and utility types shared across the whole API. All are plain strings at runtime — loggable, storable, comparable.

```ts
import type { ChatId, UserId, Unsubscribe } from "libwa.js";
import { phoneFromId } from "libwa.js";
```

## `ChatId`

```ts
type ChatId = string;
```

Identifier of any conversation: direct chat (`5511999999999@s.whatsapp.net`), group (`1203630…@g.us`), broadcast list, newsletter, or provider-specific shapes. Produced by backends; the core only passes it around.

Used by: `Chat.id`, `MessageService` targets, `GroupService` targets, every `Backend*Request`.

## `UserId`

```ts
type UserId = string;
```

Identifier of a user — the same value a direct chat's `ChatId` carries. Used by: `User.id`, mentions, group participant requests, event payloads.

WhatsApp has **two id schemes for the same account** ([JID vs LID](https://baileys.wiki/concepts/jids)):

| Scheme | Shape | Carries the phone number? |
| --- | --- | --- |
| Phone-number JID (PNJID) | `5511999999999@s.whatsapp.net` (legacy `@c.us`) | yes — digits are the id |
| Linked id (LIDJID) | `123456789012345@lid` | no — opaque, assigned to hide the number |

Which form arrives depends on the chat's addressing mode (modern groups are LID-addressed), so never assume digits. Both forms are produced by backends, compared with `===`, and interchangeable as far as the API is concerned — sending a message or a mention works with whichever id you were given. To cross from one scheme to the other, use [`client.users`](/reference/entities#userservice) (`phone` / `resolvePhone` / `altId` / `resolveLid`; `fetch` checks an account's existence and name under either form); events, group metadata and membership changes carry the raw pairs as `idPairs` / `GroupParticipant.altId` and the library records them automatically.

<ApiNote kind="info">
The two aliases are structurally both <code>string</code> — TypeScript will not stop you from swapping them. The distinction is documentation: chat ids name conversations, user ids name accounts.
</ApiNote>

## `Unsubscribe`

```ts
type Unsubscribe = () => void;
```

Returned by event subscriptions:

- `client.on / once` → removes that listener;
- `backend.on(...)` → detaches that backend listener.

```ts
const stop = client.on("ready", handler);
stop(); // later
```

Calling a used/unsubscribed handle twice is harmless (idempotent deletes in the emitter).

## `phoneFromId`

```ts
function phoneFromId(id: string): string | undefined
```

Protocol-level helper: extracts digits from a standard user JID matching `/^(\d{5,})@(?:s\.whatsapp\.net|c\.us)$/`.

```ts
phoneFromId("5511999999999@s.whatsapp.net"); // "5511999999999"
phoneFromId("5511999999999@c.us");           // "5511999999999" (legacy)
phoneFromId("1203630…@g.us");                // undefined (group id)
phoneFromId("123456789012345@lid");          // undefined (linked id — no digits)
```

`User.phone` uses it internally; call it directly when you only have an id string. It never resolves linked ids — for that use [`client.users`](/reference/entities#userservice).

## Conventions

| Rule | Detail |
| --- | --- |
| Strings, not branded types | ids serialize to JSON as-is and compare with `===` |
| Provider produces them | core never fabricates ids; backends map raw provider formats once |
| Derived phone numbers | only via `phoneFromId`/`User.phone`/`client.users` — never by parsing in user code |
| Session slot ids are different | `ClientOptions.sessionId` uses `[A-Za-z0-9_-]{1,64}` ([sessions](/reference/sessions#assertsafesessionid)) |

## See also

- [Entities](/reference/entities) — `Chat`, `User`, `Message` built from ids
- [UserService](/reference/entities#userservice) — resolving between id schemes, fetching accounts under either id
- [Events](/reference/client-events) — `Unsubscribe` usage
