import { defineConfig, type DefaultTheme } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

/** GitHub Pages project-site base path (repo: Gustavo10Destroyer/libwa.js-docs). */
const BASE = "/libwa.js-docs/";

/** Locale directory that is not the root (English lives at the site root). */
const PT = "pt-BR";
const PT_PREFIX = `/${PT}`;

type Lang = "en" | "pt";

/** A navigation label in both locales. */
type Bi = readonly [en: string, pt: string];

/** A nav/sidebar node; `link` is always root-relative and locale-agnostic. */
interface Item {
  text: Bi;
  link?: string;
  collapsed?: boolean;
  items?: Item[];
}

const t = (value: Bi, lang: Lang): string => (lang === "en" ? value[0] : value[1]);

/**
 * Turns the shared trees into one locale's nav/sidebar.
 *
 * Labels are picked from the `Bi` pair and every link is prefixed with the
 * locale's directory (`""` for English at the root, `/pt-BR` otherwise), which
 * is what makes one tree serve both languages without drifting apart.
 */
function localize(
  items: readonly Item[],
  lang: Lang,
  prefix: string,
): DefaultTheme.SidebarItem[] {
  return items.map((item) => ({
    text: t(item.text, lang),
    ...(item.link !== undefined ? { link: `${prefix}${item.link}` } : {}),
    ...(item.collapsed !== undefined ? { collapsed: item.collapsed } : {}),
    ...(item.items !== undefined ? { items: localize(item.items, lang, prefix) } : {}),
  }));
}

const NAV: readonly Item[] = [
  { text: ["Guide", "Guia"], link: "/guide/introduction", },
  { text: ["Reference", "Referência"], link: "/reference/" },
  { text: ["Architecture", "Arquitetura"], link: "/architecture/overview" },
  { text: ["Development", "Desenvolvimento"], link: "/development/repository" },
  { text: ["Changelog", "Changelog"], link: "/CHANGELOG" },
  { text: ["Troubleshooting", "Solução de problemas"], link: "/troubleshooting" },
];

const GUIDE: readonly Item[] = [
  {
    text: ["Guide", "Guia"],
    collapsed: false,
    items: [
      { text: ["Introduction", "Introdução"], link: "/guide/introduction" },
      { text: ["Getting started", "Primeiros passos"], link: "/guide/getting-started" },
      { text: ["Configuration", "Configuração"], link: "/guide/configuration" },
    ],
  },
  {
    text: ["Working with interactions", "Trabalhando com interações"],
    collapsed: false,
    items: [
      { text: ["Interactions", "Interações"], link: "/guide/interactions" },
      { text: ["Commands", "Comandos"], link: "/guide/commands" },
      { text: ["Middleware", "Middleware"], link: "/guide/middleware" },
      { text: ["Events", "Eventos"], link: "/guide/events" },
    ],
  },
  {
    text: ["Features", "Recursos"],
    collapsed: false,
    items: [
      { text: ["Messaging", "Mensagens"], link: "/guide/messaging" },
      { text: ["Groups", "Grupos"], link: "/guide/groups" },
      { text: ["Sessions & login", "Sessões e login"], link: "/guide/sessions" },
      { text: ["Error handling", "Tratamento de erros"], link: "/guide/error-handling" },
    ],
  },
  {
    text: ["Extending libwa.js", "Estendendo o libwa.js"],
    collapsed: false,
    items: [
      { text: ["Backends", "Backends"], link: "/guide/backends" },
      { text: ["Examples", "Exemplos"], link: "/guide/examples" },
    ],
  },
];

const REFERENCE: readonly Item[] = [
  { text: ["Reference", "Referência"], items: [{ text: ["API overview", "Visão geral da API"], link: "/reference/" }] },
  {
    text: ["Core", "Núcleo"],
    collapsed: false,
    items: [
      { text: ["Client", "Cliente"], link: "/reference/client" },
      { text: ["ClientOptions", "ClientOptions"], link: "/reference/client-options" },
      { text: ["Client events", "Eventos do cliente"], link: "/reference/client-events" },
      { text: ["DisconnectReason", "DisconnectReason"], link: "/reference/disconnect-reason" },
      { text: ["IDs & helpers", "IDs e utilitários"], link: "/reference/ids" },
    ],
  },
  {
    text: ["Interactions & content", "Interações e conteúdo"],
    collapsed: false,
    items: [
      { text: ["Interactions", "Interações"], link: "/reference/interactions" },
      { text: ["Message content", "Conteúdo de mensagem"], link: "/reference/content" },
    ],
  },
  {
    text: ["Entities", "Entidades"],
    collapsed: false,
    items: [
      { text: ["Chat, Group, Message, User", "Chat, Group, Message, User"], link: "/reference/entities" },
    ],
  },
  {
    text: ["Services", "Serviços"],
    collapsed: false,
    items: [
      { text: ["Commands", "Comandos"], link: "/reference/commands" },
      { text: ["Messaging", "Mensagens"], link: "/reference/messaging" },
      { text: ["Groups", "Grupos"], link: "/reference/groups" },
      { text: ["Middleware", "Middleware"], link: "/reference/middleware" },
    ],
  },
  {
    text: ["Infrastructure", "Infraestrutura"],
    collapsed: false,
    items: [
      { text: ["Sessions & stores", "Sessões e stores"], link: "/reference/sessions" },
      { text: ["Backend contract", "Contrato do backend"], link: "/reference/backend" },
      { text: ["TypedEventEmitter", "TypedEventEmitter"], link: "/reference/typed-event-emitter" },
      { text: ["Errors", "Erros"], link: "/reference/errors" },
      { text: ["Logger", "Logger"], link: "/reference/logger" },
    ],
  },
];

