# Guard da API pública {#public-api-guard}

"Nenhuma dependência de implementação na API pública" é **imposta mecanicamente**, não uma regra de revisão. `npm run check:exports` falha o build no momento em que o Baileys — ou o driver SQLite embarcado — se torna alcançável a partir de `dist/index.d.ts`.

```bash
npm run build && npm run check:exports
# check:exports: ok — 42 arquivos de declaration alcançáveis a partir de dist/index.d.ts,
# sem tokens de dependência de implementação na superfície pública de tipos.
```

## As três camadas de defesa {#the-three-layers-of-defense}

```mermaid
flowchart TD
    L1["1. Disciplina de import<br/>provedor somente em src/backend/baileys/<br/>driver somente em src/auth (require lazy)"] --> L2
    L2["2. Mapa de exports do pacote<br/>somente '.' e './package.json'"] --> L3
    L3["3. check:exports<br/>percorre o grafo alcançável de d.ts a partir de dist/index.d.ts"] --> OK["superfície limpa"]
    L3 -->|"token de provedor encontrado"| FAIL["exit 1 + relatório"]
```

### 1. Disciplina do código-fonte {#_1-source-discipline}

Por convenção (e revisão), os imports do provedor vivem exclusivamente em `src/backend/baileys/`. `createDefaultBackend.ts` é o único arquivo do core que nomeia a factory do provedor, e o faz de forma lazy pela própria entrada do adaptador. O driver SQLite é a segunda dependência permitida fora desse diretório — `src/auth/sqliteDriver.ts` o carrega com `createRequire` apenas no momento da construção, e nenhuma declaration alcançável a partir de `dist/index.d.ts` pode mencioná-lo.

### 2. Mapa de exports {#_2-exports-map}

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "require": "./dist/index.js",
    "default": "./dist/index.js"
  },
  "./package.json": "./package.json"
}
```

Sem subcaminhos `./dist/…` → resolvers conscientes de exports (bundler/node16) rejeitam deep imports de imediato, enquanto o legado `moduleResolution: "node"` ainda consegue alcançar `dist/` no disco — deep imports em declarações internas (que *podem* referenciar tipos de provedor — tudo bem, elas são inalcançáveis) não são suportados, não fisicamente impossíveis.

### 3. O script (`scripts/check-exports.mjs`, 204 linhas) {#_3-the-script-scripts-check-exports-mjs-204-lines}

Roda **depois do build**; sai com código diferente de zero e um relatório de violação.

**Tokens proibidos:**

```
@whiskeysockets/baileys · WAMessage · WASocket · IWebMessageInfo · makeWASocket · proto. · better-sqlite3
```

**Checagens, nesta ordem:**

| # | Checagem | Falha quando |
| --- | --- | --- |
| 1 | `dist/index.d.ts` existe | build não executado |
| 2 | chaves do mapa de exports | qualquer chave além de `.` / `./package.json`; ponteiro `types` errado |
| 3 | percurso de alcançabilidade | import relativo em um `.d.ts` alcançável não consegue ser resolvido (declaration ausente) |
| 4 | varredura do `index.d.ts` | **qualquer** token proibido em qualquer lugar da declaration raiz |
| 5 | arquivos alcançáveis: import de dependência | o texto do arquivo contém `@whiskeysockets/baileys` ou `better-sqlite3` (força os consumidores a resolverem as declarations do provedor/driver) |
| 6 | arquivos alcançáveis: linhas de export | uma linha/bloco `export …` menciona o nome de um tipo proibido |

Como o percurso funciona:

1. analisa especificadores relativos (`from "./x.js"` / `import("./x.js")`);
2. mapeia especificadores `.js` emitidos de volta para candidatos `.d.ts`;
3. BFS a partir de `dist/index.d.ts`, visitando cada arquivo uma vez;
4. aplica as checagens 4–6 em cada arquivo visitado.

**Permitido por design:** arquivos `.d.ts` internos *inalcançáveis* podem referenciar Baileys — o mapa de exports mantém os consumidores longe deles. (O grafo alcançável tem ~42 arquivos; ele inclui `dist/backend/baileys/index.d.ts` e `dist/backend/baileys/BaileysBackend.d.ts` — re-exportados via `createBaileysBackend` — mas passam porque as declarations *emitidas* expõem apenas `browser`/`syncFullHistory`, sem tokens de provedor.)

## Demonstração: um vazamento falha o build {#demonstration-a-leak-fails-the-build}

Injete um tipo de provedor na superfície (ex.: `export type { WASocket } from "./backend/baileys/index.js";` em `src/index.ts`), refaça o build e:

```bash
npm run build && npm run check:exports
# check:exports: 2 violação(ões):
#   - dist/index.d.ts menciona "WASocket" — detalhes do provedor vazaram para a API pública.
#   - dist/backend/baileys/index.d.ts importa o módulo do provedor — …
```

Código de saída 1 → `npm run verify` falha. Remova o export e o guard fica verde de novo. (Isto foi testado contra o repositório real — vazamento dentro, vermelho; vazamento fora, verde.)

## O que ele NÃO verifica {#what-it-does-not-check}

| Fora de escopo | Por quê |
| --- | --- |
| comportamento em runtime | preocupação só de tipos; `dist/index.js` pode importar o adaptador (precisa, para criar o backend padrão) |
| valores de runtime não exportados | a alcançabilidade em `.d.ts` é o contrato que os consumidores veem |
| texto dos exemplos de JSDoc | tokens em comentários são tolerados (eles não forçam a resolução de tipo) |

## Veja também {#see-also}

- [Design decisions #15](/pt-BR/architecture/design-decisions#_15-leaks-are-a-build-failure) — por quê
- [Workflow](/pt-BR/development/workflow) — ordem do `verify`
- [Backend contract](/pt-BR/architecture/backend-contract#enforced-boundaries) — resumo dos limites
