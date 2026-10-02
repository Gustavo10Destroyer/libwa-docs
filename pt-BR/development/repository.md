# Repositório {#repository}

Layout do repositório da biblioteca `libwa` — onde tudo fica e por quê.

```
libwa/
├── src/                 código-fonte da biblioteca (ESM, TypeScript)
│   ├── index.ts         ← o ÚNICO entry público (package exports ".")
│   ├── Client.ts        raiz de composição, ciclo de vida, dispatch
│   ├── ClientOptions.ts resolução + validação de opções
│   ├── events/          ClientEvents + TypedEventEmitter
│   ├── interactions/    9 classes de interação + factory
│   ├── entities/        Chat/Group/Message/User + EntityFactory
│   ├── commands/        CommandRegistry + CommandDefinition
│   ├── messaging/       MessageService + normalização de payload
│   ├── groups/          GroupService
│   ├── middleware/      compose.ts (executor da cadeia)
│   ├── auth/            contrato SessionStore + stores arquivo/memória
│   ├── backend/         contrato (Backend.ts, events.ts), createDefaultBackend
│   │   └── baileys/     ← ÚNICO dir autorizado a importar o provedor
│   ├── errors/          hierarquia WhatsAppError
│   ├── logging/         contrato Logger + loggers console/null
│   └── core/            ids, content union, DisconnectReason, LruMap, sequence
├── tests/               suites do vitest + helpers (MockBackend, fixtures)
├── examples/            exemplos com typecheck no estilo de consumidor ("libwa" import)
├── scripts/
│   ├── check-exports.mjs   guard de vazamento da API pública (roda no `verify`)
│   └── clean-dist.mjs      apaga `dist/` antes de cada build
├── docs/                notas de arquitetura e decisões de design no repositório
├── dist/                saída do build (tsc: js + d.ts + maps)
├── package.json         scripts, exports, engines
├── tsconfig.json        config de typecheck (src + tests + examples)
├── tsconfig.build.json  config de emit (src → dist, declarations)
├── vitest.config.ts     config de testes + exclusões de cobertura
└── biome.json           formatter + linter (2 espaços, sem any)
```

## Fatos-chave {#key-facts}

| Item | Valor |
| --- | --- |
| nome do pacote | `libwa` (v0.3.0, MIT, ESM, Node ≥ 20.0.0) |
| dependência de runtime | apenas `@whiskeysockets/baileys` |
| superfície pública | `exports`: `.` → `dist/index.d.ts` + `dist/index.js` (declarado sob `types`, `import`, `require` e `default`), além de `./package.json` |
| arquivos publicados | `dist`, `docs`, `LICENSE` (README incluído automaticamente) |
| executor de testes | vitest (`tests/**/*.test.ts`, ambiente node) |
| linter/formatter | biome |
| build | `node scripts/clean-dist.mjs && tsc -p tsconfig.build.json` (limpa `dist/`, depois declarations + sourcemaps) |
| estilo de import | testes → caminhos `src/…`; exemplos → `"libwa"` (tsconfig paths → `src/index.ts`) |

## Inventário do código-fonte {#source-inventory}

7,665 linhas de `src` em 48 arquivos TypeScript, agrupadas por camada:

| Área | Arquivos | Papel |
| --- | --- | --- |
| client | 3 | ciclo de vida + opções + barrel `index.ts` |
| interactions | 11 | classes de evento + factory + `InteractionType` |
| entities | 5 | objetos de domínio + factory |
| backend | 9 | contrato (3) + adaptador Baileys (6, incl. barrel `index.ts`) |
| services | 7 | messaging (3), commands (2), groups (1), users (1) |
| infrastructure | 13 | auth (3), core (5), events (2), middleware (1), errors (1), logging (1) |

## Testes {#tests}

16 suites, **324 testes**, 6,003 linhas (5,609 de testes + 394 de helpers):

| Suite | Foco |
| --- | --- |
| `baileys-mapper.test.ts` (57) | mapeamento de payload do provedor → domínio (maior suite) |
| `client.test.ts` (36) | ciclo de vida, dispatch, ensure de metadados de grupo (TTL/dedupe/backoff), reconexão, login/destroy/logout |
| `users.test.ts` (30) | registro de pares de id em `client.users`, resolução, fetch, memória de nomes, enriquecimento de perfil |
| `interactions.test.ts` (25) | guards, factory, subclasses, `interaction.member` |
| `messaging.test.ts` (21) | caminhos de send/react/edit/delete |
| `commands.test.ts` (18) | registro + parsing |
| `groups.test.ts` (21) | operações do GroupService, cache do ensure, patches de membership + buscas em `Group.member` |
| `typed-event-emitter.test.ts` (11) | semântica do emitter |
| `baileys-auth.test.ts` (13) | estado de autenticação baseado em sessão |
| `payload.test.ts` (10) | validação de `normalizeReplyContent` |
| `session.test.ts` (15) | stores de arquivo/memória |
| `errors.test.ts` (8) | hierarquia + wrapping |
| `baileys-disconnect.test.ts` (8) | mapeamento de motivos |
| `middleware.test.ts` (9) | semântica da cadeia |
| `entities.test.ts` (18) | identidade, identidade do cache chat/metadata + evicção LRU limitada, memória de nomes |
| `baileys-backend.test.ts` (24) | ciclo de vida do adaptador, normalização de envio/evento, metadados de grupo + hook de cache, pareamento (provedor mockado) |

Helpers: `MockBackend` / `CapableMockBackend` (299 linhas — o contrato obrigatório mais toda capacidade opcional) e `fixtures.ts` (construtores de eventos do backend).

## Exemplos {#examples}

| Arquivo | Demonstra |
| --- | --- |
| `basic-bot.ts` | logger, comandos, listener de QR, ready, reply |
| `pairing-login.ts` | fluxo de código de pareamento com `WA_PHONE_NUMBER` |
| `middleware-filters.ts` | rate limit, deny-list de chat, boas-vindas de entrada em grupo, classes de erro, tratamento de `DisconnectReason` |

Todos importam `"libwa"` exatamente como código de consumidor e são cobertos pelo `npm run typecheck`.

## Comandos {#commands}

Veja [Workflow](/pt-BR/development/workflow) para a matriz completa de scripts — o importante:

```bash
npm run verify   # typecheck → test → lint → build → check:exports
```

## Veja também {#see-also}

- [Workflow](/pt-BR/development/workflow) — scripts em detalhe
- [Testing](/pt-BR/development/testing) — estratégia e helpers
- [Conventions](/pt-BR/development/conventions) — regras de estilo impostas pela configuração
- [Public API guard](/pt-BR/development/public-api-guard) — como os vazamentos são bloqueados
