# Middleware {#middleware}

<ApiBadge kind="type" /> O pipeline de dispatch entre interações construídas pela factory e a execução de comandos/listeners.

```ts
import type { Middleware } from "libwa.js";
```

## `Middleware` {#middleware-1}

```ts
type Middleware = (
  interaction: Interaction,
  next: () => Promise<void>,
) => void | Promise<void>;
```

| Parâmetro | Descrição |
| --- | --- |
| `interaction` | A interação candidata (pode ser estreitada/anotada por um middleware anterior por meio da **mutação** dela antes de `next()`). |
| `next` | Continua a cadeia. Deve ser chamado **no máximo uma vez** — uma segunda chamada rejeita com `Error("next() called multiple times in the same middleware.")`. Não chamá-lo interrompe o dispatch (comandos + listeners nunca executam). |

Regras:

1. **Ordem de registro** — `client.use(a).use(b)` executa `a` e depois `b`.
2. **Pular = filtrar** — retorne sem `next()` para descartar a interação silenciosamente (sem evento de erro).
3. **Lançar = abortar com relato** — os erros aparecem como evento `error` com o contexto `middleware`.
4. Middlewares assíncronos são aguardados; `await next()` mantém as garantias de ordenação.

```ts
import { type Middleware, type CommandInteraction } from "libwa.js";

const rateLimit: Middleware = async (i, next) => {
  if (bucket.has(i.author?.id) && !i.isCommand()) return; // engole
  await next();
};

const adminsOnly: Middleware = async (i, next) => {
  if (i.isCommand() && i.name === "kick" && !isAdmin(i.author)) {
    await i.reply("admins only");
    return; // para antes de execute() e dos listeners
  }
  await next();
};

client.use(rateLimit).use(adminsOnly);
```

Registro: [`client.use(middleware)`](/pt-BR/reference/client#use) (encadeável, sem unuse).

## `runMiddlewareChain` <ApiBadge kind="internal" /> {#runmiddlewarechain}

```ts
function runMiddlewareChain(
  middlewares: readonly Middleware[],
  interaction: Interaction,
  last: () => Promise<void>,
): Promise<void>
```

Esvaziamento recursivo: despacha a posição `0…n`, depois `last()` (a etapa de execução de comandos + listeners do client). Cada middleware recebe um `next` embrulhado protegido contra dupla invocação.

**Semântica:**

| Situação | Resultado |
| --- | --- |
| todo middleware chama `next()` | `last()` executa, a promise resolve |
| algum middleware pula `next()` | a promise resolve, `last()` nunca executa (descarte silencioso) |
| middleware lança erro | a promise rejeita → o client reporta o contexto `middleware` |
| `next()` chamado duas vezes | rejeita com o `Error` de chamada dupla |
| `next()` disparado mas nunca aguardado/tratado (destacado) | a cadeia adota a promise: sua rejeição rejeita este dispatch também → o client reporta o contexto `middleware` |

Não é exportado da raiz do pacote — o `Client` é dono do único pipeline. Documentado para colaboradores que estendem o dispatch (veja o [guia de middleware](/pt-BR/guide/middleware#semantics)).

## Veja também {#see-also}

- [Guia de middleware](/pt-BR/guide/middleware) — padrões (permissões, logging, rate limits, i18n)
- [Client → use](/pt-BR/reference/client#use) — registro
- [Arquitetura: pipeline de eventos](/pt-BR/architecture/event-pipeline) — onde o middleware se encaixa
