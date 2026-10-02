#!/usr/bin/env node
// site-kit verifier: drives a GENERATED site in a real browser (Playwright + Chromium) at desktop and phone widths and checks
// every module it contains. It reads the site's own src/content/site.json, so it needs no configuration.
//
//   cd <a folder where `npm i playwright` has been run>
//   node <skill>/scripts/verify.mjs --site D:/path/to/generated-site [--port 4010] [--out D:/path/to/screenshots] [--no-start]
//
// Exit code 0 only if every check passed. Screenshots (desktop + mobile, every page) are written to --out.
// The site must be built (`npm run build`); the verifier starts `next start` itself unless --no-start.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const SITE = path.resolve(arg('site', '.'));
const PORT = Number(arg('port', '4010'));
const OUT = path.resolve(arg('out', path.join(SITE, '.verify')));
const NOSTART = argv.includes('--no-start');
const KEEP = argv.includes('--keep-server'); // debugging: leave the server and its data running after the checks
const APK = arg('apk', '');
const BASE = `http://localhost:${PORT}`;

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

// ---- site facts ---------------------------------------------------------------------------------------------------------
const site = JSON.parse(fs.readFileSync(path.join(SITE, 'src/content/site.json'), 'utf8'));
const env = Object.fromEntries(fs.readFileSync(path.join(SITE, '.env.local'), 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const has = (m) => site.modules.includes(m);
const flag = (f) => site.flags.includes(f);
fs.mkdirSync(OUT, { recursive: true });

// ---- tiny harness ---------------------------------------------------------------------------------------------------------
const results = [];
let section = '';
async function check(name, fn) {
  const label = `${section ? section + ' · ' : ''}${name}`;
  try { await fn(); results.push({ label, ok: true }); console.log(`  ok    ${label}`); }
  catch (e) { results.push({ label, ok: false, error: String(e.message ?? e) }); console.log(`  FAIL  ${label}\n        ${String(e.message ?? e).split('\n')[0]}`); }
}
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };

// ---- TOTP (RFC 6238) - the test's own implementation, deliberately independent of the site's -----------------------------
function totp(secretB32, step) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32.replace(/[\s=]/g, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}
const nowStep = () => Math.floor(Date.now() / 1000 / 30);

// ---- server -----------------------------------------------------------------------------------------------------------------
let server = null;
const scratch = [];
async function startServer() {
  if (NOSTART) return;
  if (!fs.existsSync(path.join(SITE, '.next'))) throw new Error('The site is not built. Run `npm run build` in it first.');
  const nextBin = path.join(SITE, 'node_modules/next/dist/bin/next');
  // A throwaway database and storage per run, so a re-run starts from nothing (process env wins over .env.local).
  const stamp = Date.now();
  scratch.push(path.join(SITE, `.verify-pg-${stamp}`), path.join(SITE, `.verify-storage-${stamp}`));
  const keepLog = KEEP ? fs.openSync(path.join(OUT, 'server.log'), 'a') : null;
  server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
    cwd: SITE, detached: KEEP, stdio: KEEP ? ['ignore', keepLog, keepLog] : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: `pglite://.verify-pg-${stamp}`, STORAGE_PROVIDER: 'local', LOCAL_STORAGE_DIR: `.verify-storage-${stamp}`, PUBLIC_BASE_URL: BASE },
  });
  let log = '';
  if (!KEEP) { server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; }); } else server.unref();
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status < 500) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The server did not start:\n${log.slice(-1500)}`);
}

// ---- browser helpers ------------------------------------------------------------------------------------------------------
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 }, narrow: { width: 360, height: 740 } };
const consoleErrors = [];
const IGNORED = /status of (400|401|403|409) |fonts\.(googleapis|gstatic)|favicon|net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION)|Failed to load resource.*(font|googleapis)/i;

async function newPage(browser, vp, name) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[vp], deviceScaleFactor: vp === 'desktop' ? 1 : 2, isMobile: vp !== 'desktop', hasTouch: vp !== 'desktop',
    permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORED.test(m.text())) consoleErrors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${name}] pageerror: ${e.message}`));
  page.setDefaultTimeout(30000);
  return { ctx, page };
}

const shot = async (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const overflow = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

/** Scrolls the whole page in steps so every scroll-triggered reveal fires, then returns to the top. */
async function scrollThrough(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

async function noOverflow(page, where) {
  const { sw, iw } = await overflow(page);
  if (sw > iw + 1) throw new Error(`${where}: page is ${sw}px wide in a ${iw}px viewport (horizontal scroll)`);
}

/** On a touch device every visible button, link-button, select and text input should be at least 44px tall (3px of slack for rounding). */
async function tapTargets(page, where) {
  const small = await page.evaluate(() => [...document.querySelectorAll('button, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), header.site nav a')]
    .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.position !== 'fixed'; })
    .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || e.name || e.tagName).trim().slice(0, 24), h: Math.round(e.getBoundingClientRect().height) }))
    .filter((x) => x.h < 41));
  if (small.length) throw new Error(`${where}: ${small.length} control(s) under 44px tall on a touch screen: ${small.slice(0, 4).map((x) => `"${x.t}" ${x.h}px`).join(', ')}`);
}

