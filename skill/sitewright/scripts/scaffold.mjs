#!/usr/bin/env node
// Sitewright scaffold: turns a site.json + a list of modules into a complete Next.js project.
//
//   node scaffold.mjs --config site.json --out ./my-site [--modules landing,signin,dashboard] [--force] [--password secret]
//   node scaffold.mjs --list
//   node scaffold.mjs --list-effects                       the effects menu (ids and what each does)
//   ... --preset calm --hero-bg aurora --headline split-words --buttons shine --cards lift --reveal blur --extras cursor-glow,count-up
//                                                          effect choices passed directly; they override the config file
//
// Nothing here is clever on purpose: copy the module folders, fill __TOKENS__, strip //#if blocks, assemble the few files that
// depend on the whole module set (package.json, middleware, schema, env, navigation, palette). Then npm install && npm run dev.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MODULES, resolveModules } from './modules.mjs';
import { DEFAULTS, deepMerge, interpolate } from './defaults.mjs';
import { buildPalette, paletteCss, onColour } from './lib/color.mjs';
import { logoComponent, faviconSvg, LOGO_STYLES } from './lib/logo.mjs';
import { resolveEffects, effectsMenu, BUTTON_SELECTOR, CARD_SELECTOR } from './effects.mjs';
import { generateFx } from './lib/fxgen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(HERE, '..', 'templates');

// ---- args ---------------------------------------------------------------------------------------------------------------
function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['force', 'list', 'list-effects', 'check', 'quiet'].includes(k)) out[k] = true;
      else out[k] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

const fail = (msg) => { console.error(`sitewright: ${msg}`); process.exit(1); };

// ---- templating ---------------------------------------------------------------------------------------------------------
const TEXT = /\.(ts|tsx|css|json|md|mjs|svg|txt|example|gitignore)$|^_gitignore$|^\.env/;

