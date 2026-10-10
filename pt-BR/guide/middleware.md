# Middleware {#middleware}

Middlewares são funções ordenadas por que toda interação passa **antes** de os comandos serem executados e de os listeners `interactionCreate` rodarem. São o ponto de extensão do libwa.js para rate limiting, filtragem, logging, permissões e métricas.

## O contrato {#the-contract}

```ts
type Middleware = (
  interaction: Interaction,
  next: () => Promise<void>,
) => void | Promise<void>;
```

Registre com `client.use()` (encadeável):

```ts
import { type Middleware, Client } from "libwa.js";

const logger: Middleware = async (interaction, next) => {
  const started = Date.now();
  await next(); // continue a cadeia
  console.log(`${interaction.type} handled in ${Date.now() - started}ms`);
};

const ignoreBots: Middleware = (interaction, next) => {
  if (interaction.isFromMe) return; // pare: sem comando, sem listeners
  return next();
};

const client = new Client();
client.use(ignoreBots).use(logger);
```

## Semântica {#semantics}

| Comportamento | Regra |
| --- | --- |
| Ordem | Ordem de registro, o mais externo primeiro. `use(a).use(b)` → `a` envolve `b` envolve dispatch. |
| Continuar | Chame `next()` exatamente uma vez. |
| Parar | Não chame `next()` — comandos e listeners nunca veem a interação. |
| Assíncrono | Aguardar `next()` é como você roda código depois da cadeia (estilo Koa). |
| Duplo `next()` | Rejeitado: `next() called multiple times in the same middleware.` — aparece pelo evento `error` com o contexto `middleware`. |
| Erro lançado | Aborta a cadeia; é reportado por `error` com o contexto `middleware`. Os middlewares seguintes, o comando e os listeners não rodam. |
| Valor de retorno | Ignorado; o tipo permite `void` para filtros simples. Exceção: um `next()` destacado (fire-and-forget — chamado sem `await` e sem nenhum handler seu anexado) deixa de ser ignorado: o compose adota a promise não tratada, o dispatch rejeita e a falha é reportada com o contexto `middleware`. Um `.catch` que você anexa sozinho é dono do resultado e pode engoli-lo. |

### Posição no pipeline de dispatch {#dispatch-pipeline-position}

```mermaid
flowchart LR
    E[Evento do backend] --> F[InteractionFactory]
    F --> R[runMiddlewareChain]
    R -->|todas as chamadas de next()| D[command.execute se correspondente e permitido]
    D --> L[listeners de interactionCreate]
    R -->|qualquer middleware para| X[interação descartada]
```

Os middlewares veem **todo** tipo de interação — mensagens, comandos, reações, eventos de grupo — não apenas mensagens.

## Padrões {#patterns}

### Rate limiting (por chat + autor) {#rate-limiting-per-chat-author}

```ts
import { type Middleware, Client } from "libwa.js";

const lastSeen = new Map<string, number>();
const WINDOW_MS = 2_000;

const rateLimit: Middleware = (interaction, next) => {
  const key = `${interaction.chat.id}:${interaction.author?.id ?? "?"}`;
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < WINDOW_MS) return; // descartar
  lastSeen.set(key, now);
  return next();
};

new Client().use(rateLimit);
```

### Listas de permitidos/bloqueados de chat {#chat-allow-deny-lists}

```ts
const IGNORED = new Set(["status@broadcast"]);

const ignoreChats: Middleware = (interaction, next) =>
  IGNORED.has(interaction.chat.id) ? undefined : next();
```

### Bot apenas para grupos {#group-only-bot}

```ts
const groupsOnly: Middleware = (interaction, next) =>
  interaction.isFromGroup() ? next() : undefined;
```

### Guard de comando com resposta {#command-guard-with-reply}

```ts
const adminOnly: Middleware = async (interaction, next) => {
  if (
    interaction.isCommand() &&
    ["ban", "kick"].includes(interaction.name) &&
    !isAdmin(interaction.author)
  ) {
    await interaction.reply("Admins only.");
    return; // o comando nunca executa
  }
  await next();
};
```

### Tempos e contexto de erro {#timings-error-context}

```ts
const timed: Middleware = async (interaction, next) => {
  try {
    await next();
  } catch (error) {
    console.error("chain failed for", interaction.id, error);
    throw error; // relançar → ainda reportado com o contexto "middleware"
  }
};
```

## Armadilhas {#pitfalls}

- **O middleware roda antes da aplicação de `groupOnly`/`dmOnly`.** Um `next()` pulado esconde *tudo*, incluindo `interactionCreate` — use-o para filtros rígidos; use guards de comando para escopo.
- **Não segure locks durante `await next()`.** Outros eventos podem ser despachados concorrentemente enquanto sua cadeia está parada.
- **O registro é mais ou menos estático.** `use()` acrescenta; não existe `removeUse`. Mantenha um array e compose:

  ```ts
  const chain: Middleware[] = [rateLimit, logging];
  if (isDev) chain.push(debug);
  for (const mw of chain) client.use(mw);
  ```

- **Erros em middleware pulam o comando, mas não o evento `error`** — sempre escute `error`.

## Testando um middleware {#testing-a-middleware}

Middleware é uma função pura de `(interaction, next)` — teste-a diretamente como unidade:

```ts
import { expect, it, vi } from "vitest";
import { runMiddlewareChain } from "../src/middleware/compose.js"; // caminho interno (testes do repositório)

it("stops when next is not called", async () => {
  const final = vi.fn();
  await runMiddlewareChain([() => undefined], fakeInteraction, final);
  expect(final).not.toHaveBeenCalled();
});
```

Testes no nível da aplicação podem, em vez disso, usar um `MockBackend` e emitir eventos através do seu próprio backend de teste — veja [Testes](/pt-BR/development/testing).

## Relacionados {#related}

- [Referência de middleware](/pt-BR/reference/middleware) — tipo `Middleware`, detalhes internos de `runMiddlewareChain`
- [Guia de comandos](/pt-BR/guide/commands) — o que roda depois da cadeia
- [Client.use](/pt-BR/reference/client#use) — método de registro
