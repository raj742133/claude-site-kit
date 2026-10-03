---
name: site-kit
description: Generate a complete, working Next.js website (landing page, sign-in, authenticator MFA, dashboard, release publishing, connect-a-phone, ingest API) from a modular kit modelled on a production field-capture dashboard, restyled and re-worded for the user's own brand. Use when the user wants to create a landing page, publishing/downloads page, records dashboard, shared-password or MFA sign-in, or a "connect your phone" page for their own site, one module or several, with colours, copy and vocabulary of their choice. Optional animated effects layer (hero backgrounds, headline text animations, button and card micro-interactions) chosen from a menu, with a live /effects gallery. Includes a Playwright verifier that builds the site and drives it at desktop and phone widths.
---

# site-kit

Recreates the design and backend of a production field-capture dashboard as independent **modules**, filled with the user's brand and data.
The output is a normal Next.js 15 / React 19 / TypeScript project the user owns - there is no runtime dependency on this skill.

## Modules

| id | What the user gets | Needs |
| --- | --- | --- |
| `landing` | Public home page: hero with animated mark, scroll story with phone mock-ups, proof numbers and bars, features, timeline, FAQ, download card with QR code and team code, release list | - (shows downloads if `publishing` is chosen) |
| `signin` | Shared-password gate (signed cookie + edge middleware), themed login page | - |
| `mfa` | Named accounts: password + authenticator app (TOTP, replay-protected), invites, lockout, activity log, optional access-code lock | - |
| `publishing` | Upload a version (APK parsed for real, or any file types), notes editor, stable/testing channels, testers with codes, update-check endpoint, public download | `mfa` (added automatically) |
| `dashboard` | Records list with stats, search, status chips, facets, detail page with status actions and delete | `signin`, `api` |
| `connect` | "Connect a phone" page: link with key, copy button, curl example | `signin`, `api` |
| `fxgallery` | A public `/effects` page that runs every animated background, headline, button and card effect live, with a colour picker and the exact `effects` config to copy. Use it to let the user choose by looking | - |

`base` (design system, database, storage) and `api` (ingest, signed uploads, health) are internal; they are added when needed.
Dependencies are resolved automatically - choosing `publishing` brings `mfa`; `dashboard`/`connect` bring `signin` + `api`.

**Effects** are not a module but an optional style layer on top of any of them (`effects` block in `site.json`): 10 hero backgrounds, 8 headline animations, 4 button and 4 card effects, 5 scroll-reveal styles and 4 extras, all original dependency-free code. They are off unless chosen. Catalogue, presets and rules: `reference/effects.md`.

## Workflow

1. **Ask which modules.** Use AskUserQuestion with a multi-select over: Landing page, Publishing page, Dashboard, Connect to phone, Sign in (shared password), MFA accounts. Say what each adds in one line. If the user already named them, skip the question.
2. **Gather the brand** (ask only what is missing; everything has a default - see `reference/config.md`):
   - name, one-line tagline, what the product does in a sentence;
   - two brand colours (primary + accent/signal) - the whole light and dark palette, with contrast-checked text colours, is derived from them;
   - logo style (`hex`, `circle`, `square`, `drop`, `monogram`);
   - vocabulary: what they call a *record* (order, case, scan, ticket...), the *device* (phone, tablet), the *artifact* (app, catalogue, brochure) and the admin *area*;
   - for `publishing`: file types allowed (`.apk` + `parseApk` for Android apps, or `.pdf`, `.zip`, ...);
   - for `dashboard`: statuses, field labels, any numeric metric to total up;
   - for `landing`: headline + accent word, 3-4 story steps, optional proof/features/FAQ.
   **Never invent facts** (customer counts, benchmarks, testimonials). Leave `proof`, `features`, `compat` out unless the user supplies the content. Mark placeholder copy as such.
3. **Offer the visual style (effects).** The default look is clean and already animated a little (dotted hero, scroll story, reveals). Ask once with AskUserQuestion, single-select: **Keep the default look** (recommended if they did not ask for animation) / **Pick a preset** / **Choose piece by piece** / **Show me everything first**.
   - *Preset*: offer `calm`, `aurora-glass`, `tech-grid`, `playful` (and mention `cosmic`, `editorial`, `minimal`); set `effects.preset`.
   - *Piece by piece*: ask background, headline animation, button style, card style (one question each, with a short description from `reference/effects.md`); write them as `heroBackground`, `headline`, `buttons`, `cards` (+ `reveal`, `extras`). `rotate` needs `rotateWords`.
   - *Show me everything first*: also add `fxgallery` to the modules, build, run it, and tell them to open `/effects`, try things, press Copy, and paste the config back. Then regenerate with their choice.
   Match the effect to the brand (calm/serious brands: `calm` or `editorial`; playful consumer brands: `playful`; technical: `tech-grid`). Do not stack heavy choices on a page full of dense content.
