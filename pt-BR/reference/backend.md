# Backend {#backend}

<ApiBadge kind="interface" /> `WhatsAppBackend` é o contrato de adaptador de provedor — a costura que esconde o Baileys (ou qualquer provedor futuro). O core não depende de mais nada.

```ts
import type { WhatsAppBackend } from "libwa.js";
import { createDefaultBackend, createBaileysBackend } from "libwa.js";

new Client({ backend: createBaileysBackend({ syncFullHistory: false }) });
```

## WhatsAppBackend <ApiBadge kind="interface" /> {#whatsappbackend}

```ts
interface WhatsAppBackend {
  readonly id: string; // ex.: "baileys"

  // ciclo de vida
  connect(options: BackendConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // operações obrigatórias
  sendMessage(request: BackendSendMessage): Promise<BackendSentMessage>;
  downloadMedia(request: BackendMediaDownload): Promise<Uint8Array>;
  getGroupMetadata(chatId: ChatId): Promise<GroupMetadata>;

  // eventos
  on<Name extends BackendEventName>(event: Name, listener: BackendEventListener<Name>): Unsubscribe;

  // capacidades opcionais (detectáveis por feature)
  react?(request: BackendReactRequest): Promise<void>;
  editMessage?(request: BackendEditMessageRequest): Promise<void>;
  deleteMessage?(request: BackendDeleteMessageRequest): Promise<void>;
  updateGroupParticipants?(request: BackendGroupParticipantsRequest): Promise<void>;
  updateGroupName?(request: BackendGroupNameRequest): Promise<void>;
  updateGroupDescription?(request: BackendGroupDescriptionRequest): Promise<void>;
  requestPairingCode?(phoneNumber: string): Promise<string>;
  logout?(): Promise<void>;

  // resolução de identidade (LID ↔ número de telefone) + consulta de conta
  getPhoneNumberForLid?(lid: UserId): Promise<string | null>;
  getLidForPhoneNumber?(phone: string): Promise<UserId | null>;
  fetchUser?(phone: string): Promise<BackendUserLookup>;

  // enriquecimento de perfil (qualquer esquema de id)
  getProfilePictureUrl?(id: UserId, type: ProfilePictureType): Promise<string | undefined>;
  getAbout?(id: UserId): Promise<string | undefined>;
  getBusinessProfile?(id: UserId): Promise<BackendBusinessProfile | undefined>;
}
```

| Grupo | Membros | Falha quando ausente |
| --- | --- | --- |
| identidade | `id` | — (obrigatório, estável, usado em sessões/logs) |
| ciclo de vida | `connect` `disconnect` `isConnected` | o core não funciona sem eles |
| mensagens | `sendMessage` `downloadMedia` | obrigatório; erros lançados que não são `WhatsAppError` são embrulhados como `BackendError` (subclasses de `WhatsAppError` passam direto — o adaptador embutido reporta `MessageError`) |
| leitura de grupos | `getGroupMetadata` | obrigatório |
| eventos | `on` | obrigatório; o core inscreve uma vez por client |
| ops opcionais | `react` `editMessage` `deleteMessage` `updateGroupParticipants` `updateGroupName` `updateGroupDescription` `requestPairingCode` | `UnsupportedOperationError` (`ERR_UNSUPPORTED`) vindo do serviço — um `requestPairingCode` ausente é desta mesma classe, porque uma capacidade que a sua escolha de backend não tem é um problema de configuração, não uma operação de serviço |
| identidade | `getPhoneNumberForLid` `getLidForPhoneNumber` | sem erro — `client.users.resolvePhone`/`resolveLid` são consultas e resolvem `undefined` quando a capacidade está ausente |
| consulta de conta | `fetchUser` | `client.users.fetch` lança `UnsupportedOperationError` (`ERR_UNSUPPORTED`) — a existência é verificada, nunca assumida |
| enriquecimento de perfil | `getProfilePictureUrl` `getAbout` `getBusinessProfile` | `client.users.pictureUrl` / `about` / `accountType` lançam `UnsupportedOperationError` (`ERR_UNSUPPORTED`); *com* a capacidade, dados genuinamente ausentes/ocultos resolvem `undefined` (nunca confundido com uma capacidade ausente) |

