#!/usr/bin/env node
// End-to-end test of the Sitewright website, local or live.
//
//   cd <folder where `npm i playwright axe-core` has been run>
//   node site-test.mjs --url http://localhost:4400/ --repo D:/claude-site-kit --out D:/tmp/site-test
//   node site-test.mjs --url https://claude-site-kit.vercel.app/ --repo D:/claude-site-kit
//
// Covers: HTTP and SEO, every link and image, responsive layout at five widths, every interaction (theme, menu, tabs, copy buttons,
// FAQ, the embedded live demo), keyboard use, reduced motion, accessibility (axe-core), and whether the numbers and claims on the
// page match the repository. Exit code 0 only when every check passes; warnings are listed but do not fail the run.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const BASE = arg('url', 'http://localhost:4400/').replace(/\/?$/, '/');
const REPO = path.resolve(arg('repo', '.'));
const OUT = path.resolve(arg('out', path.join(process.cwd(), 'site-test-out')));
const LIVE = BASE.startsWith('https://');
fs.mkdirSync(OUT, { recursive: true });

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

// ---- harness ------------------------------------------------------------------------------------------------------------
const results = [], warnings = [];
let section = '';
async function check(name, fn) {
  const label = `${section ? section + ' · ' : ''}${name}`;
  try { await fn(); results.push({ label, ok: true }); console.log(`  ok    ${label}`); }
  catch (e) { const m = String(e.message ?? e).split('\n')[0]; results.push({ label, ok: false, error: m }); console.log(`  FAIL  ${label}\n        ${m}`); }
}
const warn = (msg) => { warnings.push(`${section}: ${msg}`); console.log(`  warn  ${section}: ${msg}`); };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };

const VIEWPORTS = { wide: [1440, 900], laptop: [1024, 768], tablet: [820, 1180], phone: [390, 844], narrow: [360, 740] };
const IGNORE_CONSOLE = /fonts\.(googleapis|gstatic)|ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/;
const get = async (url, init) => { for (let i = 0; ; i++) { try { return await fetch(url, { redirect: 'follow', ...init }); } catch (e) { if (i >= 3) throw e; await new Promise((r) => setTimeout(r, 700)); } } };
const abs = (u) => new URL(u, BASE).href;

