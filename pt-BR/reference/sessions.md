# Sessões {#sessions}

<ApiBadge kind="interface" /> Persistência de autenticação. O core trata os bytes da sessão como opacos — apenas o backend os interpreta. As stores são plugáveis: arquivo, memória ou a sua própria (Redis, SQL, nuvem).

```ts
import { Client, FileSessionStore, MemorySessionStore, type SessionStore } from "libwa";

new Client({ sessionStore: new FileSessionStore({ directory: "/var/lib/bot" }) });
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
}
```

| Método | Contrato |
| --- | --- |
| `load` | Retorna a sessão ou `null` quando nenhuma existe (ausente ≠ erro). |
| `save` | Persiste por `session.id`; deve ser seguro sob chamadas concorrentes para o mesmo id. |
| `clear` | Remove o slot; limpar um slot ausente **não** é um erro. |

Os backends chamam esses métodos por meio de `ClientOptions.sessionStore`; `client.logout()` limpa o slot.

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

### `assertSafeSessionId` <ApiBadge kind="internal" /> {#assertsafesessionid}

```ts
function assertSafeSessionId(id: string): void
```

Impõe `/^[A-Za-z0-9_-]{1,64}$/` para que um id nunca escape do diretório da store (`../`, separadores etc.). Lança `ValidationError` com o código `ERR_SESSION_ID`:

```
Invalid session id "…": use 1-64 characters from [A-Za-z0-9_-].
```

Exportado de `src/auth/FileSessionStore.ts` para testes, mas **não** faz parte das exportações da raiz do pacote.

## MemorySessionStore <ApiBadge kind="class" /> {#memorysessionstore}

```ts
class MemorySessionStore implements SessionStore { /* baseado em Map */ }
```

Um `Map<string, Session>` em memória — para testes e processos descartáveis; as sessões não sobrevivem a reinícios. Sem validação de id (nada toca o sistema de arquivos), sem preocupações de serialização.

## Escolhendo uma store {#choosing-a-store}

| Store | Persistência | Concorrência | Regras de id | Uso |
| --- | --- | --- | --- | --- |
| `FileSessionStore` (padrão) | disco `.libwa/<id>.json` | atômico + fila por slot | validado | produção single-node |
| `MemorySessionStore` | nenhuma | trivial | nenhuma | testes, demos |
| personalizada | sua | seu contrato | seu | Redis/SQL/multi-node |

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
| `ERR_SESSION_CORRUPT` | `ValidationError` | arquivo de sessão não é JSON válido (cause preservada) |
| `ERR_SESSION_UNREADABLE` | `ValidationError` | arquivo de sessão existe mas não pode ser lido — não-ENOENT (EACCES/EIO/…, cause preservada) |

## Veja também {#see-also}

- [Guia de sessões](/pt-BR/guide/sessions) — receitas multi-conta, diagrama de ciclo de vida
- [ClientOptions → sessionStore/sessionId](/pt-BR/reference/client-options)
- [Arquitetura: sessões](/pt-BR/architecture/sessions) — como as stores se integram ao backend
