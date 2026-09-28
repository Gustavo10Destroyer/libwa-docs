---
layout: home

hero:
  name: libwa
  text: WhatsApp bots as interactions
  tagline: A TypeScript-first, interaction-driven WhatsApp bot library — discord.js-style DX on a pluggable backend.
  actions:
    - theme: brand
      text: Get started
      link: /guide/introduction
    - theme: alt
      text: API reference
      link: /reference/
    - theme: alt
      text: Architecture
      link: /architecture/overview

features:
  - icon: 🎛️
    title: Interactions, not payloads
    details: Messages, commands, reactions, edits, group changes — everything arrives as one typed Interaction with narrowing guards like isMessage(), isCommand() and isReaction().
  - icon: 🧩
    title: Pluggable backends
    details: The core never imports a provider. Baileys ships as the default backend behind the WhatsAppBackend contract, and a build-time guard proves no provider type leaks into the public API.
  - icon: 🧭
    title: Commands & middleware
    details: Prefixes, aliases, args, groupOnly/dmOnly guards, and an ordered middleware pipeline for rate limiting, filtering and permissions.
  - icon: 🗂️
    title: Session persistence
    details: Opaque session blobs through SessionStore — filesystem and memory stores included, Redis/SQL pluggable. Multi-account bots use one store with distinct session ids.
  - icon: 🛡️
    title: Strict by default
    details: Built with strict TypeScript, exactOptionalPropertyTypes and zero any. Stable error hierarchy with machine-readable codes and typed events everywhere.
  - icon: 🔄
    title: Resilient connections
    details: Client-owned exponential backoff with a fatal-reason short circuit, QR and pairing-code login, and a lifecycle that survives provider restarts.
---

::: tip How this project was made
This project was created **entirely through vibe coding**: **ChatGPT** handled orchestration and **MiMo-V2.6-Flash** handled implementation. It is beta software — expect rough edges, and please [report issues](https://github.com/Gustavo10Destroyer/libwa/issues) as you find them.
:::