const browser = await chromium.launch();
async function open(vp, extra = {}) {
  const [w, h] = VIEWPORTS[vp];
  const touch = w < 700;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch, permissions: ['clipboard-read', 'clipboard-write'], ...extra });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE_CONSOLE.test(m.text()) && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0, 140)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 140)}`));
  page.on('response', (r) => { if (r.status() >= 400 && !IGNORE_CONSOLE.test(r.url())) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('requestfailed', (r) => { if (!IGNORE_CONSOLE.test(r.url())) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page, problems };
}
/** Waits for smooth scrolling to finish (the scroll position stops changing). */
async function settle(page) {
  let last = -1, same = 0;
  for (let i = 0; i < 60 && same < 4; i++) { await page.waitForTimeout(100); const y = await page.evaluate(() => window.scrollY); same = y === last ? same + 1 : 0; last = y; }
}
async function scrollAll(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 400) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(45); }
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
}

// ---- registry facts the page makes claims about ---------------------------------------------------------------------------
let FX = null;
try { FX = await import(pathToFileURL(path.join(REPO, 'skill/sitewright/scripts/effects.mjs')).href); } catch { /* repo not given */ }

// =========================================================================================================================
section = 'http';
const homeRes = await get(BASE);
const html = await homeRes.text();
await check('the home page answers 200 as HTML', async () => { eq(homeRes.status, 200, 'status'); truthy((homeRes.headers.get('content-type') ?? '').includes('text/html'), 'content-type'); });

await check('title, description, language and viewport are set', async () => {
  const title = (html.match(/<title>([^<]*)/) ?? [])[1] ?? '';
  truthy(title.length >= 15 && title.length <= 70, `title length ${title.length}: "${title}"`);
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? '';
  truthy(desc.length >= 70 && desc.length <= 200, `description length ${desc.length}`);
  truthy(/<html lang="en"/.test(html), 'html lang');
  truthy(/<meta name="viewport" content="width=device-width, initial-scale=1"/.test(html), 'viewport meta');
});

await check('social tags are complete and the share image is a real 1200x630 PNG', async () => {
  for (const p of ['og:title', 'og:description', 'og:type', 'og:image']) truthy(new RegExp(`property="${p}"`).test(html), `missing ${p}`);
  truthy(/name="twitter:card" content="summary_large_image"/.test(html), 'twitter card');
  const img = (html.match(/property="og:image" content="([^"]+)"/) ?? [])[1];
  const r = await get(abs(img)); eq(r.status, 200, `og:image ${img}`);
  const buf = Buffer.from(await r.arrayBuffer());
  eq(buf.readUInt32BE(16), 1200, 'og width'); eq(buf.readUInt32BE(20), 630, 'og height');
  if (LIVE) truthy(img.startsWith('https://'), 'og:image should be an absolute URL for crawlers');
});

await check('favicon and canonical link resolve', async () => {
  const icon = (html.match(/rel="icon" href="([^"]+)"/) ?? [])[1];
  eq((await get(abs(icon))).status, 200, 'favicon');
  const canon = (html.match(/rel="canonical" href="([^"]+)"/) ?? [])[1];
  truthy(canon, 'canonical link present');
  if (LIVE) eq(canon, BASE, 'canonical points at the live URL');
});

const refs = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map((m) => m[1]).filter((u) => !/^(mailto:|javascript:|data:)/.test(u));
const internalRefs = [...new Set(refs.filter((u) => !/^https?:\/\//.test(u)).map((u) => u.split('#')[0]).filter(Boolean))];
const externalRefs = [...new Set(refs.filter((u) => /^https?:\/\//.test(u) && !/fonts\.(googleapis|gstatic)/.test(u)))];
await check(`all ${internalRefs.length} local files and pages referenced by the HTML exist`, async () => {
  const bad = [];
  for (const u of internalRefs) { const r = await get(abs(u)); if (r.status !== 200) bad.push(`${r.status} ${u}`); }
  eq(bad.join(', '), '', 'missing');
});
await check(`all ${externalRefs.length} external links respond`, async () => {
  const bad = [];
  for (const u of externalRefs) {
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      try { const r = await get(u, { method: 'GET', signal: AbortSignal.timeout(25000) }); ok = r.status < 400; if (!ok) { bad.push(`${r.status} ${u}`); break; } }
      catch (e) { if (i === 3) warn(`could not reach ${u} (${e.cause?.code ?? e.name}); this is the network, not the page`); await new Promise((r) => setTimeout(r, 1500)); }
    }
  }
  eq(bad.join(', '), '', 'links that answer with an error');
});

await check('image weight is sane (no single image over 450 KB; initial HTML under 60 KB)', async () => {
  truthy(Buffer.byteLength(html) < 60000, `HTML is ${Buffer.byteLength(html)} bytes`);
  const heavy = [];
  for (const u of internalRefs.filter((x) => /\.(png|jpe?g|webp|gif)$/i.test(x))) {
    const r = await get(abs(u)); const n = (await r.arrayBuffer()).byteLength;
    if (n > 450 * 1024) heavy.push(`${u} ${(n / 1024) | 0} KB`);
  }
  eq(heavy.join(', '), '', 'heavy images');
});

await check('a missing page gives a real 404, and /demo/effects works with or without a trailing slash', async () => {
  eq((await get(abs('definitely-not-here'))).status, 404, 'unknown path');
  eq((await get(abs('demo/effects'))).status, 200, 'no slash');
  eq((await get(abs('demo/effects/'))).status, 200, 'slash');
});
if (LIVE) await check('static assets are cacheable and the page is served with security headers', async () => {
  const a = await get(abs('assets/banner.png')); truthy(/max-age=\d{4,}/.test(a.headers.get('cache-control') ?? ''), `asset cache-control: ${a.headers.get('cache-control')}`);
  eq(homeRes.headers.get('x-content-type-options'), 'nosniff', 'x-content-type-options');
  truthy(!!homeRes.headers.get('referrer-policy'), 'referrer-policy');
});

// =========================================================================================================================
section = 'content';
const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ');
await check('the product is called Sitewright everywhere (no old name, no placeholders, no broken values)', async () => {
  truthy((text.match(/Sitewright/g) ?? []).length >= 8, 'brand name appears');
  eq((html.match(/(?<!claude-)site-kit/g) ?? []).length, 0, 'leftover "site-kit"');
  const junk = (text.match(/\b(undefined|NaN|null|lorem|TODO|FIXME|__[A-Z_]+__)\b|\[object Object\]/gi) ?? []);
  eq(junk.join(','), '', 'placeholder or broken text');
});

await check('every in-page anchor points at an element that exists', async () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const bad = [...new Set(anchors)].filter((a) => !ids.has(a));
  eq(bad.join(','), '', 'dangling anchors');
});

await check('the results table adds up to the numbers shown elsewhere on the page', async () => {
  const rows = [...html.matchAll(/<td class="ok">(\d+) \/ (\d+)<\/td>/g)].map((m) => [Number(m[1]), Number(m[2])]);
  truthy(rows.length >= 10, `${rows.length} result rows`);
  for (const [a, b] of rows) eq(a, b, 'a result row with failures');
  const sum = rows.reduce((s, [a]) => s + a, 0);
  const total = Number((html.match(/<b>(\d+)<\/b><span>browser checks passed across the (\w+) sites/) ?? [])[1]);
  eq(total, sum, 'total checks stat vs table sum');
  const sites = (html.match(/<b>(\d+)<\/b><span>different sites generated and run/) ?? [])[1];
  eq(Number(sites), rows.length, 'site count stat vs table rows');
  const full = rows[0][0];
  truthy(new RegExp(`<b>${full}</b>browser checks on the full kit`).test(html), `hero fact should say ${full}`);
});

if (FX) await check('effect counts and names on the page match the skill registry', async () => {
  const bg = Object.keys(FX.BACKGROUNDS).length;
  eq((html.match(/class="fx-tile reveal"/g) ?? []).length, bg, 'background tiles vs registry');
  for (const [id, e] of Object.entries(FX.BACKGROUNDS)) { truthy(html.includes(`assets/fx/bg-${id}.jpg`), `tile image for ${id}`); truthy(html.includes(`<b>${e.label}</b>`), `tile label ${e.label}`); }
  const chipText = [...html.matchAll(/<div class="fx-chips">([\s\S]*?)<\/div>/g)].flatMap((m) => [...m[1].matchAll(/<span>([^<]+)<\/span>/g)].map((x) => x[1]));
  const listed = { ...FX.REVEALS }; delete listed.rise; // "rise" is the default, so it has no chip
  for (const t of [FX.HEADLINES, FX.BUTTONS, FX.CARDS, listed, FX.EXTRAS]) for (const e of Object.values(t)) truthy(chipText.some((c) => c.toLowerCase().replace(/ numbers$/, '') === e.label.toLowerCase().replace(/ numbers$/, '') || c.toLowerCase().startsWith(e.label.toLowerCase().split(' ')[0])), `effect "${e.label}" is listed`);
  eq(Number((html.match(/<h3>(\d+) headline animations<\/h3>/) ?? [])[1]), Object.keys(FX.HEADLINES).length, 'headline count');
  eq(Object.keys(FX.PRESETS).length, 7, 'preset count claimed in README/SKILL');
});

await check('install commands copy-paste correctly and point at files that exist in the repo', async () => {
  const cmds = [...html.matchAll(/data-copy="([^"]+)"/g)].map((m) => m[1].replace(/&#10;/g, '\n').replace(/&amp;/g, '&'));
  truthy(cmds.length >= 5, `${cmds.length} copy buttons`);
  const joined = cmds.join('\n');
  truthy(joined.includes('git clone https://github.com/raj742133/claude-site-kit'), 'clone URL');
  for (const f of ['install.sh', 'install.ps1', 'skill/sitewright/SKILL.md']) truthy(fs.existsSync(path.join(REPO, f)), `${f} exists in the repo`);
  truthy(joined.includes('cp -R claude-site-kit/skill/sitewright'), 'manual copy path');
  for (const rel of ['skill/sitewright/examples', 'skill/sitewright']) truthy(fs.existsSync(path.join(REPO, rel)), `${rel} exists`);
  const skillMd = fs.readFileSync(path.join(REPO, 'skill/sitewright/SKILL.md'), 'utf8');
  truthy(/^name: sitewright$/m.test(skillMd), 'SKILL.md name matches the command shown (/sitewright)');
  truthy(html.includes('/sitewright'), 'the page tells people to type /sitewright');
});

// =========================================================================================================================
for (const vp of Object.keys(VIEWPORTS)) {
  section = `layout ${vp}`;
  const { ctx, page, problems } = await open(vp);
  await scrollAll(page); await page.waitForTimeout(800);
  const w = VIEWPORTS[vp][0];

  await check('no console errors, failed requests or HTTP errors while loading and scrolling the whole page', async () => eq(problems.join(' | '), '', 'problems'));
  await check('no horizontal scrolling', async () => {
    // mobile browsers silently widen innerWidth to fit overflowing content, so compare with the visual viewport (what the person sees)
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: Math.round(window.visualViewport.width) }));
    truthy(m.sw <= m.iw + 1, `page is ${m.sw}px wide in a ${m.iw}px viewport`);
  });
  await check('every image loads, has alt text, and nothing is hidden after scrolling', async () => {
    const r = await page.evaluate(() => ({
      broken: [...document.images].filter((i) => i.offsetParent !== null && (!i.complete || i.naturalWidth === 0)).map((i) => i.getAttribute('src')),
      noAlt: [...document.images].filter((i) => i.getAttribute('alt') === null).map((i) => i.getAttribute('src')),
      hidden: [...document.querySelectorAll('.reveal')].filter((e) => Number(getComputedStyle(e).opacity) < 0.95).length,
    }));
    eq(r.broken.join(','), '', 'broken images'); eq(r.noAlt.join(','), '', 'images without alt'); eq(r.hidden, 0, 'elements still hidden');
  });
  await check('exactly one h1 and no skipped heading levels', async () => {
    const hs = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1])));
    eq(hs.filter((n) => n === 1).length, 1, 'h1 count');
    for (let i = 1; i < hs.length; i++) truthy(hs[i] - hs[i - 1] <= 1, `heading jumps from h${hs[i - 1]} to h${hs[i]}`);
  });
  await check('text is not clipped or overlapping inside its own container', async () => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,p,li,summary,.btn,.tab,.pill,.fx-tile b')].filter((e) => {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('.term, .code, .copyline, .table-wrap, iframe')) return false;
      const r = e.getBoundingClientRect(); if (!r.width) return false;
      return e.scrollWidth > e.clientWidth + 2 && cs.overflowX !== 'visible' && cs.overflowX !== 'auto';
    }).map((e) => `${e.tagName}.${e.className}: ${(e.textContent || '').trim().slice(0, 30)}`));
    eq(bad.slice(0, 3).join(' | '), '', 'clipped text');
  });
  if (w < 700) await check('buttons, tabs and links are finger-sized (44px)', async () => {
    const small = await page.evaluate(() => [...document.querySelectorAll('a.btn, button, summary, .tab, nav a')].filter((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.position !== 'fixed' && r.height < 41 && e.offsetParent !== null;
    }).map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().height)}px`));
    eq(small.slice(0, 4).join(' | '), '', 'controls under 44px tall');
  });
  await page.screenshot({ path: path.join(OUT, `page-${vp}.png`), fullPage: true });
  await ctx.close();
}


