# libwa documentation

Source of the **libwa** documentation site — built with [VitePress](https://vitepress.dev) and Mermaid, including custom `ApiBadge`/`ApiTable`/`ApiNote` components used by the API reference.

> **How this was made:** the project was created **entirely through vibe coding** — **ChatGPT** for orchestration, **MiMo-V2.6-Flash** for implementation.

**Live site:** <https://gustavo10destroyer.github.io/libwa-docs/>

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/libwa-docs/
```

## Build

```bash
npm run build    # static site → .vitepress/dist
npm run preview  # serve the production build locally
```

## Deployment

Pushes to `main` trigger the `Deploy documentation to GitHub Pages` workflow (`.github/workflows/deploy-docs.yml`), which builds the site and publishes it to GitHub Pages. The site is served under the `/libwa-docs/` base path.

## License

MIT