const ARCHITECTURE: readonly Item[] = [
  {
    text: ["Architecture", "Arquitetura"],
    items: [
      { text: ["Overview", "Visão geral"], link: "/architecture/overview" },
      { text: ["Event pipeline", "Pipeline de eventos"], link: "/architecture/event-pipeline" },
      { text: ["Backend contract", "Contrato do backend"], link: "/architecture/backend-contract" },
      { text: ["Sessions & auth", "Sessões e autenticação"], link: "/architecture/sessions" },
      { text: ["Reconnection", "Reconexão"], link: "/architecture/reconnection" },
      { text: ["Design decisions", "Decisões de design"], link: "/architecture/design-decisions" },
    ],
  },
];

const DEVELOPMENT: readonly Item[] = [
  {
    text: ["Development", "Desenvolvimento"],
    items: [
      { text: ["Repository structure", "Estrutura do repositório"], link: "/development/repository" },
      { text: ["Workflow & scripts", "Fluxo de trabalho e scripts"], link: "/development/workflow" },
      { text: ["Testing", "Testes"], link: "/development/testing" },
      { text: ["Coding conventions", "Convenções de código"], link: "/development/conventions" },
      { text: ["Public API guard", "Guarda da API pública"], link: "/development/public-api-guard" },
    ],
  },
];

const CHANGELOG: readonly Item[] = [
  {
    text: ["Changelog", "Changelog"],
    items: [
      { text: ["0.3.0 (current)", "0.3.0 (atual)"], link: "/CHANGELOG#_0-3-0-2026-10-01" },
      { text: ["0.2.0", "0.2.0"], link: "/CHANGELOG#_0-2-0-2026-09-29" },
      { text: ["0.1.0 (baseline)", "0.1.0 (linha de base)"], link: "/CHANGELOG#_0-1-0-2026-09-27" },
    ],
  },
];

const TROUBLESHOOTING: readonly Item[] = [
  {
    text: ["Troubleshooting", "Solução de problemas"],
    items: [{ text: ["Common problems", "Problemas comuns"], link: "/troubleshooting" }],
  },
];

function navFor(lang: Lang): DefaultTheme.NavItem[] {
  return localize(NAV, lang, lang === "en" ? "" : PT_PREFIX) as DefaultTheme.NavItem[];
}

function sidebarFor(lang: Lang): DefaultTheme.Sidebar {
  const p = lang === "en" ? "" : PT_PREFIX;
  return {
    [`${p}/guide/`]: localize(GUIDE, lang, p),
    [`${p}/reference/`]: localize(REFERENCE, lang, p),
    [`${p}/architecture/`]: localize(ARCHITECTURE, lang, p),
    [`${p}/development/`]: localize(DEVELOPMENT, lang, p),
    [`${p}/CHANGELOG`]: localize(CHANGELOG, lang, p),
    [`${p}/troubleshooting`]: localize(TROUBLESHOOTING, lang, p),
  };
}

/** Local-search UI strings; `root` is English, `pt-BR` overrides per locale. */
const SEARCH_TRANSLATIONS = {
  button: { buttonText: "Search docs", buttonAriaLabel: "Search documentation" },
  modal: {
    displayDetails: "Display list view",
    resetButtonTitle: "Clear query",
    backButtonTitle: "Close search",
    noResultsText: "No results for",
    footer: {
      selectText: "to select",
      selectKeyAriaLabel: "enter",
      navigateText: "to navigate",
      navigateUpKeyAriaLabel: "up arrow",
      navigateDownKeyAriaLabel: "down arrow",
      closeText: "to close",
      closeKeyAriaLabel: "escape",
    },
  },
};

const SEARCH_TRANSLATIONS_PT = {
  button: { buttonText: "Buscar na documentação", buttonAriaLabel: "Buscar na documentação" },
  modal: {
    displayDetails: "Exibir visualização em lista",
    resetButtonTitle: "Limpar consulta",
    backButtonTitle: "Fechar busca",
    noResultsText: "Nenhum resultado para",
    footer: {
      selectText: "para selecionar",
      selectKeyAriaLabel: "enter",
      navigateText: "para navegar",
      navigateUpKeyAriaLabel: "seta para cima",
      navigateDownKeyAriaLabel: "seta para baixo",
      closeText: "para fechar",
      closeKeyAriaLabel: "escape",
    },
  },
};