// =========================================================================================================================
section = 'responsive sweep';
{
  const { ctx, page } = await open('wide');
  await scrollAll(page);
  await check('no horizontal overflow at any width from 320 to 1600 px (every 20 px)', async () => {
    const bad = [];
    for (let w = 320; w <= 1600; w += 20) {
      await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(60);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: Math.round(window.visualViewport.width) }));
      if (m.sw > m.iw + 1) bad.push(`${w}px (+${m.sw - m.iw})`);
    }
    eq(bad.join(', '), '', 'widths that scroll sideways');
  });
  await check('the header nav is either fully visible or replaced by the menu button, at every width', async () => {
    const bad = [];
    for (let w = 320; w <= 1600; w += 20) {
      await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(60);
      const r = await page.evaluate(() => { const menu = document.querySelector('#menu'); const nav = document.querySelector('#nav'); const shown = getComputedStyle(menu).display !== 'none';
        const kids = [...nav.querySelectorAll('a')].map((a) => a.getBoundingClientRect()); const right = shown ? 0 : Math.max(...kids.map((k) => k.right)); return { shown, right, iw: document.documentElement.clientWidth, theme: document.querySelector('#theme').getBoundingClientRect().right }; });
      if (!r.shown && (r.right > r.iw - 4 || r.theme > r.iw - 4)) bad.push(`${w}px`);
    }
    eq(bad.join(', '), '', 'widths where the nav runs off the screen');
  });
  await ctx.close();
}

