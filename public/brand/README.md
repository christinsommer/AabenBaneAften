# Approved Åben Bane artwork

The icon and mobile assets were extracted without redrawing from the approved design board
`Aaben Bane HIK loginside og logo.png` (1536 × 1024 pixels), supplied on 2026-10-28.

- `classic-icon.png`: the approved racket, ball and court icon, extracted at
  x=1211, y=305, width=274, height=270 and resized to a square.
- `login-hero.webp`: the original wordmark, club subtitle, values and court artwork,
  extracted at x=116, y=103, width=464, height=426. Accessible equivalent text is
  supplied in the login component.
- `icon-*.png`: browser, Apple touch and manifest sizes. Regenerate using
  `node scripts/generate-app-icons.mjs` from the repository root.
- `login-court.webp`: court-only texture extracted at x=116, y=405, width=360,
  height=124 from the same approved board. CSS scales this below the hero and
  applies blue color washes to continue the background behind the entire page.

The 512-pixel icon is upscaled from the supplied board, not a higher-resolution
original. Replace the source with an approved standalone original if provided.
Do not substitute the older full-court illustrations or generate new branding.

## Desktop background

`login-desktop.webp` is a 1672 × 941 desktop-only background derived from the separately approved PC mockup using the built-in imagegen tool. Text, value icons, the white form card and the footer were removed and the underlying tennis scene reconstructed. The original approved wordmark and app icon were not regenerated. The generated PNG was converted to WebP at quality 90 for the website.

Generation prompt:

> Edit the attached approved desktop website mockup into a clean background asset for that same website. Remove ALL text, lettering, logos, three value icons, white login card, form controls, footer text and footer horizontal divider. Reconstruct the tennis court and dark blue out-of-focus trees naturally behind those removed UI elements. Preserve the exact scene composition, deep navy and blue palette, tennis net at the right, court white lines and fine floor texture, upper-right floodlight and single yellow tennis ball near 45% horizontal and 72% vertical. No new logos, no text, no UI elements, no extra objects. Photorealistic continuous image full bleed, widescreen 16:9, suitable for a 1920px desktop website background. Keep the left upper half dark and quiet for a separate approved wordmark overlay. This is background cleanup only, not a redesign.
