import { buildHtml } from "./build-html.ts";
import { exportPdfs } from "./export-pdf.ts";

process.stdout.write("[1/2] Building the bilingual GitHub Pages site...\n");
await buildHtml();

process.stdout.write("[2/2] Exporting downloadable PDFs from the generated pages...\n");
await exportPdfs();

process.stdout.write("Resume site complete: deployable pages and PDFs are in dist/.\n");
