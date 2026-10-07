# Sessões {#sessions}

<ApiBadge kind="interface" /> Persistência de autenticação. O core trata os bytes da sessão como opacos — apenas o backend os interpreta. As stores são plugáveis: arquivo, SQLite, memória ou a sua própria (Redis, SQL, nuvem).

```ts
import { Client, FileSessionStore, SqliteSessionStore, MemorySessionStore, type SessionStore } from "libwa";

new Client({ sessionStore: new FileSessionStore({ directory: "/var/lib/bot" }) });
new Client({ sessionStore: new SqliteSessionStore({ filename: "var/bots.db" }) }); // produção
new Client({ sessionStore: new MemorySessionStore() }); // testes
```

## Session <ApiBadge kind="interface" /> {#session}

```ts
interface Session {
  readonly id: string;         // id do slot (ClientOptions.sessionId)
  readonly provider: string;   // backend que o produziu, ex.: "baileys"
  readonly data: Uint8Array;   // credenciais serializadas opacas
  readonly updatedAt: Date;    // última vez salvo
}
```

O core nunca analisa `data` — `provider` permite que uma store (ou ferramentas de migração) detecte reuso entre backends.

## SessionStore <ApiBadge kind="interface" /> {#sessionstore}

```ts
interface SessionStore {
  load(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(id: string): Promise<void>;
  close?(): Promise<void> | void; // opcional — libera locks/arquivos
}
```

| Método | Contrato |
| --- | --- |
| `load` | Retorna a sessão ou `null` quando nenhuma existe (ausente ≠ erro). |
| `save` | Persiste por `session.id`; deve ser seguro sob chamadas concorrentes para o mesmo id. |
| `clear` | Remove o slot; limpar um slot ausente **não** é um erro. |
| `close` | Opcional. Libera recursos do sistema operacional (descritores de arquivo, conexões de banco). libwa **nunca** o chama — quem criou a store é dono dele. |