A ausência de `logout` é a exceção: `Client.logout()` pula silenciosamente a revogação no backend quando o método está ausente (sem erro).

O par de identidade funciona da mesma forma por design: `resolvePhone`/`resolveLid` primeiro respondem a partir dos pares de id que a biblioteca registrou a partir dos eventos, depois recorrem a estes métodos (o adaptador do Baileys lê `signalRepository.lidMapping`) e resolvem `undefined` quando nenhum dos dois conhece o mapeamento — um lid que o provedor nunca viu simplesmente não tem número de telefone para fornecer.

### Tipo de consulta de conta {#account-lookup-type}

`fetchUser(phone)` é a única consulta que reporta de volta em vez de resolver `undefined` — mas apenas depois que `client.users` já transformou a entrada em **dígitos de telefone** (lids passam pelos pares registrados / `getPhoneNumberForLid` primeiro, então um backend nunca recebe um lid que não consegue analisar):

```ts
interface BackendUserLookup {
  exists: boolean;        // false → fetch resolve undefined
  name?: string;          // nome de exibição conhecido pelo provedor; tem prioridade sobre o push name lembrado
  verifiedName?: string;  // canal de nome de fallback (usado quando name está ausente)
}
```

O adaptador do Baileys embutido o implementa com a query `onWhatsApp` do WhatsApp (`exists: results.some(entry => entry.exists)`).

### Tipos de enriquecimento de perfil {#profile-enrichment-types}

Três consultas independentes, cada uma respondendo dados-ou-`undefined`:

```ts
type ProfilePictureType = "image" | "preview";

interface BackendBusinessProfile {
  description: string;                 // "" quando o provedor não fornece nenhum
  category: string | undefined;
  email: string | undefined;
  website: readonly string[];
  address: string | undefined;
}
```

- **`getProfilePictureUrl(id, type)`** — URL para `"image"` (padrão) ou `"preview"`; `undefined` quando a imagem está ausente ou oculta por privacidade (o adaptador do Baileys mapeia 401/403/404 para `undefined`).
- **`getAbout(id)`** — texto de about/bio; `undefined` quando não definido ou oculto (`""` vindo do provedor).
- **`getBusinessProfile(id)`** — perfil de negócios; `undefined` quando a sonda termina sem um (uma conta padrão). Falhas lançam erro; o adaptador do Baileys resolve entradas `…@lid` para números de telefone primeiro e lança `BackendError` quando o provedor não consegue mapeá-las.

As três aceitam qualquer esquema de id — [`client.users`](/pt-BR/reference/entities#userservice) normaliza a entrada do usuário antes de delegar.

Detecção de capacidade no código do usuário:

```ts
if (client.backend.react) { /* suportado */ }
```

## BackendConnectOptions <ApiBadge kind="interface" /> {#backendconnectoptions}

Tudo o que um backend precisa do client para conectar:

<ApiTable
  :rows="[
    { name: 'sessionId', type: 'string', description: 'Id do slot (ClientOptions.sessionId).' },
    { name: 'sessionStore', type: 'SessionStore', description: 'Carrega/salva a sessão opaca do provedor.' },
    { name: 'logger', type: 'Logger', description: 'Diagnósticos do provedor — a instância de logger que você injeta.' },
    { name: 'pairingPhoneNumber', type: 'string | undefined', description: 'Dígitos internacionais para solicitar automaticamente um código de pareamento, quando configurado.' }
  ]"
/>

`connect()` pode ser chamado novamente após `disconnect()` (caminho de reconexão) — os backends devem suportar conexões repetidas.

## Tipos de saída {#outbound-types}

### `OutboundContent` {#outboundcontent}

Conteúdo que o core entrega ao `sendMessage` — já validado por `normalizeReplyContent`:

```ts
type OutboundContent =
  | { kind: "text"; text: string }
  | { kind: "image" | "video" | "audio" | "document" | "sticker";
      data: Uint8Array; mimetype: string | undefined; fileName: string | undefined;
      caption: string | undefined; voice: boolean;
      durationSeconds: number | undefined; animated: boolean }
  | { kind: "location"; latitude: number; longitude: number;
      address: string | undefined; name: string | undefined };
```

