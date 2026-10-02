# Comandos {#commands}

<ApiBadge kind="interface" /> `CommandDefinition`, `ParsedCommand` e `CommandRegistry` — o sistema de comandos com prefixo exposto como `client.commands`.

```ts
client.commands.register({
  name: "ping",
  description: "Health check",
  execute: (i) => void i.reply("pong"),
});
```

## CommandDefinition <ApiBadge kind="interface" /> {#commanddefinition}

Dados puros + `execute`. Agnóstico de provedor; registrado no registry do cliente.

<ApiTable
  :rows="[
    { name: 'name', type: 'string', description: 'Obrigatório. Nome do comando sem prefixo (ping para !ping). Comparado sem distinção de maiúsculas: a chave do registry e os nomes parseados entram em minúsculas (definition.name mantém a caixa original). Deve casar com /^[a-z0-9][a-z0-9_-]{0,31}$/ — 1-32 caracteres no total.' },
    { name: 'description', type: 'string | undefined', def: 'undefined', description: 'Texto curto de ajuda.' },
    { name: 'aliases', type: 'readonly string[] | undefined', def: 'undefined', description: 'Nomes alternativos; cada um validado pelo mesmo padrão e verificado contra comandos/aliases existentes.' },
    { name: 'category', type: 'string | undefined', def: 'undefined', description: 'Rótulo de agrupamento para listagens de ajuda (ex.: moderação).' },
    { name: 'groupOnly', type: 'boolean', def: 'false', description: 'Executa apenas em grupos; em DMs a execução é pulada (os listeners ainda rodam).' },
    { name: 'dmOnly', type: 'boolean', def: 'false', description: 'Executa apenas em chats diretos.' },
    { name: 'execute', type: '(interaction: CommandInteraction) =&gt; void | Promise&lt;void&gt;', description: 'Obrigatório. Roda quando o comando casa. Errors lançados chegam ao evento de erro inalterados; valores que não são Error são embrulhados como WhatsAppError (ERR_WHATSAPP).' }
  ]"
/>

<ApiNote kind="info">
<code>groupOnly</code> + <code>dmOnly</code> juntos significam que o comando jamais pode rodar — o cliente não valida nada aqui; ele simplesmente nunca casa em lugar nenhum.
</ApiNote>

```ts
client.commands.register({
  name: "kick",
  aliases: ["remove"],
  category: "moderation",
  groupOnly: true,
  async execute(i) {
    const [target] = i.args;
    if (!target) return void (await i.reply("usage: kick @user"));
    await i.chat /* Group */.removeMembers([target]);
  },
});
```

## ParsedCommand <ApiBadge kind="interface" /> {#parsedcommand}

Resultado de [`CommandRegistry.parse`](#parse) — também copiado para `CommandInteraction`.

<ApiTable
  :rows="[
    { name: 'prefix', type: 'string', description: 'O prefixo que casou (relevante quando vários prefixos estão configurados).' },
    { name: 'name', type: 'string', description: 'Token do nome em minúsculas como digitado.' },
    { name: 'args', type: 'readonly string[]', description: 'Argumentos separados por espaço em branco (split em /\s+/).' },
    { name: 'rawArgs', type: 'string', description: 'String de argumentos depois do nome, com trim; vazia quando não há args.' },
    { name: 'command', type: 'CommandDefinition | undefined', description: 'Definição registrada via resolve() — ciente de aliases; undefined para comandos desconhecidos.' }
  ]"
/>

## CommandRegistry <ApiBadge kind="class" /> {#commandregistry}

```ts
class CommandRegistry {
  register(definition: CommandDefinition): this;
  registerAll(definitions: Iterable<CommandDefinition>): this;
  unregister(name: string): boolean;
  get(name: string): CommandDefinition | undefined;
  resolve(name: string): CommandDefinition | undefined;
  has(name: string): boolean;
  list(): readonly CommandDefinition[];
  readonly size: number;
  clear(): void;
  parse(text: string, prefixes: readonly string[]): ParsedCommand | null;
}
```

Armazenamento interno: dois maps — `name → definition` e `alias → canonical name`.

### `register` {#register}

```ts
register(definition: CommandDefinition): this
```

