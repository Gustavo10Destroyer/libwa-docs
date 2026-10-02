# Grupos {#groups}

<ApiBadge kind="class" /> `GroupService` (`client.groups`) resolve metadados por meio de um cache de 60 segundos (`ensure`), faz round-trips sob demanda (`fetch`) e executa operações de membros/configurações. Tudo o que ele não pode fazer aparece como `UnsupportedOperationError`.

```ts
const group = await client.groups.fetch("1203630…@g.us"); // sempre um round-trip
const fresh = await client.groups.ensure("1203630…@g.us"); // cache se tiver ≤60s
await client.groups.addMembers(group, ["5511888888888@s.whatsapp.net"]);
```

## `GroupTarget` {#grouptarget}

```ts
type GroupTarget = Group | ChatId;
```

Todo método aceita uma entidade `Group` ou uma string de chat id crua — internamente `#chatId(target)` escolhe `.id` ou a própria string, e acrescenta `@g.us` quando a forma de id puro é passada: `120363012345678901` ou um valor legado `120363012345678901-1601234567890` (como aparece em um link de grupo) tornam-se o chat id canônico `…@g.us`.

## GroupService <ApiBadge kind="class" /> {#groupservice}

```ts
class GroupService {
  constructor(backend: WhatsAppBackend, entities: EntityFactory); // interno
  ensure(target: GroupTarget): Promise<Group>;
  fetch(target: GroupTarget): Promise<Group>;
  reset(): void;                          // esquece quando cada grupo foi buscado pela última vez — chamado por logout()/destroy()
  addMembers(group: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  removeMembers(group: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  promote(group: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  demote(group: GroupTarget, users: readonly (UserLike | UserId)[]): Promise<void>;
  rename(group: GroupTarget, name: string): Promise<void>;
  setDescription(group: GroupTarget, description: string | undefined): Promise<void>;
}
```

`UserLike` (interno) é qualquer `{ readonly id: UserId }` — um `User` qualifica, então passe entidades ou ids crus de forma intercambiável.

Exposto como `client.groups`; construído pelo `Client`. Os métodos da entidade `Group` (`addMembers`, `promote`, …) delegam para cá.

### `ensure` {#ensure}

```ts
ensure(target): Promise<Group>
```

Resolve um grupo por meio do **cache de metadados de 60 segundos** — o caminho que o próprio client usa antes de cada dispatch de grupo:

- um fetch deste grupo foi *tentado* (sucesso ou falha) há menos de 60 segundos → o `Group` em cache resolve imediatamente, **sem I/O**;
- caso contrário → `fetch` executa uma vez; chamadas `ensure` concorrentes para o mesmo grupo compartilham uma única requisição em andamento;
- um fetch com falha conta como uma tentativa: a janela faz backoff (os dispatches continuam servindo o último estado conhecido) e o próximo `ensure` após a janela tenta de novo.

