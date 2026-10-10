# Registro de alterações {#changelog}

Todas as mudanças notáveis no pacote **libwa.js** (este site documenta `libwa.js`, não o repositório de docs). As versões seguem [Versionamento Semântico](https://semver.org): bumps menores podem conter mudanças incompatíveis enquanto a versão principal for `0` — cada entrada as detalha.

## 0.4.0 (2026-10-07) {#_0-4-0-2026-10-07}

Trabalho na branch principal do `libwa.js` desde a 0.3.0, agora publicado.

### Added {#added}

- **`SqliteSessionStore`** — o store para rodar um bot em produção. Um único arquivo de banco SQLite guarda todos os slots de sessão, então as credenciais sobrevivem a reinícios, vários processos do bot podem compartilhar um deployment e mover o bot significa copiar um arquivo em vez de uma árvore de diretórios.
  - Journal WAL + `synchronous = FULL` para segurança contra crashes, `busy_timeout` (padrão 5000 ms) para que um segundo escritor bloqueie em vez de falhar com `SQLITE_BUSY`, e um upsert transacional `INSERT … ON CONFLICT` por save.
  - Versão do schema em `PRAGMA user_version`: um banco gravado por uma libwa.js mais nova é recusado em vez de ser aberto com um schema que esta build não entende.
  - Ids validados exatamente como no `FileSessionStore`; uma linha com os tipos de coluna errados → `ERR_SESSION_CORRUPT`; toda falha após `close()` → `ERR_SESSION_STORE`.
  - Apoiado por `better-sqlite3` (uma dependência normal), carregado de forma lazy através de `createRequire` — `import "libwa.js"` nunca toca no binding nativo. Uma instalação feita com `--ignore-scripts` falha com um `ERR_SESSION_STORE` acionável, não com um crash de carregamento.
  - Opções: `filename` (padrão `libwa.js-sessions.db`, suporte a URIs `":memory:"` e `file:`, diretórios pai criados) e `busyTimeoutMs`.
- **`SessionStore.close?()`** — um hook opcional de encerramento no contrato do store. A libwa.js nunca o chama: quem criou o store é dono do handle e chama `close()` no shutdown, e toda operação em um `SqliteSessionStore` fechado rejeita com `ERR_SESSION_STORE` em vez de reabrir o arquivo por trás das suas costas.
- **`Client.isSelf(id)`** — verificação síncrona "esta é a conta do bot?", que responde sob qualquer esquema de id (pares registrados incluídos).
- **`Interaction.reply(content, options?)` e `Message.reply(content, options?)`** — respostas cientes de interação que citam a mensagem sendo respondida, com a precedência de `replyToMessageId` / `quote` detalhada.
- **`ERR_SESSION_UNREADABLE`** — um arquivo de sessão que existe mas não pode ser lido (permissões, I/O) agora levanta `ValidationError` com este código e a causa original, em vez de parecer "sem sessão".
- **Script `prepare`** — `npm install` a partir de um checkout de git agora executa `npm run build`, de modo que um checkout fica utilizável sem uma etapa manual de build.
- **Workflow de CI** — `.github/workflows/ci.yml`: Node 20, `npm ci`, `npm run verify`, em pushes para `main` e em pull requests.

### Changed {#changed}

- **Breaking:** engines elevadas de `>=18.17` para `>=20.0.0` — o provedor Baileys incluso declara o mesmo piso.
- **`npm run build` limpa `dist/` primeiro** via `scripts/clean-dist.mjs` (`node scripts/clean-dist.mjs && tsc -p tsconfig.build.json`), para que arquivos renomeados ou removidos não sobrevivam como output obsoleto.
- **`@whiskeysockets/baileys` fixado em `7.0.0-rc14`** em vez de um range com caret, para que um prerelease flutuante não possa derivar por baixo de uma versão publicada.
- **Ordenação determinística de listeners** — listeners fazem dispatch na ordem de registro sobre um snapshot, com listeners `once` consumidos antes do dispatch, de forma que emissões reentrantes não podem reordenar handlers.
- **Validação de registro de comando pela definição inteira** — `commands.register()` valida o nome, os aliases e todo conflito antes de confirmar qualquer coisa, de modo que um registro rejeitado deixa o registro exatamente como estava; `parse()` agora escolhe o prefixo **mais longo** que casa (a ordem do array só desempata).
- **Proteção contra corrida em `login()` e `logout()`** — uma trava `connecting` faz chamadas concorrentes de `login()` compartilharem uma única tentativa, uma trava `loggingOut` impede que um logout que disputou com uma desconexão acabe reconectando, um timer de reconexão pendente é cancelado quando um login se concretiza, e o backend é construído uma vez por conexão em vez de uma vez por tentativa.
- **Guard de socket obsoleto no backend Baileys** — cada `makeWASocket()` incrementa uma geração de conexão e todo handler, caminho de desconexão e timeout de handshake desiste quando pertence a uma geração obsoleta, de forma que uma reconexão disputada por uma desconexão não consegue mais ressuscitar um socket morto.
- **Requisições de código de pareamento não são mais one-shot** por arquivo de sessão: `needs-pairing` consulta as credenciais em vez de uma flag travada, uma requisição com falha rearma a próxima tentativa e respostas que uma tentativa mais nova superou são descartadas.
- **Conteúdo em string resolve menções** — `send(chat, "@1234…", { mentions })` agora marca o alvo da mesma forma que um payload em objeto.
- **Caches de entidade limitados** — `EntityFactory` limita chats (LRU 512), metadados de grupo (512), pares de id (4096) e nomes de exibição (4096) em vez de crescer sem limite; `logout()` e `destroy()` os reiniciam para que a próxima conta nunca responda a partir da anterior.
- **`GroupUpdateInteraction.changes` é um diff de verdade** — listas `added`, `removed` e só-de-papéis calculadas a partir dos conjuntos de participantes antes/depois, com um campo limpo chegando como `undefined` para que os consumidores distingam "limpo" de "intocado".
- **`FileSessionStore` mapeia apenas `ENOENT` para "sem sessão"** — um arquivo corrompido superficia `ERR_SESSION_CORRUPT` em vez de ser descartado silenciosamente, e os arquivos temporários são nomeados com `randomUUID()` para que dois stores em um mesmo processo nunca compartilhem um caminho.
- **`BaileysAuth.flush()` esvazia a cadeia de escrita** até ela realmente estar vazia, em vez de resolver no primeiro lote liquidado.
- **`requestPairingCode()` sem `auth.pairingPhoneNumber`** agora lança `UnsupportedOperationError` em vez de simplesmente não fazer nada em silêncio.

### Fixed {#fixed}

- **Middleware rejeitado aparece no evento `error`** — um `next()` destacado que rejeita é reportado (contexto `middleware`) em vez de escapar como uma rejeição não tratada.
- **`login()` concorrente não inicia mais conexões sobrepostas**, e um `logout()` que disputa com um `connect()` em andamento não deixa mais a promise de login pendurada para sempre.
- **`send(chat, "text", { mentions })` para de descartar menções.**
- **Eventos de atualização de grupo reportam diffs, não snapshots** — as listas de participantes não afirmam mais que membros inalterados foram adicionados ou removidos, e limpar uma descrição agora produz um evento `groupUpdate`.
- **O exemplo JSDoc de `UserService` compila**; chamadas condicionadas a capacidade lançam o `UnsupportedOperationError` documentado em vez de um erro cru.

## 0.3.0 (2026-10-01) {#_0-3-0-2026-10-01}

### Removed {#removed}

- **Breaking:** `GroupMember.tag` foi removido — provedores nunca entregaram rótulos de membro, então o campo era `undefined` em todo payload real. Use o `user.displayName` do membro (`name` → `phone` → `id`), ou leia os rótulos brutos do provedor em `GroupMetadata.participants[].name` / `username`:

  ```ts
  // antes (0.2.0)
  group.members.forEach((m) => console.log(m.tag ?? m.user.displayName, m.role));
  // depois (0.3.0)
  group.members.forEach((m) => console.log(m.user.displayName, m.role));
  ```

### Added {#added-1}

- **`client.groups.ensure(target)`** — resolve um grupo através do cache de metadados do cliente: quando uma busca desse grupo foi tentada nos últimos **60 segundos**, o `Group` em cache resolve sem I/O; caso contrário, uma única busca é executada (chamadas concorrentes para o mesmo grupo compartilham uma requisição em andamento). `interaction.member` continua `{ user, role }` — apenas o rótulo foi removido.
- **Eventos de membresia atualizam o cache.** Os eventos `add`/`remove`/`promote`/`demote` são aplicados aos metadados do grupo em cache antes de a interação ser construída — participantes, papéis e `memberCount` seguem o evento sem nova busca. Os patches são idempotentes, casam membros em ambos os esquemas de id (LID ↔ número de telefone via pares registrados) e nunca rebaixam um superadmin por um `promote` stray.

### Changed {#changed-1}

- **Metadados de grupo são buscados no máximo uma vez por grupo por minuto.** Toda interação de grupo — participante, atualização e família de mensagens em um grupo — resolve metadados através de `ensure()` em vez de fazer round-trip sempre que possível; os eventos atualizam o cache entre buscas, de modo que `interaction.group` ainda reflete o próprio evento enquanto a pressão de buscas permanece limitada (anti-ban). Espere dados de `group`/`member` com até 60 segundos de atraso em grupos quietos.
- **Falhas fazem backoff pela janela.** Uma atualização com falha marca o grupo pelo resto dos 60 segundos: os dispatches continuam servindo o último estado conhecido (registrando `[group refresh]`) em vez de tentar novamente a cada evento, e o próximo `ensure` após a janela tenta de novo.
- `fetch()` e `group.refresh()` não mudaram de contrato — sempre um round-trip ao provedor — e agora reiniciam explicitamente a janela de 60 segundos.

## 0.2.0 (2026-09-29) {#_0-2-0-2026-09-29}

### Added {#added-2}

- **Membros com escopo de grupo.** Toda interação expõe `member` — o `GroupMember { user, role, tag }` do autor dentro de `group` (`undefined` fora de grupos, para eventos sem autor, ou enquanto os metadados do grupo são desconhecidos). `Group.member(id | user)` busca uma conta em ambos os esquemas de id, e os metadados do grupo agora carregam os `username`s dos participantes (alimentando o `tag`).
- **Enriquecimento de perfil em `client.users`**, cada um atrás da própria capacidade opcional de backend:
  - `pictureUrl(id, type?)` — URL da foto de perfil (`"image"` padrão / `"preview"`); ausente ou oculta por privacidade → `undefined` (`getProfilePictureUrl`);
  - `about(id)` — texto sobre/bio; não definido ou oculto → `undefined` (`getAbout`);
  - `accountType(id)` — `"standard" | "business"` ao sondar o perfil comercial (`getBusinessProfile`).
  Novos exports: `GroupMember`, `AccountType`, `ProfilePictureType`, `BackendBusinessProfile`.
- **Pares de id LID ↔ telefone** capturados das chaves de mensagem, chaves de reação/atualização, eventos de membresia e metadados de grupo (`idPairs`, `GroupParticipant.altId`), para que ids vinculados resolvam em qualquer esquema.
- **Serviço de identidade `client.users`** — `phone(id)` / `altId(id)` (síncrono, a partir dos pares registrados), `resolvePhone(id)` / `resolveLid(id)` (recorrem às capacidades opcionais `getPhoneNumberForLid` / `getLidForPhoneNumber`), e `fetch(id)` — existência da conta + nome em qualquer esquema de id (capacidade `fetchUser`; lids resolvem primeiro pelos pares registrados).
- **Memória de nome de exibição.** Todo push name (e nome de consulta fornecido pelo provedor) é armazenado em ambos os esquemas de id, para que payloads posteriores apenas com id — menções, reações, membros de grupo, resultados de busca — ainda respondam com `user.name`.
- **Ids de grupo puros.** `client.groups.*` aceitam o número puro (`"120363012345678901"`) e anexam `@g.us`.
- **`interaction.group` em toda interação** com estreitamento via `isFromGroup()`, além do atalho `interaction.user` (participante afetado) em eventos de participante de grupo.

### Changed {#changed-2}

- **Breaking:** `Group.members` agora retorna `readonly GroupMember[]` (era `readonly User[]`). Use `member.user` para a entidade de nível de conta, `member.role` / `member.tag` para dados com escopo de grupo:

  ```ts
  // antes
  group.members.forEach((m) => console.log(m.displayName, m.id));
  // depois
  group.members.forEach((m) => console.log(m.tag ?? m.user.displayName, m.user.id, m.role));
  ```
- Metadados do grupo são atualizados antes das interações de participante/atualização, e buscados **uma vez por grupo** (em cache depois) antes dos dispatches da família de mensagens do grupo para que `interaction.member` possa responder; atualizações com falha registram um warning e fazem dispatch com o estado em cache em vez de descartar o evento.

### Fixed {#fixed-1}

- O mapper agora superficia o conteúdo que viaja junto com a distribuição de sender-key — a primeira mensagem em um grupo (que carrega a distribuição junto com seu texto) não chega mais vazia.
- Mudanças de atualização de grupo (name/description/announceOnly/locked) são aplicadas aos metadados do grupo em cache antes de a interação ser construída.

## 0.1.0 (2026-09-27) {#_0-1-0-2026-09-27}

Linha de base inicial — a biblioteca como publicada pela primeira vez:

- Core orientado a interações: hierarquia de interações tipada com guards no estilo `isMessage()` / `isCommand()` / `isReaction()`, `InteractionFactory`, pipeline de middleware, registro de comandos (prefixos, aliases, args, `groupOnly` / `dmOnly`), eventos tipados e uma hierarquia estável de `WhatsAppError`.
- Entidades: `Chat` / `Group` / `Message` / `User` com identidade de chat em cache, downloads de mídia lazy (`Uint8Array` + `download()`) e ações de entidade delegadas a serviços.
- Serviços: `client.messages` (enviar/react/editar/deletar com validação de payload), `client.groups` (metadados, participantes, rename/descrição).
- Contrato de backend plugável (`WhatsAppBackend`) com capacidades opcionais honestas e eventos normalizados; adaptador Baileys incluso (auth em `SessionStore`, mapper, mapeamento de motivos de desconexão).
- Sessões (`FileSessionStore` / `MemorySessionStore`), reconexão de propriedade do cliente com backoff exponencial, login por código de pareamento, guard de vazamento da API pública (`check:exports`), docs e exemplos com typecheck.