Coloca `name` em minúsculas, valida a definição inteira primeiro, depois armazena o nome e cada alias. Retorna `this` para encadeamento.

**Lança `ValidationError`:**

| Condição | Código | Formato da mensagem |
| --- | --- | --- |
| nome falha no padrão | `ERR_INVALID_COMMAND_NAME` | `Invalid command name "…": use 1-32 chars from [a-z0-9_-], starting with a letter or digit.` |
| nome já registrado | `ERR_DUPLICATE_COMMAND` | `Command "…" is already registered.` |
| alias falha no padrão | `ERR_INVALID_COMMAND_NAME` | `Invalid alias "…" for command "…".` |
| alias colide (comando ou alias) | `ERR_DUPLICATE_COMMAND` | `Alias "…" conflicts with an existing command.` |

Padrão: `/^[a-z0-9][a-z0-9_-]{0,31}$/` (1–32 caracteres). O registro é **atômico por definição**: a definição inteira (nome + cada alias + checagens de colisão) é validada antes de qualquer mutação, então um alias que falha deixa **nada** registrado (sem estado parcial).

### `registerAll` {#registerall}

```ts
registerAll(definitions: Iterable<CommandDefinition>): this
```

Percorre `register()`; a primeira falha se propaga (comandos anteriores permanecem registrados).

### `unregister` {#unregister}

```ts
unregister(name: string): boolean
```

Remove o comando **e qualquer alias que aponte para ele** (nome canônico ou alias digitado, em minúsculas). Retorna se algo foi removido.

### `get` / `has` {#get-has}

```ts
get(name: string): CommandDefinition | undefined
has(name: string): boolean
```

Busca por nome exato (em minúsculas) em `get` — aliases **não** são resolvidos. `has` é ciente de aliases (delega para `resolve`), então `has("remove")` é `true` para um alias registrado como `"remove"`.

### `resolve` {#resolve}

```ts
resolve(name: string): CommandDefinition | undefined
```

Ciente de aliases: nome canônico ou alias → definição.

### `list` / `size` / `clear` {#list-size-clear}

```ts
list(): readonly CommandDefinition[]   // ordem de registro
readonly size: number;                 // quantidade de comandos (aliases excluídos)
clear(): void;                         // descarta comandos + aliases
```

`list()` alimenta comandos de ajuda; `clear()` é útil em testes (o cliente cria um registry por instância).

### `parse` {#parse}

```ts
parse(text: string, prefixes: readonly string[]): ParsedCommand | null
```

Algoritmo (nesta ordem):

1. o prefixo mais longo que `text.startsWith` (empates → entrada mais antiga) — senão `null`;
2. remove o prefixo, `trim()`; vazio → `null` (então sozinho, `"!"` não é um comando);
3. divide o nome no primeiro espaço em branco; minúsculas; deve passar no padrão do nome — senão `null`;
4. `rawArgs` = resto com trim; `args = rawArgs.split(/\s+/)` (ou `[]`);
5. anexa `command: resolve(name)` (pode ser `undefined`).

**Nunca lança** — entrada inválida é um `null`. Sem distinção de maiúsculas por construção.

```ts
const registry = client.commands;
registry.parse("!Ping  Alice  Bob", ["!", "/"]);
// { prefix: "!", name: "ping", args: ["Alice", "Bob"],
//   rawArgs: "Alice Bob", command: <registered ping> }

registry.parse("hello", ["!"]);       // null
registry.parse("!  ", ["!"]);         // null (corpo vazio)
registry.parse("!!x", ["!"]);         // token "!x" falha no padrão do nome → null
```

Fluxo no cliente após o parsing: definição casada → gate `groupOnly`/`dmOnly` → `execute(interaction)` → e então sempre os listeners de `interactionCreate`. Veja [Guia de comandos](/pt-BR/guide/commands).

## Veja também {#see-also}

- [Guia de comandos](/pt-BR/guide/commands) — registro, ajuda, parsing
- [CommandInteraction](/pt-BR/reference/interactions#commandinteraction) — forma em runtime
- [ClientOptions → commands](/pt-BR/reference/client-options#commandoptions) — prefixos
