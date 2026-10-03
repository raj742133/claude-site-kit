// The effects catalogue: animated hero backgrounds, headline text animations, button and card micro-interactions, scroll-reveal
// styles and a few extras. Every one is original, dependency-free code under templates/fx/ (no GSAP, Three.js or OGL), so a
// generated site only carries the effects it picked.
//
// Slots (one choice each):  heroBackground, loginBackground, headline, buttons, cards, reveal.   extras: any number.
// `files` are copied from templates/fx/ to src/components/fx/; `css` snippets are concatenated into src/components/fx/fx.css.

export const BACKGROUNDS = {
  aurora:    { label: 'Aurora',        desc: 'Soft blurred colour clouds drifting slowly. Pure CSS.',                         files: ['bg/Aurora.tsx'],    css: ['bg-aurora'] },
  mesh:      { label: 'Gradient mesh', desc: 'A slowly shifting mesh of brand-coloured gradients. Pure CSS.',                 files: ['bg/Mesh.tsx'],      css: ['bg-mesh'] },
  dots:      { label: 'Dot grid',      desc: 'A grid of dots that swell and glow around the pointer, with an idle ripple.',   files: ['bg/Dots.tsx'],      css: [], canvas: true },
  particles: { label: 'Particles',     desc: 'Floating particles joined by faint lines; the pointer pulls them together.',    files: ['bg/Particles.tsx'], css: [], canvas: true },
  stars:     { label: 'Starfield',     desc: 'Twinkling stars drifting with a little pointer parallax.',                      files: ['bg/Stars.tsx'],     css: [], canvas: true },
  beams:     { label: 'Light beams',   desc: 'Vertical beams of light sweeping down the hero. Pure CSS.',                     files: ['bg/Beams.tsx'],     css: ['bg-beams'] },
  waves:     { label: 'Waves',         desc: 'Layered waves rolling along the bottom edge. Pure SVG + CSS.',                  files: ['bg/Waves.tsx'],     css: ['bg-waves'] },
  grid:      { label: 'Perspective grid', desc: 'A grid receding to the horizon and moving toward you. Pure CSS.',            files: ['bg/Grid.tsx'],      css: ['bg-grid'] },
  grain:     { label: 'Grain gradient', desc: 'Soft gradient washes under animated film grain. Pure CSS.',                    files: ['bg/Grain.tsx'],     css: ['bg-grain'] },
  spotlight: { label: 'Spotlight',     desc: 'A soft light that follows the pointer (rests top-right on touch screens).',     files: ['bg/Spotlight.tsx'], css: ['bg-spotlight'] },
};

export const HEADLINES = {
  'split-chars': { label: 'Split letters', desc: 'Letters rise into place one after another.',                          files: ['text/split.tsx', 'text/SplitChars.tsx'],  css: ['text-split'] },
  'split-words': { label: 'Split words',   desc: 'Words slide up out of a mask.',                                       files: ['text/split.tsx', 'text/SplitWords.tsx'],  css: ['text-split'] },
  'blur-in':     { label: 'Blur in',       desc: 'Words sharpen from a soft blur.',                                     files: ['text/split.tsx', 'text/BlurIn.tsx'],      css: ['text-split'] },
  typewriter:    { label: 'Typewriter',    desc: 'Letters appear as if typed, with a blinking caret.',                  files: ['text/split.tsx', 'text/Typewriter.tsx'],  css: ['text-split'] },
  gradient:      { label: 'Gradient accent', desc: 'The accent word flows through the brand colours.',                  files: ['text/split.tsx', 'text/Gradient.tsx'],    css: ['text-split'] },
  shimmer:       { label: 'Shimmer',       desc: 'A band of light sweeps across the whole headline.',                   files: ['text/split.tsx', 'text/Shimmer.tsx'],     css: ['text-split'] },
  scramble:      { label: 'Decode',        desc: 'Random glyphs resolve into the headline, left to right.',             files: ['text/split.tsx', 'text/Scramble.tsx'],    css: ['text-split'] },
  rotate:        { label: 'Rotating word', desc: 'The accent word cycles through a list you give (effects.rotateWords).', files: ['text/split.tsx', 'text/Rotate.tsx'],     css: ['text-split'] },
};

