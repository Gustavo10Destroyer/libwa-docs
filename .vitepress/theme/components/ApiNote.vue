<script setup lang="ts">
/**
 * Semantic API callout rendered as a colored panel.
 *
 * Usage: <ApiNote kind="internal">Not exported from the package root.</ApiNote>
 * Kinds: tip (default), info, warning, danger, internal.
 */
const props = withDefaults(
  defineProps<{
    kind?: "tip" | "info" | "warning" | "danger" | "internal";
    title?: string;
  }>(),
  { kind: "info", title: undefined },
);

const titles: Record<string, string> = {
  tip: "Tip",
  info: "Note",
  warning: "Warning",
  danger: "Danger",
  internal: "Internal",
};

const label = props.title ?? titles[props.kind] ?? "Note";
</script>

<template>
  <div class="api-note" :data-kind="kind">
    <p class="api-note-title">{{ label }}</p>
    <div class="api-note-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.api-note {
  margin: 16px 0;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  border-left-width: 4px;
  background: var(--vp-c-bg-soft);
  font-size: 14px;
}

.api-note-title {
  margin: 0 0 4px;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.02em;
}

.api-note-body :deep(p) {
  margin: 4px 0;
}

.api-note-body :deep(p:first-child) {
  margin-top: 0;
}

.api-note-body :deep(p:last-child) {
  margin-bottom: 0;
}

.api-note[data-kind="tip"] {
  border-left-color: #10b981;
}

.api-note[data-kind="info"] {
  border-left-color: #3b82f6;
}

.api-note[data-kind="warning"] {
  border-left-color: #f59e0b;
}

.api-note[data-kind="danger"] {
  border-left-color: #ef4444;
}

.api-note[data-kind="internal"] {
  border-left-color: #9ca3af;
}
</style>
