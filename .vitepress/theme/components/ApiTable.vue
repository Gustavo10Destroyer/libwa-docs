<script setup lang="ts">
/**
 * Structured table for API parameters, options, event arguments, etc.
 *
 * Each row renders a name (inline code), a type, an optional default and a
 * description. Omitting `default` marks the row as required.
 *
 * Usage:
 *   <ApiTable
 *     :rows="[
 *       { name: 'attempts', type: 'number', def: '5', description: '…' },
 *       { name: 'store', type: 'SessionStore', description: '…' },
 *     ]"
 *   />
 */
export interface ApiTableRow {
  /** Parameter / option / argument name (rendered as inline code). */
  name: string;
  /** TypeScript type (rendered as inline code). */
  type: string;
  /** Human-readable description (plain text; keep it concise). */
  description: string;
  /** Default value. When omitted the row is rendered as required. */
  def?: string;
}

withDefaults(
  defineProps<{
    rows: readonly ApiTableRow[];
    /** Column headers, default: Name / Type / Default / Description. */
    headers?: readonly [string, string, string, string];
    /** Caption shown above the table. */
    caption?: string;
  }>(),
  {
    headers: () => ["Name", "Type", "Default", "Description"] as const,
    caption: undefined,
  },
);
</script>

<template>
  <div class="api-table-wrap">
    <p v-if="caption" class="api-table-caption">{{ caption }}</p>
    <table class="api-table">
      <thead>
        <tr>
          <th v-for="header in headers" :key="header">{{ header }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.name">
          <td><code>{{ row.name }}</code></td>
          <td><code class="type">{{ row.type }}</code></td>
          <td>
            <code v-if="row.def !== undefined">{{ row.def }}</code>
            <span v-else class="required">required</span>
          </td>
          <td class="desc">{{ row.description }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.api-table-wrap {
  margin: 16px 0;
  overflow-x: auto;
}

.api-table-caption {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.api-table {
  width: 100%;
  display: table;
  border-collapse: collapse;
  font-size: 13.5px;
}

.api-table th,
.api-table td {
  border: 1px solid var(--vp-c-divider);
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
}

.api-table thead th {
  background: var(--vp-c-bg-soft);
  font-weight: 600;
  white-space: nowrap;
}

.api-table code {
  font-size: 12.5px;
}

.api-table code.type {
  color: var(--vp-c-brand-1);
  background: transparent;
  padding: 0;
}

.required {
  color: var(--vp-c-text-3);
  font-style: italic;
  font-size: 12.5px;
}

</style>
