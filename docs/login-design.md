# Login design and branding

## Identity and approved reference

The product name is **Åben Bane**. A club installation may use **Åben Bane HIK** and the subtitle **HIK Tennis**. This identifies the club, not ownership of the app. The login footer states “Ikke en officiel HIK-app”. The values are **Spilleglæde · Gode kampe · Fællesskab**.

The approved reference supplied on 2026-10-28 is `Aaben Bane HIK loginside og logo.png`. Its two phone screens show the top and scrolled-down portions of one login page. The original was supplied at `C:\projects\Aaben Bane HIK loginside og logo.png`; that local path is not a build dependency.

The approved “Klassisk” icon contains a white strung racket, yellow tennis ball and straight court lines on dark blue. It was extracted from the reference, not redrawn. The older `AppTennisLogo*.png` and HIK crest files are not the current app identity.

## Presentation and preserved behavior

- Mobile uses one scrolling column: original hero artwork, login card, profile creation card, rules card, then legal/contact links. The artwork is a page background, not a separate image card. Court texture continues behind all cards and the footer, with dark navy at the top and light blue washes toward the bottom.
- Desktop uses a two-column layout from 900 pixels: artwork on the left and forms/cards on the right.
- The original artwork blends into the page using intersecting horizontal and vertical opacity masks on all four edges. A navy underlay follows the artwork height, so a longer form does not move the color transition behind it. The court background uses proportional `cover` scaling rather than vertical stretching. Mobile and desktop share the approved source; no new logo or icon is generated.
- The hero retains the reference's wordmark, club subtitle, values and tennis court as a raster image, with accessible text. Form text and controls remain HTML. The interface uses the existing Arial/Helvetica/system fallback stack; no separate font file was supplied.
- “Glemt pinkode?” is below the submit button. “Opret profil” opens the existing registration form and still submits the `register` action with its existing privacy requirements.
- Members and administrators use the same login form. MFA enrollment, verification, recovery codes and remembered-device behavior remain separate existing flows.
- PIN reset, Enter-to-submit, notices, errors, rules, privacy, cookies and the contact email remain available. Login no longer automatically focuses an input, avoiding an immediately opened mobile keyboard.
- Presentation changes do not change database schemas, member records, authorization or match-planning rules.

## Source and maintenance

| File | Responsibility |
| --- | --- |
| `app/open-bane-app.tsx` | Login cards, existing form handlers, rules trigger and member header icon |
| `app/globals.css` | Scoped login styles and responsive layout |
| `app/layout.tsx` | Page metadata, theme color, browser and Apple icons |
| `app/manifest.ts` | Installed app name and 192/512-pixel icons |
| `public/brand/` | Extracted approved artwork and resized icons |
| `scripts/generate-app-icons.mjs` | Resizes the committed approved icon |

The login has its own legal links; the shared layout footer is hidden only while `.login-page` is present to avoid duplication. Other pages retain the shared footer.

See [asset provenance](../public/brand/README.md) for extraction coordinates. The source icon is approximately 274 pixels wide; the 512-pixel output is upscaled, not a high-resolution original. Request approved original artwork before replacing it. Do not invent a new logo or icon.

## Verification

For changes to these views:

1. Intercept `/api/**` with synthetic responses before opening the local page. Never exercise real member registration or reset email merely to verify styling.
2. Check 320- and 390-pixel mobile widths and a 1440-pixel desktop width for horizontal overflow, readable controls and accessible links.
3. Verify profile creation fields, required privacy acknowledgement and the `register` payload; PIN reset requests and reset-token submission; login via Enter; MFA verification/recovery navigation and return to login.
4. Open the rules dialog, privacy and cookies pages, and verify the contact link.
5. Check the manifest name and icon URLs, run TypeScript checks and compare lint findings with the existing baseline.

The initial implementation passed local Chromium checks at these widths with mocked API responses, including registration submission, PIN recovery and MFA navigation. TypeScript passed. Focused ESLint reported the same existing 70 errors and 14 warnings as the original main UI file. These checks do not establish physical-iPhone/Safari behavior, real email delivery, production authentication or deployment status. The one-off browser harness and screenshots were stored in ignored `.data/`; they are not a maintained test command.
