import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ContentRepository } from "./content.ts";
import { renderSkillIcon } from "./skill-icons.ts";
import {
  ASSET_PATHS,
  BINARY_ASSET_PATHS,
  DIST_DIRECTORY,
  EDITION_ORDER,
  LOCALE_OUTPUTS,
  ROOT_DIRECTORY,
  getPdfFilename,
} from "./config.ts";
import type {
  Education,
  Experience,
  LocaleContent,
  LocaleStrings,
  Project,
  ResumeEdition,
  ResumeLocale,
  ResumeProfile,
  SkillGroup,
} from "./types.ts";

type LocaleOutput = (typeof LOCALE_OUTPUTS)[number];
type TemplateValues = Record<string, string>;

interface BuildContext {
  assetVersions: ReadonlyMap<string, string>;
  editions: ResumeEdition[];
  locale: ResumeLocale;
  localeOutput: LocaleOutput;
  profile: ResumeProfile;
  template: string;
}

const TRUSTED_HTML_KEYS = new Set([
  "academicDossier",
  "educationEntries",
  "evidence",
  "experienceEntries",
  "headline",
  "principles",
  "skills",
  "variantLinks",
]);

const LOCALIZED_TEXT_KEYS = new Set([
  "academicGrounding",
  "academicOverview",
  "academicPractice",
  "additionalDetail",
  "allEditions",
  "alternateLocaleLabel",
  "availability",
  "capabilityDomains",
  "careerRange",
  "continuousInquiry",
  "documentSeries",
  "downloadPdf",
  "editionWord",
  "education",
  "engineeringPrinciples",
  "focusedResume",
  "label",
  "location",
  "name",
  "ongoingPublications",
  "ongoingResearch",
  "pageOne",
  "professionalExperience",
  "profileThesis",
  "role",
  "scopeAndEvidence",
  "summary",
  "technicalToolkit",
]);

