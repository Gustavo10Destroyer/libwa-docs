# Grupos {#groups}

Os dados de grupo fluem por três camadas: a **entidade** [`Group`](/pt-BR/reference/entities#group) (em cache, conveniente), o [`GroupService`](/pt-BR/reference/groups) (`client.groups`, operações autoritativas) e as **interações** (eventos de mudança de participação/metadata).

## Obtendo metadata {#fetching-metadata}

```ts
const group = await client.groups.fetch("123456789@g.us");
// ou: await client.groups.fetch(someGroupEntity);

group.name;         // string | undefined (nome da metadata, senão o nome do chat em cache)
group.description;  // string | undefined
group.owner;        // User | undefined
group.memberCount;  // number | undefined
group.members;      // readonly GroupMember[] — { user, role }
group.announceOnly; // boolean | undefined (apenas admins podem postar)
group.metadata;     // GroupMetadata | undefined (registro completo)
```

`fetch()` chama o `getGroupMetadata` do backend, armazena o resultado no cache da [`EntityFactory`](/pt-BR/reference/entities#entityfactory) e retorna a instância `Group` sincronizada — ou seja, `group === client` é a instância em cache para aquele id. Erros:

- `NotFoundError` — o provedor responde 404 (grupo sumiu).
- `PermissionError` — o provedor responde 401/403 (sem acesso).
- `BackendError` — qualquer outra coisa, embrulhado com a causa.

### O cache de 60 segundos {#the-60-second-cache}

`fetch()` é o caminho *sempre fresco* — faz ida e volta a cada chamada. Tudo o que a biblioteca faz internamente passa por `ensure()`, que responde a partir de um cache com **no máximo 60 segundos**:

```ts
const group = await client.groups.ensure("123456789@g.us"); // mesma instância Group em qualquer caso
```

- **Cache com menos de 60s → sem I/O.** O último `Group` é retornado imediatamente; a janela conta a partir da última tentativa *realizada* de fetch (sucesso ou falha).
- **Mais antigo ou ausente → um fetch.** Chamadas `ensure()` concorrentes para o mesmo grupo compartilham uma única requisição em andamento.
- **Falhas também recuam.** Um fetch com falha marca o grupo pelo resto da janela — o cliente continua servindo o último estado conhecido (registrando `[group refresh]`) em vez de martelar um provedor com dificuldade, e retenta quando a janela expira.
- **Eventos mantêm tudo atual.** Eventos de participação e de metadata corrigem o grupo em cache conforme chegam (veja [Trabalhando com a entidade](#working-with-the-entity)), então dentro da janela o cache acompanha a realidade.
- `fetch()` e `group.refresh()` sempre ignoram o cache e reiniciam a janela — chame-os quando precisar de dados garantidamente frescos.

Toda interação de grupo resolve seu grupo por `ensure()` antes de despachar, então bots pagam **no máximo uma ida e volta por grupo por minuto**, independente de o grupo ser falante.

### `GroupMetadata` {#groupmetadata}

```ts
interface GroupMetadata {
  readonly id: ChatId;
  readonly name: string;
  readonly description: string | undefined;
  readonly ownerId: UserId | undefined;
  readonly createdAt: Date | undefined;
  readonly participants: readonly GroupParticipant[]; // { id, altId, role, name, username }
  readonly announceOnly: boolean;
  readonly locked: boolean;
}
```

`GroupRole = "member" | "admin" | "superadmin"`.

## Trabalhando com a entidade {#working-with-the-entity}

```ts
if (chat.isGroup()) {
  const group = chat; // estreitado de Chat → Group

  await group.refresh();               // busca a metadata e aplica nesta instância
  group.applyMetadata(metadata);       // mescla metadata obtida externamente
  group.description;
  group.members.forEach((m) => {
    console.log(`${m.user.displayName} (${m.role}) — ${m.user.isMe ? "me" : m.user.phone ?? m.user.id}`);
  });
}
```

As ações da entidade delegam ao serviço:

```ts
await group.addMembers(["5511@s.whatsapp.net", someUser]);
await group.removeMembers([someUser]);
await group.promote([someUser]);
await group.demote([someUser]);
await group.rename("New name");
await group.setDescription("New description"); // undefined limpa a descrição
```

::: tip Identidade
Chats e grupos são cacheados por id: `interaction.chat === interaction.message.chat`, e um grupo buscado duas vezes é o mesmo objeto. A metadata em cache é atualizada automaticamente quando chegam eventos de atualização de grupo **e de participação** (a factory aplica as mudanças *antes* de criar a interação), então a janela de 60 segundos custa no máximo um fetch por grupo sem ficar desatualizada no meio do caminho.
:::

## Papéis de participação {#membership-roles}

Os papéis são **escopados por grupo**: a mesma conta pode ser `admin` em um grupo e membro comum em outro — então eles vivem no grupo, nunca no [`User`](/pt-BR/reference/entities#user):

```ts
interface GroupMember {
  readonly user: User;       // entidade de nível de conta — a mesma instância de interaction.author
  readonly role: GroupRole;  // "member" | "admin" | "superadmin" — dentro deste grupo
}
```

### Em toda interação: `interaction.member` {#on-every-interaction-interaction-member}

```ts
client.on("interactionCreate", (i) => {
  if (!i.isFromGroup()) return;

  i.member?.role; // "admin" — o papel do remetente neste grupo
  i.member?.user; // === i.author (mesma instância de User)

  if (i.member && i.member.role !== "member") await i.reply("Hello, admin!");
});
```

`member` é calculado a partir de `group` + `author`, e é `undefined` quando falta qualquer um dos lados: chats diretos, eventos sem author (atualizações de metadata de grupo, algumas exclusões em lote), authors que não são participantes do grupo, ou metadata de grupo que o cliente não conseguiu resolver (ela passa por `client.groups.ensure` antes do dispatch — no máximo um fetch por grupo por minuto; veja [O cache de 60 segundos](#the-60-second-cache)).

### No grupo: `members` e `member()` {#on-the-group-members-and-member}

```ts
group.members;                      // readonly GroupMember[]
group.member("222@s.whatsapp.net"); // GroupMember | undefined
group.member(someUser);             // aceita instâncias de User também

// os ids casam entre esquemas — um id de telefone encontra um participante …@lid (e vice-versa)
group.member("987654321012345@lid")?.role; // → "superadmin"

const bot = client.me && group.member(client.me);
if (bot && bot.role !== "member") {
  // o bot é admin aqui
}
```

## Operações de participação (nível de serviço) {#membership-operations-service-level}

```ts
await client.groups.addMembers(groupOrId, users);
await client.groups.removeMembers(groupOrId, users);
await client.groups.promote(groupOrId, users);
await client.groups.demote(groupOrId, users);
await client.groups.rename(groupOrId, "name");
await client.groups.setDescription(groupOrId, "text" | undefined);
```

`GroupTarget = Group | ChatId`. Os usuários aceitam instâncias `User` ou strings `UserId` cruas.

Validação e checagens de capacidade acontecem antecipadamente:

| Condição | Erro | Código |
| --- | --- | --- |
| Lista de usuários vazia | `ValidationError` | `ERR_EMPTY_USER_LIST` |
| Nome de grupo vazio | `ValidationError` | `ERR_EMPTY_GROUP_NAME` |
| O backend não tem `updateGroupParticipants` / `updateGroupName` / `updateGroupDescription` | `UnsupportedOperationError` | `ERR_UNSUPPORTED` |
| O provedor rejeitou **todos** os participantes | `PermissionError` | — |
| O provedor rejeitou **alguns** participantes | sucesso + `logger.warn` por falha | — |

Depois de um rename/atualização de descrição bem-sucedido, a metadata em cache é corrigida imediatamente (sem novo fetch).

## Detectando interações de grupo {#detecting-group-interactions}

### O evento: `interactionCreate` {#the-event-interactioncreate}

Toda interação de grupo — mudanças de participação, mudanças de metadata, mensagens comuns de grupo — chega no único evento [`interactionCreate`](/pt-BR/guide/events). O conjunto de eventos do libwa.js é deliberadamente fechado: **não existe** evento separado `groupAdd`/`groupRemove`/`groupPromote`. Registre um listener e filtre com os type guards:

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isFromGroup()) return; // apenas chats de grupo (estreita i.group para Group)

  if (i.isGroupParticipantUpdate()) {
    // participação mudou — i.action, i.user, i.users, i.author, i.group
  } else if (i.isGroupUpdate()) {
    // metadata mudou — i.changes, i.group
  } else if (i.isMessage()) {
    // mensagem comum de grupo — i.text, i.mentions
  }
});
```

### Filtragem {#filtering}

| Filtro | Como |
| --- | --- |
| apenas chats de grupo | `i.isFromGroup()` — também estreita `i.group` para `Group` |
| mudanças de participação (add/remove/promote/demote) | `i.isGroupParticipantUpdate()` |
| mudanças de metadata (name/description/settings) | `i.isGroupUpdate()` |
| um grupo específico | depois de um guard: `i.group.id === "123456789@g.us"` |
| uma ação específica | `i.action === "add"` (ou o getter `i.isAdd`) |
| mensagens enviadas em grupos | `i.isFromGroup() && i.isMessage()` |

```ts
const MY_GROUP = "123456789@g.us";

client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate()) return; // apenas mudanças de participação
  if (i.group.id !== MY_GROUP) return;       // um grupo específico
  if (!i.isAdd) return;                      // apenas entradas

  console.log(`${i.user?.displayName} joined ${i.group.name}`);
});
```

### Qual ação aconteceu {#which-action-took-place}

`GroupParticipantInteraction.action` é um `GroupParticipantAction`:

| `action` | Getter | Significado |
| --- | --- | --- |
| `"add"` | `i.isAdd` | usuário(s) entrou no grupo |
| `"remove"` | `i.isRemove` | usuário(s) saiu ou foi expulso |
| `"promote"` | `i.isPromote` | membro(s) virou admin(s) |
| `"demote"` | `i.isDemote` | admin(s) virou membro(s) comum(ns) |
| `"other"` | — | ação do provedor não mapeada (sem getter) |

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate()) return;

  switch (i.action) {
    case "add":
    case "remove":
    case "promote":
    case "demote":
      console.log(i.action, "by", i.author?.displayName, "→", i.user?.displayName);
      break;
    default: // "other"
      console.log("unmapped participant action in", i.group.name);
  }
});
```

### `author` vs `user` — o ator e o usuário afetado {#author-vs-user-—-the-actor-and-the-affected-user}

::: warning author realizou · user foi afetado
Em **toda** `GroupParticipantInteraction` — para `add`, `remove`, `promote` e `demote`, sem exceção:

| | Campo | Significado |
| --- | --- | --- |
| **Quem realizou a ação** | `i.author` | O **ator**: a pessoa que adicionou / removeu / promoveu / rebaixou. `undefined` para atores de sistema ou desconhecidos. |
| **Quem foi afetado** | `i.user` (e `i.users`) | O **alvo**: a pessoa que foi adicionada / removida / promovida / rebaixada. `i.user` é `users[0]`; `i.users` cobre lotes. |

Nunca os troque: se Ana expulsou Beto, então `i.author` é **Ana** (o ator) e `i.user` é **Beto** (o usuário afetado). `i.group` é o grupo onde aconteceu.
:::

### Mudanças de participação {#membership-changes}

**Detectar uma entrada** — quem entrou, e quem a adicionou:

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isGroupParticipantUpdate() || !i.isAdd) return;

  const joined = i.user; // usuário afetado — quem entrou
  const addedBy = i.author; // ator — quem realizou a adição

  await i.reply(
    `${joined?.displayName ?? "someone"} joined` +
      (addedBy ? ` (added by ${addedBy.displayName})` : ""),
  );

  // i.group.members / i.group.memberCount estão atualizados — o evento de
  // participação foi aplicado na metadata em cache antes da interação despachar
  console.log(`${i.group.name} now has ${i.group.memberCount} members`);
});
```

**Detectar uma remoção** — quem saiu ou foi expulso, e quem fez:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate() || !i.isRemove) return;

  const removed = i.user; // usuário afetado — quem foi removido
  const removedBy = i.author; // ator — quem realizou a remoção

  console.log(
    `${removed?.displayName ?? "someone"} was removed by ${removedBy?.displayName ?? "unknown"}`,
  );
});
```

