import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ASSET_PATHS,
  BINARY_ASSET_PATHS,
  DIST_DIRECTORY,
  EDITION_ORDER,
  LOCALE_OUTPUTS,
  getPdfFilename,
} from "./config.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

function localReferences(html: string): string[] {
  return [...html.matchAll(/\b(?:href|src)="([^"]+)"/gu)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .filter((value) => !/^(?:https?:|mailto:|tel:|#)/u.test(value));
}

async function assertReferenceExists(htmlPath: string, reference: string): Promise<void> {
  const url = new URL(reference, pathToFileURL(htmlPath));
  url.search = "";
  url.hash = "";
  let target = fileURLToPath(url);
  if (target.endsWith(path.sep)) target = path.join(target, "index.html");
  const relative = path.relative(DIST_DIRECTORY, target);
  assert(!relative.startsWith("..") && !path.isAbsolute(relative), `${reference} escapes dist/`);
  await access(target);
}

function editionDirectory(outputPrefix: string, slug: string): string {
  return path.join(DIST_DIRECTORY, outputPrefix, slug);
}

export async function verifySite(): Promise<void> {
  const files = await listFiles(DIST_DIRECTORY);
  const htmlFiles = files.filter((file) => file.endsWith(".html"));
  const pdfFiles = files.filter((file) => file.endsWith(".pdf"));
  assert(htmlFiles.length === 16, `Expected 16 HTML documents, found ${htmlFiles.length}`);
  assert(pdfFiles.length === 14, `Expected 14 PDF documents, found ${pdfFiles.length}`);
  await access(path.join(DIST_DIRECTORY, ".nojekyll"));

  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, "utf8");
    const relativePath = path.relative(DIST_DIRECTORY, htmlPath);
    assert(
      html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'),
      `${relativePath} is missing the responsive viewport contract`,
    );
    assert(!html.includes("{{"), `${relativePath} contains an unresolved template token`);
    assert(
      /<link rel="stylesheet" href="[^"]+\?v=[0-9a-f]{12}">/u.test(html),
      `${relativePath} does not reference a versioned stylesheet`,
    );
    for (const reference of localReferences(html)) {
      await assertReferenceExists(htmlPath, reference);
    }
    for (const source of html.matchAll(/\bsrc="([^"]+)"/gu)) {
      assert(source[1]?.includes("?v="), `${relativePath} has an unversioned image source`);
    }
  }

  for (const localeOutput of LOCALE_OUTPUTS) {
    const libraryPath = path.join(DIST_DIRECTORY, localeOutput.outputPrefix, "index.html");
    const library = await readFile(libraryPath, "utf8");
    assert(
      (library.match(/<a\b[^>]*\sdownload(?:>|\s)/gu) ?? []).length === EDITION_ORDER.length,
      `${path.relative(DIST_DIRECTORY, libraryPath)} must link directly to every PDF`,
    );

    for (const slug of EDITION_ORDER) {
      const directory = editionDirectory(localeOutput.outputPrefix, slug);
      const filename = getPdfFilename(localeOutput.code, slug);
      const pdfPath = path.join(directory, filename);
      const pdfStats = await stat(pdfPath);
      assert(pdfStats.size > 0, `${path.relative(DIST_DIRECTORY, pdfPath)} is empty`);
      const page = await readFile(path.join(directory, "index.html"), "utf8");
      assert(
        page.includes(`href="./${filename}" download`),
        `${localeOutput.code}/${slug} is missing its PDF download link`,
      );
    }
  }

  const stylesheet = await readFile(path.join(DIST_DIRECTORY, ASSET_PATHS.stylesheet), "utf8");
  const fontReferences = [...stylesheet.matchAll(/url\("(\.\.\/fonts\/[^"]+)"\)/gu)];
  assert(fontReferences.length === ASSET_PATHS.fonts.length, "Unexpected generated font references");
  for (const match of fontReferences) {
    assert(match[1]?.includes("?v="), "Generated stylesheet contains an unversioned font URL");
  }

  const expectedAssets = new Set<string>([ASSET_PATHS.stylesheet, ...BINARY_ASSET_PATHS]);
  const actualAssets = files
    .map((file) => path.relative(DIST_DIRECTORY, file).split(path.sep).join("/"))
    .filter((file) => file.startsWith("assets/"));
  assert(
    actualAssets.every((file) => expectedAssets.has(file)),
    `dist/assets contains undeclared files: ${actualAssets
      .filter((file) => !expectedAssets.has(file))
      .join(", ")}`,
  );

  process.stdout.write("Verified GitHub Pages output: links, assets, HTML, and PDFs are complete.\n");
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await verifySite();
}
