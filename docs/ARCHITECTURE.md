# Architecture

This repository is a static publishing pipeline. GitHub Pages is the primary product surface; PDF export is a derived delivery format built from the same HTML and content.

```text
content/*.json
      │
      ▼
ContentRepository ── validates shape, references, locale parity
      │
      ▼
HTML renderers + template ── relative Pages-safe routes, versioned assets
      │
      ├──────────────▶ dist/**/*.html
      │
      └─ headless Chrome ──▶ dist/**/*.pdf
                              │
                              ▼
                    static + browser verification
```

## Boundaries

- `content/` is the only maintained source for career facts, edition emphasis, and localized interface messages.
- `scripts/content.ts` is the content boundary. It parses untrusted JSON into named types, rejects malformed references, and enforces English/Persian structural parity before rendering.
- `scripts/build-html.ts` owns static rendering and the asset manifest. Runtime asset paths are declared once in `scripts/config.ts`; every generated asset URL receives a content-derived version token.
- `scripts/export-pdf.ts` is the Chrome adapter. It turns the generated resume pages into PDFs and rejects transparency objects known to render incorrectly in some PDF viewers.
- `scripts/verify-site.ts` proves generated routes, local links, assets, and downloads are complete. `scripts/verify-browser.ts` proves every route has LTR/RTL direction parity and no mobile-width overflow.

No server, client-side state, database, framework, or dependency-injection container is needed: all pages are deterministic build artifacts and contain no application logic. Introducing those layers would add boundaries without a product requirement.

## Localization and layout

English is published at the site root and Persian under `/fa/`. Both locales contain the same profile entities and edition set. Layout uses semantic HTML, logical CSS properties, local fonts, explicit image dimensions, 44-pixel primary touch targets, and print-only rules for A4 export.

## Delivery

`npm run check` is the single release gate used locally and by both GitHub Actions workflows. The deployment job publishes only `dist/` with `.nojekyll`; source files, temporary review images, and generated output are never committed.
