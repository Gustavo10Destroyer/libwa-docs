# API overview

Everything libwa publishes comes from **one module**: the package root.

```ts
import { Client, type Interaction } from "libwa";
```

There are no deep imports — `package.json` `exports` exposes only `.` (plus `./package.json`), and `npm run check:exports` proves no provider type leaks into the surface (see [Public API guard](/development/public-api-guard)). The table below is the complete export list of `src/index.ts`.

::: tip Reading the reference
Each page documents signatures, parameters, return values, errors, and examples. Symbol pages cross-link related guides. <ApiBadge kind="internal" /> marks things that exist in the repository but are **not** exported (documented for contributors extending the library).
:::

## Client & configuration

| Export | Kind | Page |
| --- | --- | --- |
| `Client` | class | [Client](/reference/client) |
| `ClientState` | type | [Client](/reference/client#clientstate) |
| `ClientEvents` | interface (type) | [Client events](/reference/client-events) |
| `ClientOptions` | interface | [ClientOptions](/reference/client-options) |
| `CommandOptions` | interface | [ClientOptions](/reference/client-options#commandoptions) |
| `ReconnectOptions` | interface | [ClientOptions](/reference/client-options#reconnectoptions) |
| `ResolvedClientOptions` | interface | [ClientOptions](/reference/client-options#resolvedclientoptions) |

## Errors

| Export | Kind | Page |
| --- | --- | --- |
| `WhatsAppError` | class | [Errors](/reference/errors#whatsapperror) |
| `ConnectionError` | class | [Errors](/reference/errors#connectionerror) |
| `AuthenticationError` | class | [Errors](/reference/errors#authenticationerror) |
| `MessageError` | class | [Errors](/reference/errors#messageerror) |
| `PermissionError` | class | [Errors](/reference/errors#permissionerror) |
| `NotFoundError` | class | [Errors](/reference/errors#notfounderror) |
| `BackendError` | class | [Errors](/reference/errors#backenderror) |
| `UnsupportedOperationError` | class | [Errors](/reference/errors#unsupportedoperationerror) |
| `ValidationError` | class | [Errors](/reference/errors#validationerror) |
| `WhatsAppErrorOptions` | interface | [Errors](/reference/errors#whatsapperroroptions) |
| `toError` | function | [Errors](/reference/errors#toerror) |
| `rethrowAsBackendError` | function | [Errors](/reference/errors#rethrowasbackenderror) |

## Core types

| Export | Kind | Page |
| --- | --- | --- |
| `DisconnectReason` | enum | [DisconnectReason](/reference/disconnect-reason) |
| `FATAL_DISCONNECT_REASONS` | constant | [DisconnectReason](/reference/disconnect-reason#fatal-disconnect-reasons) |
| `ChatId`, `UserId`, `Unsubscribe` | types | [IDs & helpers](/reference/ids) |
| `MessageContent` + 12 content interfaces | types | [Message content](/reference/content) |
| `Attachment`, `MediaInfo`, `MediaKind`, `ContactCard` | types | [Message content](/reference/content#media) |
| `contentText`, `contentAttachments` | functions | [Message content](/reference/content#helpers) |

## Entities

| Export | Kind | Page |
| --- | --- | --- |
| `Chat`, `Group` | classes | [Entities](/reference/entities) |
| `ChatKind`, `GroupMetadata`, `GroupParticipant`, `GroupRole`, `GroupParticipantAction`, `GroupUpdateChanges` | types | [Entities](/reference/entities#group-types) |
| `Message`, `MessageReference` | class / interface | [Entities](/reference/entities#message) |
| `User`, `phoneFromId` | class / function | [Entities](/reference/entities#user) |

## Interactions

| Export | Kind | Page |
| --- | --- | --- |
| `Interaction` | abstract class | [Interactions](/reference/interactions#interaction) |
| `InteractionType` | enum | [Interactions](/reference/interactions#interactiontype) |
| `MessageInteraction` | class | [Interactions](/reference/interactions#messageinteraction) |
| `CommandInteraction` | class | [Interactions](/reference/interactions#commandinteraction) |
| `ReactionInteraction` | class | [Interactions](/reference/interactions#reactioninteraction) |
| `MessageUpdateInteraction` | class | [Interactions](/reference/interactions#messageupdateinteraction) |
| `GroupParticipantInteraction` | class | [Interactions](/reference/interactions#groupparticipantinteraction) |
| `GroupUpdateInteraction` | class | [Interactions](/reference/interactions#groupupdateinteraction) |
| `ButtonInteraction` | class | [Interactions](/reference/interactions#buttoninteraction) |
| `ListInteraction` | class | [Interactions](/reference/interactions#listinteraction) |
| `CommandParsingOptions` | interface | [Interactions](/reference/interactions#commandparsingoptions) |

## Commands, messaging, groups, middleware

| Export | Kind | Page |
| --- | --- | --- |
| `CommandRegistry` | class | [Commands](/reference/commands#commandregistry) |
| `ParsedCommand` | interface | [Commands](/reference/commands#parsedcommand) |
| `CommandDefinition` | interface | [Commands](/reference/commands#commanddefinition) |
| `MessageService`, `SendTarget` | class / type | [Messaging](/reference/messaging#messageservice) |
| `MessagePayload`, `ReplyContent`, `SendOptions`, `MediaSource` | types | [Messaging](/reference/messaging#types) |
| `GroupService`, `GroupTarget` | class / type | [Groups](/reference/groups#groupservice) |
| `Middleware` | type | [Middleware](/reference/middleware#middleware) |

## Infrastructure

| Export | Kind | Page |
| --- | --- | --- |
| `Logger`, `nullLogger`, `createConsoleLogger` | interface / values | [Logger](/reference/logger) |
| `Session`, `SessionStore` | interfaces | [Sessions](/reference/sessions#session) |
| `FileSessionStore`, `FileSessionStoreOptions` | class / interface | [Sessions](/reference/sessions#filesessionstore) |
| `MemorySessionStore` | class | [Sessions](/reference/sessions#memorysessionstore) |
| `TypedEventEmitter` **not exported** | class | [TypedEventEmitter](/reference/typed-event-emitter) (internal) |

## Backend contract

| Export | Kind | Page |
| --- | --- | --- |
| `WhatsAppBackend` | interface | [Backend](/reference/backend#whatsappbackend) |
| `BackendConnectOptions` | interface | [Backend](/reference/backend#backendconnectoptions) |
| `OutboundContent` | type | [Backend](/reference/backend#outboundcontent) |
| `BackendSendMessage`, `BackendSentMessage`, `BackendMediaDownload` | interfaces | [Backend](/reference/backend#requests) |
| `BackendReactRequest`, `BackendEditMessageRequest`, `BackendDeleteMessageRequest` | interfaces | [Backend](/reference/backend#requests) |
| `BackendGroupParticipantsRequest`, `BackendGroupNameRequest`, `BackendGroupDescriptionRequest` | interfaces | [Backend](/reference/backend#requests) |
| `BackendEventMap` + event payloads | interfaces | [Backend](/reference/backend#backendeventmap) |
| `BackendEventName`, `BackendEventListener` | types | [Backend](/reference/backend#backendeventmap) |
| `createDefaultBackend` | function | [Backend](/reference/backend#createdefaultbackend) |
| `createBaileysBackend`, `BaileysBackendOptions` | function / interface | [Backend](/reference/backend#createbaileysbackend) |

## Internal (not exported)

Relevant for contributors; documented on the pages above with <ApiBadge kind="internal" />:

| Symbol | Location | Page |
| --- | --- | --- |
| `resolveClientOptions` | `src/ClientOptions.ts` | [ClientOptions](/reference/client-options#resolveclientoptions) |
| `EntityFactory` | `src/entities/EntityFactory.ts` | [Entities](/reference/entities#entityfactory) |
| `InteractionFactory` | `src/interactions/InteractionFactory.ts` | [Interactions](/reference/interactions#interactionfactory) |
| `runMiddlewareChain` | `src/middleware/compose.ts` | [Middleware](/reference/middleware#runmiddlewarechain) |
| `normalizeReplyContent`, `NormalizedPayload` | `src/messaging/payload.ts` | [Messaging](/reference/messaging#normalizereplycontent) |
| `TypedEventEmitter` and its types | `src/events/TypedEventEmitter.ts` | [TypedEventEmitter](/reference/typed-event-emitter) |
| `assertSafeSessionId` | `src/auth/FileSessionStore.ts` | [Sessions](/reference/sessions#assertsafesessionid) |
| Baileys adapter modules | `src/backend/baileys/*` | [Backends guide](/guide/backends#baileys-adapter-internals) |
