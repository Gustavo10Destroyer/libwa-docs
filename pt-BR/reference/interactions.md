# Interações {#interactions}

<ApiBadge kind="class" /> Todo evento recebido que a biblioteca entende é normalizado em uma subclasse da classe abstrata `Interaction`. Este é o único tipo de payload de evento que seus handlers veem.

```ts
import type { Interaction } from "libwa";

client.on("interactionCreate", (i) => {
  if (i.isCommand()) console.log(i.name, i.args);
});
```

## Interaction <ApiBadge kind="abstract class" /> {#interaction}

Classe base — nunca instanciada diretamente. Construtor protected: apenas subclasses (e `InteractionFactory`, internamente) criam instâncias.

### Campos {#fields}

<ApiTable
  :rows="[
    { name: 'type', type: 'InteractionType (abstract readonly)', description: 'Enum discriminador — veja InteractionType.' },
    { name: 'id', type: 'string', description: 'Id estável do evento (id de mensagem/evento do provedor).' },
    { name: 'timestamp', type: 'Date', description: 'Quando o evento aconteceu no provedor.' },
    { name: 'client', type: 'Client', description: 'Cliente dono — use para services, me, isReady.' },
    { name: 'chat', type: 'Chat', description: 'Chat ao qual o evento pertence. Direto ou grupo — verifique isFromGroup().' },
    { name: 'group', type: 'Group | undefined', description: 'O grupo quando isFromGroup() é true (mesma instância de chat em interações de grupo); undefined para chats diretos.' },
    { name: 'author', type: 'User | undefined', description: 'Quem o causou. undefined em alguns eventos de sistema; em mensagens próprias, é você.' },
    { name: 'member', type: 'GroupMember | undefined', description: 'A participação do autor no grupo — { user, role }. undefined fora de grupos, em eventos sem autor, ou enquanto os metadados do grupo são desconhecidos.' },
    { name: 'isFromMe', type: 'boolean', description: 'true quando a conta logada é o autor.' }
  ]"
/>

### Type guards {#type-guards}

Todos os guards são métodos de narrowing `this is X` — seguros de encadear:

| Guard | Narrow para |
| --- | --- |
| `isMessage()` | `MessageInteraction` |
| `isCommand()` | `CommandInteraction` |
| `isReaction()` | `ReactionInteraction` |
| `isMessageUpdate()` | `MessageUpdateInteraction` |
| `isGroupParticipantUpdate()` | `GroupParticipantInteraction` |
| `isGroupUpdate()` | `GroupUpdateInteraction` |
| `isButton()` | `ButtonInteraction` |
| `isList()` | `ListInteraction` |
| `isFromGroup()` | narrow para que `group` seja `Group` (`Interaction & { group: Group }`) |
| `isFromDirectChat()` | boolean — `chat.kind === "direct"` |

```ts
if (i.isMessage() && i.isCommand() && i.name === "ping") {
  await i.reply("pong");
}
if (i.isFromGroup()) {
  console.log(i.group.name, i.group.memberCount); // group é tipado como Group aqui
}
```

### Métodos {#methods}

#### `reply` {#reply}

```ts
reply(content: ReplyContent, options?: SendOptions): Promise<Message>
```

Envia uma resposta apontando para o chat desta interação (com citação quando a interação carrega uma mensagem). `options` é repassado para `client.messages.send` — um `options.replyToMessageId` explícito tem prioridade sobre a citação da própria interação, e um `options.quote` explícito sobre os dois.

<ApiTable
  :rows="[
    { name: 'content', type: 'ReplyContent', description: 'String simples ou payload estruturado — ReplyContent = string | MessagePayload (sem forma de array).' },
    { name: 'options', type: 'SendOptions', def: 'undefined', description: 'quote / replyToMessageId / mentions — mesmas opções que client.messages.send aceita.' }
  ]"
/>

**Retorna:** a `Message` enviada.

**Erros:** `ValidationError` (`ERR_EMPTY_MESSAGE`, `ERR_AMBIGUOUS_MESSAGE`, `ERR_INVALID_CAPTION`, `ERR_EMPTY_MEDIA`) para entrada inválida; falhas do provedor aparecem como `MessageError` (adapter embutido) — backends customizados também podem lançar `PermissionError` / `NotFoundError`.

