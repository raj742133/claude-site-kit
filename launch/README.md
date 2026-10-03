# Sitewright launch video

A 22.5-second launch film for Sitewright, made with the [`/brag`](https://github.com/latent-spaces/brag) skill (tone `polished`, landscape 1920x1080) and rendered locally with [Hyperframes](https://hyperframes.heygen.com/).

[![Sitewright launch video: "Tell Claude your brand. Get a working website."](brag-output/brag.jpg)](brag-output/brag.mp4)

**[Watch brag.mp4](brag-output/brag.mp4)** (9.6 MB, H.264 + AAC, -17 LUFS)

## What is in this folder

| File | What it is |
| --- | --- |
| [`brag-output/brag.mp4`](brag-output/brag.mp4) | the rendered video (poster baked in as frame 0) |
| [`brag-output/brag.jpg`](brag-output/brag.jpg) | the poster frame, for thumbnails and uploads |
| [`brag-output/share-copy.txt`](brag-output/share-copy.txt) | the caption to post with it |
| [`brag-output/brag-plan.md`](brag-output/brag-plan.md) | the creative plan and storyboard |
| [`brag-output/composition-brief.md`](brag-output/composition-brief.md) | the brief handed to Hyperframes |
| [`brag-output/composition/`](brag-output/composition) | the Hyperframes project (`index.html` plus local assets) |

## What is in the video

Everything on screen is quoted from the website or taken from real output of the project:

- the site's own headline, "Tell Claude your brand. Get a working website."
- the request typed to Claude and the module list from the "How it works" panel
- "87 / 87 checks passed", the real result for the Bean & Barrel example site
- real screenshots of generated sites. The brands, names and numbers in those screenshots are fictional demo data.

## Re-render it

```bash
cd launch/brag-output/composition
npx hyperframes check
npx hyperframes render --quality delivery --output ../brag.mp4
```

You need Node 22+, FFmpeg on your `PATH`, and the Hyperframes CLI (`npx hyperframes doctor` checks the setup). Everything the composition uses is in `assets/`, so a render needs no network access except for the one-time download of the Montserrat and JetBrains Mono font files that Hyperframes embeds.

## Credits

- Skill: [`/brag`](https://github.com/latent-spaces/brag) by latent-spaces (MIT)
- Video engine: [Hyperframes](https://hyperframes.heygen.com/)
- Music: "Happy Beats / Business Moves vol. 11" by [ende.app](https://ende.app/en), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Sound effects: [Kenney](https://kenney.nl/), CC0
- Animation: [GSAP](https://gsap.com/) 3.14.2, bundled in `composition/assets/gsap.min.js` under GreenSock's [standard licence](https://gsap.com/standard-license/)
- Fonts: Montserrat and JetBrains Mono (SIL Open Font Licence)