Os backends chamam `load`/`save`/`clear` por meio de `ClientOptions.sessionStore`; `client.logout()` limpa o slot. O `close()` é de você chamar no encerramento (veja [Escolhendo uma store](#choosing-a-store)).

## FileSessionStore <ApiBadge kind="class" /> {#filesessionstore}

```ts
class FileSessionStore implements SessionStore {
  constructor(options?: FileSessionStoreOptions);
  get directory(): string;
  load(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(id: string): Promise<void>;
}
```

A store padrão. Um arquivo JSON por slot: `<directory>/<id>.json`.

```json
{ "provider": "baileys", "data": "<base64>", "updatedAt": "2026-09-25T12:00:00.000Z" }
```

### `FileSessionStoreOptions` <ApiBadge kind="interface" /> {#filesessionstoreoptions}

```ts
interface FileSessionStoreOptions {
  directory?: string; // padrão ".libwa"
}
```

### Garantias {#guarantees}

| Propriedade | Mecanismo |
| --- | --- |
| Escritas atômicas | escreve `<file>.<writerId>.tmp` → `rename()` (leitores nunca veem arquivos parciais; `writerId` = `randomUUID()` por instância da store, então duas stores em um mesmo processo nunca compartilham um arquivo temporário) |
| Serializado por slot | fila de promises interna por id (`#serialize`) — save/clear concorrentes em um id executam em ordem |
| Ids seguros | toda operação executa `assertSafeSessionId()` primeiro (veja abaixo) |
| Arquivo ausente | `load()` → `null` **apenas** para ENOENT; qualquer outro erro de leitura lança `ValidationError` `ERR_SESSION_UNREADABLE` (nunca engolido) |
| JSON corrompido | `load()` → `ValidationError` `ERR_SESSION_CORRUPT` (com `cause`) |

```ts
const store = new FileSessionStore({ directory: ".libwa" });
store.directory; // ".libwa"
await store.load("default");     // Session | null
await store.clear("default");    // semântica de rm -f, sem throw quando ausente
```

## SqliteSessionStore <ApiBadge kind="class" /> {#sqlitesessionstore}

```ts
class SqliteSessionStore implements SessionStore {
  constructor(options?: SqliteSessionStoreOptions);
  get filename(): string;
  get closed(): boolean;
  load(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(id: string): Promise<void>;
  close(): void;
}
```

A store de produção: **um único banco SQLite contendo todos os slots**. As credenciais sobrevivem a reinícios, vários processos de bot podem compartilhar um mesmo deploy, e mover o bot significa copiar um arquivo em vez de uma árvore de diretórios.

```ts
import { Client, SqliteSessionStore } from "libwa";

const store = new SqliteSessionStore({ filename: "/var/lib/bot/bot.db" });
const alice = new Client({ sessionStore: store, sessionId: "alice" });
const bob = new Client({ sessionStore: store, sessionId: "bob" });

await Promise.all([alice.login(), bob.login()]);
// … no encerramento:
await alice.destroy();
store.close();
```

### `SqliteSessionStoreOptions` <ApiBadge kind="interface" /> {#sqlitesessionstoreoptions}

```ts
interface SqliteSessionStoreOptions {
  filename?: string;      // padrão "libwa-sessions.db"; URIs ":memory:" e "file:…" também funcionam
  busyTimeoutMs?: number; // padrão 5000 — quanto tempo um escritor espera por um lock
}
```

Diretórios pai ausentes são criados sob demanda. `busyTimeoutMs` deve ser um inteiro não negativo; a espera acontece de forma síncrona no event loop, então trate-a como uma rede de segurança contra um lock perdido, e não como uma fila para ficar esperando.

### Garantias {#guarantees-1}

| Propriedade | Mecanismo |
| --- | --- |
| Segurança contra crashes | jornal WAL + `synchronous = FULL` — a última gravação de credencial sobrevive a uma queda de energia; leitores continuam funcionando enquanto um escritor confirma |
| Processos concorrentes | `busy_timeout = busyTimeoutMs` — um segundo bot ou uma ferramenta de migração bloqueia em vez de falhar com `SQLITE_BUSY` |
| Serializado por slot | uma única instrução `INSERT … ON CONFLICT(id) DO UPDATE` — sem corrida de ler-modificar-escrever |
| Ids seguros | toda operação executa `assertSafeSessionId()` primeiro (veja abaixo) |
| Slot ausente | `load()` → `null` |
| Linha corrompida | `load()` → `ValidationError` `ERR_SESSION_CORRUPT` (com `cause`) |
| Compatível com versões futuras | versão do schema armazenada em `PRAGMA user_version`; um banco escrito por um libwa **mais novo** é recusado em vez de migrado para trás |
| Diretório pai ausente | criado (semântica de `mkdir -p`) |

Schema, mantido intencionalmente mínimo:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  provider   TEXT    NOT NULL,
  data       BLOB    NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
```

### Ciclo de vida {#lifecycle}

```ts
const store = new SqliteSessionStore({ filename: "sessions.db" });
store.filename; // "sessions.db" — o caminho configurado, ou ":memory:"
store.closed;   // false
store.close();  // descarrega e libera o handle; seguro chamar duas vezes
store.closed;   // true
```

O `close()` **não** é chamado pelo libwa: `Client.destroy()` nunca fecha uma store que ele não criou, então quem criou a store é dono do handle (chame `close()` no seu hook de encerramento). Toda operação após `close()` lança `ValidationError` `ERR_SESSION_STORE`, então uma store usada além do encerramento falha de forma evidente em vez de reabrir o arquivo pelas suas costas.

> **Driver nativo.** A store é baseada em `better-sqlite3`, uma dependência normal do libwa que é carregada **de forma lazy** — importar `libwa` nunca toca o binding nativo, então uma build quebrada não pode quebrar o resto da biblioteca. Se sua instalação rodou com `npm install --ignore-scripts`, construir uma store lança `ERR_SESSION_STORE` dizendo para você reinstalar sem essa flag.

## MemorySessionStore <ApiBadge kind="class" /> {#memorysessionstore}

```ts
class MemorySessionStore implements SessionStore { /* baseado em Map */ }
```

Um `Map<string, Session>` em memória — para testes e processos descartáveis; as sessões não sobrevivem a reinícios. Sem validação de id (nada toca o sistema de arquivos), sem preocupações de serialização.

## `assertSafeSessionId` <ApiBadge kind="internal" /> {#assertsafesessionid}

```ts
function assertSafeSessionId(id: string): void
```

Impõe `/^[A-Za-z0-9_-]{1,64}$/` para que um id nunca escape do diretório da store (`../`, separadores etc.). Lança `ValidationError` com o código `ERR_SESSION_ID`:

```
Invalid session id "…": use 1-64 characters from [A-Za-z0-9_-].
```

Compartilhada por `FileSessionStore` e `SqliteSessionStore`; `MemorySessionStore` a pula (nada toca o sistema de arquivos). Exportada de `src/auth/SessionStore.ts` para testes, mas **não** faz parte das exportações da raiz do pacote.

## Escolhendo uma store {#choosing-a-store}

| Store | Persistência | Concorrência | Regras de id | Uso |
| --- | --- | --- | --- | --- |
| `FileSessionStore` (padrão) | disco `.libwa/<id>.json` | atômico + fila por slot | validado | bots pequenos em nó único |
| `SqliteSessionStore` | um banco em modo WAL | transações SQLite + busy-timeout | validado | **produção** — durabilidade, muitos slots, multiprocesso |
| `MemorySessionStore` | nenhuma | trivial | nenhuma | testes, demos |
| personalizada | sua | seu contrato | seu | Redis/multi-node/SQL gerenciado |

> **Fechando uma store.** `SqliteSessionStore.close()` (e qualquer `close()` que a sua própria store acrescente ao `SessionStore.close` opcional) é chamado por **você**, no encerramento — libwa nunca fecha um handle que não criou. A store de arquivo padrão não precisa de teardown.

Esboço de store personalizada:

```ts
import type { Session, SessionStore } from "libwa";

interface WireSession {
  id: string;
  provider: string;
  data: string; // base64
  updatedAt: string;
}

class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<unknown>; del(k: string): Promise<unknown> }) {}

  async load(id: string): Promise<Session | null> {
    const raw = await this.redis.get(`wa:session:${id}`);
    if (raw === null) return null;
    const p = JSON.parse(raw) as WireSession;
    return { id: p.id, provider: p.provider, data: Uint8Array.from(Buffer.from(p.data, "base64")), updatedAt: new Date(p.updatedAt) };
  }

  async save(session: Session): Promise<void> {
    const wire: WireSession = {
      id: session.id,
      provider: session.provider,
      data: Buffer.from(session.data).toString("base64"),
      updatedAt: session.updatedAt.toISOString(),
    };
    await this.redis.set(`wa:session:${session.id}`, JSON.stringify(wire));
  }

  async clear(id: string): Promise<void> {
    await this.redis.del(`wa:session:${id}`);
  }
}
```

## Erros {#errors}

| Code | Classe | Quando |
| --- | --- | --- |
| `ERR_SESSION_ID` | `ValidationError` | id falha em `[A-Za-z0-9_-]{1,64}` |
| `ERR_SESSION_CORRUPT` | `ValidationError` | arquivo de sessão não é JSON válido, ou uma linha SQLite tem os tipos de coluna errados (cause preservada) |
| `ERR_SESSION_UNREADABLE` | `ValidationError` | arquivo de sessão existe mas não pode ser lido — não-ENOENT (EACCES/EIO/…, cause preservada) |
| `ERR_SESSION_STORE` | `ValidationError` | a store SQLite não consegue abrir/fechar/ler/escrever o banco, é usada após `close()`, recebeu opções inválidas, ou o binding nativo `better-sqlite3` está ausente |

## Veja também {#see-also}

- [Guia de sessões](/pt-BR/guide/sessions) — receitas multi-conta, diagrama de ciclo de vida
- [ClientOptions → sessionStore/sessionId](/pt-BR/reference/client-options)
- [Arquitetura: sessões](/pt-BR/architecture/sessions) — como as stores se integram ao backend
