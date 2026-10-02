# TypedEventEmitter <ApiBadge kind="internal" /> {#typedeventemitter}

O event emitter fortemente tipado por trás do [`client`](/pt-BR/reference/client#on-once-off) e do [bus de eventos do backend](/pt-BR/reference/backend#whatsappbackend). **Não exportado da raiz do pacote** — documentado para colaboradores e para entender a semântica em tempo de execução.

```ts
// import interno do repositório apenas
import { TypedEventEmitter } from "../events/TypedEventEmitter.js";
```

## Tipos {#types}

```ts
type EventMap = Record<string, readonly unknown[]>;
type EventMapConstraint<Map> = Record<keyof Map, readonly unknown[]>;
type ListenerOf<Map, Key> = (...args: Map[Key]) => void | Promise<void>;

interface TypedEventEmitterOptions {
  onListenerError?: (error: unknown, event: string) => void;
}
```

`Map` declara cada evento como uma **tupla de argumentos**. O alias `EventMapConstraint` existe porque interfaces (e não tipos object literal) são usadas como maps (`ClientEvents`, `BackendEventMap`).

## Classe {#class}

```ts
class TypedEventEmitter<Map extends EventMapConstraint<Map>> {
  constructor(options?: TypedEventEmitterOptions);
  on<Key>(event: Key, listener: ListenerOf<Map, Key>): Unsubscribe;
  once<Key>(event: Key, listener: ListenerOf<Map, Key>): Unsubscribe;
  off<Key>(event: Key, listener?: ListenerOf<Map, Key>): void;
  emit<Key>(event: Key, ...args: Map[Key]): void;
  emitAsync<Key>(event: Key, ...args: Map[Key]): Promise<void>;
  listenersOf<Key>(event: Key): readonly ListenerOf<Map, Key>[];
  hasListeners<Key>(event: Key): boolean;
  removeAllListeners(): void;
}
```

### `on` / `once` {#on-once}

Registra listeners permanentes / one-shot. Retorna um closure `Unsubscribe` (idempotente). Armazenamento: **um** `Map<key, ListenerEntry[]>` por emitter, cada entrada `{ listener, once }` — assim listeners `on` e `once` são dispatchados estritamente na ordem de registro: um `once` registrado entre dois listeners permanentes executa **entre** eles, não depois de todos.

### `off` {#off}

```ts
off(event): void            // remove TODOS os listeners do evento
off(event, listener): void  // remove um
```

### `emit` vs `emitAsync` {#emit-vs-emitasync}

| Método | Comportamento |
| --- | --- |
| `emitAsync` | faz snapshot do array ordenado (assim `off` durante o emit é seguro), remove do array **apenas as entradas `once`** (as permanentes ficam no lugar), depois `await` cada listener do snapshot **sequencialmente**; try/catch por listener → `onListenerError(error, event)` |
| `emit` | fire-and-forget: `void emitAsync(...).catch(err => onListenerError(err, event))` |

**Nunca rejeita para quem chama `emit`**; falhas de listener sempre são roteadas para `onListenerError`. Sem listeners, `emitAsync` retorna imediatamente.

```ts
const emitter = new TypedEventEmitter<{ ping: [n: number] }>({
  onListenerError: (e, ev) => console.error(ev, e),
});
const stop = emitter.on("ping", (n) => console.log(n));
emitter.emit("ping", 1);   // 1
stop();
emitter.emit("ping", 2);   // silencioso
```

### `listenersOf` / `hasListeners` / `removeAllListeners` {#listenersof-haslisteners-removealllisteners}

- `listenersOf` — array de snapshot (permanentes + once pendentes).
- `hasListeners` — guard barato; o client usa para decidir se emite eventos `error`.
- `removeAllListeners` — desmontagem completa (disponível mas não usado pelo client: `destroy()` desanexa apenas os listeners do backend, deixando os listeners da aplicação registrados).

## Integração dentro do `Client` {#wiring-inside-client}

O client constrói um emitter com um hook de erro:

```ts
new TypedEventEmitter<ClientEvents>({
  onListenerError: (error, event) => {
    if (event === "error") {
      logger.error("[error listener]", toError(error).message);
      // para o próprio evento "error": apenas log, nunca re-emitir (proteção contra recursão)
      return;
    }
    // loga `[listener for "<event>"]` no nível error, depois emite "error"
    handleError(error, `listener for "${event}"`);
  },
});
```

Garantias que isso traz:

1. um listener que lança erro nunca pode derrubar o caminho de código que emite;
2. uma falha de listener de `error` não pode colocar o evento `error` em loop;
3. o dispatch permanece determinístico (sequencial, isolado por snapshot).

## Notas de design {#design-notes}

- Os tipos são apagados em tempo de execução — custo zero de reflexão.
- Um array ordenado por evento mantém os listeners `on` e `once` intercalados na ordem de registro; a remoção é um `splice` linear, o que é irrelevante em contagens realistas de listeners (e é isso que permite que entradas `once` sejam consumidas individualmente sem perturbar os vizinhos permanentes).
- Listeners armazenados com `(...args: never[])` evitam atrito de variância; casts acontecem apenas na fronteira da chamada.
- A mesma classe alimenta o `BackendEventMap` no backend do Baileys (o `on` dele faz parte do `WhatsAppBackend`).

## Veja também {#see-also}

- [Guia de eventos tipados](/pt-BR/guide/events#the-event-map) — padrões de uso
- [Eventos do client](/pt-BR/reference/client-events) — o map que o client usa
- [Arquitetura: pipeline de eventos](/pt-BR/architecture/event-pipeline) — posicionamento do emitter