export const BUTTONS = {
  magnetic:     { label: 'Magnetic',    desc: 'Buttons lean toward the pointer. Fine pointers only.', micro: ['magnetic'], css: ['buttons'] },
  shine:        { label: 'Shine',       desc: 'A glint sweeps across on hover. Pure CSS.',            micro: [],           css: ['buttons'] },
  ripple:       { label: 'Ripple',      desc: 'A ripple spreads from the press point.',               micro: ['ripple'],   css: ['buttons'] },
  'glow-border': { label: 'Glow border', desc: 'A light travels around the button edge. Pure CSS.',    micro: [],           css: ['buttons'] },
};

export const CARDS = {
  tilt:         { label: 'Tilt',         desc: '3D tilt toward the pointer with a moving glare. Fine pointers only.', micro: ['tilt'],      css: ['cards'] },
  spotlight:    { label: 'Spotlight',    desc: 'A soft light follows the pointer across the card.',                   micro: ['spotlight'], css: ['cards'] },
  'glow-border': { label: 'Glow border',  desc: 'A light travels around the card edge on hover. Pure CSS.',            micro: [],            css: ['cards'] },
  lift:         { label: 'Lift',         desc: 'The card rises and its shadow deepens. Pure CSS.',                    micro: [],            css: ['cards'] },
};

export const REVEALS = {
  rise:  { label: 'Rise',  desc: 'Fade up a little (the default).', css: [] },
  fade:  { label: 'Fade',  desc: 'Fade only, no movement.',         css: ['reveal'] },
  scale: { label: 'Scale', desc: 'Grow slightly into place.',       css: ['reveal'] },
  blur:  { label: 'Blur',  desc: 'Sharpen from a blur.',            css: ['reveal'] },
  slide: { label: 'Slide', desc: 'Slide in from the left.',         css: ['reveal'] },
};

export const EXTRAS = {
  'cursor-glow':     { label: 'Cursor glow',     desc: 'A soft glow follows the pointer across the page. Fine pointers only.', micro: ['cursorGlow'],     css: ['extras'] },
  'scroll-progress': { label: 'Scroll progress', desc: 'A thin brand-coloured bar shows how far down the page you are.',        micro: ['scrollProgress'], css: ['extras'] },
  'click-spark':     { label: 'Click sparks',    desc: 'A small burst of sparks where you click.',                              micro: ['clickSpark'],     css: ['extras'] },
  'count-up':        { label: 'Count-up numbers', desc: 'Dashboard stat numbers count up when they appear.',                    micro: [],                 css: ['extras'], files: ['CountUp.tsx'] },
};

export const PRESETS = {
  minimal:        { heroBackground: 'territory', headline: 'none',         buttons: 'none',        cards: 'none',      reveal: 'rise',  extras: [] },
  calm:           { heroBackground: 'mesh',      headline: 'blur-in',      buttons: 'shine',       cards: 'lift',      reveal: 'fade',  extras: [] },
  'aurora-glass': { heroBackground: 'aurora',    headline: 'split-words',  buttons: 'glow-border', cards: 'spotlight', reveal: 'blur',  extras: ['cursor-glow'] },
  'tech-grid':    { heroBackground: 'grid',      headline: 'scramble',     buttons: 'shine',       cards: 'spotlight', reveal: 'rise',  extras: ['scroll-progress'] },
  playful:        { heroBackground: 'particles', headline: 'split-chars',  buttons: 'ripple',      cards: 'tilt',      reveal: 'scale', extras: ['click-spark'] },
  cosmic:         { heroBackground: 'stars',     headline: 'shimmer',      buttons: 'glow-border', cards: 'tilt',      reveal: 'fade',  extras: ['cursor-glow', 'count-up'] },
  editorial:      { heroBackground: 'grain',     headline: 'gradient',     buttons: 'magnetic',    cards: 'lift',      reveal: 'rise',  extras: ['count-up'] },
};

const none = (v) => v === undefined || v === null || v === '' || v === 'none' || v === false;