### Requisições <ApiBadge kind="interface" /> {#requests}

| Tipo | Campos |
| --- | --- |
| `BackendSendMessage` | `chatId`, `content`, `replyToMessageId \| undefined`, `mentionUserIds` |
| `BackendSentMessage` | `id`, `chatId`, `chatKind`, `timestamp` — confirmação do provedor |
| `BackendMediaDownload` | `chatId`, `messageId` |
| `BackendReactRequest` | `chatId`, `messageId`, `emoji: string \| null` (`null` limpa) |
| `BackendEditMessageRequest` | `chatId`, `messageId`, `text` |
| `BackendDeleteMessageRequest` | `chatId`, `messageId` |
| `BackendGroupParticipantsRequest` | `chatId`, `userIds`, `action: "add"\|"remove"\|"promote"\|"demote"` |
| `BackendGroupNameRequest` | `chatId`, `name` |
| `BackendGroupDescriptionRequest` | `chatId`, `description: string \| undefined` (`undefined` limpa) |

Todos os campos são `readonly`; as requisições são dados puros — sem estruturas de provedor.

## `BackendEventMap` {#backendeventmap}

```ts
interface BackendEventMap {
  message: [event: BackendMessageEvent];
  messageUpdate: [event: BackendMessageUpdateEvent];
  reaction: [event: BackendReactionEvent];
  groupParticipants: [event: BackendGroupParticipantsEvent];
  groupUpdate: [event: BackendGroupUpdateEvent];
  connection: [event: BackendConnectionUpdate];
}
```

Os seis eventos normalizados — o **único** canal pelo qual o estado entra. Payloads:

| Evento | Destaques do payload |
| --- | --- |
| `message` | `id`, `chatId`, `chatKind`, `authorId`, `authorName?`, `timestamp`, `content`, `isFromMe`, `isForwarded`, `mentions`, `reference?`, `idPairs?` |
| `messageUpdate` | `action: "edit"\|"delete"`, `messageId`, `content?`, `authorId?`, `idPairs?` |
| `reaction` | `messageId`, `reactorId`, `emoji: string \| null` (`null` = removido), `idPairs?` |
| `groupParticipants` | `groupId`, `action`, `participantIds`, `actorId?`, `idPairs?` |
| `groupUpdate` | `groupId`, `changes: GroupUpdateChanges` |
| `connection` | `status: "connecting"\|"open"\|"close"`, `qr?`, `me?`, `reason?`, `detail?`, `pairingCode?` |

