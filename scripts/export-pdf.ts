import { spawn, type ChildProcess } from "node:child_process";
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

const PDF_EXPORT_TIMEOUT_MS = 30_000;
const BROWSER_EXIT_GRACE_MS = 750;
const BROWSER_KILL_GRACE_MS = 2_000;

interface BrowserExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isCompletePdf(output: string): Promise<boolean> {
  try {
    const pdf = await readFile(output);
    if (pdf.length < 8 || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return false;
    }

    return pdf.subarray(-1024).toString("latin1").trimEnd().endsWith("%%EOF");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function waitForCompletePdf(output: string): Promise<void> {
  const deadline = Date.now() + PDF_EXPORT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isCompletePdf(output)) {
      return;
    }
    await delay(100);
  }

  throw new Error(`Timed out after ${PDF_EXPORT_TIMEOUT_MS / 1000}s while exporting ${output}`);
}

function signalBrowserGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
}

async function stopBrowser(child: ChildProcess, exit: Promise<BrowserExit>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  signalBrowserGroup(child, "SIGTERM");
  const stopped = await Promise.race([
    exit.then(() => true),
    delay(BROWSER_KILL_GRACE_MS).then(() => false),
  ]);
  if (!stopped) {
    signalBrowserGroup(child, "SIGKILL");
    await exit;
  }
}

async function runBrowserPdfExport(
  browser: string,
  source: string,
  output: string,
  profileDirectory: string,
): Promise<void> {
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-component-update",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-default-browser-check",
      "--no-first-run",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--no-pdf-header-footer",
      "--virtual-time-budget=2000",
      `--user-data-dir=${profileDirectory}`,
      `--print-to-pdf=${output}`,
      pathToFileURL(source).href,
    ],
    {
      detached: process.platform !== "win32",
      stdio: "ignore",
    },
  );
  const exit = new Promise<BrowserExit>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  try {
    const firstResult = await Promise.race([
      exit.then((result) => ({ kind: "exit" as const, result })),
      waitForCompletePdf(output).then(() => ({ kind: "pdf" as const })),
    ]);

    if (firstResult.kind === "exit") {
      if (firstResult.result.code !== 0) {
        throw new Error(
          `Chrome exited before exporting ${output} (code ${String(firstResult.result.code)}, signal ${String(firstResult.result.signal)})`,
        );
      }
      if (!(await isCompletePdf(output))) {
        throw new Error(`Chrome exited without creating a complete PDF at ${output}`);
      }
      return;
    }

    const naturalExit = await Promise.race([
      exit,
      delay(BROWSER_EXIT_GRACE_MS).then(() => undefined),
    ]);
    if (naturalExit !== undefined && naturalExit.code !== 0) {
      throw new Error(
        `Chrome exited after exporting ${output} (code ${String(naturalExit.code)}, signal ${String(naturalExit.signal)})`,
      );
    }
  } finally {
    await stopBrowser(child, exit);
  }
}

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
  const profilesDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-pdf-chrome-"));

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
        await rm(output, { force: true });
        const profileDirectory = path.join(
          profilesDirectory,
          `${locale.code}-${edition}`,
        );
        await mkdir(profileDirectory, { recursive: true });
        await runBrowserPdfExport(
          browser,
          source,
          output,
          profileDirectory,
        );

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
    await rm(profilesDirectory, { recursive: true, force: true });
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await exportPdfs();
}
