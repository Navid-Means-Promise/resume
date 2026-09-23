const EXPECTED_PDF_COUNT = 14;
const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function siteUrl(): URL {
  const configured = process.env.SITE_URL;
  if (!configured) {
    throw new Error("SITE_URL must contain the deployed GitHub Pages URL.");
  }
  return new URL(configured.endsWith("/") ? configured : `${configured}/`);
}

async function fetchPublished(url: URL): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { "user-agent": "resume-pages-smoke-check" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        return response;
      }
      await response.body?.cancel();
      lastError = new Error(`${url.href} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < MAX_ATTEMPTS) {
      await delay(RETRY_DELAY_MS);
    }
  }

  throw new Error(
    `Could not fetch ${url.href} after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
}

function pdfLinks(html: string, page: URL): URL[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=(?:"([^"]+)"|'([^']+)')/gu)) {
    const href = match[1] ?? match[2];
    if (!href) continue;
    const url = new URL(href, page);
    if (url.pathname.toLowerCase().endsWith(".pdf")) {
      links.add(url.href);
    }
  }
  return [...links].map((url) => new URL(url));
}

async function verifyHtml(page: URL): Promise<URL[]> {
  const response = await fetchPublished(page);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(`${page.href} returned unexpected content type ${contentType}`);
  }
  const html = await response.text();
  if (!html.includes("<html")) {
    throw new Error(`${page.href} did not return an HTML document.`);
  }
  process.stdout.write(`verified page ${page.href}\n`);
  return pdfLinks(html, page);
}

async function verifyPdf(url: URL): Promise<void> {
  const response = await fetchPublished(url);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/pdf")) {
    throw new Error(`${url.href} returned unexpected content type ${contentType}`);
  }

  const pdf = Buffer.from(await response.arrayBuffer());
  if (
    pdf.length < 8 ||
    pdf.subarray(0, 5).toString("latin1") !== "%PDF-" ||
    !pdf.subarray(-1024).toString("latin1").trimEnd().endsWith("%%EOF")
  ) {
    throw new Error(`${url.href} did not return a complete PDF document.`);
  }
  process.stdout.write(`verified PDF ${url.href}\n`);
}

const base = siteUrl();
const localizedPages = [base, new URL("fa/", base)];
const discovered = new Set<string>();
for (const page of localizedPages) {
  for (const pdf of await verifyHtml(page)) {
    discovered.add(pdf.href);
  }
}

if (discovered.size !== EXPECTED_PDF_COUNT) {
  throw new Error(
    `Expected ${EXPECTED_PDF_COUNT} published PDF links, found ${discovered.size}.`,
  );
}

await Promise.all([...discovered].sort().map((url) => verifyPdf(new URL(url))));
process.stdout.write(
  `Verified deployed GitHub Pages site and all ${EXPECTED_PDF_COUNT} PDF downloads.\n`,
);
