import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DIST_DIRECTORY, EDITION_ORDER, LOCALE_OUTPUTS } from "./config.ts";
import { resolveBrowser } from "./export-pdf.ts";

interface CdpMessage {
  error?: { message: string };
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  sessionId?: string;
}

interface PendingRequest {
  reject: (reason: Error) => void;
  resolve: (value: unknown) => void;
}

interface EventWaiter {
  method: string;
  resolve: () => void;
  sessionId?: string;
  timer: ReturnType<typeof setTimeout>;
}

interface BrowserAudit {
  bodyOverflowX: string;
  direction: string;
  offenders: string[];
  primaryActionFailures: string[];
  rootOverflowX: string;
  rootScrollWidth: number;
  viewportWidth: number;
}

class CdpConnection {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly waiters = new Set<EventWaiter>();
  private requestId = 0;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      if (!message.method) return;
      for (const waiter of this.waiters) {
        if (waiter.method !== message.method) continue;
        if (waiter.sessionId !== undefined && waiter.sessionId !== message.sessionId) continue;
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        waiter.resolve();
      }
    });
  }

  public static async connect(endpoint: string): Promise<CdpConnection> {
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome")), {
        once: true,
      });
    });
    return new CdpConnection(socket);
  }

  public request<T>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    const id = ++this.requestId;
    const payload = sessionId === undefined ? { id, method, params } : { id, method, params, sessionId };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: (value) => resolve(value as T),
      });
      this.socket.send(JSON.stringify(payload));
    });
  }

  public waitFor(method: string, sessionId?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waiter: EventWaiter = {
        method,
        resolve,
        ...(sessionId === undefined ? {} : { sessionId }),
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`Timed out waiting for Chrome event ${method}`));
        }, 15_000),
      };
      this.waiters.add(waiter);
    });
  }

  public close(): void {
    this.socket.close();
  }
}

async function launchChrome(): Promise<{
  endpoint: string;
  process: ChildProcess;
  profileDirectory: string;
}> {
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-chrome-"));
  const browserProcess = spawn(
    resolveBrowser(),
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const endpoint = await new Promise<string>((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${stderr}`)), 15_000);
    browserProcess.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (!match?.[1]) return;
      clearTimeout(timer);
      resolve(match[1]);
    });
    browserProcess.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before its debugging endpoint was ready (${String(code)})`));
    });
  });
  return { endpoint, process: browserProcess, profileDirectory };
}

function pagePaths(): string[] {
  return LOCALE_OUTPUTS.flatMap(({ outputPrefix }) => [
    path.join(DIST_DIRECTORY, outputPrefix, "index.html"),
    ...EDITION_ORDER.map((slug) =>
      path.join(DIST_DIRECTORY, outputPrefix, slug, "index.html"),
    ),
  ]);
}

function assertAudit(audit: BrowserAudit, pagePath: string, width: number): void {
  const page = path.relative(DIST_DIRECTORY, pagePath);
  if (audit.rootScrollWidth > audit.viewportWidth + 1 || audit.offenders.length > 0) {
    throw new Error(
      `${page} overflows at ${width}px (root ${audit.rootScrollWidth}/${audit.viewportWidth}; ${audit.offenders.join(", ")})`,
    );
  }
  if (audit.rootOverflowX === "hidden" || audit.bodyOverflowX === "hidden") {
    throw new Error(`${page} conceals horizontal overflow at ${width}px`);
  }
  if (audit.primaryActionFailures.length > 0) {
    throw new Error(
      `${page} has undersized primary actions at ${width}px: ${audit.primaryActionFailures.join(", ")}`,
    );
  }
  const expectedDirection = page.startsWith(`fa${path.sep}`) || page === path.join("fa", "index.html")
    ? "rtl"
    : "ltr";
  if (audit.direction !== expectedDirection) {
    throw new Error(`${page} rendered ${audit.direction}; expected ${expectedDirection}`);
  }
}

export async function verifyBrowser(): Promise<void> {
  const chrome = await launchChrome();
  const cdp = await CdpConnection.connect(chrome.endpoint);
  try {
    const { targetId } = await cdp.request<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await cdp.request<{ sessionId: string }>("Target.attachToTarget", {
      flatten: true,
      targetId,
    });
    await cdp.request("Page.enable", {}, sessionId);

    for (const width of [360, 375, 390, 412]) {
      await cdp.request(
        "Emulation.setDeviceMetricsOverride",
        { deviceScaleFactor: 1, height: 1200, mobile: true, width },
        sessionId,
      );
      for (const pagePath of pagePaths()) {
        const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
        await cdp.request("Page.navigate", { url: pathToFileURL(pagePath).href }, sessionId);
        await loaded;
        const result = await cdp.request<{
          result: { value?: BrowserAudit };
        }>(
          "Runtime.evaluate",
          {
            awaitPromise: true,
            expression: `(async () => {
              await document.fonts.ready;
              const visible = [...document.body.querySelectorAll("*")].filter((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
              });
              const label = (element) => {
                const id = element.id ? "#" + element.id : "";
                const classes = [...element.classList].slice(0, 2).map((name) => "." + name).join("");
                return element.tagName.toLowerCase() + id + classes;
              };
              return {
                bodyOverflowX: getComputedStyle(document.body).overflowX,
                direction: document.documentElement.dir,
                offenders: visible
                  .filter((element) => {
                    const rect = element.getBoundingClientRect();
                    return rect.left < -1 || rect.right > innerWidth + 1;
                  })
                  .slice(0, 8)
                  .map(label),
                primaryActionFailures: visible
                  .filter((element) => element.matches("[data-primary-action]"))
                  .filter((element) => {
                    const rect = element.getBoundingClientRect();
                    return rect.width < 44 || rect.height < 44;
                  })
                  .map(label),
                rootOverflowX: getComputedStyle(document.documentElement).overflowX,
                rootScrollWidth: document.documentElement.scrollWidth,
                viewportWidth: innerWidth,
              };
            })()`,
            returnByValue: true,
          },
          sessionId,
        );
        const audit = result.result.value;
        if (!audit) throw new Error(`Chrome returned no audit for ${pagePath}`);
        assertAudit(audit, pagePath, width);
      }
    }
    process.stdout.write("Verified all 16 pages at 360, 375, 390, and 412 CSS pixels.\n");
  } finally {
    cdp.close();
    if (chrome.process.exitCode === null && chrome.process.signalCode === null) {
      chrome.process.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => chrome.process.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ]);
    }
    await rm(chrome.profileDirectory, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await verifyBrowser();
}