// ---- the checks --------------------------------------------------------------------------------------------------------------
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const api = (p, init = {}) => fetch(`${BASE}${p}`, init);
const bearer = { Authorization: `Bearer ${env.INGEST_TOKEN}` };

async function checkLanding(browser) {
  section = 'landing';
  for (const vp of ['desktop', 'mobile', 'narrow']) {
    const { ctx, page } = await newPage(browser, vp, `landing-${vp}`);
    await check(`${vp}: renders the brand, headline and story`, async () => {
      const r = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      eq(r.status(), 200, 'status');
      truthy((await page.title()).includes(site.brand.name), 'title has the brand name');
      const h1 = (await page.locator('h1.lp-h1').innerText()).replace(/\s+/g, ' ');
      truthy(h1.includes(site.landing.accent), `h1 "${h1}" contains the accent "${site.landing.accent}"`);
      eq(await page.locator('.st-step').count(), site.landing.story.steps.length, 'story steps');
      truthy(await page.locator('.lp-territory canvas').count(), 'territory canvas');
      truthy(await page.locator('.route svg').count(), 'road svg');
    });
    await check(`${vp}: no horizontal scroll after scrolling the whole page`, async () => { await scrollThrough(page); await noOverflow(page, 'landing'); });
    await check(`${vp}: theme toggle switches light/dark`, async () => {
      const toggle = page.locator('.theme-toggle').first();
      const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await toggle.click();
      await page.waitForTimeout(150);
      const theme = await page.evaluate(() => document.documentElement.dataset.theme);
      truthy(theme === 'dark' || theme === 'light', 'data-theme set');
      const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      truthy(before !== after, `body colour changed (${before} -> ${after})`);
      await toggle.click();
    });
    if (flag('proof')) await check(`${vp}: proof figure and bars`, async () => {
      eq((await page.locator('.flip-row').getAttribute('aria-label')), site.landing.proof.figure, 'figure');
      eq(await page.locator('.why-bar').count(), (site.landing.proof.bars ?? []).length, 'bars');
    });
    if (flag('features')) await check(`${vp}: features board`, async () => {
      eq(await page.locator('.mod-col').first().locator('.mod-item').count(), site.landing.features.ready.length, 'ready items');
    });
    if (flag('compat')) await check(`${vp}: timeline selects an item`, async () => {
      const items = site.landing.compat.items;
      await page.locator('.dv-btn').nth(items.length - 1).scrollIntoViewIfNeeded();
      await page.locator('.dv-btn').nth(items.length - 1).click();
      truthy((await page.locator('.dev-name').innerText()).includes(items[items.length - 1].name), 'selected name shown');
    });
    if (flag('faq')) await check(`${vp}: FAQ opens`, async () => {
      const d = page.locator('.faq details').first();
      await d.scrollIntoViewIfNeeded(); await d.locator('summary').click();
      eq(await d.evaluate((e) => e.open), true, 'open');
    });
    if (vp !== 'desktop') await check(`${vp}: menu sheet opens and lists the links`, async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('.lp-menu-b').click();
      truthy(await page.locator('.lp-sheet a').count() >= 2, 'sheet links');
      await page.locator('.lp-menu-b').click();
    });
    await scrollThrough(page);
    await shot(page, `landing-${vp}`);
    await ctx.close();
  }
}