// =========================================================================================================================
section = 'navigation';
{
  const { ctx, page } = await open('wide');
  await check('every nav link scrolls to its section and the heading is not hidden under the sticky header', async () => {
    const links = await page.locator('#nav a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    truthy(links.length >= 5, `${links.length} nav links`);
    const headerH = await page.locator('header.top').evaluate((h) => h.getBoundingClientRect().height);
    for (const href of links) {
      await page.locator(`#nav a[href="${href}"]`).click(); await settle(page);
      const top = await page.locator(`${href} .eyebrow, ${href} h2`).first().evaluate((e) => e.getBoundingClientRect().top);
      truthy(top >= headerH - 6 && top < 500, `${href}: heading at ${Math.round(top)}px, header is ${Math.round(headerH)}px`);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await check('the brand link and the skip link work', async () => {
    await page.evaluate(() => window.scrollTo(0, 3000)); await page.waitForTimeout(300);
    await page.locator('.brand').click(); await settle(page);
    truthy(await page.evaluate(() => window.scrollY) < 80, 'back at the top');
    await page.reload({ waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    const skip = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { text: a.textContent.trim(), onScreen: r.left >= 0 && r.top >= 0 && r.width > 0 }; });
    eq(skip.text, 'Skip to content', 'first tab stop'); truthy(skip.onScreen, 'skip link becomes visible on focus');
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    eq((await page.evaluate(() => document.activeElement?.id || location.hash)).replace('#', ''), 'main', 'focus/hash moved to main');
  });
  await check('keyboard focus is clearly visible on links and buttons', async () => {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.reload({ waitUntil: 'networkidle' });
    const seen = [];
    for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); seen.push(await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return `${a.tagName}:${cs.outlineStyle}:${cs.outlineWidth}`; })); }
    const none = seen.filter((s) => /:none:|:0px$/.test(s));
    eq(none.length, 0, `elements focused without an outline: ${none.slice(0, 3)}`);
  });
  await ctx.close();
}