**Detectar promote/demote** — mesma distinção, ambos os papéis:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate()) return;

  if (i.isPromote) {
    // i.user = quem virou admin · i.author = quem promoveu
    console.log(`${i.user?.displayName} made admin by ${i.author?.displayName ?? "?"}`);
  }
  if (i.isDemote) {
    // i.user = quem perdeu o admin · i.author = quem rebaixou
    console.log(`${i.user?.displayName} demoted by ${i.author?.displayName ?? "?"}`);
  }
});
```

**Lotes** — o provedor pode mover vários usuários em um único evento:

```ts
if (i.isAdd) {
  const joined = i.users.map((u) => u.displayName).join(", "); // todos os usuários afetados
  console.log(`joined: ${joined} · by: ${i.author?.displayName ?? "?"}`);
}
```

Ações do provedor fora de `add|remove|promote|demote` chegam como `action: "other"` (sem getter de conveniência). Eventos sem um id de grupo resolvível ou sem participantes são descartados pelo mapper.

### Mudanças de metadata {#metadata-changes}

```ts
client.on("interactionCreate", (i) => {
  if (!i.isGroupUpdate()) return;
  // i.changes: parcial { name?, description?, announceOnly?, locked? }
  // i.group já reflete os novos valores (aplicados na metadata em cache antes do dispatch)
});
```

Limpezas de descrição são normalizadas: o provedor envia `desc: null`, o libwa.js mapeia para `changes.description === undefined` com a chave **presente** (`"description" in changes` é `true` — presença da chave, não do valor).

Um `groupUpdate` cuja diff contra a metadata em cache é vazia é descartado antes do dispatch, então os listeners nunca veem uma atualização que não faz nada.

## Menções {#mentions}

Mensagens de grupo podem mencionar pessoas com @. Menções são tratadas nos dois sentidos: **lê-las** de mensagens recebidas e **enviá-las** com as suas.

### Lendo menções {#reading-mentions}

`MessageInteraction` (e portanto `CommandInteraction`) expõe `mentions` — os usuários mencionados com @, extraídos da mensagem recebida:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isMessage()) return; // menções existem apenas em interações de mensagem
  if (i.mentions.length === 0) return; // ninguém foi mencionado com @

  for (const user of i.mentions) {
    console.log(`mentioned: ${user.id} (${user.displayName})`);
  }
});

client.commands.register({
  name: "ban",
  groupOnly: true,
  async execute(i) {
    const target = i.mentions[0]; // primeiro usuário mencionado com @
    if (!target) return void (await i.reply("Mention someone: !ban @user"));
    // …
  },
});
```

