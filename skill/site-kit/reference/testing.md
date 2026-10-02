# Testing a generated site

```bash
npm install && npx tsc --noEmit && npx next build            # in the generated folder
node ~/.claude/skills/site-kit/scripts/verify.mjs --site ./my-site --port 4010 --out ./verify-shots
```

Run the verifier from a folder where `playwright` resolves (`npm i playwright`, then `npx playwright install chromium`). Use a **production** build:
the verifier runs `next start` itself against a throwaway PGlite database and local storage folder (`.verify-pg-*`, `.verify-storage-*` inside the site; it removes them).
It reads `src/content/site.json` and `.env.local` from the site, so it tests whatever modules that site has.

Flags: `--site` (required) · `--port` · `--out` (screenshots + `report.json`) · `--no-start` (test a server you already started) · `--keep-server` (leave it running, log in `<out>/server.log`) ·
`--apk <file> --apk-name <versionName> --apk-code <versionCode>` and `--apk2 ...` (publish real APKs instead of fake files; needs `publishing.parseApk` and `publishing.packageName` set to the APK's real package name - the shipped `examples/fitness.json` uses the placeholder `com.example.fitness`).

## What it checks, per module (desktop 1280, phone 390, narrow phone 360)

- **landing:** brand and headline render; theme toggle switches light/dark; proof figure and bars, features board and timeline (when configured); FAQ opens; the phone menu sheet opens and lists the links; no horizontal scroll, also after scrolling the whole page (lazy sections); screenshots.
- **signin:** private pages redirect to `/login?next=`; wrong password refused; right one signs in and returns to `next`; sign out; open-redirect attempts ignored; finger-sized controls on phones.
- **api:** missing/wrong token -> 401; sign -> PUT -> ingest; re-sending the same id does not duplicate; a record whose uploaded file never arrived is refused; a bad status or id is refused; an upload key outside the record is refused.
- **dashboard:** stats; search narrows; status chips and facet selects filter; clear resets; detail page (facts, files, items); status change and delete; API callers without a session get 401; no horizontal scroll; finger-sized controls.
- **connect:** link with `#key=`, copy button, no horizontal scroll.
- **mfa:** no account -> `/admin/setup`; wrong setup code and short password refused; QR + secret shown; wrong authenticator code does not create the account; the right one does (the verifier has its own RFC 6238 implementation); sign out and two-step sign-in; a used code is refused (replay); one vague message for a wrong password; an invite link works once; the shared-password cookie alone cannot open `/admin`.
- **publishing:** page complete and fits a phone; wrong file type refused; publish stores and lists; lower/equal build number refused; second version; put on the home page -> landing offers it and the download is byte-identical (SHA-256); hide/show/delete; tester code issued once, and the update check offers testing builds only to that tester.
- **cross-cutting:** each page type is loaded 6 times right after `/` in a fresh browser context (warm cache) and fails on React hydration errors #418/#423/#425/#299; no console errors or uncaught exceptions (expected 400/401/403/409 responses and font failures are ignored).

## Reading failures

- `page is Npx wide in a 390px viewport` -> find the overflowing element: `[...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth)`.
- `hydration · ... error(s)` -> read `reference/gotchas.md` first; then diff server HTML (`curl`) against the DOM and look at which chunks `<script src>` lists for that route.
- A failure only in the "end state" (after the MFA/publishing checks) means state-dependent rendering (an account exists, releases exist) - reproduce against `--keep-server`.
- Timeouts: first requests compile PGlite and are slow; the default per-step timeout is 30 s.

## What the verifier does NOT cover

Real Android install of a published APK, real email/SMS, S3/Azure drivers against a real bucket, Postgres (only PGlite), `next dev`, Safari/Firefox, tablets, and OS font scaling.
