import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CdpConnection, launchChrome, stopChrome } from "./chrome.ts";
import { DIST_DIRECTORY, EDITION_ORDER, LOCALE_OUTPUTS } from "./config.ts";

interface BrowserAudit {
  bodyOverflowX: string;
  direction: string;
  offenders: string[];
  primaryActionFailures: string[];
  rootOverflowX: string;
  rootScrollWidth: number;
  viewportWidth: number;
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
    await stopChrome(chrome);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await verifyBrowser();
}