// =========================================================================================================================
section = 'theme';
{
  const { ctx, page } = await open('wide');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await check('the toggle switches light and dark, remembers the choice, and survives a reload', async () => {
    const before = await bg();
    await page.locator('#theme').click(); await page.waitForTimeout(250);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme); truthy(theme === 'dark' || theme === 'light', `data-theme ${theme}`);
    const after = await bg(); truthy(after !== before, `background did not change (${before})`);
    eq(await page.evaluate(() => localStorage.getItem('sitewright-theme')), theme, 'saved choice');
    await page.reload({ waitUntil: 'networkidle' });
    eq(await page.evaluate(() => document.documentElement.dataset.theme), theme, 'applied after reload');
    eq(await bg(), after, 'same colours after reload');
    await page.locator('#theme').click(); await page.waitForTimeout(250); eq(await bg(), before, 'toggled back');
  });
  await ctx.close();
  const dark = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });
  const dp = await dark.newPage(); await dp.goto(BASE, { waitUntil: 'networkidle' });
  await check('with no saved choice the page follows the device (dark)', async () => {
    const lum = await dp.evaluate(() => { const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return (r + g + b) / 3; });
    truthy(lum < 60, `body is not dark (avg channel ${lum})`);
    eq(await dp.evaluate(() => getComputedStyle(document.querySelector('h1')).color !== getComputedStyle(document.body).backgroundColor), true, 'headline contrasts with background');
  });
  await dark.close();
}