Nunca lança por cache miss — as falhas aparecem exatamente como [`fetch`](#fetch) (`NotFoundError` / `PermissionError` / `BackendError`).

```ts
const g = await client.groups.ensure("120363012345678901@g.us");
g.memberCount; // respondido do cache quando a janela é recente
```

### `fetch` {#fetch}

```ts
fetch(target): Promise<Group>
```

Busca os metadados completos e retorna um `Group` **sincronizado**: metadados aplicados, cache de `name` atualizado, participantes mapeados para `User`s (com `isMe` definido) — assim um grupo buscado com um id puro faz round-trip com `group.id` na forma canônica `…@g.us`. Sempre um round-trip ao provedor: contorna o cache de 60 segundos e (re)inicia a janela (o mesmo vale para `group.refresh()`).

**Erros:** `NotFoundError` / `PermissionError` (erros da biblioteca vindos do backend passam direto: `ERR_NOT_FOUND` / `ERR_PERMISSION`) e `BackendError` caso contrário (contexto `Failed to fetch group <id>`).

```ts
const g = await client.groups.fetch("120363012345678901"); // id puro de um link de grupo
g.id; // "120363012345678901@g.us" — forma canônica
g.memberCount; g.announceOnly; g.owner?.displayName;
```

### `addMembers` / `removeMembers` {#addmembers-removemembers}

```ts
addMembers(group, users): Promise<void>
removeMembers(group, users): Promise<void>
```

Mudanças de membros — **direitos de admin exigidos** (`PermissionError` do lado do provedor quando ausentes).

**Erros** (a verificação de capacidade roda antes da verificação de lista vazia):

| Condição | Erro | Código |
| --- | --- | --- |
| backend não tem `updateGroupParticipants` | `UnsupportedOperationError` | `ERR_UNSUPPORTED` |
| `users` vazio | `ValidationError` | `ERR_EMPTY_USER_LIST` |
| falha do provedor | `PermissionError` (direitos de admin, 401–403) / `NotFoundError` (404) / `BackendError` caso contrário | `ERR_PERMISSION` / `ERR_NOT_FOUND` / `ERR_BACKEND` |

### `promote` / `demote` {#promote-demote}

```ts
promote(group, users): Promise<void>
demote(group, users): Promise<void>
```

Mudanças de cargo — mesma semântica de erros que a de membros (contextos `Failed to promote/demote group participants`).

### `rename` {#rename}

```ts
rename(group, name): Promise<void>
```

<ApiTable
  :rows="[
    { name: 'name', type: 'string', description: 'Novo assunto. String vazia → ValidationError ERR_EMPTY_GROUP_NAME.' }
  ]"
/>

Em caso de sucesso, os metadados em cache da factory (quando conhecidos) são atualizados com o novo nome para que `group.name` reflita a realidade sem um novo fetch.

**Erros:** `ERR_EMPTY_GROUP_NAME`, `ERR_UNSUPPORTED` (sem `updateGroupName`), `BackendError` (contexto `Failed to rename group <id>`).

### `setDescription` {#setdescription}

```ts
setDescription(group, description: string | undefined): Promise<void>
```

Define a descrição do grupo — `undefined` **limpa** a descrição (a verificação de capacidade roda primeiro; não há validação de valor vazio, ao contrário de `rename`).

**Erros:** `ERR_UNSUPPORTED` (sem `updateGroupDescription`), `BackendError` (contexto `Failed to update description of group <id>`). Metadados em cache atualizados em caso de sucesso.

## Resumo da validação {#validation-summary}

| Code | Condição |
| --- | --- |
| `ERR_EMPTY_USER_LIST` | `addMembers`/`removeMembers`/`promote`/`demote` com zero usuários |
| `ERR_EMPTY_GROUP_NAME` | `rename("")` |

## Receitas {#recipes}

```ts
// Sincroniza tudo sobre um grupo
const g = await client.groups.fetch(i.chat.id);
await g.refresh();                       // igual a client.groups.fetch + apply
console.log(g.displayName, g.memberCount, g.metadata?.announceOnly);

// Comando de moderação com guard
if (i.isCommand() && i.command?.groupOnly && i.isFromGroup()) {
  const target = i.args[0];
  await client.groups.removeMembers(i.chat.id, [target]);
}

// Renomear + anunciar
await client.groups.rename(groupId, "New name");
await client.groups.setDescription(groupId, "Rules live here.");
```

Veja o [guia de grupos](/pt-BR/guide/groups) para o percurso completo, incluindo os métodos no nível da entidade.

## Veja também {#see-also}

- [Entidades → Group](/pt-BR/reference/entities#group) — métodos de conveniência no nível da entidade
- [Tipos de grupo](/pt-BR/reference/entities#group-types) — metadados/cargos/mudanças
- [Mapa de capacidades do backend](/pt-BR/guide/backends#the-contract) — quais operações são opcionais
