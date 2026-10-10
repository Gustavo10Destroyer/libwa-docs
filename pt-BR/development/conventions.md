# Convenções {#conventions}

Regras impostas pela configuração — não pela revisão. Segui-las mantém o `verify` verde.

## TypeScript {#typescript}

A partir do `tsconfig.json` (todas ativadas):

| Flag | Efeito no estilo do código |
| --- | --- |
| `strict` | checagens de null, erros de any implícito |
| `exactOptionalPropertyTypes` | opcionais públicos escritos como `field: T \| undefined`, nunca `field?: T` com atribuição solta; **não passe `undefined` explícito** para props opcionais — omita-as |
| `noUncheckedIndexedAccess` | acesso a índice produz `T \| undefined` — faça guard antes de usar |
| `noImplicitOverride` | palavra-chave `override` obrigatória (`Group extends Chat`, mapas de evento) |
| `noFallthroughCasesInSwitch` | cases agrupados de switch devem ser intencionais |
| `noImplicitReturns` | todo caminho de código retorna |
| `verbatimModuleSyntax` + `isolatedModules` | `import type` para imports só de tipo; sem ambiguidade de `export type` |
| `module/moduleResolution: NodeNext` | ESM com extensões `.js` em imports relativos |

Adicionais:

- `paths: { "libwa.js": ["./src/index.ts"] }` — os exemplos importam o nome real do pacote;
- separação de emit: a config base só faz typecheck (sem emit); `tsconfig.build.json` adiciona `rootDir: src` + `declaration`/`declarationMap` + `sourceMap`/`inlineSources` para `dist/`.

## Biome (`biome.json`) {#biome-biome-json}

```json
{
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "organizeImports": { "enabled": true },
  "linter": {
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "noNonNullAssertion": "error" }
    }
  }
}
```

| Regra | Significado |
| --- | --- |
| 2 espaços, largura 100 | sem tabs, sem debate — `npm run format` corrige |
| organizar imports | a ordem de imports é gerenciada pela máquina |
| `noExplicitAny` (**error**) | `any` nunca deve aparecer; use `unknown` + narrowing |
| `noNonNullAssertion` (**error**) | sem `!` — verifique em vez disso |
| regras recomendadas | padrões de suspicious/style/correctness |

`as unknown as X` é reservado para fixtures de teste em que um literal com forma de provedor é intencionalmente convertido, além dos poucos casts internos em `TypedEventEmitter` (estreitamento de listener e o mapeamento do snapshot `listenersOf`).

## Regras de arquitetura {#architecture-rules}

| Regra | Aplicação |
| --- | --- |
| imports do provedor só em `src/backend/baileys/` | revisão + `check:exports` (a consequência falha o build) |
| sem exports profundos no pacote | `exports` do `package.json` expõe apenas `.` |
| services embrulham erros desconhecidos | `rethrowAsBackendError(op, e)` em todo ponto de chamada do backend |
| listeners nunca quebram | todos os caminhos de emit roteiam falhas para `onListenerError` / evento `error` |
| entidades delegam para services | `chat.send` → `client.messages.send`, nunca para um backend |
| padrões de opção vivem em um lugar só | `resolveClientOptions` (`DEFAULT_RECONNECT`, regras de prefixo) |
| validação de entrada antes da I/O do backend | `rename("")` gera erro antes da checagem de capacidade; operações de participantes checam a capacidade primeiro, depois a lista de usuários |

## Nomenclatura {#naming}

| Tipo | Convenção | Exemplos |
| --- | --- | --- |
| classes | substantivos em PascalCase | `Client`, `FileSessionStore`, `CommandInteraction` |
| interfaces/tipos | PascalCase; type guards `is*` | `ChatId`, `isFromGroup()` |
| eventos | lowerCamel, passado/estado | `ready`, `interactionCreate`, `reconnecting` |
| códigos de erro | `ERR_` + SCREAMING_SNAKE | `ERR_EMPTY_MESSAGE` |
| campos privados | `#name` (privado nativo) | `#backend`, `#handleError` |
| arquivos | correspondem ao export principal | `MessageService.ts`, `compose.ts` para utilitários |
| testes | `<subject>.test.ts` | `client.test.ts` |

## Disciplina de erros e eventos {#error-event-discipline}

- entrada do usuário → `ValidationError` com um `code` específico;
- falhas do provedor → `rethrowAsBackendError` (as strings de contexto começam com uma frase verbal: `Failed to send message`);
- falhas internas de dispatch → `#handleError(e, context)` (context = nome do estágio);
- nunca lançar exceção de: wrappers de listener (falhas roteiam para `onListenerError` / o evento `error`) e `destroy()` (relata, não lança); `logout()` engole falhas do backend, mas pode expor um `clear()` da store que rejeita; mantenha as implementações de `Logger` totais — a biblioteca não protege as chamadas de logger.

## Disciplina de documentação {#docs-discipline}

- todo símbolo público: JSDoc com pelo menos um resumo de uma linha;
- exemplos em `examples/` devem passar no typecheck (fazem parte do include do `tsconfig.json`);
- `README.md` / `docs/` atualizados quando o comportamento muda.

## Veja também {#see-also}

- [Workflow](/pt-BR/development/workflow) — comandos que impõem o acima
- [Public API guard](/pt-BR/development/public-api-guard) — a regra de vazamento
- [Design decisions #16](/pt-BR/architecture/design-decisions#_16-repo-hygiene-choices) — justificativa