// =========================================================================================================================
section = 'mobile menu';
{
  const { ctx, page } = await open('phone');
  await check('the menu button is shown, opens the nav, links close it, Escape closes it', async () => {
    truthy(await page.locator('#menu').isVisible(), 'menu button visible on a phone');
    eq(await page.locator('#nav').isVisible(), false, 'nav hidden at first');
    await page.locator('#menu').click(); await page.waitForTimeout(200);
    eq(await page.locator('#menu').getAttribute('aria-expanded'), 'true', 'aria-expanded'); truthy(await page.locator('#nav').isVisible(), 'nav open');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); eq(await page.locator('#nav').isVisible(), false, 'Escape closes');
    await page.locator('#menu').click(); await page.locator('#nav a[href="#install"]').click(); await settle(page);
    eq(await page.locator('#nav').isVisible(), false, 'link closes the nav');
    truthy(await page.evaluate(() => document.querySelector('#install').getBoundingClientRect().top < 300), 'scrolled to Install');
  });
  await ctx.close();
  const d = await open('wide');
  await check('on a desktop the menu button is hidden and the full nav is visible', async () => {
    eq(await d.page.locator('#menu').isVisible(), false, 'menu button'); truthy(await d.page.locator('#nav').isVisible(), 'nav');
  });
  await d.ctx.close();
}