```ts
await i.reply("hi");
const bytes = new Uint8Array(await readFile("/tmp/x.png"));
await i.reply({ image: { data: bytes, mimetype: "image/png" }, caption: "with image" });
await i.reply({ text: "line two" }); // um payload por chamada — ReplyContent não tem forma de array
```

Detalhes: [Referência de mensageria](/pt-BR/reference/messaging).

## InteractionType <ApiBadge kind="enum" /> {#interactiontype}

```ts
enum InteractionType {
  Message = "message",
  Command = "command",
  Reaction = "reaction",
  MessageUpdate = "messageUpdate",
  GroupParticipant = "groupParticipant",
  GroupUpdate = "groupUpdate",
  Button = "button",
  List = "list",
}
```

Enum com valores string (seguro para JSON, amigável para logs). Mapeia 1:1 para as classes abaixo.

## MessageInteraction {#messageinteraction}

```ts
class MessageInteraction<C extends MessageContent = MessageContent> extends Interaction
```

Uma mensagem recebida com conteúdo genérico `C` (padrão `MessageContent`). Também é o tipo das mensagens de texto simples (não-comando).

### Campo extra {#extra-field}

<ApiTable
  :rows="[
    { name: 'message', type: 'Message', description: 'Entidade subjacente com id/chat/author/content/timestamp/isForwarded/mentions/reference.' }
  ]"
/>

### Getters {#getters}

| Getter | Tipo | Observações |
| --- | --- | --- |
| `content` | `C` | Discriminado por `kind`. |
| `text` | `string` | `contentText(message.content)` — texto, caption, rótulo de botão/lista, nome da enquete ou `""`. |
| `attachments` | `readonly Attachment[]` | `contentAttachments(...)` — `[]` para conteúdo que não é mídia. |
| `reference` | `MessageReference \| undefined` | Presente quando isto é uma resposta/citação ou uma atualização de uma mensagem original. |
| `isForwarded` | `boolean` | Sinalizador de encaminhamento vindo do provedor. |
| `mentions` | `readonly User[]` | Usuários mencionados com @. |
| `isReply` | `boolean` | `reference !== undefined`. |

### Guards de conteúdo {#content-guards}

`isText()`, `isImage()`, `isVideo()`, `isAudio()`, `isDocument()`, `isSticker()`, `isLocation()`, `isContact()`, `isPoll()`, `isMedia()` — cada um aplica narrowing em `content` (e `this`) para o tipo de conteúdo correspondente:

```ts
if (i.isMessage() && i.isImage()) {
  const bytes = await i.content.attachment.download();
  // i.content: ImageContent
}
```

### Métodos {#methods-1}

| Método | Assinatura | Descrição |
| --- | --- | --- |
| `react` | `(emoji: string \| null) => Promise<void>` | Adiciona (`"👍"`) ou limpa (`null`) a sua própria reação. |
| `delete` | `() => Promise<void>` | Apaga esta mensagem — sem checagem de posse no libwa (ex.: administradores de grupo apagando mensagens de outros). |
| `edit` | `(text: string) => Promise<Message>` | Edita a **sua própria** mensagem; retorna a `Message` atualizada. |
| `reply` | herdado | Responde no mesmo chat. |

## CommandInteraction {#commandinteraction}

```ts
class CommandInteraction extends MessageInteraction<TextContent>
```

Um `MessageInteraction` cujo texto casou com um prefixo de comando. `content` é sempre `TextContent`.

### Campos {#fields-1}

<ApiTable
  :rows="[
    { name: 'name', type: 'string', description: 'Nome do comando em minúsculas como digitado, sem prefixo (alias resolvido via i.command).' },
    { name: 'args', type: 'readonly string[]', description: 'Argumentos separados por espaço em branco depois do nome do comando.' },
    { name: 'rawArgs', type: 'string', description: 'Tudo depois do token do comando, com trim mas de resto intocado (bom para texto entre aspas).' },
    { name: 'command', type: 'CommandDefinition | undefined', description: 'Comando registrado resolvido (ciente de aliases). undefined quando o parsing produziu um nome que ninguém registrou.' }
  ]"
/>

```ts
client.on("interactionCreate", (i) => {
  if (!i.isCommand()) return;
  console.log(i.name, i.args, JSON.stringify(i.rawArgs));
});
// "!kick alice bob reason here"
// → "kick", ["alice", "bob", "reason", "here"], "alice bob reason here"
```

`execute()` roda antes dos listeners de `interactionCreate`; veja [Guia de comandos](/pt-BR/guide/commands).

