# Solução de problemas {#troubleshooting}

Sintoma → causa → correção. Ordenado por frequência com que autores de bots encontram cada um.

## Login e pareamento {#login-pairing}

### O evento `qr` nunca dispara {#qr-event-never-fires}

- Anexe os listeners **antes** de `login()`: `client.on("qr", …)` depois de `await client.login()` é tarde demais (o evento dispara durante a conexão).
- Fluxo de pareamento: escute `pairingCode` (emitido sempre que um código é produzido — automático via `auth.pairingPhoneNumber` ou manual via `requestPairingCode()`). libwa.js **não** suprime o `qr`; se um ainda chegar enquanto você espera o código, ignore-o.
- Verifique se não está engolindo erros: anexe `client.on("error", …)` e registre-o no log.

### A solicitação de código de pareamento falha {#pairing-code-request-fails}

| Erro | Código | Correção |
| --- | --- | --- |
| `phoneNumber must contain 7-15 digits…` | `ERR_INVALID_PHONE` | apenas dígitos internacionais: `5511999999999`, sem `+`, sem espaços |
| `Backend "…" does not support pairing codes` | `ERR_UNSUPPORTED` | este backend não tem `requestPairingCode` (o Baileys incluso tem) |
| `Failed to request pairing code: …` | `ERR_BACKEND` | provedor rejeitou — telefone inacessível, rate limit; tente o fluxo por QR |

### `login()` rejeita com `AuthenticationError` {#login-rejects-with-authenticationerror}

A sessão está morta (`loggedOut` / `badSession` / `connectionReplaced` / `forbidden`). **Nenhuma nova tentativa automática vai resolver isso** — faça o pareamento novamente:

```ts
await client.logout();   // limpa o slot (falhas de backend são reportadas através de "error")
// depois, fluxo por QR ou pareamento de novo
```

Também acontece com um **pareamento interrompido**: se uma tentativa por código de pareamento/QR foi iniciada mas nunca concluída no telefone, o slot guarda creds não registradas (`"registered": false`) e o servidor responde `Connection Failure` → `loggedOut`. Recupere excluindo o arquivo do slot diretamente (relativo ao diretório de trabalho do seu processo):

```sh
rm -rf .libwa.js          # ou .libwa.js/<sessionId>.json para um único slot
```

Se a rejeição não for capturada (`await client.login()` solto no topo), o Node imprime o stack do `AuthenticationError` e sai com `1` — envolva `login()` em `try/catch`.

### `login()` rejeita com `ConnectionError: Client was destroyed.` {#login-rejects-with-connectionerror-client-was-destroyed}

Você chamou `destroy()` enquanto o login estava pendente — comportamento esperado. Crie um novo `Client` (destruído é terminal).

### Login trava, sem `ready`, sem `qr` {#login-hangs-no-ready-no-qr}

Quase sempre: sem listeners de `error` e `logger` não configurado (o padrão é `nullLogger`) — as falhas ficam invisíveis. Comece sempre com:

```ts
client.on("error", (e) => console.error("[libwa.js]", e instanceof WhatsAppError ? e.code : "—", e.message, e.cause));
```

## Reconexão {#reconnection}

### O bot permanece desconectado após queda de rede {#bot-stays-disconnected-after-network-drop}

- `reconnect: false` configurado? → o fechamento é terminal por design.
- Motivo fatal? observe os motivos de `disconnect`: `loggedOut`, `badSession`, `connectionReplaced`, `forbidden` nunca tentam de novo.
- Tentativas esgotadas (padrão 5)? fique atento à linha `error` `Gave up reconnecting after 5 attempt(s) (…)`, e aumente `reconnect.attempts` / `maxDelayMs`.
- Processo saiu? os timers de backoff pendentes estão `unref`'d — um processo sem mais nada vivo **vai** sair durante o backoff. Mantenha-o vivo (servidor, `process.stdin`, etc.).

### Loop de reconexão infinito {#endless-reconnect-loop}

Motivo transitório mas a rede está genuinamente fora → o cliente continua tentando até `attempts` por epoch (o contador reinicia a cada open). Reduza `attempts`, adicione monitoramento no evento `reconnecting`.

### Mensagens antigas processadas depois da reconexão {#old-messages-processed-after-reconnect}

Não deveria acontecer (guards de geração do backend descartam eventos de socket morto). Se acontecer, verifique se não está reutilizando **uma única instância de backend em múltiplos clients** — um backend por client.

## Comandos {#commands}

### Os comandos não disparam {#commands-do-not-fire}

1. `commands: false` nas opções? → parsing desabilitado por completo.
2. Prefixo errado (o prefixo **mais longo** que casa vence; a ordem do array só desempata entre casamentos de mesmo tamanho).
3. O nome falha no padrão (`^[a-z0-9][a-z0-9_-]{0,31}$`) → `parse()` retorna `null` silenciosamente.
4. `ignoreSelf: true` + mensagem enviada pela conta do bot.
5. Gate `groupOnly`/`dmOnly` — note que os listeners de `interactionCreate` ainda disparam; apenas `execute()` é pulado.

### `ERR_DUPLICATE_COMMAND` no registro {#err-duplicate-command-at-registration}

Nome ou alias já ocupado. Novos *aliases* são verificados contra comandos e aliases existentes; um novo *nome* é verificado apenas contra comandos — então um comando pode sombrear um alias existente (mantenha nomes únicos para evitar surpresas). Use `registry.get(name)` / `registry.resolve(alias)` ou `unregister(name)` primeiro — note que os aliases registrados por um comando existente são removidos junto com ele.