/**
 * VitePress configuration for the libwa.js documentation site.
 *
 * Information architecture (identical in both locales — the Portuguese tree
 * lives under /pt-BR/ and mirrors every English path):
 *   /                — landing page
 *   /guide/          — task-oriented guides (install, features, workflows)
 *   /reference/      — exhaustive API reference (every export of `libwa.js`)
 *   /architecture/   — internal design, data flows, decision records
 *   /development/    — contributor workflow, tooling, conventions
 *   /CHANGELOG       — versioned release notes for the libwa.js package
 *   /troubleshooting — diagnosing common failures
 */
export default withMermaid(
  defineConfig({
    title: "libwa.js",
    description:
      "Interaction-driven WhatsApp bot library for TypeScript — discord.js-style DX on a pluggable backend.",
    lang: "en-US",
    base: BASE,
    cleanUrls: true,
    lastUpdated: true,
    ignoreDeadLinks: true,

    /**
     * English is the root locale; the language switcher in the navbar is built
     * from these entries and maps the current page onto the other locale.
     */
    locales: {
      root: {
        label: "English",
        lang: "en-US",
      },
      [PT]: {
        label: "Português (Brasil)",
        lang: "pt-BR",
        link: `${PT_PREFIX}/`,
        title: "libwa.js",
        description:
          "Biblioteca de bots de WhatsApp orientada a interações para TypeScript — experiência de desenvolvimento no estilo discord.js sobre um backend substituível.",
        markdown: {
          container: {
            tipLabel: "DICA",
            infoLabel: "INFO",
            warningLabel: "AVISO",
            dangerLabel: "PERIGO",
            detailsLabel: "Detalhes",
          },
          codeCopyButton: {
            tooltipText: "Copiar código",
            copiedText: "Copiado!",
          },
        },
        themeConfig: {
          nav: navFor("pt"),
          sidebar: sidebarFor("pt"),
          outline: { level: [2, 3], label: "Nesta página" },
          docFooter: { prev: "Anterior", next: "Próximo" },
          lastUpdated: { text: "Atualizado" },
          returnToTopLabel: "Voltar ao topo",
          sidebarMenuLabel: "Menu",
          darkModeSwitchLabel: "Aparência",
          lightModeSwitchTitle: "Alternar para o tema claro",
          darkModeSwitchTitle: "Alternar para o tema escuro",
          langMenuLabel: "Mudar idioma",
          notFound: {
            title: "Página não encontrada",
            quote: "Talvez o link esteja quebrado ou a página tenha sido movida.",
            linkLabel: "Ir para a página inicial",
            linkText: "Início",
          },
          footer: {
            message:
              "Documentação do libwa.js — licença MIT · Totalmente vibe-coded: ChatGPT (orquestração) + MiMo-V2.6-Flash (implementação)",
            copyright: "Copyright © 2026 Gustavo10Destroyer",
          },
        },
      },
    },

    head: [
      ["link", { rel: "icon", type: "image/svg+xml", href: `${BASE}favicon.svg` }],
      ["meta", { name: "theme-color", content: "#059669" }],
      ["meta", { name: "og:type", content: "website" }],
      ["meta", { name: "og:title", content: "libwa.js documentation" }],
      [
        "meta",
        {
          name: "og:description",
          content:
            "Interaction-driven WhatsApp bot library for TypeScript — discord.js-style DX on a pluggable backend.",
        },
      ],
    ],

    markdown: {
      lineNumbers: true,
      theme: { light: "github-light", dark: "github-dark" },
      image: { lazyLoading: true },
    },

    // Rendered by vitepress-plugin-mermaid (```mermaid fences).
    mermaid: { theme: "neutral" },

    themeConfig: {
      logo: { src: "/logo.svg", alt: "libwa.js" },
      siteTitle: "libwa.js",

      nav: navFor("en"),
      sidebar: sidebarFor("en"),

      search: {
        provider: "local",
        options: {
          miniSearch: {
            options: {
              fuzzy: 0.2,
              prefix: true,
              boost: { title: 4, text: 2, titles: 1 },
            },
          },
          translations: SEARCH_TRANSLATIONS,
          locales: {
            [PT]: { translations: SEARCH_TRANSLATIONS_PT },
          },
        },
      },

      outline: { level: [2, 3], label: "On this page" },
      docFooter: { prev: "Previous", next: "Next" },
      lastUpdated: { text: "Last updated" },
      returnToTopLabel: "Back to top",
      sidebarMenuLabel: "Menu",
      darkModeSwitchLabel: "Appearance",
      lightModeSwitchTitle: "Switch to light theme",
      darkModeSwitchTitle: "Switch to dark theme",
      langMenuLabel: "Change language",

      footer: {
        message:
          "libwa.js documentation — MIT licensed · Entirely vibe-coded: ChatGPT (orchestration) + MiMo-V2.6-Flash (implementation)",
        copyright: "Copyright © 2026 Gustavo10Destroyer",
      },
    },
  }),
);
