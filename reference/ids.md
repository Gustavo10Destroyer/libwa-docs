# IDs & helpers

<ApiBadge kind="type" /> Identifier and utility types shared across the whole API. All are plain strings at runtime — loggable, storable, comparable.

```ts
import type { ChatId, UserId, Unsubscribe } from "libwa";
import { phoneFromId } from "libwa";
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
phoneFromId("some@linked");                  // undefined
```

`User.phone` uses it internally; call it directly when you only have an id string.

## Conventions

| Rule | Detail |
| --- | --- |
| Strings, not branded types | ids serialize to JSON as-is and compare with `===` |
| Provider produces them | core never fabricates ids; backends map raw provider formats once |
| Derived phone numbers | only via `phoneFromId`/`User.phone` — never by parsing in user code |
| Session slot ids are different | `ClientOptions.sessionId` uses `[A-Za-z0-9_-]{1,64}` ([sessions](/reference/sessions#assertsafesessionid)) |

## See also

- [Entities](/reference/entities) — `Chat`, `User`, `Message` built from ids
- [Events](/reference/client-events) — `Unsubscribe` usage