async function checkSignin(browser) {
  section = 'sign-in';
  const redirect = has('dashboard') ? '/dashboard' : has('connect') ? '/connect' : has('mfa') ? '/admin' : '/';
  for (const vp of ['desktop', 'mobile']) {
    const { ctx, page } = await newPage(browser, vp, `signin-${vp}`);
    await check(`${vp}: a private page sends you to /login with ?next`, async () => {
      await page.goto(`${BASE}${redirect === '/' ? '/connect' : redirect}`);
      truthy(page.url().includes('/login'), `url ${page.url()}`);
    });
    await check(`${vp}: the sign-in page fits the screen`, async () => { await noOverflow(page, 'login'); await shot(page, `login-${vp}`); });
    if (vp !== 'desktop') await check(`${vp}: sign-in controls are finger-sized`, async () => { await tapTargets(page, 'login'); });
    await check(`${vp}: wrong password is refused`, async () => {
      await page.locator('input[name=password]').fill('definitely-wrong');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL(/error=1/);
      truthy(await page.locator('p.err').isVisible(), 'error message visible');
    });
    await check(`${vp}: right password signs in and lands on ${redirect}`, async () => {
      await page.locator('input[name=password]').fill(env.DASHBOARD_PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL((u) => !u.pathname.startsWith('/login'));
      truthy(page.url().includes(redirect === '/' ? '/connect' : redirect), `landed on ${page.url()}`);
      const cookie = (await ctx.cookies()).find((c) => c.name.endsWith('-session'));
      truthy(cookie && cookie.httpOnly, 'session cookie is HttpOnly');
    });
    await check(`${vp}: an open redirect in ?next is ignored`, async () => {
      const c2 = await browser.newContext(); const p2 = await c2.newPage();
      await p2.goto(`${BASE}/login?next=//evil.example/x`);
      await p2.locator('input[name=password]').fill(env.DASHBOARD_PASSWORD);
      await p2.getByRole('button', { name: 'Sign in' }).click();
      await p2.waitForURL((u) => !u.pathname.startsWith('/login'));
      truthy(new URL(p2.url()).host === `localhost:${PORT}`, `stayed on this host (${p2.url()})`);
      await c2.close();
    });
    await check(`${vp}: sign out returns to /login`, async () => {
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL(/\/login/);
    });
    await ctx.close();
  }
}

async function checkApiAndDashboard(browser) {
  if (!has('api')) return;
  section = 'api';
  await check('health reports the site, database and storage', async () => {
    const r = await api('/api/health', { headers: bearer }); const j = await r.json();
    eq(r.status, 200, 'status'); eq(j.service, `${site.brand.slug}-site`, 'service'); eq(j.database, 'ok', 'database'); eq(j.storage, 'ok', 'storage'); eq(j.authorized, true, 'authorized');
    const bad = await (await api('/api/health', { headers: { Authorization: 'Bearer nope' } })).json();
    eq(bad.authorized, false, 'bad token authorized');
  });
  await check('ingest refuses a call without the key', async () => {
    eq((await api('/api/ingest', { method: 'POST', body: '{}' })).status, 401, 'status');
    eq((await api('/api/uploads/sign', { method: 'POST', body: '{}' })).status, 401, 'sign status');
  });
  await check('a key outside the record is refused', async () => {
    const r = await api('/api/uploads/sign', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId: 'rec-aaaa0001', files: [{ key: 'records/other-rec-9999/files/0.png', contentType: 'image/png' }] }) });
    eq(r.status, 400, 'status');
    const t = await api('/api/uploads/sign', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId: 'rec-aaaa0001', files: [{ key: 'records/rec-aaaa0001/files/../../../x.png', contentType: 'image/png' }] }) });
    eq(t.status, 400, 'traversal status');
  });

  const statuses = site.dashboard.statuses.map((s) => s.id);
  const made = [];
  async function ingest(n, over = {}) {
    const id = `rec-test-000${n}`;
    const key = `records/${id}/files/0.png`;
    const sign = await (await api('/api/uploads/sign', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId: id, files: [{ key, contentType: 'image/png' }] }) })).json();
    const put = await fetch(sign[0].url, { method: sign[0].method, headers: sign[0].headers, body: PNG });
    if (!put.ok) throw new Error(`PUT to ${sign[0].url} -> ${put.status}`);
    const body = {
      id, title: `Test ${n} ${site.vocab.record}`, subtitle: `Place ${n}`, status: statuses[(n - 1) % statuses.length], category: n % 2 ? 'Alpha' : 'Beta', owner: `Owner ${n % 3}`, source: 'verify',
      occurredAt: new Date(Date.now() - n * 3600_000).toISOString(),
      metrics: Object.fromEntries((site.dashboard.metrics ?? []).map((m) => [m.key, n * 10])),
      data: { Note: `data ${n}` },
      items: [{ id: 'a', label: `Item A${n}`, status: statuses[0], value: n }, { id: 'b', label: `Item B${n}`, value: 2 }],
      files: [{ idx: 0, objectKey: key, caption: `File ${n}` }], ...over,
    };
    const r = await api('/api/ingest', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json(), body };
  }

  if (has('dashboard') || has('connect')) {
    await check('ingest stores a record with its file, and is idempotent', async () => {
      for (const n of [1, 2, 3]) { const r = await ingest(n); eq(r.status, 200, `ingest ${n} status ${JSON.stringify(r.json)}`); eq(r.json.updated, false, 'first ingest updated'); made.push(r.body); }
      const again = await ingest(1); eq(again.json.updated, true, 'second ingest updated');
    });
    await check('ingest refuses a record whose file never arrived', async () => {
      const r = await api('/api/ingest', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'rec-test-0099', files: [{ idx: 0, objectKey: 'records/rec-test-0099/files/0.png' }] }) });
      eq(r.status, 409, 'status');
    });
    await check('ingest refuses a bad status and a bad id', async () => {
      eq((await api('/api/ingest', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'rec-test-0098', status: 'not-a-status' }) })).status, 400, 'bad status');
      eq((await api('/api/ingest', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'x' }) })).status, 400, 'bad id');
    });
  }

  if (!has('dashboard')) return;
  section = 'dashboard';
  for (const vp of ['desktop', 'mobile']) {
    const { ctx, page } = await newPage(browser, vp, `dashboard-${vp}`);
    await page.goto(`${BASE}/login`);
    await page.locator('input[name=password]').fill(env.DASHBOARD_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/dashboard/);
    await page.waitForLoadState('networkidle');

    await check(`${vp}: stat cards show real numbers`, async () => {
      const n = await page.locator('.stat-card').count(); eq(n, site.dashboard.stats.length, 'stat cards');
      const first = (await page.locator('.stat-card .stat-n').first().innerText()).replace(/\D/g, '');
      eq(Number(first), 3, `first stat (${site.dashboard.stats[0].label})`);
    });
    await check(`${vp}: a card per record, with its thumbnail`, async () => {
      eq(await page.locator('.rec-card').count(), 3, 'cards');
      const imgs = await page.locator('.rec-thumb img').evaluateAll((els) => Promise.all(els.map((i) => (i.complete ? i.naturalWidth : new Promise((r) => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); })))));
      truthy(imgs.length === 3 && imgs.every((w) => w > 0), `thumbnails loaded (${imgs})`);
    });
    await check(`${vp}: search narrows the list`, async () => {
      await page.locator('#record-search').fill('Test 2');
      eq(await page.locator('.rec-card').count(), 1, 'one match');
      await page.locator('#record-search').fill('zzz-nothing');
      truthy(await page.getByText('Nothing matches.').isVisible(), 'empty state');
      await page.locator('#record-search').fill('');
    });
    await check(`${vp}: a status chip filters`, async () => {
      const tabs = page.getByRole('tab');
      truthy(await tabs.count() >= 2, 'chips');
      await tabs.nth(1).click();
      const shown = await page.locator('.rec-card').count();
      truthy(shown >= 1 && shown < 3 + 1, `chip shows ${shown}`);
      await tabs.nth(0).click();
      eq(await page.locator('.rec-card').count(), 3, 'all again');
    });
    await check(`${vp}: a facet select filters`, async () => {
      const sel = page.locator('.facet select').first();
      const opts = await sel.locator('option').allTextContents();
      truthy(opts.length >= 2, `facet options ${opts}`);
      await sel.selectOption({ index: 1 });
      truthy(await page.locator('.rec-card').count() <= 3, 'filtered');
      await page.getByRole('button', { name: /Clear/ }).click();
      eq(await page.locator('.rec-card').count(), 3, 'cleared');
    });
    await check(`${vp}: no horizontal scroll`, async () => { await noOverflow(page, 'dashboard'); });
    if (vp !== 'desktop') await check(`${vp}: dashboard controls are finger-sized`, async () => { await tapTargets(page, 'dashboard'); });
    await shot(page, `dashboard-${vp}`);

    await check(`${vp}: the detail page shows facts, the file, the items; status changes; delete works`, async () => {
      await page.locator('.rec-card').first().click();
      await page.waitForURL(/\/records\//);
      await page.waitForLoadState('networkidle');
      truthy((await page.locator('h1').innerText()).startsWith('Test'), 'title');
      eq(await page.locator('.gallery figure').count(), 1, 'gallery');
      eq(await page.locator('tbody tr').count(), 2, 'item rows');
      await noOverflow(page, 'detail');
      await shot(page, `record-${vp}`);
      const before = await page.getByTestId('record-status').innerText();
      const other = site.dashboard.statuses.find((s) => s.label !== before);
      await page.getByRole('button', { name: other.label, exact: true }).click();
      await page.waitForFunction((l) => document.querySelector('[data-testid=record-status]')?.textContent === l, other.label);
      page.once('dialog', (d) => d.accept());
      await page.getByRole('button', { name: new RegExp(`Delete ${site.vocab.record}`, 'i') }).click();
      await page.waitForURL(/\/dashboard/);
      await page.waitForLoadState('networkidle');
      eq(await page.locator('.rec-card').count(), 2, 'cards after delete');
    });
    await ctx.close();
    if (vp === 'desktop') { const r = await ingest(1); if (r.status !== 200) throw new Error('re-ingest after delete failed'); }
  }
  await check('an API caller without a session gets 401, not a redirect', async () => {
    eq((await api('/api/records/rec-test-0002', { method: 'PATCH', body: '{}' })).status, 401, 'status');
    eq((await api('/api/file?key=records/rec-test-0002/files/0.png', { redirect: 'manual' })).status, 401, 'file status');
  });
}