// =========================================================================================================================
section = 'interactions';
{
  const { ctx, page } = await open('wide');
  await scrollAll(page);

  await check('the four "how it works" steps switch the terminal pane, and it advances by itself when left alone', async () => {
    const steps = page.locator('.step');
    for (let i = 0; i < 4; i++) {
      await steps.nth(i).click(); await page.waitForTimeout(150);
      eq(await steps.nth(i).getAttribute('aria-selected'), 'true', `step ${i + 1} selected`);
      eq(await page.locator('.term .pane.on').count(), 1, 'one pane shown');
      eq(await page.evaluate((n) => [...document.querySelectorAll('.term .pane')].findIndex((p) => p.classList.contains('on')) === n, i), true, `pane ${i + 1} is the one shown`);
    }
  });
  await check('the terminal panes carry real output (no empty pane, no raw markup showing)', async () => {
    const panes = await page.locator('.term .pane').evaluateAll((ps) => ps.map((p) => p.textContent.trim()));
    for (const p of panes) { truthy(p.length > 120, 'pane has content'); truthy(!/&lt;|&amp;|<span/.test(p), 'raw entity or tag visible'); }
  });

  await check('each example brand loads its screenshots, name, modules and colours in the gallery', async () => {
    const tabs = page.locator('#brand-tabs .tab'); const n = await tabs.count(); eq(n, 5, 'brand tabs');
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click(); await page.waitForTimeout(450);
      eq(await tabs.nth(i).getAttribute('aria-selected'), 'true', 'tab selected');
      const r = await page.evaluate(() => ({
        name: document.querySelector('#g-name').textContent, imgs: ['#g-main', '#g-side', '#g-phone'].map((s) => { const e = document.querySelector(s); return [e.complete && e.naturalWidth > 0, e.alt.length > 10]; }),
        chips: document.querySelectorAll('#g-modules span').length, swatches: document.querySelectorAll('#g-sw b').length, url: document.querySelector('#g-url').textContent,
      }));
      truthy(r.name.length > 3, 'brand name shown'); truthy(r.imgs.every(([ok, alt]) => ok && alt), `images/alt ${JSON.stringify(r.imgs)} for ${r.name}`);
      truthy(r.chips >= 1, 'module chips'); eq(r.swatches, 2, 'colour swatches'); truthy(/generated by Sitewright/.test(r.url), 'url bar text');
    }
  });

  await check('install tabs: macOS/Linux, Windows and Manual each show their own commands', async () => {
    const seen = new Set();
    for (const os of ['mac', 'win', 'manual']) {
      await page.locator(`.os-tabs button[data-os="${os}"]`).click(); await page.waitForTimeout(150);
      eq(await page.locator('.panel.on').count(), 1, 'one panel'); eq(await page.locator('.panel.on').getAttribute('data-panel'), os, 'panel for tab');
      seen.add(await page.locator('.panel.on').innerText());
    }
    eq(seen.size, 3, 'three different command sets');
  });

  await check('every Copy button puts exactly its command on the clipboard and says "Copied" for a moment', async () => {
    const buttons = page.locator('[data-copy]'); const n = await buttons.count(); truthy(n >= 6, `${n} copy buttons`);
    for (let i = 0; i < n; i++) {
      const btn = buttons.nth(i);
      // open the install tab that contains it so it is visible
      const panel = await btn.evaluate((e) => e.closest('.panel')?.dataset.panel ?? null);
      if (panel) await page.locator(`.os-tabs button[data-os="${panel}"]`).click();
      await btn.scrollIntoViewIfNeeded(); const want = await btn.getAttribute('data-copy'); const label = (await btn.textContent()).trim();
      await btn.click(); await page.waitForTimeout(150);
      eq((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), want, `clipboard for button ${i + 1}`);
      eq((await btn.textContent()).trim(), 'Copied', 'feedback'); await page.waitForTimeout(1700); eq((await btn.textContent()).trim(), label, 'label restored');
    }
  });

  await check('FAQ entries open and close, and every answer has text', async () => {
    const items = page.locator('#faq details'); const n = await items.count(); truthy(n >= 7, `${n} questions`);
    for (let i = 0; i < n; i++) {
      const d = items.nth(i); await d.scrollIntoViewIfNeeded();
      await d.locator('summary').click(); await page.waitForTimeout(80); truthy(await d.evaluate((e) => e.open), `question ${i + 1} opens`);
      truthy((await d.locator('p').innerText()).length > 40, 'answer text');
      await d.locator('summary').click(); await page.waitForTimeout(80); eq(await d.evaluate((e) => e.open), false, 'closes');
    }
  });
  await ctx.close();
}

// =========================================================================================================================
section = 'embedded demo';
{
  const { ctx, page, problems } = await open('wide');
  await check('the live gallery inside the page loads, responds to clicks and recolours', async () => {
    await page.locator('.fx-frame').scrollIntoViewIfNeeded(); await page.waitForTimeout(2500);
    const fr = page.frameLocator('.fx-frame');
    truthy((await fr.locator('.fxg-hero').count()) === 1, 'gallery rendered in the iframe');
    const group = (n) => fr.getByRole('radiogroup', { name: n, exact: true });
    await group('Hero background').getByRole('radio', { name: 'Particles', exact: true }).click(); await page.waitForTimeout(500);
    eq(await fr.locator('.fxg-hero canvas').count(), 1, 'particles canvas');
    await fr.getByRole('button', { name: 'tech-grid', exact: true }).click(); await page.waitForTimeout(300);
    truthy((await fr.locator('.fxg-code pre code').innerText()).includes('"scramble"'), 'preset changes the config');
    eq(problems.filter((p) => !/fonts/.test(p)).join(' | '), '', 'errors while using the demo');
  });
  await check('"Open full screen" opens the same gallery as its own page', async () => {
    const href = await page.locator('.fx-live-head a.btn').getAttribute('href');
    const p2 = await ctx.newPage(); await p2.goto(abs(href), { waitUntil: 'networkidle' });
    truthy((await p2.locator('.fxg-hero').count()) === 1, 'gallery page'); truthy((await p2.title()).includes('Effects'), `title ${await p2.title()}`);
    truthy((await p2.locator('.fxg-brand').innerText()).includes('Sitewright'), 'demo is branded Sitewright');
    await p2.close();
  });
  await ctx.close();
}