4. **Write the config** to `site.json` (see `reference/config.md`; `examples/*.json` are complete worked configs - `examples/minimal.json` is just a brand name).
5. **Scaffold:**
   ```bash
   node ~/.claude/skills/site-kit/scripts/scaffold.mjs --config site.json --out ./my-site --modules landing,signin,dashboard,connect,mfa,publishing
   ```
   `--modules` may be omitted if the config has a `modules` array. Other flags: `--force` (write into a non-empty folder), `--password <p>` (dev password), `--check` (validate and list what would be written, writes nothing), `--list`.
   Quote Windows paths with forward slashes in Bash.
6. **Install and build** in the new folder. If the system drive is short on space (the install is ~700 MB with PGlite and Tiptap), put the project, `TEMP`/`TMP` and the npm cache on a roomy drive.
   ```bash
   npm install && npx tsc --noEmit && npx next build
   ```
7. **Verify** (do not skip - report what actually ran):
   ```bash
   node ~/.claude/skills/site-kit/scripts/verify.mjs --site ./my-site --port 4010 --out ./verify-shots
   ```
   It needs Playwright (`npm i playwright` somewhere resolvable from the cwd, and a Chromium - `npx playwright install chromium`). It starts the built site on a throwaway database and storage, then drives every chosen module at 1280, 390 and 360 px: renders, forms, sign-in, the full MFA enrolment with its own TOTP, publishing (fake files, or real APKs with `--apk <file> --apk-name <v> --apk-code <n> [--apk2 ...]`), API auth and idempotency, no horizontal scroll on phones, repeated warm-cache loads for hydration errors, and no console errors. Screenshots and `report.json` land in `--out`; read a couple of the screenshots before telling the user it looks right.
8. **Hand over:** the folder, the dev password and `.env.local` location (generated with random secrets - never print secrets into committed files), how to run (`npm run build && npm start`), the list of checks that passed, and the caveats below. Offer a Playwright screenshot of the landing page at desktop and phone width.

## Rules the generated code keeps - do not edit them away

- Private pages and `/api` are behind the middleware gate; API callers get 401, not a redirect. The cookie check in middleware is presence-only (Edge has no `node:crypto`); every page and route re-verifies the HMAC.
- Ingest uses a bearer `INGEST_TOKEN`, separate from the password, and is idempotent per record id.
- Storage returns **keys**, never URLs; files are served through signed, short-lived routes.
- TOTP accepts +/-1 step, refuses a reused step, locks after 5 failures for 15 minutes; invites are single-use and expire after 48 h.
- The root layout must not import values from a `'use client'` file (see `reference/gotchas.md` - it breaks hydration on some routes).
- Effects respect `prefers-reduced-motion`, switch off pointer-follow behaviour on touch screens, pause canvases when off screen, and never hide the real headline text from screen readers.
- Mobile first: every page has `width=device-width`, tap targets >= 44 px, tables scroll inside their card, no horizontal page scroll at 360 px. `prefers-reduced-motion` switches animations off.

## Extending

New module = a folder under `templates/modules/<id>/` mirroring the output tree, plus an entry in `scripts/modules.mjs` (requires, deps, env vars, SQL, open paths, nav). Conditional code uses `//#if flag` ... `//#else` ... `//#endif` lines (or `{/*#if flag*/}` in JSX). See `reference/modules.md`.

## Reference

- `reference/config.md` - every config key, its default, and a minimal vs full example
- `reference/effects.md` - the effects catalogue, presets, wiring and rules
- `reference/design-system.md` - tokens, palette derivation, components, animations, responsive rules
- `reference/modules.md` - routes, tables, env vars and flags per module
- `reference/testing.md` - what the verifier checks, how to run it, how to read failures
- `reference/gotchas.md` - things that cost real time: hydration, Node versions, disk, Windows shells