async function checkConnect(browser) {
  if (!has('connect')) return;
  section = 'connect';
  for (const vp of ['desktop', 'mobile']) {
    const { ctx, page } = await newPage(browser, vp, `connect-${vp}`);
    await page.goto(`${BASE}/login?next=/connect`);
    await page.locator('input[name=password]').fill(env.DASHBOARD_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/connect/);
    await check(`${vp}: shows the link with the key and copies it`, async () => {
      const link = await page.getByTestId('connect-link').innerText();
      truthy(link.startsWith('http') && link.includes('#key='), `link ${link}`);
      truthy(link.includes(encodeURIComponent(env.INGEST_TOKEN)), 'the key is in it');
      await page.getByRole('button', { name: 'Copy link' }).click();
      await page.getByRole('button', { name: /Copied/ }).waitFor();
      eq(await page.evaluate(() => navigator.clipboard.readText()), link, 'clipboard');
    });
    await check(`${vp}: no horizontal scroll`, async () => { await noOverflow(page, 'connect'); });
    await shot(page, `connect-${vp}`);
    await ctx.close();
  }
}

async function checkAdmin(browser) {
  if (!has('mfa')) return;
  section = 'mfa';
  const user = { name: 'Test Admin', username: 'testadmin', password: 'correct-horse-battery-9' };
  let secret = '';
  let enrolledStep = 0;
  const { ctx, page } = await newPage(browser, 'desktop', 'admin');

  await check('/admin with no account yet sends you to setup', async () => {
    await page.goto(`${BASE}/admin`); truthy(page.url().includes('/admin/setup'), page.url());
  });
  await check('setup refuses a wrong setup code', async () => {
    await page.locator('input[name=code]').fill('wrong'); await page.locator('input[name=name]').fill(user.name);
    await page.locator('input[name=username]').fill(user.username); await page.locator('input[name=password]').fill(user.password);
    await page.getByRole('button', { name: /authenticator/i }).click();
    await page.waitForURL(/error=/); truthy(await page.getByText('setup code is not right').isVisible(), 'message');
  });
  await check('setup refuses a short password', async () => {
    await page.goto(`${BASE}/admin/setup`);
    await page.locator('input[name=code]').fill(env.ADMIN_SETUP_CODE || env.SESSION_SECRET); await page.locator('input[name=name]').fill(user.name);
    await page.locator('input[name=username]').fill(user.username); await page.locator('input[name=password]').evaluate((e) => { e.removeAttribute('minlength'); });
    await page.locator('input[name=password]').fill('short');
    await page.getByRole('button', { name: /authenticator/i }).click();
    await page.waitForURL(/error=/); truthy(await page.getByText(/at least 10/).isVisible(), 'message');
  });
  await check('setup with the right code leads to a QR code and a secret', async () => {
    await page.goto(`${BASE}/admin/setup`);
    await page.locator('input[name=code]').fill(env.ADMIN_SETUP_CODE || env.SESSION_SECRET); await page.locator('input[name=name]').fill(user.name);
    await page.locator('input[name=username]').fill(user.username); await page.locator('input[name=password]').fill(user.password);
    await page.getByRole('button', { name: /authenticator/i }).click();
    await page.waitForURL(/\/admin\/enroll/);
    truthy(await page.locator('img.qr').isVisible(), 'QR visible');
    secret = (await page.locator('.secret').innerText()).replace(/\s/g, '');
    truthy(/^[A-Z2-7]{32}$/.test(secret), `secret ${secret}`);
    await shot(page, 'admin-enroll');
  });
  await check('a wrong authenticator code does not create the account', async () => {
    const bad = totp(secret, nowStep() + 40);
    await page.locator('input[name=code]').fill(bad); await page.getByRole('button', { name: /Confirm/ }).click();
    await page.waitForURL(/error=/); truthy(page.url().includes('/admin/enroll'), 'still enrolling');
  });
  await check('the right code confirms, creates the account and signs in', async () => {
    enrolledStep = nowStep() - 1; // inside the +-1 window; leaves now and now+1 for the next two sign-ins
    await page.locator('input[name=code]').fill(totp(secret, enrolledStep)); await page.getByRole('button', { name: /Confirm/ }).click();
    await page.waitForURL((u) => u.pathname === '/admin');
    truthy(await page.getByText(`Signed in as ${user.name}`).isVisible(), 'signed in as');
    await shot(page, 'admin-home');
  });
  await check('sign out, then step 1 (password) then step 2 (code) signs in again', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/admin\/login/);
    await page.locator('input[name=username]').fill(user.username); await page.locator('input[name=password]').fill(user.password);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(/\/admin\/verify/);
    // the code accepted at enrolment cannot be used again; the next time-step's code is inside the allowed window
    await page.locator('input[name=code]').fill(totp(secret, enrolledStep + 1)); await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => u.pathname === '/admin');
  });
  await check('a used authenticator code is refused (replay)', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.locator('input[name=username]').fill(user.username); await page.locator('input[name=password]').fill(user.password);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(/\/admin\/verify/);
    await page.locator('input[name=code]').fill(totp(secret, enrolledStep + 1)); await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/error=/); truthy(page.url().includes('/admin/verify'), 'still on verify');
  });
  await check('a wrong password gives one vague message', async () => {
    await page.goto(`${BASE}/admin/login`);
    await page.locator('input[name=username]').fill(user.username); await page.locator('input[name=password]').fill('nope-nope-nope');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(/error=/); truthy(await page.getByText('Wrong username or password.').isVisible(), 'vague');
    await page.goto(`${BASE}/admin/login`);
    await page.locator('input[name=username]').fill('nobody'); await page.locator('input[name=password]').fill('nope-nope-nope');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(/error=/); truthy(await page.getByText('Wrong username or password.').isVisible(), 'same message for an unknown user');
  });
  await check('sign in fully, then an invite link works once', async () => {
    await page.goto(`${BASE}/admin/login`);
    await page.locator('input[name=username]').fill(user.username); await page.locator('input[name=password]').fill(user.password);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForURL(/\/admin\/verify/);
    await page.locator('input[name=code]').fill(totp(secret, enrolledStep + 2)); await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => u.pathname === '/admin');
    await page.getByRole('button', { name: 'Add a person' }).click();
    const url = (await page.locator('.invite .linkline').innerText()).trim();
    truthy(url.includes('/admin/join?t='), `invite ${url}`);
    const c2 = await browser.newContext(); const p2 = await c2.newPage();
    await p2.goto(url);
    truthy(await p2.getByRole('heading', { name: new RegExp(`Join ${site.vocab.area}`) }).isVisible(), 'join page');
    await p2.locator('input[name=name]').fill('Second Person'); await p2.locator('input[name=username]').fill('second.person'); await p2.locator('input[name=password]').fill('another-long-pass-7');
    await p2.getByRole('button', { name: /authenticator/i }).click(); await p2.waitForURL(/\/admin\/enroll/);
    const s2 = (await p2.locator('.secret').innerText()).replace(/\s/g, '');
    await p2.locator('input[name=code]').fill(totp(s2, nowStep())); await p2.getByRole('button', { name: /Confirm/ }).click();
    await p2.waitForURL((u) => u.pathname === '/admin');
    const p3 = await (await browser.newContext()).newPage(); await p3.goto(url);
    truthy(await p3.getByText('This link does not work').isVisible(), 'second use refused');
    await c2.close();
    await page.reload();
    truthy(await page.getByText('second.person').first().isVisible(), 'second person listed');
  });
  await check('/admin cannot be reached with the shared password cookie alone', async () => {
    const c = await browser.newContext(); const p = await c.newPage();
    await p.goto(`${BASE}/admin`); truthy(p.url().includes('/admin/login'), p.url()); await c.close();
  });

  if (has('publishing')) await checkPublishing(browser, page, user, () => secret, () => enrolledStep);
  await ctx.close();
}

