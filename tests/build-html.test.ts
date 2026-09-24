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
      assert.equal(
        (library.match(/<p class="section-kicker">/gu) ?? []).length,
        EDITION_ORDER.length,
      );
      assert.match(library, /class="featured-edition"/u);
      assert.doesNotMatch(library, /\bSenior\b/u);
      assert.doesNotMatch(library, /\{(?:location|name)\}/u);
      if (code === "fa") {
        assert.match(library, /<h1>نوید محمدی<\/h1>/u);
        assert.match(library, /رزومه‌های تخصصی من بر اساس حوزه‌های فعالیت/u);
        assert.match(library, /data-persian-align aria-hidden="true"/u);
        assert.match(library, /data-original-text="رزومه‌های تخصصی من"/u);
        assert.match(library, /data-original-text="بر اساس حوزه‌های فعالیت"/u);
        assert.match(library, /رزومـه‌هـای تـخـصـصی من/u);
        assert.equal((library.match(/class="persian-align-line text-nowrap"/gu) ?? []).length, 2);
        assert.match(library, /assets\/scripts\/persian-aligner\.js\?v=[0-9a-f]{12}/u);
        assert.match(library, /class="featured-edition"/u);
        assert.match(library, /🧭 تصویری کلی از مسیر کاری، مهارت‌ها و پروژه‌ها/u);
        assert.match(library, /🐍 برای ابزارها و سرویس‌هایی که قرار است ساده بمانند/u);
        assert.doesNotMatch(library, /مهندس ارشد/u);
        assert.doesNotMatch(library, /نسخهٔ (?:جامع|مهندسی|Java)/u);
        assert.doesNotMatch(library, /رزومهٔ متناسب با موقعیت شغلی/u);
      }

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
