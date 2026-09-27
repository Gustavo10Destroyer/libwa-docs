import { h } from "vue";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import ApiBadge from "./components/ApiBadge.vue";
import ApiTable from "./components/ApiTable.vue";
import ApiNote from "./components/ApiNote.vue";
import "./custom.css";

/**
 * Custom theme: VitePress defaults plus small API-documentation components.
 *
 * - ApiBadge  — colored kind chip (class / interface / enum / …)
 * - ApiTable  — structured parameters/options table with types + defaults
 * - ApiNote   — semantic callout for API-specific notes (internal, stable, …)
 */
export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout),
  enhanceApp({ app }) {
    app.component("ApiBadge", ApiBadge);
    app.component("ApiTable", ApiTable);
    app.component("ApiNote", ApiNote);
  },
} satisfies Theme;
