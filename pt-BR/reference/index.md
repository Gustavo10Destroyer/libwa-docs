# Visão geral da API {#api-overview}

Tudo o que o libwa.js publica vem de **um único módulo**: a raiz do pacote.

```ts
import { Client, type Interaction } from "libwa.js";
```

Imports profundos não são suportados — não que sejam fisicamente impossíveis: o campo `exports` do `package.json` expõe apenas `.` (além de `./package.json`), então resolvers conscientes de exports rejeitam qualquer caminho profundo — enquanto ferramentas legadas com `moduleResolution: "node"` ainda conseguem alcançar `dist/` diretamente. `npm run check:exports` comprova que nenhum tipo de provedor vaza para a superfície (veja [Guarda da API pública](/pt-BR/development/public-api-guard)). A tabela abaixo é a lista completa de exports de `src/index.ts`.

::: tip Lendo a referência
Cada página documenta assinaturas, parâmetros, valores de retorno, erros e exemplos. Páginas de símbolos fazem referência cruzada aos guias relacionados. <ApiBadge kind="internal" /> marca coisas que existem no repositório mas **não** são exportadas (documentadas para colaboradores que estendem a biblioteca).
:::

## Client e configuração {#client-configuration}

| Exportação | Categoria | Página |
| --- | --- | --- |
| `Client` | class | [Client](/pt-BR/reference/client) |
| `ClientState` | type | [Client](/pt-BR/reference/client#clientstate) |
| `ClientEvents` | interface (type) | [Eventos do client](/pt-BR/reference/client-events) |
| `ClientOptions` | interface | [ClientOptions](/pt-BR/reference/client-options) |
| `CommandOptions` | interface | [ClientOptions](/pt-BR/reference/client-options#commandoptions) |
| `ReconnectOptions` | interface | [ClientOptions](/pt-BR/reference/client-options#reconnectoptions) |
| `ResolvedClientOptions` | interface | [ClientOptions](/pt-BR/reference/client-options#resolvedclientoptions) |

## Erros {#errors}

| Exportação | Categoria | Página |
| --- | --- | --- |
| `WhatsAppError` | class | [Erros](/pt-BR/reference/errors#whatsapperror) |
| `ConnectionError` | class | [Erros](/pt-BR/reference/errors#connectionerror) |
| `AuthenticationError` | class | [Erros](/pt-BR/reference/errors#authenticationerror) |
| `MessageError` | class | [Erros](/pt-BR/reference/errors#messageerror) |
| `PermissionError` | class | [Erros](/pt-BR/reference/errors#permissionerror) |
| `NotFoundError` | class | [Erros](/pt-BR/reference/errors#notfounderror) |
| `BackendError` | class | [Erros](/pt-BR/reference/errors#backenderror) |
| `UnsupportedOperationError` | class | [Erros](/pt-BR/reference/errors#unsupportedoperationerror) |
| `ValidationError` | class | [Erros](/pt-BR/reference/errors#validationerror) |
| `WhatsAppErrorOptions` | interface | [Erros](/pt-BR/reference/errors#whatsapperroroptions) |
| `toError` | function | [Erros](/pt-BR/reference/errors#toerror) |
| `rethrowAsBackendError` | function | [Erros](/pt-BR/reference/errors#rethrowasbackenderror) |

## Tipos centrais {#core-types}

| Exportação | Categoria | Página |
| --- | --- | --- |
| `DisconnectReason` | enum | [DisconnectReason](/pt-BR/reference/disconnect-reason) |
| `FATAL_DISCONNECT_REASONS` | constant | [DisconnectReason](/pt-BR/reference/disconnect-reason#fatal-disconnect-reasons) |
| `ChatId`, `UserId`, `Unsubscribe` | types | [IDs e utilitários](/pt-BR/reference/ids) |
| `MessageContent` + 12 interfaces de conteúdo | types | [Conteúdo da mensagem](/pt-BR/reference/content) |
| `Attachment`, `MediaInfo`, `MediaKind`, `ContactCard` | types | [Conteúdo da mensagem](/pt-BR/reference/content#media) |
| `contentText`, `contentAttachments` | functions | [Conteúdo da mensagem](/pt-BR/reference/content#helpers) |

## Entidades {#entities}

| Exportação | Categoria | Página |
| --- | --- | --- |
| `Chat`, `Group` | classes | [Entidades](/pt-BR/reference/entities) |
| `ChatKind`, `GroupMember`, `GroupMetadata`, `GroupParticipant`, `GroupRole`, `GroupParticipantAction`, `GroupUpdateChanges` | types | [Entidades](/pt-BR/reference/entities#group-types) |
| `Message`, `MessageReference` | class / interface | [Entidades](/pt-BR/reference/entities#message) |
| `User`, `phoneFromId` | class / function | [Entidades](/pt-BR/reference/entities#user) |

## Interações {#interactions}

| Exportação | Categoria | Página |
| --- | --- | --- |
| `Interaction` | abstract class | [Interações](/pt-BR/reference/interactions#interaction) |
| `InteractionType` | enum | [Interações](/pt-BR/reference/interactions#interactiontype) |
| `MessageInteraction` | class | [Interações](/pt-BR/reference/interactions#messageinteraction) |
| `CommandInteraction` | class | [Interações](/pt-BR/reference/interactions#commandinteraction) |
| `ReactionInteraction` | class | [Interações](/pt-BR/reference/interactions#reactioninteraction) |
| `MessageUpdateInteraction` | class | [Interações](/pt-BR/reference/interactions#messageupdateinteraction) |
| `GroupParticipantInteraction` | class | [Interações](/pt-BR/reference/interactions#groupparticipantinteraction) |
| `GroupUpdateInteraction` | class | [Interações](/pt-BR/reference/interactions#groupupdateinteraction) |
| `ButtonInteraction` | class | [Interações](/pt-BR/reference/interactions#buttoninteraction) |
| `ListInteraction` | class | [Interações](/pt-BR/reference/interactions#listinteraction) |
| `CommandParsingOptions` | interface | [Interações](/pt-BR/reference/interactions#commandparsingoptions) |

## Serviços {#services}

| Exportação | Categoria | Página |
| --- | --- | --- |
| `CommandRegistry` | class | [Comandos](/pt-BR/reference/commands#commandregistry) |
| `ParsedCommand` | interface | [Comandos](/pt-BR/reference/commands#parsedcommand) |
| `CommandDefinition` | interface | [Comandos](/pt-BR/reference/commands#commanddefinition) |
| `MessageService`, `SendTarget` | class / type | [Mensageria](/pt-BR/reference/messaging#messageservice) |
| `MessagePayload`, `ReplyContent`, `SendOptions`, `MediaSource` | types | [Mensageria](/pt-BR/reference/messaging#types) |
| `GroupService`, `GroupTarget` | class / type | [Grupos](/pt-BR/reference/groups#groupservice) |
| `UserService`, `AccountType` | class / type | [Entidades](/pt-BR/reference/entities#userservice) |
| `Middleware` | type | [Middleware](/pt-BR/reference/middleware#middleware) |

## Infraestrutura {#infrastructure}

| Exportação | Categoria | Página |
| --- | --- | --- |
| `Logger`, `nullLogger`, `createConsoleLogger` | interface / values | [Logger](/pt-BR/reference/logger) |
| `Session`, `SessionStore` | interfaces | [Sessões](/pt-BR/reference/sessions#session) |
| `FileSessionStore`, `FileSessionStoreOptions` | class / interface | [Sessões](/pt-BR/reference/sessions#filesessionstore) |
| `SqliteSessionStore`, `SqliteSessionStoreOptions` | class / interface | [Sessões](/pt-BR/reference/sessions#sqlitesessionstore) |
| `MemorySessionStore` | class | [Sessões](/pt-BR/reference/sessions#memorysessionstore) |
| `TypedEventEmitter` **não exportado** | class | [TypedEventEmitter](/pt-BR/reference/typed-event-emitter) (interno) |

## Contrato do backend {#backend-contract}

| Exportação | Categoria | Página |
| --- | --- | --- |
| `WhatsAppBackend` | interface | [Backend](/pt-BR/reference/backend#whatsappbackend) |
| `BackendConnectOptions` | interface | [Backend](/pt-BR/reference/backend#backendconnectoptions) |
| `OutboundContent` | type | [Backend](/pt-BR/reference/backend#outboundcontent) |
| `BackendSendMessage`, `BackendSentMessage`, `BackendMediaDownload` | interfaces | [Backend](/pt-BR/reference/backend#requests) |
| `BackendReactRequest`, `BackendEditMessageRequest`, `BackendDeleteMessageRequest` | interfaces | [Backend](/pt-BR/reference/backend#requests) |
| `BackendGroupParticipantsRequest`, `BackendGroupNameRequest`, `BackendGroupDescriptionRequest` | interfaces | [Backend](/pt-BR/reference/backend#requests) |
| `BackendEventMap` + payloads de eventos, `BackendIdPair` | interfaces | [Backend](/pt-BR/reference/backend#backendeventmap) |
| `BackendEventName`, `BackendEventListener` | types | [Backend](/pt-BR/reference/backend#backendeventmap) |
| `BackendUserLookup` | interface | [Backend](/pt-BR/reference/backend#account-lookup-type) |
| `BackendBusinessProfile`, `ProfilePictureType` | interface / type | [Backend](/pt-BR/reference/backend#profile-enrichment-types) |
| `createDefaultBackend` | function | [Backend](/pt-BR/reference/backend#createdefaultbackend) |
| `createBaileysBackend`, `BaileysBackendOptions` | function / interface | [Backend](/pt-BR/reference/backend#createbaileysbackend) |

## Interno (não exportado) {#internal-not-exported}

Relevante para colaboradores; documentado nas páginas acima com <ApiBadge kind="internal" />:

| Símbolo | Local | Página |
| --- | --- | --- |
| `resolveClientOptions` | `src/ClientOptions.ts` | [ClientOptions](/pt-BR/reference/client-options#resolveclientoptions) |
| `EntityFactory` | `src/entities/EntityFactory.ts` | [Entidades](/pt-BR/reference/entities#entityfactory) |
| `InteractionFactory` | `src/interactions/InteractionFactory.ts` | [Interações](/pt-BR/reference/interactions#interactionfactory) |
| `runMiddlewareChain` | `src/middleware/compose.ts` | [Middleware](/pt-BR/reference/middleware#runmiddlewarechain) |
| `normalizeReplyContent`, `NormalizedPayload` | `src/messaging/payload.ts` | [Mensageria](/pt-BR/reference/messaging#normalizereplycontent) |
| `TypedEventEmitter` e seus tipos | `src/events/TypedEventEmitter.ts` | [TypedEventEmitter](/pt-BR/reference/typed-event-emitter) |
| `assertSafeSessionId` | `src/auth/SessionStore.ts` | [Sessões](/pt-BR/reference/sessions#assertsafesessionid) |
| Módulos do adaptador Baileys | `src/backend/baileys/*` | [Guia de backends](/pt-BR/guide/backends#baileys-adapter-internals) |
