# DisconnectReason {#disconnectreason}

<ApiBadge kind="enum" /> Motivos de fechamento normalizados emitidos pelos backends e expostos através do evento [`disconnect`](/pt-BR/reference/client-events#disconnect) do client.

```ts
import { DisconnectReason, FATAL_DISCONNECT_REASONS } from "libwa.js";

client.on("disconnect", (reason) => {
  if (FATAL_DISCONNECT_REASONS.has(reason)) rePair();
});
```

## Enum {#enum}

```ts
enum DisconnectReason {
  LoggedOut = "loggedOut",
  BadSession = "badSession",
  ConnectionReplaced = "connectionReplaced",
  Forbidden = "forbidden",
  RateLimited = "rateLimited",
  RestartRequired = "restartRequired",
  ConnectionClosed = "connectionClosed",
  ConnectionLost = "connectionLost",
  TimedOut = "timedOut",
  ServiceUnavailable = "serviceUnavailable",
  NetworkError = "networkError",
  Unknown = "unknown",
}
```

Valores string (seguros para JSON). O adaptador Baileys mapeia os códigos de fechamento do provedor para estes — o núcleo só enxerga este enum.

## Referência {#reference}

| Valor | Significado | Retentável? |
| --- | --- | --- |
| `loggedOut` | Sessão não é mais válida; novo login necessário | ❌ fatal |
| `badSession` | Sessão armazenada corrompida/inconsistente com o servidor | ❌ fatal |
| `connectionReplaced` | Outro dispositivo assumiu a conexão | ❌ fatal |
| `forbidden` | Conta não pode se conectar (banida) | ❌ fatal |
| `rateLimited` | Rate limiting do provedor | ✅ (via retry) |
| `restartRequired` | Servidor pediu para reiniciar a conexão | ✅ |
| `connectionClosed` | Fechado pelo lado remoto | ✅ |
| `connectionLost` | Rede caiu | ✅ |
| `timedOut` | Conexão esgotou o tempo | ✅ |
| `serviceUnavailable` | Serviço do WhatsApp temporariamente fora do ar | ✅ |
| `networkError` | Não foi possível alcançar a rede | ✅ |
| `unknown` | Fechamento não classificado | ✅ |

## `FATAL_DISCONNECT_REASONS` {#fatal-disconnect-reasons}

```ts
const FATAL_DISCONNECT_REASONS: ReadonlySet<DisconnectReason>;
```

O conjunto consultado pela política de reconexão: `loggedOut`, `badSession`, `connectionReplaced`, `forbidden`.

**Política:** um fechamento neste conjunto → **sem novas tentativas**, evento `disconnect` imediato e (durante um `login()` pendente) uma rejeição `AuthenticationError`. Tentar novamente em loop nunca teria sucesso (usuário deslogado) ou entraria em conflito com o usuário (conexão substituída).

```ts
if (FATAL_DISCONNECT_REASONS.has(reason)) {
  console.error("session dead:", reason);
} else {
  console.warn("transient:", reason, "— client will retry");
}
```

## Separação comportamental {#behavioral-split}

| Categoria | Exemplos | Comportamento do client |
| --- | --- | --- |
| Fatal | loggedOut, badSession, connectionReplaced, forbidden | `disconnect` na hora; `AuthenticationError` se o login estiver pendente |
| Transitório | network/timed out/service unavailable/… | backoff com nova tentativa (até `reconnect.attempts`), eventos `reconnecting` |
| Tentativas esgotadas | qualquer transitório, tentativas gastas | `disconnect` com o último motivo; `ConnectionError` se o login estiver pendente |
| Reconexão desativada | `reconnect: false` | qualquer fechamento → `disconnect` imediatamente |

Veja [Arquitetura de reconexão](/pt-BR/architecture/reconnection) para o fluxograma completo de decisão.

## Veja também {#see-also}

- [Guia de tratamento de erros](/pt-BR/guide/error-handling#disconnects) — reagindo aos motivos
- [ClientOptions → reconnect](/pt-BR/reference/client-options#reconnectoptions) — a política de novas tentativas
