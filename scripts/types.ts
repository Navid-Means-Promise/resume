export interface Education {
  degree: string;
  school: string;
  year: string;
}

export interface Experience {
  id: string;
  role: string;
  organization: string;
  period: string;
  bullets: string[];
}

export interface Project {
  name: string;
  url?: string;
  kind?: string;
  description: string;
  tags: string[];
}

export interface Publication {
  title: string;
  venue: string;
  year: string;
  url: string;
  context: string;
}

export interface AcademicProfile {
  overview: string;
  continuousPractice: string;
  ongoingPublications: string;
}

export interface ResumeProfile {
  name: string;
  initials: string;
  location: string;
  phone: string;
  phoneHref: string;
  email: string;
  availability: string;
  careerStart: string;
  codingStart: string;
  principles: string[];
  experience: Experience[];
  education: Education[];
  projects: Record<string, Project>;
  publication: Publication;
  academicProfile: AcademicProfile;
}

export interface SkillGroup {
  name: string;
  items: string[];
}

export interface ResumeEdition {
  slug: string;
  label: string;
  cardNote: string;
  cardTitle?: string;
  role: string;
  headline: [string, string];
  summary: string;
  accent: string;
  accentSoft: string;
  skillGroups: SkillGroup[];
  experienceOrder?: string[];
  experienceRoles?: Record<string, string>;
  experienceFocus?: Record<string, string[]>;
  projectKeys?: string[];
  includePublication: boolean;
}

export interface LocaleStrings {
  resumeEditions: string;
  languageSelection: string;
  allEditions: string;
  downloadPdf: string;
  technicalToolkit: string;
  education: string;
  engineeringPrinciples: string;
  professionalExperience: string;
  careerRange: string;
  relevantWork: string;
  openSourceProject: string;
  editionWord: string;
  focusedResume: string;
  additionalDetail: string;
  libraryEyebrow: string;
  libraryTitle: string;
  libraryLede: string;
  focusedEditions: string;
  focusedEditionsLineOne: string;
  focusedEditionsLineTwo: string;
  libraryHint: string;
  openResume: string;
  libraryMeta: string;
  portraitAlt: string;
  documentSeries: string;
  pageOne: string;
  profileThesis: string;
  scopeResearchAndSkills: string;
  scopeTechnicalSkills: string;
  academicGrounding: string;
  continuousInquiry: string;
  ongoingResearch: string;
  acceptedResearch: string;
  capabilityDomains: string;
}

export interface ResumeLocale {
  code: "en" | "fa";
  direction: "ltr" | "rtl";
  nativeName: string;
  alternateLocaleLabel: string;
  profilePath: string;
  generalPath: string;
  specializedDirectory: string;
  strings: LocaleStrings;
}

export interface LocaleContent {
  editions: ResumeEdition[];
  locale: ResumeLocale;
  profile: ResumeProfile;
}
