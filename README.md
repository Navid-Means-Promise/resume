# Navid Mohammadi · Resume site

A bilingual static resume site built for GitHub Pages. The same validated career record produces an English and Persian landing page, seven focused resume pages per locale, and a downloadable PDF beside every web resume.

## Output

| Route | Content |
| --- | --- |
| `/` | English resume landing page |
| `/fa/` | Persian resume landing page |
| `/{edition}/` | English web resume and PDF download |
| `/fa/{edition}/` | Persian web resume and PDF download |

The editions are `general`, `ai-data`, `python-engineering`, `typescript-fullstack`, `java-backend`, `security-devops`, and `embedded-systems`. Relative URLs keep every route valid under a GitHub Pages project subpath.

## Develop locally

Requirements: Node.js 22+, npm, and Chrome or Chromium.

```bash
npm ci
npm run check
npm run preview
```

`npm run check` is the release gate. It type-checks the build tools, validates both locale content graphs, runs deterministic tests, builds all web pages and PDFs, verifies every generated link and asset, and renders all 16 HTML routes at 360, 375, 390, and 412 CSS pixels to detect horizontal overflow and undersized primary actions.

Useful commands:

```bash
npm run build       # generate the complete deployable site in dist/
npm run build:html  # regenerate HTML and versioned runtime assets
npm run build:pdf   # export PDFs from existing HTML
npm run clean       # remove generated dist/
npm test            # validate content and the static-site build
npm run preview     # build and serve http://localhost:4173
```

Set `BROWSER_PATH` when Chrome is not installed at a standard Linux path.

## Deploy to GitHub Pages

1. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
2. Merge the reviewed branch into `main`.
3. The [deployment workflow](.github/workflows/deploy-pages.yml) runs the complete release gate, uploads `dist/`, and deploys it through the GitHub Pages environment.

Pull requests and non-`main` branches run the [verification workflow](.github/workflows/ci.yml) and retain the generated site as a short-lived artifact. Generated output is never committed.

## Repository map

```text
.github/workflows/  CI and GitHub Pages deployment
assets/             Runtime fonts, optimized images, and shared styles
content/            English and Persian profile/edition data
docs/               Architecture, blueprint baseline, and writing guidance
scripts/            Typed content, rendering, PDF, and verification pipeline
templates/          Semantic resume HTML shell
tests/              Content-contract and static-build tests
dist/               Generated site; ignored by Git
```

The module boundaries and data flow are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Asset origins and licenses are recorded beside the relevant assets in [assets/images/README.md](assets/images/README.md) and [assets/fonts/README.md](assets/fonts/README.md).

## Update resume content

1. Update shared English facts in `content/general/profile.json` and keep `content/fa/general/profile.json` factually aligned.
2. Update the matching edition files under `content/specialized/` and `content/fa/specialized/`.
3. Keep interface text in the locale catalogs under `content/locales/`; inline interface copy does not belong in renderers.
4. Run `npm run check` before review.

Persian copy also follows [docs/persian-resume-writing-guide.md](docs/persian-resume-writing-guide.md). Claims should foreground verified evidence rather than introduce unsupported employers, projects, technologies, or outcomes.
