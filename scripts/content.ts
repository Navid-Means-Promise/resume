import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  EDITION_ORDER,
  LOCALE_OUTPUTS,
  ROOT_DIRECTORY,
  type EditionSlug,
  type LocaleCode,
} from "./config.ts";
import type {
  Education,
  Experience,
  LocaleContent,
  LocaleStrings,
  Project,
  Publication,
  ResumeEdition,
  ResumeLocale,
  ResumeProfile,
  SkillGroup,
} from "./types.ts";

type JsonObject = Record<string, unknown>;

const LOCALE_STRING_KEYS = [
  "resumeEditions",
  "languageSelection",
  "allEditions",
  "downloadPdf",
  "technicalToolkit",
  "education",
  "engineeringPrinciples",
  "professionalExperience",
  "careerRange",
  "relevantWork",
  "openSourceProject",
  "editionWord",
  "focusedResume",
  "additionalDetail",
  "libraryEyebrow",
  "libraryTitle",
  "libraryLede",
  "focusedEditions",
  "focusedEditionsLineOne",
  "focusedEditionsLineTwo",
  "libraryHint",
  "openResume",
  "libraryMeta",
  "portraitAlt",
  "documentSeries",
  "pageOne",
  "profileThesis",
  "scopeResearchAndSkills",
  "scopeTechnicalSkills",
  "academicGrounding",
  "continuousInquiry",
  "ongoingResearch",
  "acceptedResearch",
  "capabilityDomains",
] as const satisfies readonly (keyof LocaleStrings)[];

function fail(location: string, message: string): never {
  throw new Error(`Invalid content at ${location}: ${message}`);
}

function objectAt(value: unknown, location: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(location, "expected an object");
  }
  return value as JsonObject;
}

function stringAt(value: unknown, location: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    return fail(location, "expected a non-empty string");
  }
  return value;
}

function booleanAt(value: unknown, location: string): boolean {
  if (typeof value !== "boolean") return fail(location, "expected a boolean");
  return value;
}

function arrayAt<T>(
  value: unknown,
  location: string,
  parseItem: (item: unknown, itemLocation: string) => T,
): T[] {
  if (!Array.isArray(value)) return fail(location, "expected an array");
  return value.map((item, index) => parseItem(item, `${location}[${index}]`));
}

function stringArrayAt(value: unknown, location: string): string[] {
  return arrayAt(value, location, stringAt);
}

function optionalStringArrayAt(value: unknown, location: string): string[] | undefined {
  return value === undefined ? undefined : stringArrayAt(value, location);
}

function stringRecordAt(value: unknown, location: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const record = objectAt(value, location);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, stringAt(item, `${location}.${key}`)]),
  );
}

function stringArrayRecordAt(
  value: unknown,
  location: string,
): Record<string, string[]> | undefined {
  if (value === undefined) return undefined;
  const record = objectAt(value, location);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      stringArrayAt(item, `${location}.${key}`),
    ]),
  );
}

function parseExperience(value: unknown, location: string): Experience {
  const item = objectAt(value, location);
  return {
    id: stringAt(item.id, `${location}.id`),
    role: stringAt(item.role, `${location}.role`),
    organization: stringAt(item.organization, `${location}.organization`),
    period: stringAt(item.period, `${location}.period`),
    bullets: stringArrayAt(item.bullets, `${location}.bullets`),
  };
}

function parseEducation(value: unknown, location: string): Education {
  const item = objectAt(value, location);
  return {
    degree: stringAt(item.degree, `${location}.degree`),
    school: stringAt(item.school, `${location}.school`),
    year: stringAt(item.year, `${location}.year`),
  };
}

function parseProject(value: unknown, location: string): Project {
  const item = objectAt(value, location);
  const url = item.url === undefined ? undefined : stringAt(item.url, `${location}.url`);
  const kind = item.kind === undefined ? undefined : stringAt(item.kind, `${location}.kind`);
  return {
    name: stringAt(item.name, `${location}.name`),
    ...(url === undefined ? {} : { url }),
    ...(kind === undefined ? {} : { kind }),
    description: stringAt(item.description, `${location}.description`),
    tags: stringArrayAt(item.tags, `${location}.tags`),
  };
}

function parsePublication(value: unknown, location: string): Publication {
  const item = objectAt(value, location);
  return {
    title: stringAt(item.title, `${location}.title`),
    venue: stringAt(item.venue, `${location}.venue`),
    year: stringAt(item.year, `${location}.year`),
    url: stringAt(item.url, `${location}.url`),
    context: stringAt(item.context, `${location}.context`),
  };
}