### Middleware parece engolir tudo {#middleware-seems-to-swallow-everything}

Pular = parar. Um middleware que faz `return` sem `await next()` bloqueia comandos **e** listeners. Coloque um `await next()` incondicional no caminho feliz; use padrões `try/finally` com cuidado (chamar `next()` duas vezes lança erro).

## Envio e mídia {#sending-media}

| Erro | Código | Correção |
| --- | --- | --- |
| payload vazio/ambíguo | `ERR_EMPTY_MESSAGE` / `ERR_AMBIGUOUS_MESSAGE` | exatamente um corpo: `text` *ou* media *ou* `location` |
| legenda sem mídia | `ERR_INVALID_CAPTION` | legendas apenas em image/video/document |
| bytes de mídia vazios | `ERR_EMPTY_MEDIA` | você passou `Uint8Array(0)` — verifique a leitura do arquivo |
| reação rejeitada | `ERR_EMPTY_REACTION` | use `null` para limpar, `""` é inválido |
| `PermissionError` | `ERR_PERMISSION` | não é admin (operações de grupo) |
| `NotFoundError` | `ERR_NOT_FOUND` | mensagem/chat deletado — pare de agir sobre ele |
| `UnsupportedOperationError` | `ERR_UNSUPPORTED` | o backend não tem a capacidade: `if (client.backend.react)` |
| `BackendError` | `ERR_BACKEND` | rename/descrição de grupo, códigos de pareamento, backends personalizados — inspecione `.cause`; falhas de envio/mídia aparecem como `MessageError` |

### Download de mídia retorna nada / falha {#media-download-returns-nothing-fails}

`attachment.download()` puxa do **cache de mensagens brutas do backend (LRU 500)** — mensagens muito antigas podem ter sido evacuadas (e a sincronização de histórico está desligada por padrão, então mensagens pré-login nunca existiram localmente). Baixa logo ao receber.

## Sessões {#sessions}

| Sintoma | Código | Correção |
| --- | --- | --- |
| crash na inicialização com `sessionId` inválido | `ERR_SESSION_ID` | ids devem casar com `[A-Za-z0-9_-]{1,64}` |
| arquivo corrompido | `ERR_SESSION_CORRUPT` | exclua `.libwa.js/<id>.json` e faça o pareamento de novo (fail-fast por design) |
| `.libwa.js/<id>.json` ilegível (EACCES/EIO — existe mas não pode ser lido) | `ERR_SESSION_UNREADABLE` | corrija permissões/propriedade do arquivo — **não** refaça o pareamento, a sessão armazenada ainda está lá |
| bot logado na conta errada | — | `sessionId`s distintos compartilham uma store; verifique o slot |
| sessão ignorada após trocar de backend | — | `provider` divergente → warning + creds novas (pareamento) |

## Grupos {#groups}

| Sintoma | Correção |
| --- | --- |
| `At least one user is required.` | passe ≥1 alvo para add/remove/promote/demote |
| `Group name cannot be empty.` | `rename("")` inválido; `setDescription(undefined)` é como você *limpa* |
| getters de metadados `undefined` | chame `await group.refresh()` (ou `client.groups.fetch`) primeiro |
| primeira mensagem em um grupo nunca chega aos handlers | atualize o libwa.js — builds antigos descartavam mensagens que carregavam a distribuição de sender-key ao lado do texto (corrigido: o conteúdo vence as chaves de plumbing) |
| comando `groupOnly` silencioso no DM | por design; os listeners de `interactionCreate` ainda rodam |

## Motivos de desconexão {#disconnect-reasons}

`disconnect` disparou e nunca tentou de novo → veja [DisconnectReason](/pt-BR/reference/disconnect-reason):

- **fatal**: `loggedOut`, `badSession`, `connectionReplaced`, `forbidden` → faça o pareamento de novo;
- `restartRequired`, `rateLimited`, `timedOut`, `networkError`, … → tentados novamente (a menos que as tentativas/`reconnect:false` tenham encerrado).

## Desempenho e processo {#performance-process}

| Sintoma | Causa | Correção |
| --- | --- | --- |
| processo sai durante o backoff | timers estão `unref`'d | mantenha o event loop vivo (seu servidor/fila) |
| crescimento de memória em sessões longas | cache de mensagens brutas limitado (LRU 500) — não é esse | verifique seus próprios caches (ex.: limitadores de taxa em `Map` sem evacuação) |
| evento `error` silencioso | nenhum listener registrado | adicione um — a biblioteca não emite para o vazio |

## Obtendo um diagnóstico rápido {#getting-a-diagnosis-quickly}

```ts
const client = new Client({
  logger: createConsoleLogger("bot"),   // veja a atividade interna
  commands: { prefix: "!" },
});
client.on("error", (e) => console.error("ERROR", e instanceof WhatsAppError ? e.code : "—", e.message, "cause:", e.cause));
client.on("disconnect", (r) => console.error("DISCONNECT", r));
client.on("reconnecting", (n, ms) => console.warn(`retry ${n} in ${ms}ms`));
await client.login().catch((e) => console.error("LOGIN FAILED", e.code, e.message));
```

Ainda preso? Reúna: o `error.code` exato, `message`, `cause`, o motivo do `disconnect`, seus `ClientOptions` com números de telefone redigidos, e se reproduz com um `sessionId` novo.

## Veja também {#see-also}

- [Guia de tratamento de erros](/pt-BR/guide/error-handling) — padrões
- [Guia de sessões](/pt-BR/guide/sessions) — fluxos de recuperação
- [Guia de backends](/pt-BR/guide/backends) — diferenças de capacidade
