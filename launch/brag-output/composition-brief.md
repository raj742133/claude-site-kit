# Hyperframes Composition Brief: Sitewright

## Objective
Create a short, polished launch-style brag video for Sitewright, a Claude Code skill that generates a complete Next.js website (landing page, sign-in, MFA, dashboard, publishing, connect-a-phone) from a brand description and then tests it in a real browser.

## Output
- Composition directory: `launch/brag-output/composition/`
- Rendered video: `launch/brag-output/brag.mp4`
- Format: landscape - 1920x1080
- Duration: 22.5 seconds

## Source Material
- Project root: `D:\claude-site-kit` (the repository `raj742133/sitewright`)
- Primary files read: `site/index.html`, `site/style.css`, `README.md`, `skill/sitewright/SKILL.md`, `skill/sitewright/reference/effects.md`, and the screenshots in `site/assets/shots/`
- Product name: Sitewright
- Tagline / strongest claim: "Tell Claude your brand. Get a working website."
- Key UI or visual moment to recreate: the "Four steps, one conversation" terminal (the request, the module list) and the real generated sites (Bean & Barrel landing page, orders dashboard, phone layout)
- Copy that must appear verbatim (all taken from the site):
  - Tell Claude your brand.
  - Get a working website.
  - Pick the pieces. Skip the rest.
  - Generated, built, and driven in a browser.
  - One kit. Any brand.
  - A Claude Code skill that builds your website.
  - 87 / 87 checks passed (the real result for the Bean & Barrel example site)
  - sitewright-skill.vercel.app

## Creative Direction
- Tone preset: polished
- Creative direction: quiet premium product film
- Interpretation: four scenes, long holds, slow 0.7s crossfades, large mixed-case type, and one idea per scene. The product's own evidence does the persuading.
- Angle: the product's promise, proved in three beats (a request typed to Claude, modules ticked, a finished site that already passed 87 of 87 browser checks), then the range of brands it handles.
- Hook: the headline types in; the second line lands on the 3.70s beat in the brand blue.
- Outro / punchline: the hexagon mark draws itself, then "Sitewright" and "A Claude Code skill that builds your website."
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrequested claims (everything on screen is quoted from the site or the test results)

## Visual Identity
- Background: #f3f5fa (cards #ffffff, terminal #0d1424)
- Text: #0d1424 (muted #55607a)
- Accent: #1e5bd8 (blue) and #14a6cc (cyan)
- Display font: Montserrat (700 and 800)
- Body font: JetBrains Mono (terminal and labels)
- Visual references from the project: the hexagon-and-lens mark, the dotted field, white cards with soft shadows, pill chips

## Storyboard
Use the storyboard in `brag-plan.md` as the creative contract.

1. Hook - 5.4s - "Tell Claude your brand." types; "Get a working website." lands on the beat.
2. The request - 6.9s - terminal card, typed request, six module rows with four ticked on consecutive beats; "Pick the pieces. Skip the rest."
3. The proof - 6.1s - "Generated, built, and driven in a browser."; the count reaches 87 / 87; three real screenshots arrive one by one.
4. Range and outro - 6.2s - four real generated sites for four brands; then the mark, name, tagline and address.

## Audio
- Audio role: warm bed with sparse professional accents
- Audio arc: gentle fade-in, quiet tactile ticks while text types and rows tick, soft card sounds for the screenshots, one low bell at the mark, then a long fade to near silence.
- Music: `assets/music/bed.mp3` (ende.app "Happy Beats / Business Moves" vol. 11, CC BY 4.0, 115 BPM)
- Music treatment: volume automation 0 to 0.5 over the first 0.9s; holds; fades 20.6s to 22.4s down to 0.03
- Music cue guidance: bundled preset read. Strong cues locked: 3.70s (second hook line), 5.80s (request starts to type), 12.65s (the count lands), 17.91s (second brand). Sequential items snap to consecutive or every-other beats on the 0.52s grid.
- Audio-reactive treatment: subtle. Per-frame music data (16 bands, 30 fps, pre-extracted to `assets/audio-data.js`) scales the two background glows and the two marks by up to 16%. Text never moves with the music and there are no waveform or equalizer visuals.
- Audio-coupled moments:
  - hook line and typed request - key ticks
  - module rows - one soft tick per tick
  - screenshots and brand cards - card-slide sounds
  - mark completes - one low bell
- SFX selection guidance: low high-frequency-risk files from `sfx-analysis.md` (keypress, click_003, impactSoft_medium_001, card-slide-1, impactBell_heavy_000), all CC0 from Kenney
- Audio files: copied into `composition/assets/`

## Hyperframes Instructions
Built with `hyperframes-core` (composition contract), `hyperframes-animation` (single paused GSAP timeline, seek-safe), `hyperframes-creative` (video-scale type, depth, light-canvas treatment) and `hyperframes-cli` (check, snapshot, render).

Requirements:
- Show real UI and copy from the project (done: screenshots of generated sites and the site's own headline).
- Keep every text element readable: no text below 24px, every read held at least 0.8s (labels) or about 0.3s per word (sentences).
- Keep the video at 22.5 seconds.
- Music and SFX included; no voiceover.
- Local assets only (GSAP, fonts bundled by Hyperframes, music, SFX, screenshots).
- Run `hyperframes check` before render.
- Keep creation and rendering local. Nothing is uploaded or published by this step.
