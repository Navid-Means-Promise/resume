import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CdpConnection, launchChrome, stopChrome } from "./chrome.ts";
import {
  DIST_DIRECTORY,
  EDITION_ORDER,
  LOCALE_OUTPUTS,
  getPdfFilename,
} from "./config.ts";

async function assertOpaquePdf(output: string): Promise<void> {
  const pdf = await readFile(output);
  if (
    pdf.length < 8 ||
    pdf.subarray(0, 5).toString("latin1") !== "%PDF-" ||
    !pdf.subarray(-1024).toString("latin1").trimEnd().endsWith("%%EOF")
  ) {
    throw new Error(`${output} is not a complete PDF document.`);
  }

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
  const chrome = await launchChrome();
  let cdp: CdpConnection | undefined;

  try {
    cdp = await CdpConnection.connect(chrome.endpoint);
    const { targetId } = await cdp.request<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await cdp.request<{ sessionId: string }>("Target.attachToTarget", {
      flatten: true,
      targetId,
    });
    await cdp.request("Page.enable", {}, sessionId);

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
        await rm(output, { force: true });

        const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
        await cdp.request("Page.navigate", { url: pathToFileURL(source).href }, sessionId);
        await loaded;
        await cdp.request(
          "Runtime.evaluate",
          {
            awaitPromise: true,
            expression: "document.fonts.ready",
            returnByValue: true,
          },
          sessionId,
        );
        const { data } = await cdp.request<{ data: string }>(
          "Page.printToPDF",
          {
            displayHeaderFooter: false,
            preferCSSPageSize: true,
            printBackground: true,
          },
          sessionId,
        );
        if (!data) {
          throw new Error(`Chrome returned no PDF data for ${locale.code}/${edition}`);
        }
        await writeFile(output, Buffer.from(data, "base64"));

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
    cdp?.close();
    await stopChrome(chrome);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await exportPdfs();
}
