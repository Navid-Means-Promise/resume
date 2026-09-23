# Local font assets

Persian pages use two locally hosted families:

- **Vazirmatn 33.003** for body text and interface labels.
- **Estedad 8.5** for display headings and mixed-script titles.

Only the WOFF2 subsets and weights referenced by the stylesheet are retained. Both families use the SIL Open Font License 1.1; each license is stored beside its files. Runtime fonts use `font-display: swap`, and the builder attaches content-derived cache tokens.

Authoritative sources:

- <https://github.com/rastikerdar/vazirmatn/releases/tag/v33.003>
- <https://github.com/aminabedi68/Estedad> at revision `97d10596b3a260c040336199c2e83a6305d37663` (Estedad 8.5; Fontsource `estedad:vf@5.3.0` delivery files)