const LTR_RUN_PATTERN =
  /(?:\.[A-Za-z]|[A-Za-z0-9])(?:[A-Za-z0-9+#._:@/-]*[A-Za-z0-9+#])?(?:[ \t]+(?:[+&/↔-][ \t]+)?(?:\.[A-Za-z]|[A-Za-z0-9])(?:[A-Za-z0-9+#._:@/-]*[A-Za-z0-9+#])?)*/gu;

// Prevent a visible reflow before the runtime aligner measures the loaded Persian font.
// Canonical copy remains keshide-free in the locale catalog and data-original-text.
const PERSIAN_FOCUSED_EDITIONS_INITIAL_LINE_ONE = "رزومـه‌هـای تـخـصـصی من";
const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

function escapeHtml(value: unknown = ""): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localizeDigits(value: string, direction: ResumeLocale["direction"]): string {
  if (direction !== "rtl") return value;
  return value.replace(/[0-9]/gu, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

function renderLocalizedText(
  value: unknown,
  direction: ResumeLocale["direction"],
): string {
  const source = String(value ?? "");
  if (direction !== "rtl") return escapeHtml(source);
  const renderChunk = (chunk: string): string => escapeHtml(localizeDigits(chunk, direction));

  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(LTR_RUN_PATTERN)) {
    const index = match.index;
    output += renderChunk(source.slice(cursor, index));
    output += `<bdi dir="ltr" lang="en">${escapeHtml(match[0])}</bdi>`;
    cursor = index + match[0].length;
  }
  return output + renderChunk(source.slice(cursor));
}

function formatLocalized(value: string, replacements: Record<string, string>): string {
  return value.replace(/\{([A-Za-z]+)\}/g, (_match, key: string) => replacements[key] ?? "");
}

function textLanguage(value: string): "fa" | "en" {
  return /[\u0600-\u06ff]/u.test(value) ? "fa" : "en";
}

function portraitArt(locale: ResumeLocale): string {
  return locale.direction === "rtl"
    ? ASSET_PATHS.libraryPortrait.fa
    : ASSET_PATHS.libraryPortrait.en;
}

function renderSkills(
  groups: SkillGroup[],
  editionSlug: string,
  direction: ResumeLocale["direction"],
): string {
  return groups
    .map(
      (group, index) => `
        <article class="skill-domain">
          ${renderSkillIcon(editionSlug, index)}
          <h3>${renderLocalizedText(group.name, direction)}</h3>
          <ul class="skill-list">
            ${group.items
              .map(
                (item) =>
                  `<li lang="${textLanguage(item)}">${renderLocalizedText(item, direction)}</li>`,
              )
              .join("")}
          </ul>
        </article>`,
    )
    .join("");
}

function renderEducation(
  items: Education[],
  direction: ResumeLocale["direction"],
): string {
  return items
    .map(
      (item) => `
        <div class="education-entry">
          <h3>${renderLocalizedText(item.degree, direction)}</h3>
          <p>${renderLocalizedText(item.school, direction)} · <time>${renderLocalizedText(item.year, direction)}</time></p>
        </div>`,
    )
    .join("");
}

function renderPrinciples(
  principles: string[],
  direction: ResumeLocale["direction"],
): string {
  return `<ul class="principle-list">${principles
    .map((principle) => `<li>${renderLocalizedText(principle, direction)}</li>`)
    .join("")}</ul>`;
}

function renderHeadline(
  lines: [string, string],
  direction: ResumeLocale["direction"],
): string {
  return lines
    .map((line) => `<span class="headline-line">${renderLocalizedText(line, direction)}</span>`)
    .join("");
}

function orderedExperience(
  profile: ResumeProfile,
  edition: ResumeEdition,
): Experience[] {
  if (!edition.experienceOrder) return profile.experience;

  const byId = new Map(profile.experience.map((entry) => [entry.id, entry]));
  return edition.experienceOrder
    .map((id) => byId.get(id))
    .filter((entry): entry is Experience => entry !== undefined);
}

function renderExperience(
  profile: ResumeProfile,
  edition: ResumeEdition,
  direction: ResumeLocale["direction"],
): string {
  return orderedExperience(profile, edition)
    .map((entry) => {
      const bullets = edition.experienceFocus?.[entry.id] ?? entry.bullets;
      const role = edition.experienceRoles?.[entry.id] ?? entry.role;
      return `
        <article class="experience-entry">
          <div class="experience-date">
            <time>${renderLocalizedText(entry.period, direction)}</time>
          </div>
          <div class="experience-copy">
            <header>
            <h3>${renderLocalizedText(role, direction)}</h3>
            <span class="org">${renderLocalizedText(entry.organization, direction)}</span>
            </header>
            <ul>${bullets.map((bullet) => `<li>${renderLocalizedText(bullet, direction)}</li>`).join("")}</ul>
          </div>
        </article>`;
    })
    .join("");
}

function renderProject(
  project: Project,
  strings: LocaleStrings,
  direction: ResumeLocale["direction"],
): string {
  const title = project.url
    ? `<a href="${escapeHtml(project.url)}">${renderLocalizedText(project.name, direction)}</a>`
    : renderLocalizedText(project.name, direction);
  return `
    <article class="evidence-item project-card">
      <p class="evidence-kind">${renderLocalizedText(project.kind ?? strings.openSourceProject, direction)}</p>
      <h3>${title}</h3>
      <p>${renderLocalizedText(project.description, direction)}</p>
      <p class="tag-line">${project.tags.map((tag) => renderLocalizedText(tag, direction)).join(" · ")}</p>
    </article>`;
}

function renderPublication(
  profile: ResumeProfile,
  strings: LocaleStrings,
  direction: ResumeLocale["direction"],
): string {
  const item = profile.publication;
  return `
    <article class="publication-record">
      <span>${renderLocalizedText(strings.acceptedResearch, direction)}</span>
      <div>
        <h3><a href="${escapeHtml(item.url)}">${renderLocalizedText(item.title, direction)}</a></h3>
        <p>${renderLocalizedText(item.context, direction)}</p>
        <p class="evidence-citation">${renderLocalizedText(item.venue, direction)} · ${renderLocalizedText(item.year, direction)}</p>
      </div>
    </article>`;
}

function renderAcademicDossier(
  profile: ResumeProfile,
  strings: LocaleStrings,
  direction: ResumeLocale["direction"],
  includePublication: boolean,
): string {
  if (!includePublication) return "";

  return `
    <section class="academic-dossier" aria-labelledby="academic-heading">
      <div class="academic-intro">
        <h2 id="academic-heading">${renderLocalizedText(strings.academicGrounding, direction)}</h2>
        <p>${renderLocalizedText(profile.academicProfile.overview, direction)}</p>
      </div>
      <div class="academic-stream">
        <div>
          <span>${renderLocalizedText(strings.continuousInquiry, direction)}</span>
          <p>${renderLocalizedText(profile.academicProfile.continuousPractice, direction)}</p>
        </div>
        <div>
          <span>${renderLocalizedText(strings.ongoingResearch, direction)}</span>
          <p>${renderLocalizedText(profile.academicProfile.ongoingPublications, direction)}</p>
        </div>
      </div>
      ${renderPublication(profile, strings, direction)}
    </section>`;
}

function renderEvidence(
  profile: ResumeProfile,
  edition: ResumeEdition,
  strings: LocaleStrings,
  direction: ResumeLocale["direction"],
): string {
  const items = (edition.projectKeys ?? [])
    .map((key) => profile.projects[key])
    .filter((project): project is Project => project !== undefined)
    .map((project) => renderProject(project, strings, direction));
  if (items.length === 0) return "";

  return `
    <section class="evidence-section" aria-labelledby="evidence-heading">
      <div class="section-title-row">
        <div>
          <h2 id="evidence-heading">${renderLocalizedText(strings.relevantWork, direction)}</h2>
        </div>
        <span class="section-index">E</span>
      </div>
      <div class="evidence-list" data-count="${items.length}">${items.join("")}</div>
    </section>`;
}

function renderVariantLinks(
  editions: ResumeEdition[],
  activeSlug: string,
  direction: ResumeLocale["direction"],
): string {
  return editions
    .map(
      (edition) =>
        `<a href="../${escapeHtml(edition.slug)}/"${
          edition.slug === activeSlug ? ' aria-current="page"' : ""
        }>${renderLocalizedText(edition.label, direction)}</a>`,
    )
    .join("");
}

function editionAssetPrefix(localeOutput: LocaleOutput): string {
  return localeOutput.outputPrefix ? "../.." : "..";
}

function editionAlternateHref(locale: ResumeLocale, slug: string): string {
  return locale.code === "en" ? `../fa/${slug}/` : `../../${slug}/`;
}

function libraryAlternateHref(locale: ResumeLocale): string {
  return locale.code === "en" ? "./fa/" : "../";
}

function assetHref(
  prefix: string,
  assetPath: string,
  versions: ReadonlyMap<string, string>,
): string {
  const version = versions.get(assetPath);
  if (!version) throw new Error(`Missing generated asset version for ${assetPath}`);
  return `${prefix}/${assetPath}?v=${version}`;
}

function renderEdition(context: BuildContext, edition: ResumeEdition): string {
  const { assetVersions, editions, locale, localeOutput, profile, template } = context;
  const strings = locale.strings;
  const hasEvidence = Boolean((edition.projectKeys ?? []).length);
  const pageTwoScope = edition.includePublication
    ? strings.scopeResearchAndSkills
    : strings.scopeTechnicalSkills;
  const values: TemplateValues = {
    accent: edition.accent,
    accentSoft: edition.accentSoft,
    academicGrounding: strings.academicGrounding,
    academicDossier: renderAcademicDossier(
      profile,
      strings,
      locale.direction,
      edition.includePublication,
    ),
    academicOverview: profile.academicProfile.overview,
    academicPractice: profile.academicProfile.continuousPractice,
    additionalDetail: strings.additionalDetail,
    allEditions: strings.allEditions,
    alternateLocaleCode: locale.code === "en" ? "fa" : "en",
    alternateLocaleHref: editionAlternateHref(locale, edition.slug),
    alternateLocaleLabel: locale.alternateLocaleLabel,
    availability: profile.availability,
    capabilityDomains: strings.capabilityDomains,
    careerRange: strings.careerRange,
    direction: locale.direction,
    documentSeries: strings.documentSeries,
    documentTitle: `${profile.name} — ${edition.role}`,
    downloadPdf: strings.downloadPdf,
    education: strings.education,
    educationEntries: renderEducation(profile.education, locale.direction),
    editionWord: strings.editionWord,
    email: profile.email,
    engineeringPrinciples: strings.engineeringPrinciples,
    evidence: renderEvidence(profile, edition, strings, locale.direction),
    experienceEntries: renderExperience(profile, edition, locale.direction),
    focusedResume: strings.focusedResume,
    hasEvidence: String(hasEvidence),
    headerBackgroundSrc: assetHref(
      editionAssetPrefix(localeOutput),
      ASSET_PATHS.header.background,
      assetVersions,
    ),
    headerCompositeSrc: assetHref(
      editionAssetPrefix(localeOutput),
      ASSET_PATHS.header.composite,
      assetVersions,
    ),
    headerPortraitSrc: assetHref(
      editionAssetPrefix(localeOutput),
      ASSET_PATHS.header.portrait,
      assetVersions,
    ),
    headline: renderHeadline(edition.headline, locale.direction),
    label: edition.label,
    language: locale.code,
    location: profile.location,
    metaDescription: `${profile.name}${locale.code === "fa" ? "،" : ","} ${edition.role}. ${edition.summary}`,
    name: profile.name,
    ongoingPublications: profile.academicProfile.ongoingPublications,
    ongoingResearch: strings.ongoingResearch,
    pageOne: strings.pageOne,
    pageOneNumber: localizeDigits("01", locale.direction),
    pageOneOfTwo: localizeDigits("01/02", locale.direction),
    pageTwoNumber: localizeDigits("02", locale.direction),
    pdfFilename: getPdfFilename(locale.code, edition.slug as (typeof EDITION_ORDER)[number]),
    phone: profile.phone,
    phoneHref: profile.phoneHref,
    portraitAlt: formatLocalized(strings.portraitAlt, { name: profile.name }),
    profileThesis: strings.profileThesis,
    principles: renderPrinciples(profile.principles, locale.direction),
    professionalExperience: strings.professionalExperience,
    resumeEditions: strings.resumeEditions,
    role: edition.role,
    scopeAndEvidence: pageTwoScope,
    skills: renderSkills(edition.skillGroups, edition.slug, locale.direction),
    skillGroupCount: String(edition.skillGroups.length),
    slug: edition.slug,
    summary: edition.summary,
    stylesheetHref: assetHref(
      editionAssetPrefix(localeOutput),
      ASSET_PATHS.stylesheet,
      assetVersions,
    ),
    technicalToolkit: strings.technicalToolkit,
    continuousInquiry: strings.continuousInquiry,
    variantLinks: renderVariantLinks(editions, edition.slug, locale.direction),
  };

  return template.replace(/\{\{([A-Za-z]+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Missing template value: ${key}`);
    if (TRUSTED_HTML_KEYS.has(key)) return value;
    if (LOCALIZED_TEXT_KEYS.has(key)) {
      return renderLocalizedText(value, locale.direction);
    }
    return escapeHtml(value);
  });
}

function renderLibrary(context: BuildContext): string {
  const { assetVersions, editions, locale, localeOutput, profile } = context;
  const strings = locale.strings;
  const assetPrefix = localeOutput.outputPrefix ? ".." : ".";
  const renderCard = (edition: ResumeEdition, index: number): string => `
        <article class="edition-card" style="--card-accent: ${escapeHtml(edition.accent)}">
          <div class="edition-card-index" aria-hidden="true">${localizeDigits(String(index + 1).padStart(2, "0"), locale.direction)}</div>
          <div class="edition-card-copy">
            <p class="section-kicker">${renderLocalizedText(edition.cardNote, locale.direction)}</p>
            <h3>${renderLocalizedText(edition.cardTitle ?? edition.role, locale.direction)}</h3>
            <p>${renderLocalizedText(edition.headline.join(" "), locale.direction)}</p>
            <div class="edition-actions">
              <a class="open-label" data-primary-action href="./${escapeHtml(edition.slug)}/">${renderLocalizedText(strings.openResume, locale.direction)}</a>
              <a class="pdf-label" data-primary-action href="./${escapeHtml(edition.slug)}/${escapeHtml(getPdfFilename(locale.code, edition.slug as (typeof EDITION_ORDER)[number]))}" download>${renderLocalizedText(strings.downloadPdf, locale.direction)}</a>
            </div>
          </div>
        </article>`;
  const generalEdition = editions.find(({ slug }) => slug === "general");
  if (!generalEdition) throw new Error("Missing general resume edition");
  const generalCard = renderCard(generalEdition, editions.indexOf(generalEdition));
  const specializedCards = editions
    .filter(({ slug }) => slug !== "general")
    .map((edition) => renderCard(edition, editions.indexOf(edition)))
    .join("");
  const libraryReplacements = { location: profile.location, name: profile.name };
  const libraryEyebrow = formatLocalized(strings.libraryEyebrow, libraryReplacements);
  const libraryTitle = formatLocalized(strings.libraryTitle, libraryReplacements);
  const libraryLede = formatLocalized(strings.libraryLede, libraryReplacements);
  const libraryMeta = formatLocalized(strings.libraryMeta, libraryReplacements);
  const portraitAlt = formatLocalized(strings.portraitAlt, { name: profile.name });
  const stylesheetHref = assetHref(assetPrefix, ASSET_PATHS.stylesheet, assetVersions);
  const portraitHref = assetHref(assetPrefix, portraitArt(locale), assetVersions);
  const focusedEditionsHeading = locale.code === "fa"
    ? `<span class="sr-only">${escapeHtml(strings.focusedEditions)}</span>
          <span class="persian-align-visual" data-persian-align aria-hidden="true">
            <span class="persian-align-line text-nowrap" data-original-text="${escapeHtml(strings.focusedEditionsLineOne)}">${escapeHtml(PERSIAN_FOCUSED_EDITIONS_INITIAL_LINE_ONE)}</span>
            <span class="persian-align-line text-nowrap" data-original-text="${escapeHtml(strings.focusedEditionsLineTwo)}">${escapeHtml(strings.focusedEditionsLineTwo)}</span>
          </span>`
    : renderLocalizedText(strings.focusedEditions, locale.direction);
  const persianAlignerScript = locale.code === "fa"
    ? `<script defer src="${assetHref(assetPrefix, ASSET_PATHS.scripts.persianAligner, assetVersions)}"></script>`
    : "";

  return `<!doctype html>
<html lang="${escapeHtml(locale.code)}" dir="${escapeHtml(locale.direction)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(libraryMeta)}">
  <title>${escapeHtml(profile.name)} — ${escapeHtml(strings.resumeEditions)}</title>
  <meta name="theme-color" content="#e3e6e2">
  <link rel="alternate" hreflang="${locale.code === "en" ? "fa" : "en"}" href="${libraryAlternateHref(locale)}">
  <link rel="stylesheet" href="${stylesheetHref}">
</head>
<body class="library-page">
  <main class="library-shell">
    <nav class="library-language" aria-label="${escapeHtml(strings.languageSelection)}">
      <a href="${libraryAlternateHref(locale)}" dir="auto">${escapeHtml(locale.alternateLocaleLabel)}</a>
    </nav>
    <header class="library-hero" id="main-content">
      <div>
        <p class="eyebrow">${renderLocalizedText(libraryEyebrow, locale.direction)}</p>
        <h1>${renderLocalizedText(libraryTitle, locale.direction)}</h1>
        <p class="lede">${renderLocalizedText(libraryLede, locale.direction)}</p>
      </div>
      <figure class="library-portrait">
        <img src="${portraitHref}" alt="${escapeHtml(portraitAlt)}" width="1983" height="793" fetchpriority="high">
      </figure>
    </header>

    <section aria-labelledby="editions-heading">
      <div class="library-heading">
        <h2 id="editions-heading">${focusedEditionsHeading}</h2>
        <p>${renderLocalizedText(strings.libraryHint, locale.direction)}</p>
      </div>
      <div class="featured-edition">${generalCard}</div>
      <div class="edition-grid">${specializedCards}</div>
    </section>

    <footer class="library-footer">
      <span><bdi>${escapeHtml(profile.email)}</bdi> · ${renderLocalizedText(profile.location, locale.direction)}</span>
      <span>${renderLocalizedText(profile.availability, locale.direction)}</span>
    </footer>
  </main>
  ${persianAlignerScript}
</body>
</html>`;
}

function shortHash(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

async function copyGeneratedAssets(
  outputDirectory: string,
): Promise<ReadonlyMap<string, string>> {
  const versions = new Map<string, string>();
  await Promise.all(
    BINARY_ASSET_PATHS.map(async (assetPath) => {
      const source = path.join(ROOT_DIRECTORY, assetPath);
      const target = path.join(outputDirectory, assetPath);
      const content = await readFile(source);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      versions.set(assetPath, shortHash(content));
    }),
  );

  const stylesheetSource = path.join(ROOT_DIRECTORY, ASSET_PATHS.stylesheet);
  const stylesheetTarget = path.join(outputDirectory, ASSET_PATHS.stylesheet);
  const stylesheetDirectory = path.posix.dirname(ASSET_PATHS.stylesheet);
  const source = await readFile(stylesheetSource, "utf8");
  const stylesheet = source.replace(/url\("(\.\.\/fonts\/[^"?]+)"\)/gu, (_match, href: string) => {
    const fontPath = path.posix.normalize(path.posix.join(stylesheetDirectory, href));
    const version = versions.get(fontPath);
    if (!version) throw new Error(`Stylesheet references undeclared font asset ${fontPath}`);
    return `url("${href}?v=${version}")`;
  });
  await mkdir(path.dirname(stylesheetTarget), { recursive: true });
  await writeFile(stylesheetTarget, stylesheet);
  versions.set(ASSET_PATHS.stylesheet, shortHash(stylesheet));
  return versions;
}

function createBuildContext(
  content: LocaleContent,
  template: string,
  assetVersions: ReadonlyMap<string, string>,
): BuildContext {
  const localeOutput = LOCALE_OUTPUTS.find(({ code }) => code === content.locale.code);
  if (!localeOutput) throw new Error(`Missing output configuration for ${content.locale.code}`);
  return { ...content, assetVersions, localeOutput, template };
}

export async function buildHtml(outputDirectory = DIST_DIRECTORY): Promise<void> {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const assetVersions = await copyGeneratedAssets(outputDirectory);
  const template = await readFile(path.join(ROOT_DIRECTORY, "templates/resume.html"), "utf8");
  const contents = await new ContentRepository().loadAll();
  await writeFile(path.join(outputDirectory, ".nojekyll"), "");

  for (const content of contents) {
    const context = createBuildContext(content, template, assetVersions);
    const { localeOutput } = context;
    const localeDirectory = path.join(outputDirectory, localeOutput.outputPrefix);
    await mkdir(localeDirectory, { recursive: true });
    await writeFile(path.join(localeDirectory, "index.html"), renderLibrary(context));

    for (const edition of context.editions) {
      const editionDirectory = path.join(localeDirectory, edition.slug);
      await mkdir(editionDirectory, { recursive: true });
      await writeFile(
        path.join(editionDirectory, "index.html"),
        renderEdition(context, edition),
      );
      const relativeDirectory = localeOutput.outputPrefix
        ? `${localeOutput.outputPrefix}/${edition.slug}`
        : edition.slug;
      process.stdout.write(`built dist/${relativeDirectory}/index.html\n`);
    }

    const libraryPath = localeOutput.outputPrefix
      ? `dist/${localeOutput.outputPrefix}/index.html`
      : "dist/index.html";
    process.stdout.write(`built ${libraryPath}\n`);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await buildHtml();
}
