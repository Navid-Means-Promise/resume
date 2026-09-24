import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIRECTORY = path.resolve(scriptDirectory, "..");
export const DIST_DIRECTORY = path.join(ROOT_DIRECTORY, "dist");

export const ASSET_PATHS = {
  stylesheet: "assets/styles/resume.css",
  scripts: {
    persianAligner: "assets/scripts/persian-aligner.js",
  },
  header: {
    background: "assets/images/header/header-background-v1.webp",
    composite: "assets/images/header/header-composite-v1.webp",
    portrait: "assets/images/header/portrait-cutout-v1.webp",
  },
  libraryPortrait: {
    en: "assets/images/pencil/portrait-v4.webp",
    fa: "assets/images/pencil/portrait-v4-rtl.webp",
  },
  fonts: [
    "assets/fonts/estedad/Estedad-Arabic-Variable.woff2",
    "assets/fonts/estedad/Estedad-Latin-Variable.woff2",
    "assets/fonts/vazirmatn/Vazirmatn-Regular.woff2",
    "assets/fonts/vazirmatn/Vazirmatn-SemiBold.woff2",
    "assets/fonts/vazirmatn/Vazirmatn-ExtraBold.woff2",
  ],
} as const;

export const BINARY_ASSET_PATHS = [
  ASSET_PATHS.scripts.persianAligner,
  ASSET_PATHS.header.background,
  ASSET_PATHS.header.composite,
  ASSET_PATHS.header.portrait,
  ASSET_PATHS.libraryPortrait.en,
  ASSET_PATHS.libraryPortrait.fa,
  ...ASSET_PATHS.fonts,
] as const;

export const EDITION_ORDER = [
  "general",
  "ai-data",
  "python-engineering",
  "typescript-fullstack",
  "java-backend",
  "security-devops",
  "embedded-systems",
] as const;

export type EditionSlug = (typeof EDITION_ORDER)[number];

export const LOCALE_OUTPUTS = [
  { code: "en", outputPrefix: "" },
  { code: "fa", outputPrefix: "fa" },
] as const;

export type LocaleCode = (typeof LOCALE_OUTPUTS)[number]["code"];

export function getPdfFilename(locale: LocaleCode, slug: EditionSlug): string {
  const suffix = locale === "fa" ? "-fa" : "";
  return `navid-mohammadi-${slug}-resume${suffix}.pdf`;
}
