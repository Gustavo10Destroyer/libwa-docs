# Backends {#backends}

Um **backend** adapta um provedor concreto do WhatsApp ao domínio normalizado do libwa. O core depende apenas da interface [`WhatsAppBackend`](/pt-BR/reference/backend#whatsappbackend), e é isso que torna os provedores trocáveis — e testáveis — sem tocar no código da aplicação.

## Backends embutidos {#bundled-backends}

| Fábrica | Id do backend | Observações |
| --- | --- | --- |
| [`createDefaultBackend()`](/pt-BR/reference/backend#createdefaultbackend) | `baileys` | Usado quando a opção `backend` é omitida. |
| [`createBaileysBackend(options?)`](/pt-BR/reference/backend#createbaileysbackend) | `baileys` | Construção explícita com [`BaileysBackendOptions`](/pt-BR/reference/backend#baileysbackendoptions). |

```ts
import { Client, createBaileysBackend } from "libwa";

const client = new Client({
  backend: createBaileysBackend({
    browser: ["my-bot", "2.0.0", "Linux"], // identidade de login mostrada no celular
    syncFullHistory: false,                // padrão: sem sync de histórico completo
  }),
});
```

`BaileysBackendOptions`:

<ApiTable
  :rows="[
    { name: 'browser', type: 'readonly [name: string, version: string, platform: string]', def: '[&quot;libwa&quot;, &quot;1.0.0&quot;, &quot;1&quot;]', description: 'Identidade do navegador usada durante o login — visível no celular, em Dispositivos vinculados.' },
    { name: 'syncFullHistory', type: 'boolean', def: 'false', description: 'Pedir ao celular o histórico completo de chats no login. A libwa ainda despacha apenas mensagens ao vivo (notify), de qualquer forma.' }
  ]"
/>

## O contrato {#the-contract}

Superfície obrigatória (o seu backend deve implementar tudo):

```ts
interface WhatsAppBackend {
  readonly id: string;

  connect(options: BackendConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  sendMessage(request: BackendSendMessage): Promise<BackendSentMessage>;
  downloadMedia(request: BackendMediaDownload): Promise<Uint8Array>;
  getGroupMetadata(chatId: ChatId): Promise<GroupMetadata>;

  on<Name extends BackendEventName>(
    event: Name,
    listener: BackendEventListener<Name>,
  ): Unsubscribe;
}
```

Capacidades opcionais (verificadas pelo core antes do uso):

```ts
react?(request): Promise<void>;
editMessage?(request): Promise<void>;
deleteMessage?(request): Promise<void>;
updateGroupParticipants?(request): Promise<void>;
updateGroupName?(request): Promise<void>;
updateGroupDescription?(request): Promise<void>;
requestPairingCode?(phoneNumber: string): Promise<string>;
logout?(): Promise<void>;

// resolução de identidade — LID ↔ número de telefone (veja "Ids vinculados" abaixo)
getPhoneNumberForLid?(lid: UserId): Promise<string | null>;
getLidForPhoneNumber?(phone: string): Promise<UserId | null>;
fetchUser?(phone: string): Promise<BackendUserLookup>; // existência + nome para client.users.fetch

// enriquecimento de perfil (qualquer esquema de id, veja "Enriquecimento de perfil" abaixo)
getProfilePictureUrl?(id: UserId, type: ProfilePictureType): Promise<string | undefined>;
getAbout?(id: UserId): Promise<string | undefined>;
getBusinessProfile?(id: UserId): Promise<BackendBusinessProfile | undefined>;
```

<ApiNote kind="info" title="Por que opcional?">
Os provedores realmente diferem. Uma opcionalidade honesta + checagens em runtime dão erros melhores (`UnsupportedOperationError`) do que fingir que todo backend pode fazer tudo. Veja a [decisão #3](/pt-BR/architecture/design-decisions#_3-provider-behind-an-interface-with-optional-capabilities).
</ApiNote>

### Ids vinculados (LID ↔ número de telefone) {#linked-ids-lid-↔-phone-number}

O WhatsApp identifica contas ou por número de telefone (`5511999999999@s.whatsapp.net`) ou por um linked id opaco (`…@lid`) — [os dois esquemas se referem à mesma conta](https://baileys.wiki/concepts/jids), e qual deles chega depende do chat. A biblioteca os mantém juntos de três maneiras:

1. **Pares nos eventos** — os backends preenchem `idPairs` em `message`/`messageUpdate`/`reaction`/`groupParticipants` e `GroupParticipant.altId` na metadata sempre que o provedor entregou as duas formas; o cliente registra cada par antes de despachar a interação.
2. **`client.users`** — `phone()`/`altId()` respondem a partir dos pares registrados na hora; `resolvePhone()`/`resolveLid()` recorrem às capacidades opcionais `getPhoneNumberForLid`/`getLidForPhoneNumber` acima; `fetch()` compõe par registrado → `getPhoneNumberForLid` → `fetchUser(phone)` para responder se uma conta existe (e sob qual nome).
3. **O Baileys faz os dois de fábrica** — o adaptador lê a store `signalRepository.lidMapping` do provedor (persistida junto com a sessão, com lookups USSync para números que ele nunca viu).

Um backend sem as capacidades de identidade ainda é totalmente válido: `resolvePhone`/`resolveLid` simplesmente resolvem `undefined` para ids que só ele poderia saber. `fetch` é mais rigoroso por design — sem `fetchUser` ele lança `UnsupportedOperationError`, porque existência é algo que se verifica, nunca se assume; o Baileys o implementa através da própria consulta `onWhatsApp` do WhatsApp.

### Enriquecimento de perfil {#profile-enrichment}

Três capacidades opcionais respondem dados de perfil voltados ao usuário sob demanda — cada uma atrás de `client.users`:

| Capacidade | Método do serviço | Responde `undefined` quando |
| --- | --- | --- |
| `getProfilePictureUrl(id, type)` | `client.users.pictureUrl(id, "image" \| "preview")` | foto ausente ou oculta por privacidade |
| `getAbout(id)` | `client.users.about(id)` | about/bio não definido ou oculto |
| `getBusinessProfile(id)` | `client.users.accountType(id)` → `"standard" \| "business"` | a sonda não encontrou perfil business (uma conta padrão) |

Backends sem eles continuam totalmente válidos — o serviço lança `UnsupportedOperationError` em vez de inventar dados. Com a capacidade, `undefined` significa *genuinamente sem dados* (o adaptador Baileys mapeia respostas de privacidade 401/403/404 para `undefined` em fotos e textos de about). Tipos completos na [referência de backend](/pt-BR/reference/backend).

### `BackendConnectOptions` {#backendconnectoptions}

Passado pelo cliente em todo `connect()`:

```ts
{
  sessionId: string;           // slot a usar
  sessionStore: SessionStore;  // persistência — use APENAS este
  logger: Logger;              // diagnósticos em nível de provedor
  pairingPhoneNumber: string | undefined;
}
```

Regras do contrato:

- `connect()` **pode ser chamado de novo** na mesma instância depois de um disconnect (o cliente faz isso para reconexão). Derrube o estado anterior primeiro.
- Persista **apenas** pelo `sessionStore` fornecido — nunca pelos seus próprios arquivos/banco.
- Emita eventos normalizados; nunca objetos payload do provedor.
- Lance erros da biblioteca (`ConnectionError`, `MessageError`, …) em vez dos do provedor.

### Eventos {#events}

Seis eventos normalizados (veja a [referência de contrato do backend](/pt-BR/reference/backend#backendeventmap)):

| Evento | Payload | Mapeia para interação |
| --- | --- | --- |
| `message` | `BackendMessageEvent` | mensagem / comando / botão / lista |
| `messageUpdate` | `BackendMessageUpdateEvent` | `MessageUpdateInteraction` |
| `reaction` | `BackendReactionEvent` | `ReactionInteraction` |
| `groupParticipants` | `BackendGroupParticipantsEvent` | `GroupParticipantInteraction` |
| `groupUpdate` | `BackendGroupUpdateEvent` | `GroupUpdateInteraction` |
| `connection` | `BackendConnectionUpdate` | `qr`/`pairingCode`/`ready`/`disconnect`/`reconnecting` |

As atualizações de `connection` usam `status: "connecting" | "open" | "close"`; `close` carrega uma [`DisconnectReason`](/pt-BR/reference/disconnect-reason) da biblioteca — os backends traduzem códigos do provedor (o adaptador Baileys mapeia códigos de status Boom e errnos de rede).

Sempre que um evento do provedor carrega os dois esquemas de id da mesma conta, preencha o campo opcional `idPairs` (`message`/`messageUpdate`/`reaction`/`groupParticipants`) ou `GroupParticipant.altId` (metadata) — o cliente registra os pares antes do dispatch, e é isso que faz `client.users` e `User.phone` funcionarem para ids vinculados.

## Escrevendo seu próprio backend {#writing-your-own-backend}

Esqueleto mínimo (veja também o dublê de teste [`MockBackend`](/pt-BR/development/testing#helpers)):

```ts
import type {
  BackendConnectOptions,
  BackendEventListener,
  BackendEventMap,
  BackendEventName,
  BackendMediaDownload,
  BackendSendMessage,
  BackendSentMessage,
  ChatId,
  GroupMetadata,
  Unsubscribe,
  WhatsAppBackend,
} from "libwa";

type Listener = (...args: never[]) => unknown;

class MyBackend implements WhatsAppBackend {
  readonly id = "my-backend";

  // Barramento de eventos mínimo — o TypedEventEmitter existe no libwa mas é interno,
  // então um mapa privado de listeners mantém o exemplo autossuficiente.
  #listeners = new Map<BackendEventName, Set<Listener>>();
  #connected = false;

  #emit<Name extends BackendEventName>(event: Name, ...args: BackendEventMap[Name]): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      (listener as (...a: BackendEventMap[Name]) => unknown)(...args);
    }
  }

  async connect(options: BackendConnectOptions): Promise<void> {
    const session = await options.sessionStore.load(options.sessionId);
    // ... estabelece o transporte, restaura o estado de session?.data
    void session;
    this.#connected = true;
    this.#emit("connection", {
      status: "open",
      qr: undefined,
      me: { id: "5511999999999@s.whatsapp.net", name: "My bot" },
      reason: undefined,
      detail: undefined,
      pairingCode: undefined,
    });
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  isConnected(): boolean {
    return this.#connected;
  }

  async sendMessage(request: BackendSendMessage): Promise<BackendSentMessage> {
    // ... entrega request.content (OutboundContent) em request.chatId
    return {
      id: "generated-id",
      chatId: request.chatId,
      chatKind: "direct",
      timestamp: new Date(),
    };
  }

  async downloadMedia(_request: BackendMediaDownload): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async getGroupMetadata(chatId: ChatId): Promise<GroupMetadata> {
    void chatId;
    throw new Error("group metadata not supported");
  }

  on<Name extends BackendEventName>(
    event: Name,
    listener: BackendEventListener<Name>,
  ): Unsubscribe {
    let set = this.#listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as Listener);
    return () => set?.delete(listener as Listener);
  }

  // opcional: react, editMessage, deleteMessage, ...
  //           getPhoneNumberForLid, getLidForPhoneNumber, fetchUser,
  //           getProfilePictureUrl, getAbout, getBusinessProfile
}
```

Conecte-o:

```ts
const client = new Client({ backend: () => new MyBackend() });
```

### Checklist de implementação {#implementation-checklist}

1. **`id`** — estável, usado nos logs e no `session.provider` persistido.
2. **`connect` reentrante** — derrube sockets antigos, ignore eventos tardios deles (contadores de geração, flags `suppressEvents` — veja `BaileysBackend`).
3. **Ida e volta de sessão** — serialize em `Session.data` (versione o seu formato!), restaure no connect, trate mismatch/corrupção de provedor com `ValidationError` (falhe rápido) ou init do zero (a seu critério — documente).
4. **Normalize ids** — produza `ChatId`s simples sem sufixos de dispositivo; classifique `ChatKind`.
5. **Normalize conteúdo** — emita `MessageContent`; retorne `null`/pule para payloads que não são visíveis ao usuário.
6. **Mapeie erros** — lance erros da biblioteca com `cause`; use `rethrowAsBackendError` para os desconhecidos.
7. **Política de histórico** — não despache histórico backfill como eventos `message` ao vivo.
8. **Capacidades** — implemente apenas o que você suporta; omita o resto honestamente.
9. **Mídia** — `downloadMedia` deve funcionar para qualquer mensagem que você emitiu (cache os payloads brutos você mesmo, se precisar).
10. **Testes** — conduza o cliente de ponta a ponta com o seu backend, como o `client.test.ts` do repositório faz com `MockBackend`.

## Isolamento de provedor (como a fronteira é imposta) {#provider-isolation-how-the-boundary-is-enforced}

| Mecanismo | O que ele faz |
| --- | --- |
| Regra de diretório | Apenas `src/backend/baileys/**` pode importar `@whiskeysockets/baileys`. |
| `npm run check:exports` | Constrói o grafo alcançável de `.d.ts` a partir de `dist/index.d.ts`; falha em qualquer token de provedor (`WAMessage`, `WASocket`, `makeWASocket`, `proto.`, especificador de módulo). |
| mapa `exports` | Apenas `.` e `./package.json` — imports profundos em `dist/` **não fazem parte da API suportada**: resolvers conscientes de exports os rejeitam de imediato, enquanto o legado `moduleResolution: "node"` ainda alcança `dist/` no disco. |
| Testes | As suítes do core usam `MockBackend`; o mapeamento de provedor é testado unitariamente com fixtures realistas. |

Detalhes: [Guard da API pública](/pt-BR/development/public-api-guard).

## Internals do adaptador Baileys {#baileys-adapter-internals}

Para os curiosos (tudo interno, sob `src/backend/baileys/`):

| Arquivo | Responsabilidade |
| --- | --- |
| `BaileysBackend.ts` | Ciclo de vida do socket, wiring de eventos, operações de send/react/edit/delete/grupo, pareamento, resolução LID ↔ telefone via `signalRepository.lidMapping`, LRU de 500 mensagens brutas, conversão de conteúdo do provedor. Classe privada do módulo exposta via `createBaileysBackend()`. |
| `BaileysMapper.ts` | Mapeamento puro de payload → domínio (wrappers, timestamps, jids, todos os kinds de conteúdo, reações, eventos de grupo). |
| `BaileysAuth.ts` | `AuthenticationState` sobre `SessionStore`; escritas coalescidas; `BufferJSON`; revivência de chaves de app-state. |
| `BaileysDisconnect.ts` | Tradução de Boom/código de status/errno → `DisconnectReason`. |
| `BaileysLogger.ts` | `Logger` da biblioteca → forma de logger do provedor (`child()`, bindings). |

## Relacionados {#related}

- [Referência de backend](/pt-BR/reference/backend) — cada tipo do contrato
- [Arquitetura: contrato de backend](/pt-BR/architecture/backend-contract) — contexto de design
- [Pipeline de eventos](/pt-BR/architecture/event-pipeline) — como eventos de backend se tornam interações
- [Testes](/pt-BR/development/testing) — conduzindo o cliente com dublês de backend