## ReactionInteraction {#reactioninteraction}

```ts
class ReactionInteraction extends Interaction
```

Uma reação foi adicionada a uma mensagem ou removida dela.

<ApiTable
  :rows="[
    { name: 'messageId', type: 'string', description: 'Id da mensagem alvo.' },
    { name: 'emoji', type: 'string | null', description: 'Emoji adicionado, ou null quando uma reação foi removida.' },
    { name: 'isRemoved', type: 'boolean (getter)', description: 'true quando emoji === null.' }
  ]"
/>

`react(emoji | null)` espelha a reação de volta (útil para confirmações no estilo ✅).

```ts
if (i.isReaction() && i.emoji === "🔥") {
  await i.react("🔥"); // devolve na mesma mensagem
}
```

## MessageUpdateInteraction {#messageupdateinteraction}

```ts
class MessageUpdateInteraction extends Interaction
```

Uma mensagem foi editada ou apagada por alguém (ou por você mesmo em outro dispositivo).

<ApiTable
  :rows="[
    { name: 'messageId', type: 'string', description: 'Id da mensagem afetada.' },
    { name: 'action', type: '&quot;edit&quot; | &quot;delete&quot;', description: 'O que aconteceu.' },
    { name: 'content', type: 'MessageContent | undefined', description: 'Conteúdo novo para edições; undefined para exclusões.' },
    { name: 'isEdit', type: 'boolean (getter)', description: 'action === &quot;edit&quot;.' },
    { name: 'isDelete', type: 'boolean (getter)', description: 'action === &quot;delete&quot;.' }
  ]"
/>

## GroupParticipantInteraction {#groupparticipantinteraction}

```ts
class GroupParticipantInteraction extends Interaction
```

Participantes foram adicionados/removidos/promovidos/rebaixados em um grupo.

<ApiTable
  :rows="[
    { name: 'group', type: 'Group', description: 'Grupo alvo — os metadados são resolvidos antes do dispatch (cache de ≤60s) e este evento é aplicado nele, então os membros estão atualizados.' },
    { name: 'action', type: 'GroupParticipantAction', description: '&quot;add&quot; | &quot;remove&quot; | &quot;promote&quot; | &quot;demote&quot; | &quot;other&quot;.' },
    { name: 'user', type: 'User | undefined (getter)', description: 'O usuário afetado (users[0]) — exatamente quem foi adicionado/removido/promovido/rebaixado em mudanças com um único participante.' },
    { name: 'users', type: 'readonly User[]', description: 'Participantes afetados (todos eles; lotes são possíveis).' },
    { name: 'author', type: 'User | undefined', description: 'Quem o realizou, quando conhecido (eventos de sistema → undefined).' },
    { name: 'isAdd / isRemove / isPromote / isDemote', type: 'boolean getters', description: 'Narrowers de conveniência sobre action.' }
  ]"
/>

```ts
if (i.isGroupParticipantUpdate() && i.isRemove()) {
  console.log(`left: ${i.user?.displayName}`, i.users.map((u) => u.displayName));
}
```

::: tip Dados de grupo atualizados
Antes de qualquer interação de grupo ser despachada — de participante, de atualização ou da família de mensagens — o cliente resolve o grupo através de `client.groups.ensure`: uma cópia em cache de **até 60 segundos** é servida sem I/O, qualquer coisa mais antiga (ou ausente) dispara um único fetch, e eventos concorrentes o compartilham — no máximo um round-trip por grupo por minuto. Eventos de participação e de metadados atualizam o cache conforme chegam, então `i.group.members` / `i.group.memberCount` refletem o próprio evento, e `i.member` responde com o `{ user, role }` do autor. Se uma atualização falhar, a interação ainda é despachada sobre o último estado conhecido (um aviso `[group refresh]` é registrado; `member` permanece `undefined` apenas enquanto nenhum metadado jamais foi resolvido).
:::

## GroupUpdateInteraction {#groupupdateinteraction}

```ts
class GroupUpdateInteraction extends Interaction
```

Os metadados do grupo mudaram.