`idPairs?` (tipo [`BackendIdPair`](#backendeventmap)) é a lista opcional de pares de id LID ↔ número de telefone que o provedor anexou ao evento — chave da mensagem, chave da reação/atualização, ator e participantes afetados. A factory de interações registra cada par antes de a interação ser construída, assim [`client.users`](/pt-BR/reference/entities#userservice) e `User.phone` conhecem o mapeamento; backends que só veem um esquema simplesmente omitem o campo.

Tipos de apoio: `BackendMessageReference`, `BackendSelf` (`{ id, name? }`), `BackendIdPair` (`{ id, altId }` — dois ids da mesma conta em esquemas diferentes).

**Tipo de listener** de evento: `BackendEventListener<Name> = (...args: BackendEventMap[Name]) => void`; `on()` retorna um `Unsubscribe`.

```ts
const stop = backend.on("connection", (u) => {
  if (u.status === "open") console.log("open as", u.me?.id);
});
stop();
```

## `createDefaultBackend` {#createdefaultbackend}

```ts
function createDefaultBackend(): WhatsAppBackend
```

Retorna `createBaileysBackend()` com os padrões. O **único** módulo do core que referencia a factory de provedor (mantém o resto livre de provedor) — e é exportado para que você possa inspecionar/substituir o padrão explicitamente:

```ts
new Client();                                  // resolveClientOptions → undefined → isto
new Client({ backend: createDefaultBackend() }); // explícito, idêntico
```

## `createBaileysBackend` <ApiBadge kind="function" /> {#createbaileysbackend}

```ts
function createBaileysBackend(options?: BaileysBackendOptions): WhatsAppBackend
```

O adaptador do Baileys embutido (`id: "baileys"`). A classe em si é privada do módulo — apenas esta factory existe.

### `BaileysBackendOptions` <ApiBadge kind="interface" /> {#baileysbackendoptions}

<ApiTable
  :rows="[
    { name: 'browser', type: 'readonly [name: string, version: string, platform: string]', def: '[&quot;libwa.js&quot;, &quot;1.0.0&quot;, &quot;1&quot;]', description: 'Identidade de navegador exibida no celular em Linked devices.' },
    { name: 'syncFullHistory', type: 'boolean', def: 'false', description: 'Pede ao WhatsApp o histórico completo de chats no login — normalmente indesejado para bots.' }
  ]"
/>

```ts
createBaileysBackend({ browser: ["mybot", "2.0.0", "Chrome"], syncFullHistory: true });
```

Os internos do adaptador (mapeamento, auth, classificação de desconexão) ficam em `src/backend/baileys/` — veja o [guia de backends](/pt-BR/guide/backends#baileys-adapter-internals) e [Arquitetura: contrato de backend](/pt-BR/architecture/backend-contract).

## Implementando um backend {#implementing-a-backend}

```ts
import type { WhatsAppBackend, BackendEventMap, Unsubscribe } from "libwa.js";
import { TypedEventEmitter } from "./emitter.js"; // seu próprio emitter (não exportado)

class MyBackend implements WhatsAppBackend {
  readonly id = "myprovider";
  #events = new EventEmitter<BackendEventMap>();

  async connect(o: BackendConnectOptions) { /* abre o socket, hidrata o.sessionStore */ }
  async disconnect() { /* fecha, mantém a sessão */ }
  isConnected() { return this.#open; }

  async sendMessage(r: BackendSendMessage) { /* … → BackendSentMessage */ }
  async downloadMedia(r: BackendMediaDownload) { return bytes; }
  async getGroupMetadata(chatId: string) { /* … → GroupMetadata */ }

  on<Name extends keyof BackendEventMap>(event: Name, l: (...a: BackendEventMap[Name]) => void): Unsubscribe {
    return this.#events.on(event, l);
  }

  // opcional: react, editMessage, deleteMessage, updateGroupParticipants,
  //           updateGroupName, updateGroupDescription, requestPairingCode, logout,
  //           getPhoneNumberForLid, getLidForPhoneNumber, fetchUser,
  //           getProfilePictureUrl, getAbout, getBusinessProfile
}
```

Lista de verificação:

1. emita `connection` `open` assim que a sessão estiver utilizável (o client se inscreve nos eventos antes de chamar `connect()`, então `ready` segue assim que chegar);
2. nunca deixe classes de erro do provedor escaparem — os serviços embrulham erros desconhecidos via `rethrowAsBackendError`;
3. classifique as desconexões em valores de [`DisconnectReason`](/pt-BR/reference/disconnect-reason) (especialmente as fatais);
4. persista sessões **apenas** por meio do `sessionStore` fornecido (`Session { provider: id, data }`);
5. mantenha os payloads de eventos como tipos puros da biblioteca (sem JIDs do provedor vazando além das strings de id);
6. quando o seu provedor reportar ambos os esquemas de id, preencha `idPairs` (e `GroupParticipant.altId`) e considere implementar `getPhoneNumberForLid`/`getLidForPhoneNumber` — o core registra os pares de qualquer forma; se o seu provedor puder responder "este número de telefone tem uma conta", adicione `fetchUser` para que `client.users.fetch` funcione contra ele; dados de perfil (fotos, textos de about, classificação de negócio) são opt-in via `getProfilePictureUrl`/`getAbout`/`getBusinessProfile`.

## Veja também {#see-also}

- [Guia de backends](/pt-BR/guide/backends) — capacidades, QR/pareamento, internos do adaptador
- [Arquitetura: contrato de backend](/pt-BR/architecture/backend-contract) — justificativa de design
- [Sessões](/pt-BR/reference/sessions) — contrato de persistência usado por `connect`