function parseProfile(value: unknown, location: string): ResumeProfile {
  const item = objectAt(value, location);
  const projects = objectAt(item.projects, `${location}.projects`);
  const academicProfile = objectAt(item.academicProfile, `${location}.academicProfile`);
  return {
    name: stringAt(item.name, `${location}.name`),
    initials: stringAt(item.initials, `${location}.initials`),
    location: stringAt(item.location, `${location}.location`),
    phone: stringAt(item.phone, `${location}.phone`),
    phoneHref: stringAt(item.phoneHref, `${location}.phoneHref`),
    email: stringAt(item.email, `${location}.email`),
    availability: stringAt(item.availability, `${location}.availability`),
    careerStart: stringAt(item.careerStart, `${location}.careerStart`),
    codingStart: stringAt(item.codingStart, `${location}.codingStart`),
    principles: stringArrayAt(item.principles, `${location}.principles`),
    experience: arrayAt(item.experience, `${location}.experience`, parseExperience),
    education: arrayAt(item.education, `${location}.education`, parseEducation),
    projects: Object.fromEntries(
      Object.entries(projects).map(([key, project]) => [
        key,
        parseProject(project, `${location}.projects.${key}`),
      ]),
    ),
    publication: parsePublication(item.publication, `${location}.publication`),
    academicProfile: {
      overview: stringAt(academicProfile.overview, `${location}.academicProfile.overview`),
      continuousPractice: stringAt(
        academicProfile.continuousPractice,
        `${location}.academicProfile.continuousPractice`,
      ),
      ongoingPublications: stringAt(
        academicProfile.ongoingPublications,
        `${location}.academicProfile.ongoingPublications`,
      ),
    },
  };
}

function parseSkillGroup(value: unknown, location: string): SkillGroup {
  const item = objectAt(value, location);
  return {
    name: stringAt(item.name, `${location}.name`),
    items: stringArrayAt(item.items, `${location}.items`),
  };
}

