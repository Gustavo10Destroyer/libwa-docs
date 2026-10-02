# Commands

<ApiBadge kind="interface" /> `CommandDefinition`, `ParsedCommand`, and `CommandRegistry` — the prefix-command system exposed as `client.commands`.

```ts
client.commands.register({
  name: "ping",
  description: "Health check",
  execute: (i) => void i.reply("pong"),
});
```

## CommandDefinition <ApiBadge kind="interface" />

Plain data + `execute`. Provider-agnostic; registered on the client's registry.

<ApiTable
  :rows="[
    { name: 'name', type: 'string', description: 'Required. Command name without prefix (ping for !ping). Matched case-insensitively: the registry key and parsed names are lowercased (definition.name keeps its original casing). Must match /^[a-z0-9][a-z0-9_-]{0,31}$/ — 1-32 chars total.' },
    { name: 'description', type: 'string | undefined', def: 'undefined', description: 'Short help text.' },
    { name: 'aliases', type: 'readonly string[] | undefined', def: 'undefined', description: 'Alternative names; each validated by the same pattern and checked against existing commands/aliases.' },
    { name: 'category', type: 'string | undefined', def: 'undefined', description: 'Grouping label for help listings (e.g. moderation).' },
    { name: 'groupOnly', type: 'boolean', def: 'false', description: 'Only executes in groups; in DMs execution is skipped (listeners still run).' },
    { name: 'dmOnly', type: 'boolean', def: 'false', description: 'Only executes in direct chats.' },
    { name: 'execute', type: '(interaction: CommandInteraction) =&gt; void | Promise&lt;void&gt;', description: 'Required. Runs when the command matches. Thrown Errors reach the error event unchanged; non-Error values are wrapped as WhatsAppError (ERR_WHATSAPP).' }
  ]"
/>

<ApiNote kind="info">
<code>groupOnly</code> + <code>dmOnly</code> together means the command can never run — the client validates nothing here; it simply never matches anywhere.
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

## ParsedCommand <ApiBadge kind="interface" />

Result of [`CommandRegistry.parse`](#parse) — also copied onto `CommandInteraction`.

<ApiTable
  :rows="[
    { name: 'prefix', type: 'string', description: 'The prefix that matched (relevant when multiple prefixes are configured).' },
    { name: 'name', type: 'string', description: 'Lowercased name token as typed.' },
    { name: 'args', type: 'readonly string[]', description: 'Whitespace-split arguments (split on /\s+/).' },
    { name: 'rawArgs', type: 'string', description: 'Argument string after the name, trimmed; empty when no args.' },
    { name: 'command', type: 'CommandDefinition | undefined', description: 'Registered definition via resolve() — alias-aware; undefined for unknown commands.' }
  ]"
/>

## CommandRegistry <ApiBadge kind="class" />

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

Internal storage: two maps — `name → definition` and `alias → canonical name`.

### `register`

```ts
register(definition: CommandDefinition): this
```

Lowercases `name`, validates the whole definition first, then stores the name and every alias. Returns `this` for chaining.

**Throws `ValidationError`:**

| Condition | Code | Message shape |
| --- | --- | --- |
| name fails pattern | `ERR_INVALID_COMMAND_NAME` | `Invalid command name "…": use 1-32 chars from [a-z0-9_-], starting with a letter or digit.` |
| name already registered | `ERR_DUPLICATE_COMMAND` | `Command "…" is already registered.` |
| alias fails pattern | `ERR_INVALID_COMMAND_NAME` | `Invalid alias "…" for command "…"`. |
| alias collides (command or alias) | `ERR_DUPLICATE_COMMAND` | `Alias "…" conflicts with an existing command.` |

Pattern: `/^[a-z0-9][a-z0-9_-]{0,31}$/` (1–32 characters). Registration is **atomic per definition**: the whole definition (name + every alias + collision checks) is validated before any mutation, so a failing alias leaves **nothing** registered (no partial state).

### `registerAll`

```ts
registerAll(definitions: Iterable<CommandDefinition>): this
```

Loops `register()`; first failure propagates (earlier commands remain registered).

### `unregister`

```ts
unregister(name: string): boolean
```

Removes the command **and any aliases pointing at it** (canonical name or alias input, lowercased). Returns whether something was removed.

### `get` / `has`

```ts
get(name: string): CommandDefinition | undefined
has(name: string): boolean
```

Exact-name lookup (lowercased) for `get` — aliases are **not** resolved. `has` is alias-aware (delegates to `resolve`), so `has("remove")` is `true` for an alias registered as `"remove"`.

### `resolve`

```ts
resolve(name: string): CommandDefinition | undefined
```

Alias-aware: canonical name or alias → definition.

### `list` / `size` / `clear`

```ts
list(): readonly CommandDefinition[]   // registration order
readonly size: number;                 // command count (aliases excluded)
clear(): void;                         // drops commands + aliases
```

`list()` powers help commands; `clear()` is useful in tests (the client creates one registry per instance).

### `parse`

```ts
parse(text: string, prefixes: readonly string[]): ParsedCommand | null
```

Algorithm (in order):

1. longest prefix that `text.startsWith` (ties → earliest entry) — else `null`;
2. strip prefix, `trim()`; empty → `null` (so `"!"` alone is not a command);
3. split name at the first whitespace; lowercase; must pass the name pattern — else `null`;
4. `rawArgs` = remainder trimmed; `args = rawArgs.split(/\s+/)` (or `[]`);
5. attach `command: resolve(name)` (may be `undefined`).

**Never throws** — invalid input is a `null`. Case-insensitive by construction.

```ts
const registry = client.commands;
registry.parse("!Ping  Alice  Bob", ["!", "/"]);
// { prefix: "!", name: "ping", args: ["Alice", "Bob"],
//   rawArgs: "Alice Bob", command: <registered ping> }

registry.parse("hello", ["!"]);       // null
registry.parse("!  ", ["!"]);         // null (empty body)
registry.parse("!!x", ["!"]);         // token "!x" fails the name pattern → null
```

Client-side flow after parsing: matched definition → `groupOnly`/`dmOnly` gate → `execute(interaction)` → always `interactionCreate` listeners. See [Commands guide](/guide/commands).

## See also

- [Commands guide](/guide/commands) — registration, help, parsing
- [CommandInteraction](/reference/interactions#commandinteraction) — runtime shape
- [ClientOptions → commands](/reference/client-options#commandoptions) — prefixes