/** Turns the `effects` block of site.json into one validated, fully-resolved choice per slot. Throws on an unknown id. */
export function resolveEffects(input = {}) {
  const fail = (what, id, table) => { throw new Error(`effects.${what}: "${id}" is not one of ${['none', ...Object.keys(table)].join(', ')}`); };
  let base = {};
  if (input.preset && !none(input.preset)) {
    base = PRESETS[input.preset];
    if (!base) throw new Error(`effects.preset: "${input.preset}" is not one of ${Object.keys(PRESETS).join(', ')}`);
  }
  const pick = (key) => (input[key] !== undefined ? input[key] : base[key]);

  const heroBackground = pick('heroBackground') ?? 'territory';
  if (heroBackground !== 'territory' && !none(heroBackground) && !BACKGROUNDS[heroBackground]) fail('heroBackground', heroBackground, { territory: 1, ...BACKGROUNDS });
  const loginBackground = input.loginBackground ?? 'none';
  if (!none(loginBackground) && !BACKGROUNDS[loginBackground]) fail('loginBackground', loginBackground, BACKGROUNDS);
  const headline = pick('headline') ?? 'none';
  if (!none(headline) && !HEADLINES[headline]) fail('headline', headline, HEADLINES);
  const buttons = pick('buttons') ?? 'none';
  if (!none(buttons) && !BUTTONS[buttons]) fail('buttons', buttons, BUTTONS);
  const cards = pick('cards') ?? 'none';
  if (!none(cards) && !CARDS[cards]) fail('cards', cards, CARDS);
  const reveal = pick('reveal') ?? 'rise';
  if (!REVEALS[reveal]) fail('reveal', reveal, REVEALS);
  const extras = [...new Set(pick('extras') ?? [])];
  for (const x of extras) if (!EXTRAS[x]) fail('extras', x, EXTRAS);
  const rotateWords = (input.rotateWords ?? []).map((w) => String(w).trim()).filter(Boolean).slice(0, 8);
  if (headline === 'rotate' && rotateWords.length < 2) throw new Error('effects.headline "rotate" needs effects.rotateWords with at least two words.');

  const r = {
    heroBackground: none(heroBackground) ? 'none' : heroBackground,
    loginBackground: none(loginBackground) ? 'none' : loginBackground,
    headline: none(headline) ? 'none' : headline,
    buttons: none(buttons) ? 'none' : buttons,
    cards: none(cards) ? 'none' : cards,
    reveal, extras, rotateWords,
  };
  r.active = r.heroBackground !== 'territory' || r.loginBackground !== 'none' || r.headline !== 'none' || r.buttons !== 'none' || r.cards !== 'none' || r.reveal !== 'rise' || extras.length > 0;
  return r;
}

/** Everything the chosen effects need: files to copy, css snippets (ordered, unique) and micro-interaction modules. */
export function effectPlan(r, { all = false } = {}) {
  const files = new Set(['useCanvasLoop.ts']);
  const css = new Set(['base']);
  files.add('text/split.tsx'); files.add('text/Plain.tsx');
  const micro = new Set();
  const use = (table, id) => { const e = table[id]; if (!e) return; (e.files ?? []).forEach((f) => files.add(f)); (e.css ?? []).forEach((c) => css.add(c)); (e.micro ?? []).forEach((m) => { micro.add(m); files.add(`micro/${m}.ts`); files.add('micro/selectors.ts'); }); };
  if (all) {
    for (const t of [BACKGROUNDS, HEADLINES, BUTTONS, CARDS, REVEALS, EXTRAS]) for (const id of Object.keys(t)) use(t, id);
  } else {
    if (r.heroBackground !== 'territory' && r.heroBackground !== 'none') use(BACKGROUNDS, r.heroBackground);
    if (r.loginBackground !== 'none') use(BACKGROUNDS, r.loginBackground);
    if (r.headline !== 'none') use(HEADLINES, r.headline);
    if (r.buttons !== 'none') use(BUTTONS, r.buttons);
    if (r.cards !== 'none') use(CARDS, r.cards);
    use(REVEALS, r.reveal);
    r.extras.forEach((x) => use(EXTRAS, x));
  }
  return { files: [...files], css: [...css], micro: [...micro] };
}

/** The class lists the micro-interactions act on - one place; scaffold writes them into the css and js (__FX_BTN__ / __FX_CARD__). */
export const BUTTON_SELECTOR = '.btn.primary';
export const CARD_SELECTOR = '.rec-card, .stat-card, .card, .why-card, .cta';
