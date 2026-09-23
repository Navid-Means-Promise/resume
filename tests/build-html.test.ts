import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildHtml } from "../scripts/build-html.ts";
import { ASSET_PATHS, EDITION_ORDER, LOCALE_OUTPUTS } from "../scripts/config.ts";

test("the static build is complete and subpath-safe", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "resume-site-test-"));
  try {
    await buildHtml(outputDirectory);
    await access(path.join(outputDirectory, ".nojekyll"));
    await access(path.join(outputDirectory, ASSET_PATHS.header.portrait));

    for (const { code, outputPrefix } of LOCALE_OUTPUTS) {
      const library = await readFile(
        path.join(outputDirectory, outputPrefix, "index.html"),
        "utf8",
      );
      assert.match(library, /assets\/styles\/resume\.css\?v=[0-9a-f]{12}/u);
      assert.equal(
        (library.match(/<a\b[^>]*\sdownload(?:>|\s)/gu) ?? []).length,
        EDITION_ORDER.length,
      );

      for (const slug of EDITION_ORDER) {
        const page = await readFile(
          path.join(outputDirectory, outputPrefix, slug, "index.html"),
          "utf8",
        );
        assert.match(page, new RegExp(`data-locale="${code}"`, "u"));
        assert.doesNotMatch(page, /portrait-cutout-v1\.png/u);
        assert.doesNotMatch(page, /\{\{/u);
      }
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
