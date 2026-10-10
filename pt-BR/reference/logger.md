# Logger {#logger}

<ApiBadge kind="interface" /> Contrato de logging plugável mínimo. A biblioteca não imprime nada por padrão — injete um `Logger` via [`ClientOptions.logger`](/pt-BR/reference/client-options) para observar a atividade interna.

```ts
import { Client, createConsoleLogger } from "libwa.js";

new Client({ logger: createConsoleLogger("mybot") });
```

## `Logger` <ApiBadge kind="interface" /> {#logger-1}

```ts
interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
```

Quatro níveis, args com rest-spread (sem string de formato exigida). As implementações devem ser non-throwing — a biblioteca **não** protege as chamadas de logger, então um logger que lança erro se propaga para a operação que disparou o log (e pode fazê-la falhar).

## `nullLogger` <ApiBadge kind="constant" /> {#nulllogger}

```ts
const nullLogger: Logger;
```

Implementação no-op; o padrão quando `logger` não é fornecido. Tudo é descartado.

```ts
new Client();                 // logger: nullLogger (silencioso)
```

## `createConsoleLogger` <ApiBadge kind="function" /> {#createconsolelogger}

```ts
function createConsoleLogger(prefix?: string): Logger; // prefixo padrão "libwa.js"
```

Logger de desenvolvimento que imprime em `console.debug/info/warn/error` com um cabeçalho `` `${prefix} ${level}:` ``.

```ts
createConsoleLogger("bot");
// debug: …  →  "bot debug: …"
createConsoleLogger();        // "libwa.js debug: …"
```

## O que é registrado {#what-gets-logged}

| Origem | Nível | Linha de exemplo |
| --- | --- | --- |
| roteamento de erros do client | `error` | `[reconnect exhausted] Gave up reconnecting after 5 attempt(s) (networkError).` |
| falha no listener de error | `error` | `[error listener] <message>` |
| falhas de destroy/logout | `error` | `[disconnect during destroy] …` |
| diagnósticos do backend/provedor | `debug`/`info` | via `BackendConnectOptions.logger` (mesma instância) |

O **evento** `error` e o logger são independentes: sem listeners de `error`, as falhas registradas em log são o único rastro (e com `nullLogger`, o único rastro é o que você mesmo capturar).

## Integrando um logger real {#wiring-a-real-logger}

```ts
import { Client, type Logger } from "libwa.js";
import pino from "pino";

const p = pino({ name: "libwa.js-bot" });
const logger: Logger = {
  debug: (...a) => p.debug(a),
  info: (...a) => p.info(a),
  warn: (...a) => p.warn(a),
  error: (...a) => p.error(a),
};

const client = new Client({ logger });
```

A mesma instância é entregue ao backend em `BackendConnectOptions`, então os diagnósticos no nível do provedor também passam pelo seu logger.

## Veja também {#see-also}

- [Guia de tratamento de erros](/pt-BR/guide/error-handling#logging) — roteamento log vs evento
- [ClientOptions](/pt-BR/reference/client-options) — ponto de injeção
