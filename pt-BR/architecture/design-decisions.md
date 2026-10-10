# Decisões de design {#design-decisions}

Notas no estilo ADR sobre por que o libwa.js é do jeito que é. Cada entrada: **contexto → decisão → consequência**.

## 1. Interações em vez de mensagens brutas {#_1-interactions-over-raw-messages}

**Contexto.** O grafo `WAMessage` do Baileys (wrappers, `contextInfo`, tipos de stub, mensagens de protocolo) é uma API hostil para a aplicação. Autores de bot querem "chegou uma mensagem" como um único objeto.

**Decisão.** Tudo que os handlers tocam é uma `Interaction` construída por uma única factory. Payloads brutos do provedor nunca aparecem em nenhum tipo público.

**Consequência.** O mapper é o código de maior valor e mais testado (fixtures por tipo de conteúdo, wrapper, stub). Novos provedores custam um novo mapper, não novo código de aplicação.

## 2. Type guards + hierarquia de classes em vez de cadeias de instanceof {#_2-type-guards-class-hierarchy-instead-of-instanceof-chains}

**Contexto.** Imports circulares em ESM tornam `instanceof` frágil no grafo de interações; consumidores devem descobrir variantes fluentemente.

**Decisão.** Um discriminador `InteractionType` sustenta todo guard (`isMessage()`, `isCommand()`, …), enquanto a hierarquia de classes (`CommandInteraction extends MessageInteraction`) torna os guards *sound*: `isMessage()` é verdadeiro para comandos, e os guards estreitam `this` exatamente como uma checagem de discriminante.

**Consequência.** `i.isCommand()` depois de `i.isMessage()` compõe sem casts; `instanceof` ainda funciona, mas nada depende dele.

## 3. Provedor atrás de uma interface, com capacidades *opcionais* {#_3-provider-behind-an-interface-with-optional-capabilities}

**Contexto.** Provedores diferem (reações, códigos de pareamento, edições). Uma interface totalmente obrigatória mentiria; tudo opcional prejudicaria a DX.

**Decisão.** Ciclo de vida + send/download/metadados + eventos são obrigatórios. Todo o resto é opcional em `WhatsAppBackend`; o núcleo verifica antes de chamar e lança `UnsupportedOperationError` nomeando o id do backend.

**Consequência.** Descoberta via `if (backend.react)`, erros honestos e um contrato pequeno o suficiente para ser reimplementado em ~200 linhas (veja `MockBackend`).

## 4. União de conteúdo normalizada com campos `T | undefined` {#_4-normalized-content-union-with-t-undefined-fields}

**Contexto.** Mensagens do provedor carregam dezenas de campos meio presentes; handlers querem formatos estáveis.

**Decisão.** Uma única união discriminada [`MessageContent`](/pt-BR/reference/content). Campos opcionais são escritos como `field: T | undefined` (explícito, não `?`) e as legendas têm padrão `""` — então `content.caption` nunca lança erro sob `exactOptionalPropertyTypes`.

**Consequência.** Um `switch (content.kind)` exaustivo compila; payloads desconhecidos viram `kind: "unknown"` em vez de desaparecer.

## 5. Client é dono da reconexão, backend é dono do mapeamento de motivos {#_5-client-owns-reconnection-backend-owns-reason-mapping}

**Contexto.** Loops de retry dentro dos provedores duplicam a política; os códigos de fechamento são específicos de cada provedor.

**Decisão.** Backends emitem `close` + `DisconnectReason` mapeado (+ detail). O client roda o backoff, a contagem de tentativas e o conjunto de motivos fatais. `destroy()` é terminal; a reconexão reutiliza a mesma instância de backend.

**Consequência.** Um único lugar para testar a política (timers falsos; caminhos de esgotamento/fatal/desativado); os backends continuam bobos sobre retry.

## 6. Blobs de sessão opacos, persistência coalescida {#_6-opaque-session-blobs-coalesced-persistence}

**Contexto.** O estado de autenticação (creds + signal keys) é de propriedade do provedor; as atualizações do Baileys chegam em rajadas.

**Decisão.** `Session { id, provider, data }` é opaco para o núcleo. O Baileys serializa `{ v, creds, keys }` via `BufferJSON`, reviva as chaves de app-state na leitura e coalesce as escritas (flag + cadeia de promises) para que N atualizações de chave → 1 escrita no store; `flush()` drena no disconnect. Provedor incompatível → aviso + creds novas; versão corrompida → `ValidationError`.

**Consequência.** Apps plugam stores Redis/SQL sem entender de auth; stores de arquivo/memória compartilham a mesma história de escrita atômica.

## 7. Sync de histórico desligado por padrão {#_7-history-sync-off-by-default}

**Contexto.** O sync completo de histórico é caro e majoritariamente indesejado; rebobinar mensagens antigas quebra a semântica de "mensagem recebida".

**Decisão.** `syncFullHistory: false`, `shouldSyncHistoryMessage: () => false`, `emitOwnEvents: false`; o backend faz dispatch somente de `messages.upsert` com `type === "notify"`.

**Consequência.** Bots respondem a tráfego ao vivo; sem dilúvio no primeiro login. A porta continua aberta para histórico opt-in depois.

## 8. Reconectar *a mesma* instância de backend {#_8-reconnect-the-same-backend-instance}

**Decisão.** `connect()` pode ser chamado de novo no mesmo backend; os backends derrubam seu socket anterior na reentrada (contador de geração + flags de supressão protegem eventos tardios de um socket morto).