async function checkPublishing(browser, page, user) {
  section = 'publishing';
  const ext = site.publishing.extensions[0];
  const mkFile = (name, size = 4096) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(size, 7) });

  if (flag('parseApk')) {
    // Android flavour: the version, size and signature are read from a REAL signed APK (pass --apk older, --apk2 newer).
    const [a1, a2] = [arg('apk', ''), arg('apk2', '')];
    const exp = [{ file: a1, name: arg('apk-name', ''), code: arg('apk-code', '') }, { file: a2, name: arg('apk2-name', ''), code: arg('apk2-code', '') }];
    await check('real APKs were supplied (--apk/--apk2 with -name and -code)', async () => { truthy(exp.every((e) => e.file && fs.existsSync(e.file) && e.name && e.code), JSON.stringify(exp)); });
    const send = async (file, name, notes) => {
      await page.goto(`${BASE}/admin`); await page.waitForLoadState('networkidle');
      await page.getByTestId('release-file').setInputFiles(file);
      await page.getByPlaceholder(/What people see/).fill(name);
      await page.locator('.ProseMirror').click(); await page.keyboard.type(notes);
      await page.getByRole('button', { name: 'Publish', exact: true }).click();
    };
    await check('a file that is not an APK is refused', async () => {
      await send({ name: 'fake.apk', mimeType: 'application/octet-stream', buffer: Buffer.from('this is not a zip') }, 'Fake', 'x');
      await page.getByText(/Not a usable APK/).waitFor();
    });
    await check('an older real APK is published and its version is read from the file', async () => {
      await send(exp[0].file, 'First build', 'Older build notes');
      await page.getByText(new RegExp(`Published ${exp[0].name.replace(/\./g, '\.')}`)).waitFor({ timeout: 60000 });
      await page.waitForLoadState('networkidle');
      truthy(await page.getByText(new RegExp(`Version ${exp[0].name.replace(/\./g, '\.')} · build ${exp[0].code}`)).first().isVisible(), 'version + build shown from the APK');
    });
    await check('a newer real APK is accepted (higher build number)', async () => {
      await send(exp[1].file, 'Second build', 'Newer build notes');
      await page.getByText(new RegExp(`Published ${exp[1].name.replace(/\./g, '\.')}`)).waitFor({ timeout: 60000 });
    });
    await check('re-publishing the older build is refused', async () => {
      await send(exp[0].file, 'Again', 'x');
      await page.getByText(/already published/).waitFor({ timeout: 60000 });
    });
    await check('put the newest on the home page; the download is the exact file', async () => {
      await page.goto(`${BASE}/admin`); await page.waitForLoadState('networkidle');
      await page.locator('.version').first().locator('label.switch .track').click();
      await page.waitForFunction(() => document.querySelector('.version input[type=checkbox]')?.checked === true);
      if (has('landing')) {
        const d = await api(`/api/app/public/download?v=${exp[1].code}`); eq(d.status, 200, 'download status');
        eq((await d.arrayBuffer()).byteLength, fs.statSync(exp[1].file).size, 'bytes');
        eq(d.headers.get('content-type'), 'application/vnd.android.package-archive', 'content-type');
      }
    });
    await check('the update check returns the newest build with its checksum', async () => {
      const j = await (await api('/api/app/latest', { headers: bearer })).json();
      eq(String(j.latest.versionCode), exp[1].code, 'versionCode'); eq(j.latest.versionName, exp[1].name, 'versionName');
      eq(j.latest.sha256, crypto.createHash('sha256').update(fs.readFileSync(exp[1].file)).digest('hex'), 'sha256');
      truthy(j.latest.url, 'signed url');
    });
    await shot(page, 'admin-after');
    return;
  }

  await check('the publisher page is complete and fits a phone', async () => {
    await page.goto(`${BASE}/admin`);
    truthy(await page.getByRole('heading', { name: 'Publish a new version' }).isVisible(), 'publisher card');
    await noOverflow(page, 'admin desktop');
    const m = await browser.newContext({ viewport: VIEWPORTS.mobile, isMobile: true, hasTouch: true });
    await m.addCookies(await page.context().cookies());
    const mp = await m.newPage(); await mp.goto(`${BASE}/admin`); await mp.waitForLoadState('networkidle');
    await noOverflow(mp, 'admin mobile'); await shot(mp, 'admin-mobile'); await m.close();
  });
  await check('a wrong file type is refused', async () => {
    await page.getByTestId('release-file').setInputFiles({ name: 'notes.exe2', mimeType: 'application/octet-stream', buffer: Buffer.alloc(10) }).catch(() => undefined);
    truthy(await page.getByText(/is not a/).isVisible(), 'type error shown');
  });
  async function publish(v, build, name, notes, approve) {
    await page.goto(`${BASE}/admin`); await page.waitForLoadState('networkidle');
    await page.getByTestId('release-file').setInputFiles(mkFile(`${site.brand.slug}-${v}${ext}`));
    if (!flag('parseApk')) {
      await page.getByPlaceholder('1.4.0').fill(v); await page.getByPlaceholder('12').fill(String(build));
    }
    await page.getByPlaceholder(/What people see/).fill(name);
    await page.locator('.ProseMirror').click(); await page.keyboard.type(notes);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    return page;
  }
  await check('publishing a version stores it and lists it', async () => {
    await publish('1.0.0', 1, 'First release', 'First line of notes');
    await page.getByText(/Published 1.0.0/).waitFor();
    await page.waitForLoadState('networkidle');
    truthy(await page.getByText('First release').first().isVisible(), 'listed');
    truthy(await page.getByText('First line of notes').first().isVisible(), 'notes shown');
  });
  await check('a lower or equal build number is refused', async () => {
    await publish('0.9.0', 1, 'Old', 'x');
    await page.getByText(/already published/).waitFor();
  });
  await check('a second version, then it can be put on the home page', async () => {
    await publish('1.1.0', 2, 'Second release', 'Second notes');
    await page.getByText(/Published 1.1.0/).waitFor(); await page.waitForLoadState('networkidle');
    const sw = page.locator('.version').first().locator('label.switch');
    await sw.locator('.track').click();
    await page.waitForFunction(() => document.querySelector('.version input[type=checkbox]')?.checked === true);
  });
  if (has('landing')) await check('the home page now offers it and the download is the exact file', async () => {
    const r = await api('/'); const html = await r.text();
    truthy(html.includes('Second release'), 'release name on the home page');
    const d = await api('/api/app/public/download?v=2'); eq(d.status, 200, 'download status');
    eq((await d.arrayBuffer()).byteLength, 4096, 'bytes');
    eq((await api('/api/app/public/download?v=1')).status, 404, 'not approved is not downloadable');
    const { ctx, page: lp } = await newPage(browser, 'mobile', 'landing-after-publish');
    await lp.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await scrollThrough(lp);
    await noOverflow(lp, 'landing with a release'); await shot(lp, 'landing-with-release-mobile'); await ctx.close();
  });
  await check('hide, show and delete a version', async () => {
    await page.goto(`${BASE}/admin`); await page.waitForLoadState('networkidle');
    const first = page.locator('.version').first();
    await first.getByRole('button', { name: 'Hide' }).click();
    await first.getByText('Hidden').first().waitFor();
    await first.getByRole('button', { name: 'Show' }).click();
    await page.waitForFunction(() => !document.querySelector('.version .badge.hidden'));
    page.once('dialog', (d) => d.accept());
    const count = await page.locator('.version').count();
    await page.locator('.version').last().getByRole('button', { name: 'Delete' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.version').length === n - 1, count);
  });
  if (flag('testers')) await check('a tester gets a code once and the update check offers testing builds only to them', async () => {
    await page.goto(`${BASE}/admin`); await page.waitForLoadState('networkidle');
    await publish('1.2.0-beta', 3, 'Beta', 'Testing only'); await page.getByText(/Published 1.2.0-beta/).waitFor(); await page.waitForLoadState('networkidle');
    await page.locator('.version').first().getByRole('button', { name: 'Testers only' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.seg-b.on')].some((b) => b.textContent === 'Testers only'));
    await page.getByPlaceholder('Anna Kowalska').fill('Tess Tester'); await page.getByPlaceholder('anna@example.com').fill('tess@example.com');
    await page.getByRole('button', { name: /Add tester|Add/ }).first().click();
    const code = (await page.locator('.code-big').first().innerText()).trim();
    truthy(/^TST-/.test(code), `code ${code}`);
    const stable = await (await api('/api/app/latest', { headers: bearer })).json();
    truthy(stable.latest && stable.latest.channel === 'stable', 'stable latest is the stable build');
    eq(stable.testing, undefined, 'no testing key without a tester token');
    const bad = await api('/api/app/tester', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'tess@example.com', code: 'WRONG' }) });
    eq(bad.status, 401, 'wrong code');
    const ok = await (await api('/api/app/tester', { method: 'POST', headers: { ...bearer, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'tess@example.com', code }) })).json();
    truthy(ok.token, 'token issued');
    const withTok = await (await api('/api/app/latest', { headers: { ...bearer, 'X-Tester-Token': ok.token } })).json();
    eq(withTok.tester?.name, 'Tess Tester', 'tester name'); eq(withTok.testing?.versionName, '1.2.0-beta', 'testing build offered');
  });
  await shot(page, 'admin-after');
}