/** Strips //#if / {/*#if*​/} blocks. Conditions: `a`, `!a`, `a|b` (any), `a&b` (all). Directive lines are removed entirely. */
export function applyDirectives(text, flags) {
  const lines = text.split('\n');
  const out = [];
  const stack = []; // each: { active, taken, parent }
  const dir = /^\s*(?:\/\/|\{\/\*)\s*#(if|else|endif)\b\s*([^*}]*?)\s*(?:\*\/\})?\s*$/;
  const test = (expr) => {
    const e = expr.trim();
    const one = (s) => (s.startsWith('!') ? !flags.has(s.slice(1)) : flags.has(s));
    if (e.includes('|')) return e.split('|').some((s) => one(s.trim()));
    if (e.includes('&')) return e.split('&').every((s) => one(s.trim()));
    return one(e);
  };
  for (const line of lines) {
    const m = dir.exec(line);
    if (!m) { if (stack.every((s) => s.active)) out.push(line); continue; }
    const [, kind, expr] = m;
    if (kind === 'if') { const t = test(expr); stack.push({ active: t, taken: t }); }
    else if (kind === 'else') { const top = stack[stack.length - 1]; if (!top) throw new Error('#else without #if'); top.active = !top.taken; top.taken = true; }
    else { if (!stack.pop()) throw new Error('#endif without #if'); }
  }
  if (stack.length) throw new Error('unterminated #if');
  return out.join('\n');
}

function fill(text, tokens, file) {
  return text.replace(/__([A-Z][A-Z0-9_]+)__/g, (m, k) => {
    if (!(k in tokens)) throw new Error(`unknown token ${m} in ${file}`);
    return tokens[k];
  });
}

function walk(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

// ---- main ---------------------------------------------------------------------------------------------------------------
const a = args(process.argv.slice(2));

if (a.list) {
  for (const [id, m] of Object.entries(MODULES)) if (!m.internal) console.log(`${id.padEnd(11)} ${m.title}\n${' '.repeat(12)}${m.summary ?? ''}\n${' '.repeat(12)}requires: ${m.requires.join(', ') || '-'}`);
  process.exit(0);
}

if (a['list-effects']) { console.log(effectsMenu()); process.exit(0); }

if (!a.config) fail('--config <site.json> is required (see reference/config.md). Use --list to see the modules.');
if (!a.out && !a.check) fail('--out <directory> is required.');

let userCfg;
try { userCfg = JSON.parse(fs.readFileSync(a.config, 'utf8')); } catch (e) { fail(`cannot read ${a.config}: ${e.message}`); }

// The user's effect choices can be passed straight on the command line; they win over the config file and the preset.
// (--preset calm --hero-bg aurora --headline rotate --rotate-words "roasted,fresh" --buttons shine --cards lift --reveal blur --extras cursor-glow,count-up)
const csv = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);
const FX_FLAGS = { preset: 'preset', 'hero-bg': 'heroBackground', 'login-bg': 'loginBackground', headline: 'headline', buttons: 'buttons', cards: 'cards', reveal: 'reveal' };
const picked = {};
for (const [flag, key] of Object.entries(FX_FLAGS)) if (a[flag] !== undefined) picked[key] = a[flag];
if (a.extras !== undefined) picked.extras = csv(a.extras);
if (a['rotate-words'] !== undefined) picked.rotateWords = csv(a['rotate-words']);
if (Object.keys(picked).length) userCfg.effects = { ...(userCfg.effects ?? {}), ...picked };

const merged = deepMerge(DEFAULTS, userCfg);
const brandName = String(merged.brand?.name ?? '').trim();
if (!brandName) fail('brand.name is required.');
const slug = (merged.brand.slug || brandName).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
const cookie = (merged.brand.cookie || slug.replace(/-/g, '').slice(0, 6) || 'site');
if (!/^[a-z0-9]{2,8}$/.test(cookie)) fail(`brand.cookie "${cookie}" must be 2-8 lowercase letters/digits.`);

const vars = {
  brand: brandName, record: merged.vocab.record, records: merged.vocab.records,
  device: merged.vocab.device, artifact: merged.vocab.artifact, area: merged.vocab.area,
};
const cfg = interpolate(merged, vars);
cfg.brand.slug = slug;
cfg.brand.cookie = cookie;

// colours / logo
for (const k of ['primary', 'signal']) if (!/^#[0-9a-fA-F]{3,6}$/.test(cfg.brand.colors[k])) fail(`brand.colors.${k} must be a hex colour like #1e5bd8`);
if (!LOGO_STYLES.includes(cfg.brand.logo.style)) fail(`brand.logo.style must be one of ${LOGO_STYLES.join(', ')}`);
// The monogram letter lands in SVG text: letters and digits only, so '<', '&' or '{' cannot reach the markup.
const alnum = (s) => String(s || '').replace(/[^\p{L}\p{N}]/gu, '');
const letter = (alnum(cfg.brand.logo.letter).slice(0, 2) || alnum(brandName).slice(0, 1) || 'A').toUpperCase();

// modules
const wanted = a.modules ? a.modules.split(',').map((s) => s.trim()).filter(Boolean) : (cfg.modules ?? ['landing', 'signin', 'dashboard', 'connect', 'mfa', 'publishing']);
let modules;
try { modules = resolveModules(wanted); } catch (e) { fail(e.message); }
const has = (id) => modules.includes(id);
const added = modules.filter((m) => !wanted.includes(m) && m !== 'base');

if (a.check) {
  let effects; try { effects = resolveEffects(cfg.effects ?? {}); } catch (e) { fail(e.message); }
  console.log(JSON.stringify({ brand: brandName, slug, modules, addedAsDependencies: added, effects }, null, 2)); process.exit(0);
}

// output dir
const out = path.resolve(a.out);
if (fs.existsSync(out) && fs.readdirSync(out).length && !a.force) fail(`${out} is not empty. Use --force to write into it.`);
fs.mkdirSync(out, { recursive: true });

// flags for //#if
const flags = new Set(modules);
if (has('publishing') && cfg.publishing.testers) flags.add('testers');
if (has('publishing') && cfg.publishing.parseApk) flags.add('parseApk');
if (has('landing') && cfg.landing.proof) flags.add('proof');
if (has('landing') && cfg.landing.features) flags.add('features');
if (has('landing') && cfg.landing.compat) flags.add('compat');
if (has('landing') && cfg.landing.faq?.length) flags.add('faq');
if (cfg.storage?.provider === 's3') flags.add('s3');
if (cfg.storage?.provider === 'azure') flags.add('azure');

// effects (animated backgrounds, headline animations, button and card micro-interactions): see effects.mjs
let fx;
try { fx = resolveEffects(cfg.effects ?? {}); } catch (e) { fail(e.message); }
const fxGallery = has('fxgallery');
if (fxGallery && modules.every((m) => m === 'base' || m === 'fxgallery')) flags.add('fx_home');
if (fx.active || fxGallery) flags.add('fx');
if (has('landing') && fx.heroBackground !== 'territory' && fx.heroBackground !== 'none') flags.add('fx_bg');
if (has('landing') && fx.heroBackground === 'none') flags.add('fx_nobg');
if (has('landing') && fx.headline !== 'none') flags.add('fx_headline');
if ((has('signin') || has('mfa')) && fx.loginBackground !== 'none') flags.add('fx_login_bg');
if (has('dashboard') && fx.extras.includes('count-up')) flags.add('fx_countup');

// palette
const palette = buildPalette({ primary: cfg.brand.colors.primary, signal: cfg.brand.colors.signal, neutral: cfg.brand.colors.neutralHue });

const loginRedirect = has('dashboard') ? '/dashboard' : has('connect') ? '/connect' : has('mfa') ? '/admin' : has('fxgallery') ? '/effects' : '/';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const exts = cfg.publishing.extensions.map((e) => (e.startsWith('.') ? e : `.${e}`).toLowerCase());
const fontQuery = (f, w) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${w}`;

// Token values land inside TSX string literals, JSX text and CSS, so quote-ish characters are normalised rather than escaped:
// "Bean's" becomes "Bean’s" (a typographic apostrophe), and characters that mean something to JSX or template strings are dropped.
const safe = (v) => String(v).replace(/'/g, '’').replace(/"/g, '”').replace(/[`\\{}<>]/g, '').replace(/\$/g, 'S');
const tokens = {
  BRAND: brandName, BRAND_SLUG: slug, BRAND_JSON: JSON.stringify(brandName), COOKIE: cookie, ISSUER: brandName,
  AREA: cfg.vocab.area, AREA_LOWER: cfg.vocab.area.toLowerCase(),
  ARTIFACT: cfg.vocab.artifact, DEVICE: cfg.vocab.device,
  RECORD: cfg.vocab.record, RECORDS: cfg.vocab.records, RECORD_CAP: cap(cfg.vocab.record), RECORDS_CAP: cap(cfg.vocab.records),
  LANG: cfg.brand.lang, DESCRIPTION_JSON: JSON.stringify(cfg.brand.description),
  TITLE_JSON: JSON.stringify(`${brandName} · ${cfg.brand.tagline}`),
  FONT_BODY: cfg.brand.font.body, FONT_MONO: cfg.brand.font.mono,
  FONTS_URL: `https://fonts.googleapis.com/css2?${fontQuery(cfg.brand.font.body, '400;500;600;700;800')}&${fontQuery(cfg.brand.font.mono, '400;500;600')}&display=swap`,
  LOGIN_REDIRECT: loginRedirect,
  PACKAGE_NAME: cfg.publishing.packageName || '',
  EXTENSIONS_JSON: JSON.stringify(exts), ACCEPT_ATTR: exts.join(','),
  PALETTE_CSS: paletteCss(palette),
  SCHEMA_SQL: modules.map((m) => MODULES[m].schema).filter(Boolean).join('\n'),
  OPEN_PATHS_JSON: JSON.stringify([...new Set(modules.flatMap((m) => MODULES[m].open ?? []))]),
  LIGHT_PRIMARY: palette.light.primary, LIGHT_SURFACE: palette.light.surface, DARK_SURFACE: palette.dark.surface,
  PUBLISHING_NOUN: `${cfg.vocab.artifact} version`,
  SIGN_OUT: has('signin') ? '/api/logout' : has('mfa') ? '/api/admin/logout' : '',
  AREA_LOWER_NAV: cfg.nav.suffix || 'dashboard',
  ADMIN_NAV_ID: has('publishing') ? 'publishing' : 'team',
  NAV_CONNECT: cfg.nav.connect,
};
const PLAIN = ['BRAND', 'ISSUER', 'AREA', 'AREA_LOWER', 'ARTIFACT', 'DEVICE', 'RECORD', 'RECORDS', 'RECORD_CAP', 'RECORDS_CAP', 'AREA_LOWER_NAV', 'PACKAGE_NAME', 'NAV_CONNECT'];
for (const k of PLAIN) tokens[k] = safe(tokens[k]);
const fxAttrs = [['buttons', fx.buttons, 'none'], ['cards', fx.cards, 'none'], ['reveal', fx.reveal, 'rise']].filter(([, v, d]) => v !== d).map(([k, v]) => ` data-fx-${k}="${v}"`).join('');
tokens.FX_HTML_ATTRS = fxGallery ? '' : fxAttrs;
tokens.FX_BTN = BUTTON_SELECTOR;
tokens.FX_CARD = CARD_SELECTOR;

