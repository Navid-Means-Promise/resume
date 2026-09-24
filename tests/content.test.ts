import assert from "node:assert/strict";
import test from "node:test";

import { ContentRepository } from "../scripts/content.ts";
import { EDITION_ORDER, LOCALE_OUTPUTS } from "../scripts/config.ts";

test("all localized content satisfies the shared contract", async () => {
  const contents = await new ContentRepository().loadAll();

  assert.deepEqual(
    contents.map(({ locale }) => locale.code),
    LOCALE_OUTPUTS.map(({ code }) => code),
  );
  for (const content of contents) {
    assert.deepEqual(
      content.editions.map(({ slug }) => slug),
      EDITION_ORDER,
    );
    assert.ok(content.profile.experience.length > 0);
    assert.ok(content.profile.education.length > 0);
    const referencedProjects = new Set(
      content.editions.flatMap((edition) => edition.projectKeys ?? []),
    );
    for (const projectKey of Object.keys(content.profile.projects)) {
      assert.ok(
        referencedProjects.has(projectKey),
        `project ${projectKey} is not referenced by any ${content.locale.code} resume`,
      );
    }
    for (const edition of content.editions) {
      assert.match(edition.cardNote, /^\p{Extended_Pictographic}\uFE0F?/u);
      assert.doesNotMatch(edition.role, /(?:\bSenior\b|مهندس ارشد)/u);
    }
  }
});
