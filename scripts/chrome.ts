import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CHROME_START_TIMEOUT_MS = 15_000;
const CDP_REQUEST_TIMEOUT_MS = 30_000;
const CHROME_STOP_TIMEOUT_MS = 5_000;

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
  timer: ReturnType<typeof setTimeout>;
}

interface EventWaiter {
  method: string;
  reject: (reason: Error) => void;
  resolve: () => void;
  sessionId?: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface ChromeSession {
  endpoint: string;
  process: ChildProcess;
  profileDirectory: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

export class CdpConnection {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly waiters = new Set<EventWaiter>();
  private requestId = 0;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
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

    socket.addEventListener("close", () => {
      const error = new Error("Chrome DevTools connection closed unexpectedly");
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      for (const waiter of this.waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
      this.waiters.clear();
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
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Chrome response to ${method}`));
      }, CDP_REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        reject,
        resolve: (value) => resolve(value as T),
        timer,
      });
      this.socket.send(JSON.stringify(payload));
    });
  }

  public waitFor(method: string, sessionId?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waiter: EventWaiter = {
        method,
        reject,
        resolve,
        ...(sessionId === undefined ? {} : { sessionId }),
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`Timed out waiting for Chrome event ${method}`));
        }, CDP_REQUEST_TIMEOUT_MS),
      };
      this.waiters.add(waiter);
    });
  }

  public close(): void {
    this.socket.close();
  }
}

function signalChromeGroup(process: ChildProcess, signal: NodeJS.Signals): void {
  if (process.pid === undefined || process.exitCode !== null || process.signalCode !== null) {
    return;
  }

  try {
    if (globalThis.process.platform === "win32") {
      process.kill(signal);
    } else {
      globalThis.process.kill(-process.pid, signal);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
}

async function waitForExit(process: ChildProcess, timeout: number): Promise<boolean> {
  if (process.exitCode !== null || process.signalCode !== null) {
    return true;
  }
  return Promise.race([
    new Promise<boolean>((resolve) => process.once("exit", () => resolve(true))),
    delay(timeout).then(() => false),
  ]);
}

export async function launchChrome(): Promise<ChromeSession> {
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-chrome-"));
  const browserProcess = spawn(
    resolveBrowser(),
    [
      "--headless",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-default-browser-check",
      "--no-first-run",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    {
      detached: globalThis.process.platform !== "win32",
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      let stderr = "";
      const timer = setTimeout(
        () => reject(new Error(`Chrome did not start:\n${stderr}`)),
        CHROME_START_TIMEOUT_MS,
      );
      browserProcess.stderr?.on("data", (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
        if (!match?.[1]) return;
        clearTimeout(timer);
        resolve(match[1]);
      });
      browserProcess.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      browserProcess.once("exit", (code, signal) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Chrome exited before its debugging endpoint was ready (code ${String(code)}, signal ${String(signal)}):\n${stderr}`,
          ),
        );
      });
    });
    return { endpoint, process: browserProcess, profileDirectory };
  } catch (error) {
    signalChromeGroup(browserProcess, "SIGKILL");
    await waitForExit(browserProcess, CHROME_STOP_TIMEOUT_MS);
    await rm(profileDirectory, { force: true, recursive: true });
    throw error;
  }
}

export async function stopChrome(chrome: ChromeSession): Promise<void> {
  signalChromeGroup(chrome.process, "SIGTERM");
  if (!(await waitForExit(chrome.process, CHROME_STOP_TIMEOUT_MS))) {
    signalChromeGroup(chrome.process, "SIGKILL");
    await waitForExit(chrome.process, CHROME_STOP_TIMEOUT_MS);
  }
  await rm(chrome.profileDirectory, {
    force: true,
    maxRetries: 5,
    recursive: true,
    retryDelay: 100,
  });
}