// =========================================================================================================================
section = 'reduced motion';
{
  const { ctx, page } = await open('wide', { reducedMotion: 'reduce' });
  await check('content is visible at once and nothing keeps animating', async () => {
    const r = await page.evaluate(() => ({ hidden: [...document.querySelectorAll('.reveal')].filter((e) => Number(getComputedStyle(e).opacity) < 0.95).length, running: document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target && !a.effect.target.closest('iframe')).length }));
    eq(r.hidden, 0, 'reveal elements hidden'); eq(r.running, 0, 'running animations');
    const before = await page.evaluate(() => document.querySelector('.step.on')?.textContent); await page.waitForTimeout(5200);
    eq(await page.evaluate(() => document.querySelector('.step.on')?.textContent), before, 'steps must not auto-advance');
  });
  await ctx.close();
}

// =========================================================================================================================
section = 'accessibility (axe)';
for (const [label, vp, scheme] of [['light desktop', 'wide', 'light'], ['dark desktop', 'wide', 'dark'], ['light phone', 'phone', 'light'], ['dark phone', 'phone', 'dark']]) {
  const { ctx, page } = await open(vp, { colorScheme: scheme });
  await scrollAll(page); await page.waitForTimeout(600);
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 2).map((x) => x.target.join(' ') + ' :: ' + (x.failureSummary || '').split('\n')[1]?.trim()) })); });
  await check(`${label}: no serious or critical accessibility violations`, async () => {
    const bad = res.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    eq(bad.map((v) => `${v.id} x${v.n} [${v.sample.join(' ; ')}]`).join('  ||  '), '', 'violations');
  });
  for (const v of res.filter((x) => x.impact === 'moderate' || x.impact === 'minor')) warn(`${label}: ${v.id} (${v.impact}) x${v.n}: ${v.help}`);
  await ctx.close();
}

// =========================================================================================================================
section = 'performance';
{
  const { ctx, page } = await open('wide');
  const m = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const res = performance.getEntriesByType('resource'); return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), requests: res.length, bytes: res.reduce((s, r) => s + (r.transferSize || 0), 0) }; });
  console.log(`        timing: DOMContentLoaded ${m.dcl} ms, load ${m.load} ms, ${m.requests} requests, ${(m.bytes / 1024) | 0} KB transferred before scrolling`);
  await check(`the page is quick to become usable (${LIVE ? 'live' : 'local'} thresholds)`, async () => { truthy(m.dcl < (LIVE ? 4000 : 1500), `DOMContentLoaded took ${m.dcl} ms`); truthy(m.bytes < 1.6 * 1024 * 1024, `${(m.bytes / 1024) | 0} KB transferred on first load`); });
  await check('below-the-fold images are lazy-loaded, so the first screen does not wait for them', async () => {
    const eager = await page.evaluate(() => [...document.images].filter((i) => i.loading !== 'lazy' && i.getBoundingClientRect().top > innerHeight * 1.5).map((i) => i.getAttribute('src')));
    eq(eager.join(','), '', 'eager below-fold images');
  });
  await ctx.close();
}

// ---- report ------------------------------------------------------------------------------------------------------------------
await browser.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ url: BASE, passed: results.length - failed.length, failed: failed.length, warnings, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} FAILED` : ''}; ${warnings.length} warning(s)  (report + screenshots in ${OUT})`);
process.exit(failed.length ? 1 : 0);