async function checkHydration(browser) {
  section = 'hydration';
  // Real browsers hit pages with a WARM cache (scripts already downloaded for the page before). That is when a server-rendered page
  // that streams in pieces can start hydrating too early - a React #418 error - so load every page type right after the home page.
  const targets = ['/login', '/connect', '/dashboard', '/admin/login', '/admin/setup'].filter((u) => {
    if (u === '/login') return has('signin');
    if (u === '/connect') return has('connect');
    if (u === '/dashboard') return has('dashboard');
    return has('mfa');
  });
  const first = has('landing') ? '/' : (targets[0] ?? '/');
  for (const u of targets) {
    await check(`${u} hydrates cleanly 6 times after ${first} (warm cache)`, async () => {
      const ctx = await browser.newContext(); const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', (e) => { if (/Minified React error #(418|423|425|299)|[Hh]ydrat/.test(e.message)) errs.push(e.message.slice(0, 90)); });
      for (let i = 0; i < 6; i++) { await p.goto(`${BASE}${first}`, { waitUntil: 'networkidle' }); await p.goto(`${BASE}${u}`, { waitUntil: 'networkidle' }); }
      await ctx.close();
      if (errs.length) throw new Error(`${errs.length} hydration error(s) in 6 loads: ${errs[0]}`);
    });
  }
}

