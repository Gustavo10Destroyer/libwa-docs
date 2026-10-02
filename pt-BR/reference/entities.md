# Entidades {#entities}

<ApiBadge kind="class" /> Dados do provedor normalizados em objetos pequenos, com suporte do cliente: `Chat`, `Group`, `Message`, `User`. As entidades são criadas pela [`EntityFactory`](#entityfactory) (interna) e passadas para as interações.

```ts
import { type Chat, type Group, type Message, type User, phoneFromId } from "libwa";
```

## Chat <ApiBadge kind="class" /> {#chat}

Uma conversa: direta, grupo, broadcast, newsletter — ou `unknown` para kinds futuros.

```ts
class Chat {
  readonly client: Client;
  readonly id: ChatId;
  readonly kind: ChatKind;
  constructor(init: ChatInit);
}
```

<ApiNote kind="warning">
O construtor recusa <code>kind: "group"</code> na classe base (lança um erro — use <code>Group</code>, ou deixe a factory escolher). Isso garante que chats <code>group</code> jamais fiquem sem os membros exclusivos de grupo.
</ApiNote>

### Campos {#fields}

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `client` | `Client` | Cliente dono — `send()` delega por ele. |
| `id` | `ChatId` (`string`) | Id do chat no provedor, ex.: `1203630…@g.us`, `5511999999999@s.whatsapp.net`. |
| `kind` | `ChatKind` | `"direct" \| "group" \| "broadcast" \| "newsletter" \| "unknown"`. |

### Getters {#getters}

| Getter | Tipo | Observações |
| --- | --- | --- |
| `name` | `string \| undefined` | Nome conhecido localmente (atualizado por updates/refresh de grupo). |
| `displayName` | `string` | `name` → fallback para o `id` completo. |

### Guards de kind {#kind-guards}

`isGroup(): this is Group` (narrowing!), `isDirect()`, `isBroadcast()`, `isNewsletter()` — cada um compara `kind`.

### Métodos {#methods}

| Método | Assinatura | Descrição |
| --- | --- | --- |
| `send` | `(content: ReplyContent) => Promise<Message>` | Envia aqui via `client.messages.send(this, content)`. |
| `updateName` | `(name: string \| undefined) => void` | Atualização de nome apenas local (usada pela factory em group updates). |
| `toString` | `() => string` | Retorna `displayName`. |

```ts
if (chat.isGroup()) {
  chat.memberCount; // Membro específico de Group — o TypeScript sabe
}
```

## Tipos de grupo <ApiBadge kind="interface" /> {#group-types}

Todos declarados junto com `Chat` em `src/entities/Chat.ts`:

### `ChatKind` {#chatkind}

```ts
type ChatKind = "direct" | "group" | "broadcast" | "newsletter" | "unknown";
```

### `GroupParticipant` {#groupparticipant}

```ts
interface GroupParticipant {
  readonly id: UserId;
  readonly altId?: UserId | undefined;
  readonly role: GroupRole;         // "member" | "admin" | "superadmin"
  readonly name: string | undefined;
  readonly username?: string | undefined;
}
```

`id` é o id do membro no esquema que o provedor reportou para este grupo — JID de número de telefone ou [linked id](/pt-BR/reference/ids#userid). `altId` é o id do mesmo membro no *outro* esquema (LID ↔ número de telefone), presente quando o provedor entregou as duas formas; é o que permite resolver um número de telefone a partir de um linked id mesmo para membros que saem do grupo depois. `name` é o rótulo do participante vindo dos metadados do grupo (quando presente, semeia o `user.name` lembrado do membro), `username` o `@handle` do membro — ambos são campos brutos do provedor.

### `GroupMember` {#groupmember}

```ts
interface GroupMember {
  readonly user: User;              // entidade de nível de conta — mesma instância de interaction.author
  readonly role: GroupRole;         // apenas dentro deste grupo
}
```

A participação é **escopada por grupo**: os papéis diferem por grupo, então nunca ficam em [`User`](#user). Produzida por [`Group.members`](#metadata-accessors) e [`Group.member()`](#methods), e anexada a toda interação de grupo como [`interaction.member`](/pt-BR/reference/interactions#interaction).

### `GroupRole` {#grouprole}

```ts
type GroupRole = "member" | "admin" | "superadmin";
```

### `GroupMetadata` {#groupmetadata}

<ApiTable
  :rows="[
    { name: 'id', type: 'ChatId', description: 'Id do grupo.' },
    { name: 'name', type: 'string', description: 'Assunto atual do grupo.' },
    { name: 'description', type: 'string | undefined', description: 'Descrição do grupo quando definida.' },
    { name: 'ownerId', type: 'UserId | undefined', description: 'Id do dono quando conhecido.' },
    { name: 'createdAt', type: 'Date | undefined', description: 'Data de criação quando conhecida.' },
    { name: 'participants', type: 'readonly GroupParticipant[]', description: 'Instantâneo da participação + papéis.' },
    { name: 'announceOnly', type: 'boolean', description: 'Modo de anúncio (só admins publicam).' },
    { name: 'locked', type: 'boolean', description: 'Edição das informações do grupo bloqueada.' }
  ]"
/>

### `GroupParticipantAction` {#groupparticipantaction}

```ts
type GroupParticipantAction = "add" | "remove" | "promote" | "demote" | "other";
```

`"other"` é o fallback para ações de provedor que a biblioteca não modela — nunca quebre por causa dele.

### `GroupUpdateChanges` {#groupupdatechanges}

```ts
interface GroupUpdateChanges {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly announceOnly?: boolean | undefined;
  readonly locked?: boolean | undefined;
}
```

Diff parcial — apenas as chaves reportadas pelo provedor estão presentes (um valor limpo aparece como `undefined`). Sob `exactOptionalPropertyTypes`, cada campo é `readonly name?: string | undefined` e afins: `undefined` é um valor legal de uma chave *presente*, então `description: undefined` significa que a descrição foi **limpa**, enquanto uma chave ausente significa que ela não fez parte do update. A presença da chave é o teste "isto mudou?" (compare com `hasNameChange` / `hasDescriptionChange`).

## Group <ApiBadge kind="class" /> {#group}

```ts
class Group extends Chat
```

Um `Chat` com `kind` sempre `"group"` mais [`GroupMetadata`](#groupmetadata) em cache.

### Acessadores de metadados {#metadata-accessors}

| Getter | Tipo | Observações |
| --- | --- | --- |
| `metadata` | `GroupMetadata \| undefined` | Em cache; `undefined` até ser resolvido (no máximo 60s de idade — veja [Grupos](/pt-BR/reference/groups#ensure)). Interações de grupo chegam com ele já resolvido (veja [pipeline de eventos](/pt-BR/architecture/event-pipeline#_4-client-subscription)). |
| `name` | `string \| undefined` (override) | Delega para os metadados, depois para o cache da classe pai. |
| `description` | `string \| undefined` | Vindo dos metadados. |
| `owner` | `User \| undefined` | Construído a partir de `metadata.ownerId`. |
| `members` | `readonly GroupMember[]` | Construído a partir de `metadata.participants` — cada entrada associa o `User` da conta com o `role` dele aqui (vazio até os metadados serem buscados). |
| `memberCount` | `number \| undefined` | `members.length` quando os metadados estão presentes. |
| `announceOnly` | `boolean \| undefined` | Vindo dos metadados. |

### Métodos {#methods-1}

| Método | Assinatura | Descrição |
| --- | --- | --- |
| `member` | `(target: User \| UserId) => GroupMember \| undefined` | Participação de uma conta aqui: aceita um `User` (mantido como está dentro do membro) ou um id cru em qualquer um dos esquemas — ids casam entre esquemas através dos pares de id registrados. `undefined` enquanto os metadados são desconhecidos ou a conta não é participante. |
| `refresh` | `(): Promise<this>` | Busca os metadados via `client.groups.fetch`, os aplica (também atualiza `name`), retorna `this`. |
| `addMembers` | `(users: (User \| UserId)[]) => Promise<void>` | Somente admin; delega para `GroupService.addMembers`. |
| `removeMembers` | `(users: (User \| UserId)[]) => Promise<void>` | Somente admin. |
| `promote` | `(users: (User \| UserId)[]) => Promise<void>` | Membros → admins. |
| `demote` | `(users: (User \| UserId)[]) => Promise<void>` | Admins → membros. |
| `rename` | `(name: string) => Promise<void>` | Muda o assunto; vazio → `ERR_EMPTY_GROUP_NAME`. |
| `setDescription` | `(description: string \| undefined) => Promise<void>` | Define (ou limpa, `undefined`) a descrição. |
| `applyMetadata` | `(metadata: GroupMetadata) => void` *(interno)* | Escreve os metadados + cache de nome sem chamada de rede, e alimenta o cache de metadados limitado da factory (`storeGroupMetadata`) para que instância e factory não divirjam. Não incrementa revisão — isso acontece em escritas locais (`applyGroupChanges` / `applyGroupParticipants`). |

```ts
if (interaction.isFromGroup()) {
  // interações de grupo já carregam metadados resolvidos (cache de ≤60s, mantido
  // atual pelos eventos); chame group.refresh() quando precisar de um fetch novo
  console.log(interaction.group.memberCount, interaction.group.announceOnly);
  interaction.member?.role;                 // o papel do autor neste grupo
  interaction.group.member("222@s.whatsapp.net")?.role;
  await interaction.group.addMembers(["5511888888888@s.whatsapp.net"]);
}
```

Passo a passo completo: [Guia de grupos](/pt-BR/guide/groups).

## Message <ApiBadge kind="class" /> {#message}

```ts
class Message {
  readonly id: string;
  readonly chat: Chat;
  readonly author: User;
  readonly content: MessageContent;
  readonly timestamp: Date;
  readonly isFromMe: boolean;
  readonly isForwarded: boolean;
  readonly mentions: readonly User[];
  readonly reference: MessageReference | undefined;
}
```

| Membro | Tipo | Descrição |
| --- | --- | --- |
| `id` | `string` | Id da mensagem no provedor. |
| `chat` | `Chat` | Conversa à qual pertence (um `Group` para mensagens de grupo). |
| `author` | `User` | Remetente (sua própria conta nos ecos de saída). |
| `content` | `MessageContent` | Payload discriminado ([referência](/pt-BR/reference/content)). |
| `timestamp` | `Date` | Hora do envio. |
| `isFromMe` | `boolean` | Enviado pela conta logada. |
| `isForwarded` | `boolean` | Sinalizador de encaminhamento. |
| `mentions` | `readonly User[]` | Usuários mencionados com @. |
| `reference` | `MessageReference \| undefined` | Original citado/atualizado, quando presente. |

### Getters e métodos {#getters-and-methods}

| Membro | Assinatura | Descrição |
| --- | --- | --- |
| `text` | `string` | `contentText(content)`. |
| `attachments` | `readonly Attachment[]` | `contentAttachments(content)`. |
| `isReply` | `boolean` | Tem uma referência. |
| `reply` | `(content: ReplyContent) => Promise<Message>` | Responde com citação neste chat. |
| `react` | `(emoji: string \| null) => Promise<void>` | Adiciona/limpa a sua reação. |
| `delete` | `(): Promise<void>` | Apaga esta mensagem (sem checagem de posse no libwa — ex.: administradores de grupo apagando mensagens de outros). |

### `MessageReference` <ApiBadge kind="interface" /> {#messagereference}

```ts
interface MessageReference {
  readonly messageId: string;
  readonly chat: Chat;
  readonly author: User | undefined;
  readonly content: MessageContent | undefined;
}
```

O contexto da mensagem original por trás de respostas, edições, toques em botão e seleções de lista.

## User <ApiBadge kind="class" /> {#user}

```ts
class User {
  readonly id: UserId;
  readonly name: string | undefined;
  readonly isMe: boolean;
  constructor(init: UserInit);
}
```

<ApiTable
  :rows="[
    { name: 'id', type: 'UserId', description: 'Id de usuário do WhatsApp: JID de número de telefone (5511999999999@s.whatsapp.net) ou linked id (…@lid) — os dois esquemas de uma conta, explicados na página de ids (UserId).' },
    { name: 'name', type: 'string | undefined', description: 'Nome de exibição reportado pelo provedor (push name / nome do perfil). Lembrado entre eventos: depois que um nome é visto para uma conta, payloads posteriores apenas com id também respondem com ele (em qualquer esquema de id). Nunca um nome da lista de contatos — a biblioteca não sincroniza sua agenda.' },
    { name: 'isMe', type: 'boolean', description: 'true quando esta é a conta logada (definido pela factory).' },
    { name: 'phone', type: 'string | undefined (getter)', description: 'Dígitos do telefone: derivados do id quando é um phone JID, senão de um par LID ↔ telefone resolvido (preenchido conforme os pares chegam, ou via client.users.resolvePhone).' },
    { name: 'displayName', type: 'string (getter)', description: 'Cadeia de fallback name → phone → id. Um linked id não resolvido cai no valor cru …@lid.' },
    { name: 'equals', type: '(other: User | UserId) => boolean', description: 'Comparação de ids.' }
  ]"
/>

```ts
user.phone;        // "5511999999999"
user.displayName;  // "Alice" → "5511999999999" → "5511999999999@s.whatsapp.net"
user.equals("5511999999999@s.whatsapp.net");
```

Usuários são objetos-valor recriados a cada evento — nada fica em cache, então `phone` reflete os pares conhecidos **quando o evento foi construído**. Duas coisas atravessam eventos: `name`, lembrado do payload mais recente que trouxe um (veja [`client.users`](#userservice) para o fluxo id-only → com nome), e os pares registrados nos bastidores. Para consultas em qualquer momento posterior, use [`client.users`](#userservice).

## `phoneFromId` <ApiBadge kind="function" /> {#phonefromid}

```ts
function phoneFromId(id: string): string | undefined
```

Extrai dígitos de um JID de usuário padrão. Casa com `/^(\d{5,})@(?:s\.whatsapp\.net|c\.us)$/`; qualquer outro formato (grupos, **linked ids**, outros backends) → `undefined`.

```ts
phoneFromId("5511999999999@s.whatsapp.net"); // "5511999999999"
phoneFromId("120363012345678901@g.us");       // undefined
phoneFromId("123456789012345@lid");           // undefined — LIDs não carregam dígitos
```

Helper do protocolo WhatsApp — `User.phone` o usa internamente. Ele nunca resolve um linked id; para isso existe [`client.users`](#userservice).

## UserService <ApiBadge kind="class" /> {#userservice}

```ts
class UserService {
  phone(id: UserId): string | undefined;
  altId(id: UserId): UserId | undefined;
  resolvePhone(id: UserId): Promise<string | undefined>;
  resolveLid(id: UserId): Promise<UserId | undefined>;
  fetch(id: string): Promise<User | undefined>;
  pictureUrl(id: string, type?: ProfilePictureType): Promise<string | undefined>;
  about(id: string): Promise<string | undefined>;
  accountType(id: string): Promise<AccountType>;
}
```

`client.users` — resolução entre os dois esquemas de id de usuário do WhatsApp ([phone JID ↔ linked id](/pt-BR/reference/ids#userid)), além de buscas de conta e enriquecimento de perfil. Os pares de id reportados junto com mensagens, metadados de grupo e eventos de participação são registrados pelo core conforme chegam; esses métodos respondem primeiro a partir desse store e só consultam as capacidades opcionais do backend `getPhoneNumberForLid` / `getLidForPhoneNumber` / `fetchUser` / `getProfilePictureUrl` / `getAbout` / `getBusinessProfile` quando nada ainda é conhecido.

<ApiTable
  :rows="[
    { name: 'phone', type: '(id) => string | undefined', description: 'Dígitos do telefone de um id — do próprio id ou de um par registrado. Síncrono, sem I/O; undefined quando desconhecido.' },
    { name: 'altId', type: '(id) => UserId | undefined', description: 'O id da mesma conta no outro esquema (LID ↔ phone JID), a partir de pares registrados. Síncrono, sem I/O.' },
    { name: 'resolvePhone', type: '(id) => Promise<string | undefined>', description: 'Dígitos do telefone, perguntando ao provedor quando nenhum par é conhecido. Ids de telefone respondem na hora; backends não suportados e ids não resolvíveis resolvem undefined; falhas do provedor lançam BackendError.' },
    { name: 'resolveLid', type: '(id) => Promise<UserId | undefined>', description: 'Linked id de um id com número de telefone, mesmas regras de fallback. Um id …@lid responde com ele mesmo.' },
    { name: 'fetch', type: '(id) => Promise<User | undefined>', description: 'Existência da conta + nome. Aceita um phone JID (…@s.whatsapp.net, legado …@c.us, sufixo :device opcional), dígitos puros (+ opcional) ou um …@lid. Lids são resolvidos primeiro por pares registrados / getPhoneNumberForLid, depois os dígitos do telefone são verificados com a capacidade fetchUser. Resolve undefined quando a conta não existe ou o lid não pode ser mapeado.' },
    { name: 'pictureUrl', type: '(id, type?) => Promise<string | undefined>', description: 'URL da foto de perfil (type: \u0022image\u0022 (padrão, tamanho cheio) ou \u0022preview\u0022). Mesmas formas de id de fetch. undefined quando a foto está ausente ou privada. Capacidade: getProfilePictureUrl.' },
    { name: 'about', type: '(id) => Promise<string | undefined>', description: 'Texto sobre/bio (\u0022status\u0022). Mesmas formas de id de fetch. undefined quando não definido ou oculto. Capacidade: getAbout.' },
    { name: 'accountType', type: '(id) => Promise<AccountType>', description: '\u0022business\u0022 quando o provedor reporta um perfil business, \u0022standard\u0022 quando a sonda não encontra nenhum. Mesmas formas de id de fetch. Capacidade: getBusinessProfile (a classificação é uma sonda — um round-trip extra).' }
  ]"
/>

```ts
const digits = await client.users.resolvePhone(i.author.id); // "5511999999999" | undefined
const lid = await client.users.resolveLid("5511999999999@s.whatsapp.net"); // "…@lid" | undefined

if (digits !== undefined) {
  await i.reply(`hello @${digits}`, { mentions: [i.author.id] });
}

// checagem de existência em qualquer esquema de id — retorna o User quando a conta existe
const user = await client.users.fetch("5511999999999"); // ou um phone JID completo, ou "…@lid"
console.log(user?.id, user?.name);
```

### `fetch(id)` em detalhe {#fetch-id-in-detail}

| Entrada | Exemplo | Resolução |
| --- | --- | --- |
| phone JID | `5511999999999@s.whatsapp.net` | checado diretamente |
| legado / sufixo de dispositivo | `5511999999999@c.us`, `5511999999999:12@s.whatsapp.net` | canonicalizado para `digits@s.whatsapp.net` |
| dígitos puros | `5511999999999`, `+5511999999999` | normalizado, depois checado |
| linked id | `123456789012345@lid` | par registrado ou `getPhoneNumberForLid` → dígitos do telefone → `fetchUser`; não resolvível → `undefined` |

Regras:

- **O valor de retorno espelha o contrato da consulta.** `undefined` = sem conta (ou um lid não resolvível); uma conta existente retorna um `User` cujo `name` prefere o `name` / `verifiedName` da consulta e, caso contrário, cai no push name lembrado.
- **Capacidade, não chute.** Um backend sem `fetchUser` lança `UnsupportedOperationError`; um backend sem resolução de linked id lança `UnsupportedOperationError` apenas para lids. A existência nunca é assumida.
- **Erros:** `ValidationError` `ERR_INVALID_USER_ID` (nenhum dos formatos acima), `UnsupportedOperationError` (capacidades ausentes), `BackendError` (falha do provedor — subclasses de `WhatsAppError` passam direto).

<ApiNote kind="info" title="As menções mantêm o id como recebido">
Passe os ids de menção exatamente como o evento os entregou (um `…@lid` em um grupo endereçado por LID) — esse já é o esquema que o chat usa. Use `resolvePhone` apenas para o texto legível `@…` (veja o [guia de grupos](/pt-BR/guide/groups#linked-ids-lids-and-mentions)).
</ApiNote>

### Enriquecimento de perfil em detalhe {#profile-enrichment-in-detail}

```ts
await client.users.pictureUrl("5511999999999");            // "https://…" | undefined
await client.users.pictureUrl(user.id, "preview");         // variante pequena
await client.users.about(user.id);                         // "living la vida loca" | undefined
await client.users.accountType(user.id);                   // "standard" | "business"
```

- **Mesma tabela de entrada de [`fetch(id)`](#fetch-id-in-detail)** — phone JID, sufixo legado/de dispositivo, dígitos puros, `+…` ou `…@lid`; qualquer outra coisa lança `ValidationError` (`ERR_INVALID_USER_ID`) antes de qualquer I/O.
- **`pictureUrl`** — `type` é `"image"` (padrão, tamanho cheio) ou `"preview"`. A URL vem direto do provedor: busque e cacheie você mesmo; a biblioteca nunca baixa fotos. Fotos ausentes ou ocultas por privacidade resolvem `undefined`.
- **`about`** — o texto sobre/bio da conta ("status" do WhatsApp). Não definido, oculto (`""` do provedor) ou desconhecido resolvem `undefined`.
- **`accountType`** — `AccountType = "standard" | "business"`. Provedores não expõem um único "business flag", então isto sonda o perfil business: perfil encontrado → `"business"`, sonda concluída sem um → `"standard"`.
- **Erros:** `UnsupportedOperationError` (o backend não tem `getProfilePictureUrl` / `getAbout` / `getBusinessProfile`), `BackendError` em falhas do provedor, `ValidationError` (`ERR_INVALID_USER_ID`) para ids malformados.

```ts
const url = await client.users.pictureUrl(user.id).catch(() => undefined);
const type = await client.users.accountType(user.id); // pode lançar UnsupportedOperationError
```

## EntityFactory <ApiBadge kind="internal" /> {#entityfactory}

```ts
class EntityFactory {
  constructor(client: Client);
  get me(): User | null;
  reset(): void;                                             // descarta toda identidade, nome, par de id e registro de grupo em cache (logout/destroy)
  setSelf(self: BackendSelf): User;
  recordIdPairs(pairs: readonly BackendIdPair[] | undefined): void;  // apenas pares entre esquemas
  phoneFor(id: UserId): string | undefined;                          // o próprio id ou par registrado
  altIdFor(id: UserId): UserId | undefined;                          // contraparte no outro esquema
  isSelf(id: UserId): boolean;                               // conta própria em qualquer esquema de endereçamento; false enquanto me é null
  rememberName(id: UserId, name: string | undefined): void;          // guarda um nome de exibição sob os dois esquemas de id
  user(id: UserId, name?: string | undefined): User;                 // define isMe + telefone resolvido; cai no nome lembrado
  selfUser(): User;
  chat(ref: ChatRef): Chat;                                   // escolhe Group para kind "group"
  knownChat(id: ChatId): Chat | undefined;
  group(id: ChatId, name?: string | undefined): Group;
  storeGroupMetadata(metadata: GroupMetadata): void;          // escrita limitada no cache de metadados + registro de pares de id dos participantes (sem bump de revisão)
  applyGroupMetadata(metadata: GroupMetadata): Group;
  groupMetadata(id: ChatId): GroupMetadata | undefined;
  groupRevision(id: ChatId): number;                          // versão incrementada a cada escrita local de grupo — fetches nunca a incrementam
  diffGroupChanges(groupId: ChatId, changes: GroupUpdateChanges): GroupUpdateChanges;  // mantém apenas os campos que diferem do cache
  applyGroupChanges(groupId: ChatId, changes: GroupUpdateChanges): Group;
  applyGroupParticipants(groupId: ChatId, action: GroupParticipantAction, participantIds: readonly UserId[]): Group;  // mudança de participação → cache + bump de revisão
  message(event: BackendMessageEvent): Message;
  sentMessage(
    sent: BackendSentMessage,
    content: MessageContent,
    mentions: readonly UserId[],
    reference: MessageReference | undefined,
  ): Message;                                                 // reconstrução do eco de saída
  reference(ref: BackendMessageReference, containingChat: Chat): MessageReference;
}
```

O lugar único onde formatos crus do backend se tornam entidades; garante a seleção `Chat` vs `Group`, a marcação `isMe` e o back-linking de referência (`message.reference.chat` aponta para a mesma instância de `Chat`). Ele também registra pares de id LID ↔ número de telefone (`recordIdPairs`, chamado pela factory de interação para o `idPairs` de cada evento e por `applyGroupMetadata` para `GroupParticipant.altId`) para que todo `User` que ele constrói carregue um `phone` resolvido quando um é conhecido — e mantém uma **memória de nomes**: todo push name (e nome de consulta fornecido pelo provedor) é armazenado sob os dois esquemas de id, então `user(id)` sem nome ainda responde com o nome visto antes para aquela conta (menções, autores de reação, membros de grupo, resultados de fetch). `applyGroupChanges` atualiza os metadados de um grupo em cache a partir de um evento `groupUpdate` (diff name/description/announceOnly/locked) para que os handlers vejam valores frescos imediatamente. Chamado por `InteractionFactory`, `MessageService` e o cliente; **não exportado**.

## Veja também {#see-also}

- [Guia de entidades](/pt-BR/guide/events) — como as entidades fluem pelos eventos
- [Referência de grupos](/pt-BR/reference/groups) — `GroupService` (a API de metadados)
- [Guia de grupos](/pt-BR/guide/groups#linked-ids-lids-and-mentions) — tratamento de LID em menções
- [Interações](/pt-BR/reference/interactions) — entidades envelopadas em eventos