<ApiTable
  :rows="[
    { name: 'group', type: 'Group', description: 'Grupo alvo — metadados resolvidos antes do dispatch (cache de ≤60s), mudanças aplicadas por cima.' },
    { name: 'changes', type: 'GroupUpdateChanges', description: 'Diff parcial: { name?, description?, announceOnly?, locked? } — apenas as chaves alteradas estão presentes.' },
    { name: 'hasNameChange', type: 'boolean (getter)', description: '&quot;name&quot; in changes — presença de chave, não checagem de valor (uma chave presente pode conter undefined).' },
    { name: 'hasDescriptionChange', type: 'boolean (getter)', description: '&quot;description&quot; in changes — true mesmo quando a descrição foi limpa (chave presente com valor undefined).' }
  ]"
/>

```ts
if (i.isGroupUpdate() && i.hasNameChange) {
  await i.reply(`group is now "${i.changes.name}"`);
}
```

## ButtonInteraction {#buttoninteraction}

<ApiBadge kind="class" /> Toques em botões interativos legados (protocolo não-WhatsApp-Business).

<ApiTable
  :rows="[
    { name: 'messageId', type: 'string', description: 'Mensagem que carrega o botão.' },
    { name: 'buttonId', type: 'string', description: 'Id do provedor do botão tocado.' },
    { name: 'title', type: 'string', description: 'Prompt/título da mensagem com botão.' },
    { name: 'displayText', type: 'string', description: 'Rótulo do botão tocado.' },
    { name: 'variant', type: '&quot;template&quot; | &quot;plain&quot;', description: 'Estilo da mensagem com botão.' },
    { name: 'reference', type: 'MessageReference | undefined', description: 'Contexto citado, quando presente.' }
  ]"
/>

## ListInteraction {#listinteraction}

<ApiBadge kind="class" /> Seleções de linha do seletor de listas legado.

<ApiTable
  :rows="[
    { name: 'messageId', type: 'string', description: 'Mensagem que carrega a lista.' },
    { name: 'rowId', type: 'string', description: 'Id da linha escolhida.' },
    { name: 'title', type: 'string', description: 'Título da linha.' },
    { name: 'description', type: 'string | undefined', description: 'Subtítulo da linha, quando fornecido.' },
    { name: 'reference', type: 'MessageReference | undefined', description: 'Contexto citado, quando presente.' }
  ]"
/>

## CommandParsingOptions <ApiBadge kind="interface" /> {#commandparsingoptions}

```ts
interface CommandParsingOptions {
  readonly prefixes: readonly string[];
  readonly ignoreSelf: boolean;
}
```

Forma normalizada exportada de [`ClientOptions.commands`](/pt-BR/reference/client-options#commandoptions) — um prefixo único vira `prefixes: ["…"]`; `ignoreSelf` decide se mensagens próprias são parseadas como comandos. Passada para `InteractionFactory`, que a usa para decidir a classificação de *mensagem* vs *comando*:

```ts
// commands: { prefix: ["!", "/"], ignoreSelf: true } resolve para:
const parsing: CommandParsingOptions = { prefixes: ["!", "/"], ignoreSelf: true };
```

Com `commands: false` o cliente passa `null` e nenhuma mensagem é parseada como comando.

## InteractionFactory <ApiBadge kind="internal" /> {#interactionfactory}

```ts
class InteractionFactory {
  constructor(
    client: Client,
    entities: EntityFactory,
    commands: CommandRegistry,
    commandOptions: CommandParsingOptions | null,
  );
  fromMessage(event: BackendMessageEvent): Interaction;
  fromReaction(event: BackendReactionEvent): ReactionInteraction;
  fromMessageUpdate(event: BackendMessageUpdateEvent): MessageUpdateInteraction;
  fromGroupParticipants(event: BackendGroupParticipantsEvent): GroupParticipantInteraction;
  fromGroupUpdate(event: BackendGroupUpdateEvent): GroupUpdateInteraction;
}
```

Converte eventos normalizados do backend nas classes acima — um método por tipo de evento, cada um retornando uma instância concreta (nunca `null`; formatos de mensagem não reconhecidos ainda viram um `MessageInteraction`). `fromMessage` retorna `ButtonInteraction`/`ListInteraction` para esses tipos de conteúdo, e promove a mensagem para `CommandInteraction` quando ela passa por `CommandRegistry.parse()` (sujeito a `ignoreSelf`). Apenas `Client` o chama — não é exportado em lugar nenhum.

## Veja também {#see-also}

- [Guia de interações](/pt-BR/guide/interactions) — fluxo de dispatch e receitas
- [Conteúdo de mensagens](/pt-BR/reference/content) — a união `MessageContent`
- [Entidades](/pt-BR/reference/entities) — `Message`, `Chat`, `User`, `Group`
