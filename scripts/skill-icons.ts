const ICONS = {
  api: '<path d="M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  architecture: '<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v5M6 17v-5h12v5"/>',
  automation: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M9 3h6M8 12h.01M16 12h.01M8 16h8"/>',
  brain: '<path d="M9.5 4.5A3 3 0 0 0 5 7a3.5 3.5 0 0 0-1 6.7A3.2 3.2 0 0 0 8 19a3 3 0 0 0 4 1V4a3 3 0 0 0-2.5.5ZM14.5 4.5A3 3 0 0 1 19 7a3.5 3.5 0 0 1 1 6.7A3.2 3.2 0 0 1 16 19a3 3 0 0 1-4 1"/><path d="M8 8h2M14 8h2M7 14h3M14 14h3"/>',
  brainShield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 7.6 7.5 9.5 4.4-1.9 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="M9 10a2 2 0 0 1 3-1.7A2 2 0 0 1 15 10a2.2 2.2 0 0 1-.5 4A2 2 0 0 1 12 15a2 2 0 0 1-2.5-1A2.2 2.2 0 0 1 9 10Z"/>',
  build: '<path d="m14.5 6.5 3-3a4 4 0 0 1-5 5L6 15l-3 3 3 3 3-3 6.5-6.5a4 4 0 0 1 5-5l-3 3-3-3Z"/>',
  chain: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/><path d="m9 15 6-6"/>',
  chart: '<path d="M4 20V5M4 20h16"/><path d="m7 16 4-5 3 2 5-7"/><circle cx="7" cy="16" r="1"/><circle cx="11" cy="11" r="1"/><circle cx="14" cy="13" r="1"/><circle cx="19" cy="6" r="1"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  circuit: '<path d="M4 6h5l2 3h9M4 18h5l2-3h9M4 12h16"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="9" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="20" cy="15" r="1.5"/>',
  cloud: '<path d="M6.5 19h11a4.5 4.5 0 0 0 .8-8.9A6.5 6.5 0 0 0 6 8.2 5.5 5.5 0 0 0 6.5 19Z"/><path d="M9 15h6M12 12v6"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  contract: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13l2 2 4-4M9 18h6"/>',
  database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  deploy: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M9 6l3-2 3 2"/>',
  devices: '<rect x="3" y="4" width="14" height="10" rx="1.5"/><path d="M8 19h4M10 14v5"/><rect x="17" y="9" width="4" height="11" rx="1"/>',
  framework: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M7 7h10M7 17h10M7 7v10M17 7v10"/>',
  neural: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="m7 7 3.5 3.5M7 17l3.5-3.5M14 11l3.3-4.5M14 13l3.3 4.5"/>',
  observability: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/><path d="m7 12 2-2 2 4 2-4 2 2"/>',
  oscilloscope: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M6 12h3l2-4 3 8 2-4h2M8 21h8"/>',
  package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.2l8 4.6"/>',
  plug: '<path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0ZM12 17v4"/><path d="M4 21h8"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v9l6.5 4M3 12h18"/><circle cx="17" cy="8" r="1.5"/>',
  risk: '<path d="M12 3 2.8 20h18.4Z"/><path d="M12 9v5M12 17h.01"/>',
  scan: '<circle cx="10" cy="10" r="5"/><path d="m14 14 6 6M2 6V2h4M14 2h4v4M2 14v4h4"/><path d="M8 8h4v4H8Z"/>',
  server: '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 7.6 7.5 9.5 4.4-1.9 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  sparkles: '<path d="m12 3 1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2-4.2-1.3 4.2-1.3ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7ZM5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7Z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
  test: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
} as const;

type IconName = keyof typeof ICONS;

const EDITION_ICONS: Record<string, readonly IconName[]> = {
  general: ["code", "architecture", "database", "server", "brain", "shield", "chip"],
  "ai-data": ["neural", "sparkles", "chart", "bot", "deploy"],
  "python-engineering": ["code", "api", "database", "automation", "test", "package", "brain"],
  "typescript-fullstack": ["code", "server", "contract", "devices", "package", "observability", "brain"],
  "java-backend": ["framework", "database", "api", "test", "observability", "architecture", "brain"],
  "security-devops": ["shield", "scan", "risk", "cloud", "chain", "radar", "brainShield"],
  "embedded-systems": ["terminal", "chip", "plug", "circuit", "oscilloscope", "build", "shield", "brainShield"],
};

export function renderSkillIcon(editionSlug: string, index: number): string {
  const iconName = EDITION_ICONS[editionSlug]?.[index] ?? "code";
  return `<svg class="skill-domain-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[iconName]}</svg>`;
}