**Consequência.** Nenhum bug de reinstantiação de backend no meio da reconexão; eventos obsoletos do provedor nunca podem fazer dispatch para dentro do client.

## 9. Eventos tipados com uma restrição estrutural {#_9-typed-events-with-a-structural-constraint}

**Contexto.** O `EventEmitter` do Node não é tipado; interfaces não têm index signatures (então restrições `Record<string, …>` rejeitam `ClientEvents`).

**Decisão.** `TypedEventEmitter<Map>` com `EventMapConstraint<Map> = Record<keyof Map, readonly unknown[]>`, listeners tipados `(...args: Map[Key]) => void | Promise<void>`, falhas assíncronas de listener roteadas para um hook `onListenerError`. `listenersOf()` alimenta o dispatch ordenado.

**Consequência.** `client.on("reconnecting", (attempt, delayMs) => …)` infere tudo; um listener que lança erro degrada para um evento `error`, nunca um crash.

## 10. Erros: uma raiz, disciplina de wrapping {#_10-errors-one-root-wrapping-discipline}

**Decisão.** Tudo estende `WhatsAppError` (`.code`, `.cause`). Serviços envolvem falhas desconhecidas via `rethrowAsBackendError` (WhatsAppErrors passam direto; erros do provedor viram `BackendError`). O evento `error` nunca reentra em si mesmo.

**Consequência.** `catch (e) { if (e instanceof NotFoundError) … }` é estável entre provedores; eventos de error são seguros de deixar sem guard.

## 11. Entidades cacheiam identidade, usuários não {#_11-entities-cache-identity-users-don-t}

**Decisão.** O `EntityFactory` cacheia chats/grupos (e metadados de grupo) por id para que `interaction.chat === interaction.message.chat` e o estado do grupo se acumule — eventos de participação e atualização corrigem o grupo em cache diretamente, mantendo-o atual entre os fetches; `User` é um objeto de valor recriado a cada evento. Os caches são **limitados** (LRU: 512 chats, 512 entradas de metadados de grupo, 4096 pares de id, 4096 nomes de exibição), então a evicção pode devolver uma instância nova — a garantia de identidade estável vale abaixo dos limites, não além deles.

**Consequência.** Referências estáveis para comparações de identidade sem um mapa de identidade global que nunca evicione — e sem crescimento ilimitado de memória em processos de vida longa.

## 12. Ordem de dispatch: middleware, comando, listeners {#_12-dispatch-order-middleware-command-listeners}

**Decisão.** Middlewares gateiam tudo (pular `next()` = silêncio); um comando correspondente executa primeiro, depois os listeners de `interactionCreate`. `groupOnly`/`dmOnly` são aplicados aqui, então um comando pulado ainda notifica os listeners.

**Consequência.** Middleware de limite de taxa/filtro cobre comandos *e* mensagens comuns; os listeners sempre observam o que aconteceu.

## 13. Mídia como bytes + downloads lazy {#_13-media-as-bytes-lazy-downloads}

**Decisão.** Mídia de saída é `Uint8Array` (+ mimetype opcional); anexos de entrada expõem `download(): Promise<Uint8Array>` respaldado pelo cache de mensagem bruta do backend (mensagens citadas também são cacheadas sinteticamente).

**Consequência.** Nenhum acoplamento a sistema de arquivos nem handles de provedor na API; testes injetam bytes diretamente.

## 14. Botões/listas legados mapeiam para interações dedicadas {#_14-legacy-buttons-lists-map-to-dedicated-interactions}

**Decisão.** `buttonsResponseMessage` / `templateButtonReplyMessage` / `nativeFlowResponseMessage` → `ButtonInteraction` (id do botão vem de `paramsJson.id`, com fallback para o nome do fluxo; título do prompt recuperado da mensagem citada); `listResponseMessage` → `ListInteraction`.

**Consequência.** Três formatos de provedor, um guard para cada (`isButton()` / `isList()`), campos estáveis para os handlers.

## 15. Vazamentos são falha de build {#_15-leaks-are-a-build-failure}

**Decisão.** O Baileys só pode ser importado sob `src/backend/baileys/`; `npm run check:exports` percorre o grafo alcançável de `dist/index.d.ts` e falha em tokens de provedor. O `exports` do pacote expõe somente a entrada raiz.

**Consequência.** "Nenhum tipo de provedor na API pública" é garantido mecanicamente, não por revisão.

## 16. Escolhas de higiene do repositório {#_16-repo-hygiene-choices}

- **`noExplicitAny` / `noNonNullAssertion` como erros de lint** — os casts devem ser intencionais (`as unknown as …` nos testes e dentro dos snapshot casts do `TypedEventEmitter`).
- **`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`** — opcionais públicos são escritos como `field: T | undefined`.
- **Biome em vez de ESLint+Prettier** — uma ferramenta rápida; formatação com 2 espaços como autoridade.
- **tsconfig dividido** — a config base faz typecheck de `src` + `tests` + `examples` (sem emit); `tsconfig.build.json` adiciona `rootDir: src`, declarations e sourcemaps para `dist/`.
- **Examples importam `"libwa.js"`** (mapeado por paths para `src/index.ts`) para que comp exatamente como código de consumidor; testes importam `src/…` para alcançar internals.

## Veja também {#see-also}

- [Visão geral da arquitetura](/pt-BR/architecture/overview)
- [Desenvolvimento → convenções](/pt-BR/development/conventions) — como isso é garantido no dia a dia
- [Guard da API pública](/pt-BR/development/public-api-guard) — a decisão 15 na prática
