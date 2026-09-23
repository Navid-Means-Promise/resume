# Image provenance

Only the five optimized images used by the generated site are retained. They are local assets with no runtime dependency on an image CDN.

| Asset | Purpose | Provenance |
| --- | --- | --- |
| `header/header-background-v1.webp` | Screen resume header background | Generated editorial watercolor/graphite study |
| `header/portrait-cutout-v1.webp` | Transparent screen portrait layer | Identity-preserving generated portrait cutout; converted from the generated PNG master with `cwebp 1.5.0 -q 88 -alpha_q 100 -m 6 -metadata none` |
| `header/header-composite-v1.webp` | Opaque PDF-safe header composite | Generated from the same approved header study |
| `pencil/portrait-v4.webp` | English landing-page portrait | Identity-preserving graphite-and-watercolor portrait derived from supplied photos |
| `pencil/portrait-v4-rtl.webp` | Persian landing-page portrait | Mirrored delivery variant of `portrait-v4.webp` |

The art direction is restrained graphite and ink on warm ivory paper, with muted teal/copper watercolor and no text, logos, trademarks, or watermarks. The generated portraits were reviewed for likeness and crop safety. Source photos, intermediate studies, superseded variants, and the legacy card illustrations are deliberately excluded from the runtime repository.

The authoritative runtime paths live in `scripts/config.ts`; the builder copies only those declared files and appends deterministic content hashes to generated URLs.
