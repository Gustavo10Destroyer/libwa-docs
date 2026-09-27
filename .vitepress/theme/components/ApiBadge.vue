<script setup lang="ts">
/**
 * Small colored chip describing an API member's kind.
 *
 * Usage: <ApiBadge kind="class" />  or  <ApiBadge kind="type" label="type alias" />
 */
const props = withDefaults(
  defineProps<{
    kind:
      | "class"
      | "interface"
      | "type"
      | "enum"
      | "function"
      | "constant"
      | "event"
      | "method"
      | "option"
      | "internal";
    label?: string;
  }>(),
  {},
);

const defaultLabels: Record<string, string> = {
  class: "class",
  interface: "interface",
  type: "type alias",
  enum: "enum",
  function: "function",
  constant: "constant",
  event: "event",
  method: "method",
  option: "option",
  internal: "internal",
};

const text = props.label ?? defaultLabels[props.kind] ?? props.kind;
</script>

<template>
  <span class="api-badge" :data-kind="kind">{{ text }}</span>
</template>

<style scoped>
.api-badge {
  display: inline-block;
  vertical-align: baseline;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 18px;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.api-badge[data-kind="class"] {
  color: #b45309;
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  border-color: color-mix(in srgb, #f59e0b 45%, transparent);
}

.api-badge[data-kind="interface"],
.api-badge[data-kind="type"] {
  color: #1d4ed8;
  background: color-mix(in srgb, #3b82f6 14%, transparent);
  border-color: color-mix(in srgb, #3b82f6 42%, transparent);
}

.api-badge[data-kind="enum"] {
  color: #7c3aed;
  background: color-mix(in srgb, #8b5cf6 14%, transparent);
  border-color: color-mix(in srgb, #8b5cf6 42%, transparent);
}

.api-badge[data-kind="function"],
.api-badge[data-kind="method"] {
  color: #047857;
  background: color-mix(in srgb, #10b981 14%, transparent);
  border-color: color-mix(in srgb, #10b981 42%, transparent);
}

.api-badge[data-kind="constant"],
.api-badge[data-kind="event"] {
  color: #be123c;
  background: color-mix(in srgb, #f43f5e 14%, transparent);
  border-color: color-mix(in srgb, #f43f5e 42%, transparent);
}

.api-badge[data-kind="option"] {
  color: #0e7490;
  background: color-mix(in srgb, #06b6d4 14%, transparent);
  border-color: color-mix(in srgb, #06b6d4 42%, transparent);
}

.api-badge[data-kind="internal"] {
  color: #6b7280;
  background: color-mix(in srgb, #9ca3af 14%, transparent);
  border-color: color-mix(in srgb, #9ca3af 42%, transparent);
}

.dark .api-badge {
  filter: brightness(1.25) saturate(0.9);
}
</style>
