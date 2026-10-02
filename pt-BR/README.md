# Documentação do libwa {#libwa-documentation}

Fonte do site de documentação do **libwa** — construído com [VitePress](https://vitepress.dev) e Mermaid, incluindo os componentes personalizados `ApiBadge`/`ApiTable`/`ApiNote` usados pela referência da API.

> **Como isto foi feito:** o projeto foi criado **inteiramente através de vibe coding** — **ChatGPT** para orquestração, **MiMo-V2.6-Flash** para implementação.

**Site ao vivo:** <https://gustavo10destroyer.github.io/libwa-docs/>

## Desenvolvimento {#develop}

```bash
npm install
npm run dev      # http://localhost:5173/libwa-docs/
```

## Build {#build}

```bash
npm run build    # site estático → .vitepress/dist
npm run preview  # serve o build de produção localmente
```

## Implantação {#deployment}

Pushes para `main` disparam o workflow `Deploy documentation to GitHub Pages` (`.github/workflows/deploy-docs.yml`), que compila o site e o publica no GitHub Pages. O site é servido sob o caminho base `/libwa-docs/`.

## Licença {#license}

MIT