// ---- run ------------------------------------------------------------------------------------------------------------------------
let browser;
try {
  console.log(`site-kit verify: ${site.brand.name}  modules: ${site.modules.join(', ')}  -> ${BASE}`);
  await startServer();
  browser = await chromium.launch({ headless: true });
  if (has('landing')) await checkLanding(browser);
  if (has('signin')) await checkSignin(browser);
  await checkApiAndDashboard(browser);
  await checkConnect(browser);
  await checkAdmin(browser);
  await checkHydration(browser);
  section = 'console';
  await check('no browser console errors or uncaught exceptions', async () => { if (consoleErrors.length) throw new Error(`${consoleErrors.length}: ${consoleErrors.slice(0, 5).join(' | ')}`); });
} catch (e) {
  results.push({ label: 'run', ok: false, error: String(e.stack ?? e) }); console.log(`  FAIL  run\n        ${e.message}`);
} finally {
  if (browser) await browser.close();
  if (server && !KEEP) { server.kill(); await new Promise((r) => setTimeout(r, 800)); }
  if (!KEEP) for (const d of scratch) fs.rmSync(d, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ site: site.brand.name, modules: site.modules, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} FAILED` : ''}  (screenshots + report.json in ${OUT})`);
process.exit(failed.length ? 1 : 0);
