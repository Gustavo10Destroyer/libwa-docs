# IDs e utilitários {#ids-helpers}

<ApiBadge kind="type" /> Tipos de identificador e utilitários compartilhados por toda a API. Todos são strings simples em tempo de execução — registráveis em log, armazenáveis, comparáveis.

```ts
import type { ChatId, UserId, Unsubscribe } from "libwa";
import { phoneFromId } from "libwa";
```

## `ChatId` {#chatid}

```ts
type ChatId = string;
```

Identificador de qualquer conversa: chat direto (`5511999999999@s.whatsapp.net`), grupo (`1203630…@g.us`), lista de transmissão, newsletter ou formatos próprios do provedor. Produzidos pelos backends; o núcleo apenas os repassa.

Usado por: `Chat.id`, alvos de `MessageService`, alvos de `GroupService`, todo `Backend*Request`.

## `UserId` {#userid}

```ts
type UserId = string;
```

Identificador de um usuário — o mesmo valor que o `ChatId` de um chat direto carrega. Usado por: `User.id`, menções, requisições de participantes de grupo, payloads de eventos.

O WhatsApp tem **dois esquemas de id para a mesma conta** ([JID vs LID](https://baileys.wiki/concepts/jids)):

| Esquema | Formato | Carrega o número de telefone? |
| --- | --- | --- |
| JID de número de telefone (PNJID) | `5511999999999@s.whatsapp.net` (legado `@c.us`) | sim — os dígitos são o id |
| Linked id (LIDJID) | `123456789012345@lid` | não — opaco, atribuído para esconder o número |

Qual forma chega depende do modo de endereçamento do chat (grupos modernos são endereçados por LID), então nunca assuma os dígitos. Ambas as formas são produzidas pelos backends, comparadas com `===` e intercambiáveis para a API — enviar uma mensagem ou uma menção funciona com qualquer id que você tenha recebido. Para ir de um esquema ao outro, use [`client.users`](/pt-BR/reference/entities#userservice) (`phone` / `resolvePhone` / `altId` / `resolveLid`; `fetch` verifica a existência e o nome de uma conta em qualquer forma); eventos, metadados de grupo e mudanças de participação carregam os pares brutos como `idPairs` / `GroupParticipant.altId` e a biblioteca os registra automaticamente.

<ApiNote kind="info">
Os dois aliases são estruturalmente ambos <code>string</code> — o TypeScript não impede você de trocá-los. A distinção é documental: ids de chat nomeiam conversas, ids de usuário nomeiam contas.
</ApiNote>

## `Unsubscribe` {#unsubscribe}

```ts
type Unsubscribe = () => void;
```

Retornado por inscrições de eventos:

- `client.on / once` → remove aquele listener;
- `backend.on(...)` → desanexa aquele listener do backend.

```ts
const stop = client.on("ready", handler);
stop(); // depois
```

Chamar um handle já usado/cancelado duas vezes é inofensivo (exclusões idempotentes no emitter).

## `phoneFromId` {#phonefromid}

```ts
function phoneFromId(id: string): string | undefined
```

Helper de nível de protocolo: extrai os dígitos de um JID de usuário padrão que corresponda a `/^(\d{5,})@(?:s\.whatsapp\.net|c\.us)$/`.

```ts
phoneFromId("5511999999999@s.whatsapp.net"); // "5511999999999"
phoneFromId("5511999999999@c.us");           // "5511999999999" (legado)
phoneFromId("1203630…@g.us");                // undefined (id de grupo)
phoneFromId("123456789012345@lid");          // undefined (linked id — sem dígitos)
```

`User.phone` o usa internamente; chame-o diretamente quando você só tem uma string de id. Ele nunca resolve linked ids — para isso use [`client.users`](/pt-BR/reference/entities#userservice).

## Convenções {#conventions}

| Regra | Detalhe |
| --- | --- |
| Strings, não tipos branded | os ids são serializados para JSON como estão e comparados com `===` |
| O provedor os produz | o núcleo nunca fabrica ids; os backends mapeiam uma única vez os formatos brutos do provedor |
| Números de telefone derivados | somente via `phoneFromId`/`User.phone`/`client.users` — nunca por análise no código do usuário |
| Ids de slot de sessão são diferentes | `ClientOptions.sessionId` usa `[A-Za-z0-9_-]{1,64}` ([sessões](/pt-BR/reference/sessions#assertsafesessionid)) |

## Veja também {#see-also}

- [Entidades](/pt-BR/reference/entities) — `Chat`, `User`, `Message` construídos a partir de ids
- [UserService](/pt-BR/reference/entities#userservice) — resolvendo entre esquemas de id, buscando contas sob qualquer id
- [Eventos](/pt-BR/reference/client-events) — uso de `Unsubscribe`
