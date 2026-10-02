---
name: site-kit
description: Generate a complete, working Next.js website (landing page, sign-in, authenticator MFA, dashboard, release publishing, connect-a-phone, ingest API) from a modular kit modelled on a production field-capture dashboard, restyled and re-worded for the user's own brand. Use when the user wants to create a landing page, publishing/downloads page, records dashboard, shared-password or MFA sign-in, or a "connect your phone" page for their own site, one module or several, with colours, copy and vocabulary of their choice. Includes a Playwright verifier that builds the site and drives it at desktop and phone widths.
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

`base` (design system, database, storage) and `api` (ingest, signed uploads, health) are internal; they are added when needed.
Dependencies are resolved automatically - choosing `publishing` brings `mfa`; `dashboard`/`connect` bring `signin` + `api`.

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
3. **Write the config** to `site.json` (see `reference/config.md`; `examples/*.json` are complete worked configs - `examples/minimal.json` is just a brand name).
4. **Scaffold:**
   ```bash
   node ~/.claude/skills/site-kit/scripts/scaffold.mjs --config site.json --out ./my-site --modules landing,signin,dashboard,connect,mfa,publishing
   ```
   `--modules` may be omitted if the config has a `modules` array. Other flags: `--force` (write into a non-empty folder), `--password <p>` (dev password), `--check` (validate and list what would be written, writes nothing), `--list`.
   Quote Windows paths with forward slashes in Bash.
5. **Install and build** in the new folder. If the system drive is short on space (the install is ~700 MB with PGlite and Tiptap), put the project, `TEMP`/`TMP` and the npm cache on a roomy drive.
   ```bash
   npm install && npx tsc --noEmit && npx next build
   ```
6. **Verify** (do not skip - report what actually ran):
   ```bash
   node ~/.claude/skills/site-kit/scripts/verify.mjs --site ./my-site --port 4010 --out ./verify-shots
   ```
   It needs Playwright (`npm i playwright` somewhere resolvable from the cwd, and a Chromium - `npx playwright install chromium`). It starts the built site on a throwaway database and storage, then drives every chosen module at 1280, 390 and 360 px: renders, forms, sign-in, the full MFA enrolment with its own TOTP, publishing (fake files, or real APKs with `--apk <file> --apk-name <v> --apk-code <n> [--apk2 ...]`), API auth and idempotency, no horizontal scroll on phones, repeated warm-cache loads for hydration errors, and no console errors. Screenshots and `report.json` land in `--out`; read a couple of the screenshots before telling the user it looks right.
7. **Hand over:** the folder, the dev password and `.env.local` location (generated with random secrets - never print secrets into committed files), how to run (`npm run build && npm start`), the list of checks that passed, and the caveats below. Offer a Playwright screenshot of the landing page at desktop and phone width.

## Rules the generated code keeps - do not edit them away

- Private pages and `/api` are behind the middleware gate; API callers get 401, not a redirect. The cookie check in middleware is presence-only (Edge has no `node:crypto`); every page and route re-verifies the HMAC.
- Ingest uses a bearer `INGEST_TOKEN`, separate from the password, and is idempotent per record id.
- Storage returns **keys**, never URLs; files are served through signed, short-lived routes.
- TOTP accepts +/-1 step, refuses a reused step, locks after 5 failures for 15 minutes; invites are single-use and expire after 48 h.
- The root layout must not import values from a `'use client'` file (see `reference/gotchas.md` - it breaks hydration on some routes).
- Mobile first: every page has `width=device-width`, tap targets >= 44 px, tables scroll inside their card, no horizontal page scroll at 360 px. `prefers-reduced-motion` switches animations off.

## Extending

New module = a folder under `templates/modules/<id>/` mirroring the output tree, plus an entry in `scripts/modules.mjs` (requires, deps, env vars, SQL, open paths, nav). Conditional code uses `//#if flag` ... `//#else` ... `//#endif` lines (or `{/*#if flag*/}` in JSX). See `reference/modules.md`.

## Reference

- `reference/config.md` - every config key, its default, and a minimal vs full example
- `reference/design-system.md` - tokens, palette derivation, components, animations, responsive rules
- `reference/modules.md` - routes, tables, env vars and flags per module
- `reference/testing.md` - what the verifier checks, how to run it, how to read failures
- `reference/gotchas.md` - things that cost real time: hydration, Node versions, disk, Windows shells
