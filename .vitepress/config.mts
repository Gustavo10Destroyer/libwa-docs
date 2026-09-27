import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

/** GitHub Pages project-site base path (repo: Gustavo10Destroyer/libwa-docs). */
const BASE = "/libwa-docs/";

/**
 * VitePress configuration for the libwa documentation site.
 *
 * Information architecture:
 *   /                — landing page
 *   /guide/          — task-oriented guides (install, features, workflows)
 *   /reference/      — exhaustive API reference (every export of `libwa`)
 *   /architecture/   — internal design, data flows, decision records
 *   /development/    — contributor workflow, tooling, conventions
 *   /troubleshooting — diagnosing common failures
 */
export default withMermaid(
  defineConfig({
    title: "libwa",
    description:
      "Interaction-driven WhatsApp bot library for TypeScript — discord.js-style DX on a pluggable backend.",
    lang: "en-US",
    base: BASE,
    cleanUrls: true,
    lastUpdated: true,
    ignoreDeadLinks: true,

    head: [
      ["link", { rel: "icon", type: "image/svg+xml", href: `${BASE}favicon.svg` }],
      ["meta", { name: "theme-color", content: "#059669" }],
      ["meta", { name: "og:type", content: "website" }],
      ["meta", { name: "og:title", content: "libwa documentation" }],
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
      logo: { src: "/logo.svg", alt: "libwa" },
      siteTitle: "libwa",

      nav: [
        { text: "Guide", link: "/guide/introduction", activeMatch: "/guide/" },
        { text: "Reference", link: "/reference/", activeMatch: "/reference/" },
        { text: "Architecture", link: "/architecture/overview", activeMatch: "/architecture/" },
        { text: "Development", link: "/development/repository", activeMatch: "/development/" },
        { text: "Troubleshooting", link: "/troubleshooting", activeMatch: "/troubleshooting" },
      ],

      sidebar: {
        "/guide/": [
          {
            text: "Guide",
            collapsed: false,
            items: [
              { text: "Introduction", link: "/guide/introduction" },
              { text: "Getting started", link: "/guide/getting-started" },
              { text: "Configuration", link: "/guide/configuration" },
            ],
          },
          {
            text: "Working with interactions",
            collapsed: false,
            items: [
              { text: "Interactions", link: "/guide/interactions" },
              { text: "Commands", link: "/guide/commands" },
              { text: "Middleware", link: "/guide/middleware" },
              { text: "Events", link: "/guide/events" },
            ],
          },
          {
            text: "Features",
            collapsed: false,
            items: [
              { text: "Messaging", link: "/guide/messaging" },
              { text: "Groups", link: "/guide/groups" },
              { text: "Sessions & login", link: "/guide/sessions" },
              { text: "Error handling", link: "/guide/error-handling" },
            ],
          },
          {
            text: "Extending libwa",
            collapsed: false,
            items: [
              { text: "Backends", link: "/guide/backends" },
              { text: "Examples", link: "/guide/examples" },
            ],
          },
        ],

        "/reference/": [
          {
            text: "Reference",
            items: [{ text: "API overview", link: "/reference/" }],
          },
          {
            text: "Core",
            collapsed: false,
            items: [
              { text: "Client", link: "/reference/client" },
              { text: "ClientOptions", link: "/reference/client-options" },
              { text: "Client events", link: "/reference/client-events" },
              { text: "DisconnectReason", link: "/reference/disconnect-reason" },
              { text: "IDs & helpers", link: "/reference/ids" },
            ],
          },
          {
            text: "Interactions & content",
            collapsed: false,
            items: [
              { text: "Interactions", link: "/reference/interactions" },
              { text: "Message content", link: "/reference/content" },
            ],
          },
          {
            text: "Entities",
            collapsed: false,
            items: [{ text: "Chat, Group, Message, User", link: "/reference/entities" }],
          },
          {
            text: "Services",
            collapsed: false,
            items: [
              { text: "Commands", link: "/reference/commands" },
              { text: "Messaging", link: "/reference/messaging" },
              { text: "Groups", link: "/reference/groups" },
              { text: "Middleware", link: "/reference/middleware" },
            ],
          },
          {
            text: "Infrastructure",
            collapsed: false,
            items: [
              { text: "Sessions & stores", link: "/reference/sessions" },
              { text: "Backend contract", link: "/reference/backend" },
              { text: "TypedEventEmitter", link: "/reference/typed-event-emitter" },
              { text: "Errors", link: "/reference/errors" },
              { text: "Logger", link: "/reference/logger" },
            ],
          },
        ],

        "/architecture/": [
          {
            text: "Architecture",
            items: [
              { text: "Overview", link: "/architecture/overview" },
              { text: "Event pipeline", link: "/architecture/event-pipeline" },
              { text: "Backend contract", link: "/architecture/backend-contract" },
              { text: "Sessions & auth", link: "/architecture/sessions" },
              { text: "Reconnection", link: "/architecture/reconnection" },
              { text: "Design decisions", link: "/architecture/design-decisions" },
            ],
          },
        ],

        "/development/": [
          {
            text: "Development",
            items: [
              { text: "Repository structure", link: "/development/repository" },
              { text: "Workflow & scripts", link: "/development/workflow" },
              { text: "Testing", link: "/development/testing" },
              { text: "Coding conventions", link: "/development/conventions" },
              { text: "Public API guard", link: "/development/public-api-guard" },
            ],
          },
        ],

        "/troubleshooting": [
          {
            text: "Troubleshooting",
            items: [
              { text: "Common problems", link: "/troubleshooting" },
            ],
          },
        ],
      },

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
          translations: {
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

      footer: {
        message: "libwa documentation — MIT licensed.",
        copyright: "Copyright © 2026 Gustavo10Destroyer",
      },
    },
  }),
);
