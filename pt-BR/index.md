---
layout: home

hero:
  name: libwa
  text: Bots de WhatsApp como interações
  tagline: Uma biblioteca de bots de WhatsApp com TypeScript em primeiro lugar e orientada a interações — DX no estilo discord.js sobre um backend plugável.
  actions:
    - theme: brand
      text: Começar
      link: /pt-BR/guide/introduction
    - theme: alt
      text: Referência da API
      link: /pt-BR/reference/
    - theme: alt
      text: Arquitetura
      link: /pt-BR/architecture/overview

features:
  - icon: 🎛️
    title: Interações, não payloads
    details: Mensagens, comandos, reações, edições, mudanças de grupo — tudo chega como uma Interaction tipada com guards de estreitamento como isMessage(), isCommand() e isReaction().
  - icon: 🧩
    title: Backends plugáveis
    details: O core nunca importa um provedor. O Baileys vem como backend padrão atrás do contrato WhatsAppBackend, e um guard em tempo de build comprova que nenhum tipo de provedor vaza para a API pública.
  - icon: 🧭
    title: Comandos e middleware
    details: Prefixos, aliases, args, guards groupOnly/dmOnly e um pipeline de middleware ordenado para rate limiting, filtragem e permissões.
  - icon: 🗂️
    title: Persistência de sessão
    details: Blobs de sessão opacos através do SessionStore — stores de sistema de arquivos, SQLite e memória inclusos, Redis plugável. Bots com múltiplas contas usam uma store com session ids distintos.
  - icon: 🛡️
    title: Rigoroso por padrão
    details: Construído com TypeScript estrito, exactOptionalPropertyTypes e zero any. Hierarquia de erros estável com códigos legíveis por máquina e eventos tipados em todo lugar.
  - icon: 🔄
    title: Conexões resilientes
    details: Backoff exponencial de propriedade do cliente com um curto-circuito de motivo fatal, login por código QR e código de pareamento, e um ciclo de vida que sobrevive a reinícios do provedor.
---

::: tip Como este projeto foi feito
Este projeto foi criado **inteiramente através de vibe coding**: o **ChatGPT** cuidou da orquestração e o **MiMo-V2.6-Flash** da implementação. É software beta — espere imperfeições e, por favor, [relate issues](https://github.com/Gustavo10Destroyer/libwa/issues) conforme as encontrar.
:::