Observações:

- menções são objetos [`User`](/pt-BR/reference/entities#user) comuns — o payload carrega apenas ids, então `user.name` costuma ser `undefined` aqui e `displayName` recorre ao número de telefone, ou ao id bruto `…@lid` quando não se conhece o número (veja [Obtendo nomes de grupo e usuário](#fetching-group-and-user-names) para as fontes dos nomes);
- reações, edições e atualizações de grupo nunca carregam menções — faça o guard com `i.isMessage()` primeiro;
- o bot também pode ser mencionado — verifique `user.isMe`.

### Enviando com menções {#sending-with-mentions}

Coloque os usuários em `mentions` — seja no payload ou nas opções do `send` (ambos são mesclados e deduplicados):

```ts
await i.reply({
  text: `Welcome @${member.phone ?? member.id}!`,
  mentions: [member], // MessagePayload.mentions
});

await client.messages.send(chat, "ping", { mentions: [member] }); // SendOptions.mentions
```

Receba o membro afetado de um evento de entrada com uma menção — `i.user` de novo sendo o usuário afetado:

```ts
client.on("interactionCreate", async (i) => {
  if (!i.isGroupParticipantUpdate() || !i.isAdd || !i.user) return;

  await i.reply({
    text: `Welcome @${i.user.phone ?? i.user.id}!`,
    mentions: [i.user],
  });
});
```

### Ids vinculados (LIDs) e menções {#linked-ids-lids-and-mentions}

O WhatsApp endereça contas de uma de duas maneiras — por número de telefone (`5511999999999@s.whatsapp.net`) ou por um linked id opaco (`123456789012345@lid`) que esconde o número ([JID vs LID explicado](https://baileys.wiki/concepts/jids)). Grupos modernos normalmente são endereçados por LID, então `i.author.id`, `i.mentions` e `group.members[].user.id` podem muito bem ser valores `…@lid` sem nenhum dígito.

As regras que mantém as menções funcionando:

- **Passe os ids como foram recebidos.** `mentions: [user]` funciona com qualquer esquema que o evento entregou — o WhatsApp espera a própria forma de endereçamento do chat, então *não* tente converter um lid em um JID de telefone antes de enviar.
- **Use `user.phone` para o texto `@…`.** A biblioteca pareia ids com números de telefone conforme mensagens, metadata e eventos de participação chegam, então `user.phone` já está resolvido na maioria dos casos:

  ```ts
  await i.reply(`hello @${user.phone ?? user.displayName}`, { mentions: [user] });
  ```

- **Pergunte ao `client.users` para o resto.** Quando um par ainda não chegou:

  ```ts
  const digits = await client.users.resolvePhone(user.id); // "5511999999999" | undefined
  const lid = await client.users.resolveLid(user.id);      // "…@lid" | undefined (o próprio, para lids)
  const knownLid = client.users.altId(user.id);            // contraparte registrada, sem I/O
  ```

  `resolvePhone`/`resolveLid` respondem primeiro a partir dos pares registrados, depois perguntam ao backend (o Baileys resolve pelo seu store `lidMapping`) e resolvem `undefined` quando ninguém sabe o mapeamento — recorra a `user.id` no texto, como nos exemplos acima.

- **`displayName` degrada honestamente.** Um lid sem nome e sem telefone resolvido mostra o id bruto `…@lid` — prefira `user.phone ?? user.displayName` em textos voltados ao usuário, nunca `user.id` diretamente.

## Obtendo nomes de grupo e usuário {#fetching-group-and-user-names}

### Nomes de grupo {#group-names}

```ts
// 1. Sob demanda — sempre uma ida e volta ao provedor, ignorando o cache
const group = await client.groups.fetch("120363012345678901"); // id puro funciona — @g.us é anexado
group.name; // assunto do grupo, ex. "Planos de fim de semana"
group.displayName; // name ?? id — nunca vazio

// 2. A partir de uma interação de grupo — resolvido pelo cache de ≤60s, mantido atual pelos eventos
client.on("interactionCreate", (i) => {
  if (!i.isGroupParticipantUpdate()) return;
  console.log(i.group.name, i.group.memberCount);
});

// 3. Ressincroniza uma entidade que você já tem (também ignora o cache)
await group.refresh();
```

`fetch` (e todo outro método de grupo) aceita o id em qualquer uma de suas formas habituais: um chat id completo `…@g.us`, o número puro como aparece em um link de grupo, ou uma entidade `Group`/`Chat` que você já tenha.

### Nomes de usuário {#user-names}

Um `User` carrega qualquer nome que o provedor forneceu:

| Acessador | Significado |
| --- | --- |
| `user.name` | Nome conhecido — lembrado entre eventos (em qualquer esquema de id) uma vez visto; `undefined` apenas quando nenhum nome jamais chegou para aquela conta |
| `user.displayName` | `name` → `phone` → `id` — sempre algo legível |
| `user.phone` | Dígitos de um id de número de telefone, ou de um par LID ↔ telefone resolvido ([Ids vinculados](#linked-ids-lids-and-mentions)); `undefined` enquanto desconhecido |
| `user.id` | `5511999999999@s.whatsapp.net` ou `123456789012345@lid` |

**O nome de exibição que o usuário personalizou no WhatsApp** (o nome do perfil, também chamado de push name) chega com cada mensagem recebida:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isMessage()) return;
  i.author?.name; // "Gustavo" — o nome de perfil no WhatsApp do remetente
  i.author?.displayName; // "Gustavo", ou o telefone como fallback quando desconhecido
});

client.me?.name; // o seu próprio nome de perfil
```

Nomes são **lembrados automaticamente**: todo push name que a biblioteca vê (o remetente de uma mensagem, um nome de lookup fornecido pelo provedor) é armazenado em ambos os esquemas de id, então payloads posteriores que trazem só o id ainda respondem com `user.name` — a menção em uma mensagem seguinte, o autor de uma reação, um membro de grupo obtido da metadata:

```ts
client.on("interactionCreate", (i) => {
  if (!i.isMessage()) return;
  i.mentions[0]?.name; // "Gustavo" — lembrado da própria mensagem anterior daquele usuário, quando uma chegou
});
```

Para perguntar ao provedor se uma conta existe (e descobrir seu nome atual), use `client.users.fetch`:

```ts
const user = await client.users.fetch("5511999999999"); // phone JID, dígitos puros ou …@lid funcionam
if (user) {
  console.log(`${user.displayName} exists`); // fallback "Gustavo" / telefone / id
}
```

`fetch` resolve `undefined` quando não existe conta (ou quando um id vinculado não pode ser mapeado), lança `ValidationError` (`ERR_INVALID_USER_ID`) para ids malformados, e `UnsupportedOperationError` quando o backend não consegue verificar — ele nunca adivinha. Tabela completa de entrada e lista de erros na [referência do UserService](/pt-BR/reference/entities#userservice).

Dados de perfil trafegam pelos mesmos ids, cada um atrás da sua própria capacidade opcional: `client.users.pictureUrl(id, type?)` (URL da foto de perfil, `undefined` quando ausente ou privada), `client.users.about(id)` (texto da bio/status) e `client.users.accountType(id)` (`"standard" | "business"`). Eles aceitam as mesmas formas de id que `fetch`; veja [UserService](/pt-BR/reference/entities#userservice) para os erros.

::: tip Nomes da lista de contatos não são sincronizados
O nome que **você** salvou na agenda do seu celular ("Mãe", "Ana — trabalho") fica no seu dispositivo e **não** faz parte dos seis eventos normalizados do libwa.js — ele não pode ser lido de um `User`. Use os nomes de perfil do WhatsApp (acima) ou mantenha o seu próprio mapa `UserId → name`. Participantes de grupo podem carregar um nome fornecido pelo provedor em `GroupMetadata.participants[].name`, mas costuma ser `undefined` com o backend Baileys; `displayName` sempre recua graciosamente (name → phone → id).
:::

## Grupos apenas de anúncio (admin) {#announce-only-admin-groups}

```ts
const group = await client.groups.fetch(chat.id);
if (group.announceOnly && !i.author?.isMe) {
  const mine = client.me ? group.member(client.me) : undefined;
  const meIsAdmin = mine?.role === "admin" || mine?.role === "superadmin";
  // …lógica de moderação de sua escolha
}
```

O libwa.js deliberadamente **não** traz um motor de permissões: a metadata diz *o que é*, o seu código decide *o que fazer*. Um guard de comando exclusivo de grupo (`groupOnly: true`) cobre o caso comum.

## Um comando completo ciente de grupo {#a-complete-group-aware-command}

```ts
import { Client, NotFoundError, PermissionError, type CommandInteraction } from "libwa.js";

const client = new Client({ commands: { prefix: "!" } });

client.commands.register({
  name: "ban",
  description: "Removes a mentioned user (admin only)",
  groupOnly: true,
  async execute(interaction: CommandInteraction) {
    const chat = interaction.chat;
    if (!chat.isGroup()) return; // estreitamento em tempo de compilação

    const target = interaction.mentions[0];
    if (!target) {
      await interaction.reply("Mention the user: !ban @someone");
      return;
    }

    try {
      await chat.removeMembers([target]);
      await interaction.reply(`${target.displayName} removed.`);
    } catch (error) {
      if (error instanceof PermissionError) {
        await interaction.reply("I need admin rights for that.");
        return;
      }
      if (error instanceof NotFoundError) {
        await interaction.reply("That user is not in this group.");
        return;
      }
      throw error; // reportado pelo evento error do cliente
    }
  },
});
```

## Matriz de capacidades dos backends {#backend-capability-matrix}

| Operação | Backend Baileys | Método de capacidade |
| --- | --- | --- |
| Obter metadata | ✅ | `getGroupMetadata` (obrigatório) |
| Adicionar/remover/promover/rebaixar | ✅ | `updateGroupParticipants?` |
| Renomear | ✅ | `updateGroupName?` |
| Definir/limpar descrição | ✅ | `updateGroupDescription?` |

Um backend sem esses recursos faz as chamadas correspondentes lançarem `UnsupportedOperationError` — faça feature detection tentando a chamada, ou verifique o método na instância do backend (`client.backend.updateGroupName !== undefined`).

## Relacionados {#related}

- [Referência de entidades](/pt-BR/reference/entities#group) — API completa de `Group`
- [Referência do GroupService](/pt-BR/reference/groups) — API completa do serviço
- [GroupParticipantInteraction](/pt-BR/reference/interactions#groupparticipantinteraction) / [GroupUpdateInteraction](/pt-BR/reference/interactions#groupupdateinteraction)
- [Eventos do backend](/pt-BR/reference/backend#backendeventmap) — os eventos normalizados por trás dessas interações