function parseEdition(value: unknown, location: string, expectedSlug: EditionSlug): ResumeEdition {
  const item = objectAt(value, location);
  const slug = stringAt(item.slug, `${location}.slug`);
  if (slug !== expectedSlug) fail(`${location}.slug`, `expected ${expectedSlug}, received ${slug}`);
  const headline = arrayAt(item.headline, `${location}.headline`, stringAt);
  if (headline.length !== 2) fail(`${location}.headline`, "expected exactly two lines");
  const accent = stringAt(item.accent, `${location}.accent`);
  const accentSoft = stringAt(item.accentSoft, `${location}.accentSoft`);
  for (const [key, color] of [["accent", accent], ["accentSoft", accentSoft]] as const) {
    if (!/^#[0-9a-f]{6}$/iu.test(color)) fail(`${location}.${key}`, "expected a six-digit hex color");
  }
  const experienceOrder = optionalStringArrayAt(item.experienceOrder, `${location}.experienceOrder`);
  const experienceRoles = stringRecordAt(item.experienceRoles, `${location}.experienceRoles`);
  const experienceFocus = stringArrayRecordAt(item.experienceFocus, `${location}.experienceFocus`);
  const projectKeys = optionalStringArrayAt(item.projectKeys, `${location}.projectKeys`);
  return {
    slug,
    label: stringAt(item.label, `${location}.label`),
    role: stringAt(item.role, `${location}.role`),
    headline: [headline[0]!, headline[1]!],
    summary: stringAt(item.summary, `${location}.summary`),
    accent,
    accentSoft,
    skillGroups: arrayAt(item.skillGroups, `${location}.skillGroups`, parseSkillGroup),
    ...(experienceOrder === undefined ? {} : { experienceOrder }),
    ...(experienceRoles === undefined ? {} : { experienceRoles }),
    ...(experienceFocus === undefined ? {} : { experienceFocus }),
    ...(projectKeys === undefined ? {} : { projectKeys }),
    includePublication: booleanAt(item.includePublication, `${location}.includePublication`),
  };
}

function parseLocale(value: unknown, location: string, expectedCode: LocaleCode): ResumeLocale {
  const item = objectAt(value, location);
  const code = stringAt(item.code, `${location}.code`);
  if (code !== expectedCode) fail(`${location}.code`, `expected ${expectedCode}, received ${code}`);
  const direction = stringAt(item.direction, `${location}.direction`);
  const expectedDirection = code === "fa" ? "rtl" : "ltr";
  if (direction !== expectedDirection) {
    fail(`${location}.direction`, `expected ${expectedDirection}, received ${direction}`);
  }
  const strings = objectAt(item.strings, `${location}.strings`);
  const actualKeys = Object.keys(strings).sort();
  const expectedKeys = [...LOCALE_STRING_KEYS].sort();
  if (actualKeys.join("\0") !== expectedKeys.join("\0")) {
    fail(`${location}.strings`, "message keys do not match the typed catalog");
  }
  const parsedStrings = Object.fromEntries(
    LOCALE_STRING_KEYS.map((key) => [key, stringAt(strings[key], `${location}.strings.${key}`)]),
  ) as unknown as LocaleStrings;
  return {
    code,
    direction,
    nativeName: stringAt(item.nativeName, `${location}.nativeName`),
    alternateLocaleLabel: stringAt(
      item.alternateLocaleLabel,
      `${location}.alternateLocaleLabel`,
    ),
    profilePath: stringAt(item.profilePath, `${location}.profilePath`),
    generalPath: stringAt(item.generalPath, `${location}.generalPath`),
    specializedDirectory: stringAt(
      item.specializedDirectory,
      `${location}.specializedDirectory`,
    ),
    strings: parsedStrings,
  };
}

function assertUnique(values: string[], location: string): void {
  if (new Set(values).size !== values.length) fail(location, "values must be unique");
}

function validateReferences(content: LocaleContent): void {
  const experienceIds = content.profile.experience.map(({ id }) => id);
  const projectKeys = new Set(Object.keys(content.profile.projects));
  assertUnique(experienceIds, `${content.locale.code}.profile.experience.id`);

  for (const edition of content.editions) {
    for (const id of edition.experienceOrder ?? []) {
      if (!experienceIds.includes(id)) fail(`${content.locale.code}.${edition.slug}`, `unknown experience ${id}`);
    }
    for (const id of Object.keys(edition.experienceRoles ?? {})) {
      if (!experienceIds.includes(id)) fail(`${content.locale.code}.${edition.slug}`, `unknown experience ${id}`);
    }
    for (const id of Object.keys(edition.experienceFocus ?? {})) {
      if (!experienceIds.includes(id)) fail(`${content.locale.code}.${edition.slug}`, `unknown experience ${id}`);
    }
    for (const key of edition.projectKeys ?? []) {
      if (!projectKeys.has(key)) fail(`${content.locale.code}.${edition.slug}`, `unknown project ${key}`);
    }
  }
}

function assertLocaleParity(contents: LocaleContent[]): void {
  const [reference, ...others] = contents;
  if (!reference) fail("locales", "at least one locale is required");
  for (const content of others) {
    const comparisons = [
      [reference.editions.map(({ slug }) => slug), content.editions.map(({ slug }) => slug), "editions"],
      [reference.profile.experience.map(({ id }) => id), content.profile.experience.map(({ id }) => id), "experience"],
      [Object.keys(reference.profile.projects), Object.keys(content.profile.projects), "projects"],
    ] as const;
    for (const [expected, actual, name] of comparisons) {
      if (expected.join("\0") !== actual.join("\0")) {
        fail(`locales.${content.locale.code}.${name}`, "does not match the default locale");
      }
    }
  }
}

export class ContentRepository {
  public constructor(private readonly rootDirectory = ROOT_DIRECTORY) {}

  private async readJson(relativePath: string): Promise<unknown> {
    const source = await readFile(path.join(this.rootDirectory, relativePath), "utf8");
    return JSON.parse(source) as unknown;
  }

  public async loadAll(): Promise<LocaleContent[]> {
    const contents = await Promise.all(
      LOCALE_OUTPUTS.map(async ({ code }) => {
        const localePath = `content/locales/${code}.json`;
        const locale = parseLocale(await this.readJson(localePath), localePath, code);
        const profile = parseProfile(
          await this.readJson(locale.profilePath),
          locale.profilePath,
        );
        const editions = await Promise.all(
          EDITION_ORDER.map(async (slug) => {
            const editionPath =
              slug === "general"
                ? locale.generalPath
                : `${locale.specializedDirectory}/${slug}.json`;
            return parseEdition(await this.readJson(editionPath), editionPath, slug);
          }),
        );
        const content = { editions, locale, profile } satisfies LocaleContent;
        validateReferences(content);
        return content;
      }),
    );
    assertLocaleParity(contents);
    return contents;
  }
}
