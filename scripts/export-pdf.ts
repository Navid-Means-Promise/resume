import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DIST_DIRECTORY,
  EDITION_ORDER,
  LOCALE_OUTPUTS,
  getPdfFilename,
} from "./config.ts";

export function resolveBrowser(): string {
  const candidates = [
    process.env.BROWSER_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => candidate !== undefined && candidate !== "");
  const browser = candidates.find((candidate) => existsSync(candidate));

  if (!browser) {
    throw new Error("No Chrome/Chromium binary found. Set BROWSER_PATH and retry.");
  }
  return browser;
}

async function assertOpaquePdf(output: string): Promise<void> {
  const pdf = await readFile(output);
  const source = pdf.toString("latin1");
  const forbiddenObjects = ["/SMask", "/Transparency"];
  const foundObject = forbiddenObjects.find((token) => source.includes(token));
  if (foundObject) {
    throw new Error(
      `${output} contains ${foundObject}; opaque compatibility PDFs must not contain transparency objects.`,
    );
  }

  const alphaValues = [...source.matchAll(/\/(?:ca|CA)\s+([0-9.]+)/g)].map((match) =>
    Number(match[1]),
  );
  if (alphaValues.some((alpha) => Number.isFinite(alpha) && alpha < 1)) {
    throw new Error(
      `${output} contains a non-opaque graphics state; remove alpha-based print styling.`,
    );
  }
}

export async function exportPdfs(): Promise<void> {
  const browser = resolveBrowser();
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-pdf-chrome-"));

  try {
    for (const locale of LOCALE_OUTPUTS) {
      for (const edition of EDITION_ORDER) {
        const relativeDirectory = locale.outputPrefix
          ? path.join(locale.outputPrefix, edition)
          : edition;
        const source = path.join(DIST_DIRECTORY, relativeDirectory, "index.html");
        if (!existsSync(source)) {
          throw new Error(`Missing ${source}. Run npm run build:html first.`);
        }

        const outputDirectory = path.join(DIST_DIRECTORY, relativeDirectory);
        await mkdir(outputDirectory, { recursive: true });
        const output = path.join(
          outputDirectory,
          getPdfFilename(locale.code, edition),
        );
        const result = spawnSync(
          browser,
          [
            "--headless=new",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--allow-file-access-from-files",
            "--no-pdf-header-footer",
            "--virtual-time-budget=2000",
            `--user-data-dir=${profileDirectory}`,
            `--print-to-pdf=${output}`,
            pathToFileURL(source).href,
          ],
          { encoding: "utf8" },
        );

        if (result.status !== 0) {
          throw new Error(result.stderr || `PDF export failed for ${locale.code}/${edition}`);
        }
        if (!existsSync(output) || (await stat(output)).size === 0) {
          throw new Error(`Chrome reported success but did not create ${output}`);
        }
        await assertOpaquePdf(output);

        process.stdout.write(
          `exported dist/${relativeDirectory}/${path.basename(output)}\n`,
        );
      }
    }
  } finally {
    await rm(profileDirectory, { recursive: true, force: true });
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await exportPdfs();
}