// ---- copy -----------------------------------------------------------------------------------------------------------------
const written = new Map();
function put(rel, content) { written.set(rel.replace(/\\/g, '/'), content); }

for (const id of modules) {
  const root = id === 'base' ? path.join(TEMPLATES, 'base') : path.join(TEMPLATES, 'modules', id);
  for (const rel of walk(root)) {
    const src = path.join(root, rel);
    let dest = rel === '_gitignore' ? '.gitignore' : rel;
    if (!TEXT.test(path.basename(rel)) && !TEXT.test(rel)) { put(dest, fs.readFileSync(src)); continue; }
    let text = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
    try { text = fill(applyDirectives(text, flags), tokens, `${id}/${rel}`); } catch (e) { fail(e.message); }
    put(dest, text);
  }
}

// files that exist only with a feature flag (see fileFlags in modules.mjs)
for (const id of modules) for (const [rel, flag] of Object.entries(MODULES[id].fileFlags ?? {})) if (!flags.has(flag)) written.delete(rel);

// ---- generated files ------------------------------------------------------------------------------------------------------
put('src/components/brand/Logo.tsx', logoComponent({ style: cfg.brand.logo.style, letter, name: brandName.replace(/[`$\\]/g, '') }));
put('src/app/icon.svg', faviconSvg({ style: cfg.brand.logo.style, letter }, palette.light.primary, palette.light.signal, palette.light['on-primary']));

// ---- effects layer ---------------------------------------------------------------------------------------------------------
if (flags.has('fx')) generateFx({ fx, flags, all: fxGallery, templates: TEMPLATES, tokens, put, fill });

const nav = [];
if (has('dashboard')) nav.push({ id: 'dashboard', label: cfg.nav.dashboard, href: '/dashboard' });
if (has('connect')) nav.push({ id: 'connect', label: cfg.nav.connect, href: '/connect' });
if (has('publishing')) nav.push({ id: 'publishing', label: cfg.nav.publishing, href: '/admin' });
else if (has('mfa')) nav.push({ id: 'team', label: cfg.nav.team, href: '/admin' });
if (has('landing')) nav.push({ id: 'home', label: cfg.nav.home, href: '/' });
put('src/content/nav.json', JSON.stringify({ items: nav, homeAfterLogin: loginRedirect }, null, 2) + '\n');

// the content file the components read: exactly the resolved config, minus build-only keys
const site = { ...cfg, modules, flags: [...flags], effects: fx };
delete site.storage;
put('src/content/site.json', JSON.stringify(site, null, 2) + '\n');

// package.json
const deps = {}, devDeps = {};
for (const id of modules) Object.assign(deps, MODULES[id].deps ?? {}), Object.assign(devDeps, MODULES[id].devDeps ?? {});
if (flags.has('s3')) Object.assign(deps, { '@aws-sdk/client-s3': '^3.700.0', '@aws-sdk/s3-request-presigner': '^3.700.0' });
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
put('package.json', JSON.stringify({
  name: slug, version: '0.1.0', private: true, description: cfg.brand.description,
  scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' },
  dependencies: sorted(deps), devDependencies: sorted(devDeps),
}, null, 2) + '\n');

// env: .env.example (documented) + .env.local (generated dev secrets, gitignored)
const rnd = (n) => crypto.randomBytes(n).toString('hex');
const secrets = { '@secret': rnd(32), '@token': rnd(24), '@setup': `SETUP-${rnd(3).toUpperCase()}`, '@password': a.password || `pw-${rnd(5)}` };
const seen = new Set(); const envDocs = []; const envLocal = [];
for (const id of modules) for (const e of MODULES[id].env ?? []) {
  if (seen.has(e.name)) continue; seen.add(e.name);
  envDocs.push(`# ${e.note}\n${e.name}=`);
  envLocal.push(`${e.name}=${e.dev && e.dev.startsWith('@') ? secrets[e.dev] : (e.dev ?? '')}`);
}
if (flags.has('s3')) envDocs.push('# S3 / Cloudflare R2\nS3_ENDPOINT=\nS3_BUCKET=\nS3_ACCESS_KEY_ID=\nS3_SECRET_ACCESS_KEY=\nS3_REGION=auto');
if (flags.has('azure')) envDocs.push('# Azure Blob\nAZURE_ACCOUNT=\nAZURE_CONTAINER=\nAZURE_KEY=');
put('.env.example', `# ${brandName} - copy to .env.local and fill in. Never commit .env.local.\n\n${envDocs.join('\n\n')}\n`);
put('.env.local', `# Generated by Sitewright for local development. Do not commit.\n${envLocal.join('\n')}\n`);

// README
put('README.md', `# ${brandName}

${cfg.brand.description}

Generated by **Sitewright** from \`src/content/site.json\` with these modules: ${modules.filter((m) => m !== 'base').join(', ')}.

## Run it

\`\`\`bash
npm install
npm run dev        # http://localhost:3000
\`\`\`

\`.env.local\` was generated with development secrets. Production values go in the host's application settings - see \`.env.example\`.

## Where things live

| What | Where |
|---|---|
| All copy, colours and names | \`src/content/site.json\` (edit, then re-run Sitewright or edit the components directly) |
| Colour tokens (light + dark) | the first block of \`src/app/globals.css\` |
| Database schema | \`src/lib/schema.ts\` (idempotent, applied on first request) |
| Private-page gate | \`src/middleware.ts\` |
| Pages | \`src/app\` (App Router) |

Every page is responsive from 320px up and honours \`prefers-reduced-motion\` and the light/dark toggle.
`);

// ---- write ----------------------------------------------------------------------------------------------------------------
let n = 0;
for (const [rel, content] of written) {
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  n++;
}

if (!a.quiet) {
  console.log(`\nsitewright: wrote ${n} files to ${out}`);
  console.log(`  brand    ${brandName} (${slug}), logo ${cfg.brand.logo.style}, primary ${cfg.brand.colors.primary}, signal ${cfg.brand.colors.signal}`);
  console.log(`  modules  ${modules.filter((m) => m !== 'base').join(', ')}${added.length ? `   (added as dependencies: ${added.join(', ')})` : ''}`);
  if (fx.active) console.log(`  effects  hero ${fx.heroBackground}, login ${fx.loginBackground}, headline ${fx.headline}, buttons ${fx.buttons}, cards ${fx.cards}, reveal ${fx.reveal}${fx.extras.length ? `, extras ${fx.extras.join('+')}` : ''}`);
  if (has('signin')) console.log(`  sign-in  password ${secrets['@password']}   (development only; stored in .env.local)`);
  if (has('mfa')) console.log(`  admin    setup code ${secrets['@setup']}   (first account at /admin/setup)`);
  if (has('api')) console.log(`  api key  ${secrets['@token']}   (Bearer token for /api/ingest)`);
  console.log(`\n  next:  cd ${a.out} && npm install && npm run dev\n`);
}
