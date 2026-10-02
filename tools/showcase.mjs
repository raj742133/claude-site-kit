#!/usr/bin/env node
// Builds the marketing screenshots: starts a GENERATED site (production build) on a throwaway database, fills it with demo data from a
// seed file, then photographs every page the site has, light and dark, desktop and phone.
//
//   cd <folder where `npm i playwright` has been run>
//   node showcase.mjs --site D:/sites/coffee --seed seeds/coffee.json --port 4301 --out ../site/assets/shots/coffee
//
// Everything in the seeds is fictional. The "photos" are generated gradients, not real photographs.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const SITE = path.resolve(arg('site'));
const SEED = JSON.parse(fs.readFileSync(path.resolve(arg('seed')), 'utf8'));
const PORT = Number(arg('port', '4301'));
const OUT = path.resolve(arg('out'));
const BASE = `http://localhost:${PORT}`;
fs.mkdirSync(OUT, { recursive: true });

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

const site = JSON.parse(fs.readFileSync(path.join(SITE, 'src/content/site.json'), 'utf8'));
const env = Object.fromEntries(fs.readFileSync(path.join(SITE, '.env.local'), 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const has = (m) => site.modules.includes(m);

// ---- TOTP (RFC 6238), only to sign in to the demo site's own admin area ------------------------------------------------------
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

// ---- server ------------------------------------------------------------------------------------------------------------------
const stamp = Date.now();
const scratch = [path.join(SITE, `.show-pg-${stamp}`), path.join(SITE, `.show-storage-${stamp}`)];
const server = spawn(process.execPath, [path.join(SITE, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORT)], {
  cwd: SITE, stdio: 'ignore',
  env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: `pglite://.show-pg-${stamp}`, STORAGE_PROVIDER: 'local', LOCAL_STORAGE_DIR: `.show-storage-${stamp}`, PUBLIC_BASE_URL: BASE },
});
async function stop() {
  try { server.kill(); } catch { /* already gone */ }
  await new Promise((r) => setTimeout(r, 1500));
  for (const d of scratch) fs.rmSync(d, { recursive: true, force: true });
}
for (let i = 0; ; i++) {
  try { const r = await fetch(`${BASE}/`, { redirect: 'manual' }); if (r.status < 500) break; } catch { /* not up yet */ }
  if (i > 80) { await stop(); throw new Error('server did not start'); }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
const jpg = async (page, name, opts = {}) => {
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86, ...opts });
  console.log('  shot', name);
};
const settle = async (page, ms = 700) => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(ms); };
async function scrollThrough(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 450) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(70); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}
const ctxFor = (kind, scheme = 'light') => browser.newContext(kind === 'desktop'
  ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme }
  : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });

try {
  // ---- demo "photos": generated, brand-coloured, clearly not real ------------------------------------------------------------
  const helper = await (await ctxFor('desktop')).newPage();
  await helper.goto(`${BASE}/`);
  const palette = SEED.photoColors ?? ['#7a4a21', '#e8a33d', '#2d6a4f', '#1b2a4a'];
  const photo = async (seed) => helper.evaluate(async ({ seed, palette }) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
    let s = seed * 9301 + 49297; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const a = palette[seed % palette.length], b = palette[(seed + 1) % palette.length];
    const grad = g.createLinearGradient(0, 0, 640, 480); grad.addColorStop(0, a); grad.addColorStop(1, b); g.fillStyle = grad; g.fillRect(0, 0, 640, 480);
    for (let i = 0; i < 9; i++) { g.globalAlpha = 0.14 + rnd() * 0.22; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(rnd() * 640, rnd() * 480, 40 + rnd() * 110, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 0.22; g.fillStyle = '#000'; g.fillRect(0, 380, 640, 100);
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  }, { seed, palette }).then((b64) => Buffer.from(b64, 'base64'));

  // ---- records ---------------------------------------------------------------------------------------------------------------
  if (has('dashboard') || has('connect')) {
    const bearer = { Authorization: `Bearer ${env.INGEST_TOKEN}`, 'Content-Type': 'application/json' };
    let n = 0;
    for (const rec of SEED.records ?? []) {
      n++;
      const id = `demo-${String(n).padStart(4, '0')}-${site.brand.slug}`.slice(0, 60);
      const files = [];
      for (let f = 0; f < (rec.photos ?? 1); f++) {
        const key = `records/${id}/files/${f}.jpg`;
        const sign = await (await fetch(`${BASE}/api/uploads/sign`, { method: 'POST', headers: bearer, body: JSON.stringify({ recordId: id, files: [{ key, contentType: 'image/jpeg' }] }) })).json();
        const put = await fetch(sign[0].url, { method: sign[0].method, headers: sign[0].headers, body: await photo(n * 3 + f) });
        if (!put.ok) throw new Error(`upload ${put.status}`);
        files.push({ idx: f, objectKey: key, caption: rec.captions?.[f] ?? null });
      }
      const body = {
        id, title: rec.title, subtitle: rec.subtitle, status: rec.status, category: rec.category, owner: rec.owner, source: rec.source,
        occurredAt: new Date(Date.now() - (rec.hoursAgo ?? n * 5) * 3600_000).toISOString(), metrics: rec.metrics ?? {}, data: rec.data ?? {},
        items: (rec.items ?? []).map((it, i) => ({ id: `i${i}`, label: it[0], value: it[1], status: it[2] ?? null, note: it[3] ?? null })), files,
      };
      const r = await fetch(`${BASE}/api/ingest`, { method: 'POST', headers: bearer, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`ingest ${rec.title}: ${r.status} ${await r.text()}`);
    }
    console.log(`  seeded ${n} ${site.vocab.records}`);
  }
  await helper.context().close();

  // ---- landing ---------------------------------------------------------------------------------------------------------------
  // (publishing happens first when there is an admin area, so the landing page can show a release)
  let adminShots = null;
  if (has('mfa')) {
    const ctx = await ctxFor('desktop'); const page = await ctx.newPage();
    const user = { name: SEED.admin?.name ?? 'Demo Admin', username: SEED.admin?.username ?? 'demo.admin', password: 'demo-password-2026' };
    await page.goto(`${BASE}/admin/gate`).catch(() => undefined);
    await page.goto(`${BASE}/admin/setup`); await settle(page, 300);
    await jpg(page, 'admin-setup');
    await page.locator('input[name=code]').fill(env.ADMIN_SETUP_CODE || env.SESSION_SECRET); await page.locator('input[name=name]').fill(user.name);
    await page.locator('input[name=username]').fill(user.username); await page.locator('input[name=password]').fill(user.password);
    await page.getByRole('button', { name: /authenticator/i }).click(); await page.waitForURL(/\/admin\/enroll/); await settle(page, 400);
    await jpg(page, 'admin-enroll');
    const secret = (await page.locator('.secret').innerText()).replace(/\s/g, '');
    await page.locator('input[name=code]').fill(totp(secret, nowStep() - 1)); await page.getByRole('button', { name: /Confirm/ }).click();
    await page.waitForURL((u) => u.pathname === '/admin'); await settle(page, 500);
    if (has('publishing')) {
      const ext = (site.publishing?.extensions ?? ['.zip'])[0];
      let build = 0;
      for (const rel of SEED.releases ?? []) {
        build++;
        await page.goto(`${BASE}/admin`); await settle(page, 300);
        const buf = Buffer.alloc(rel.kb * 1024, 7);
        await page.getByTestId('release-file').setInputFiles({ name: `${site.brand.slug}-${rel.version}${ext}`, mimeType: 'application/octet-stream', buffer: buf });
        await page.getByPlaceholder('1.4.0').fill(rel.version); await page.getByPlaceholder('12').fill(String(build));
        await page.getByPlaceholder(/What people see/).fill(rel.name);
        await page.locator('.ProseMirror').click(); await page.keyboard.type(rel.notes);
        if (build === (SEED.releases ?? []).length) { await jpg(page, 'admin-publish-form'); }
        await page.getByRole('button', { name: 'Publish', exact: true }).click();
        await page.getByText(new RegExp(`Published ${rel.version.replace(/\./g, '\\.')}`)).waitFor();
        await page.waitForLoadState('networkidle');
      }
      // newest on the home page
      if (has('landing') && (SEED.releases ?? []).length) {
        await page.goto(`${BASE}/admin`); await settle(page, 500);
        const sw = page.locator('.version').first().locator('label.switch');
        await sw.locator('.track').click();
        await page.waitForFunction(() => document.querySelector('.version input[type=checkbox]')?.checked === true);
      }
    }
    await page.goto(`${BASE}/admin`); await settle(page, 700);
    await jpg(page, 'admin-home', { fullPage: true });
    await page.getByRole('button', { name: 'Sign out' }).click(); await page.waitForURL(/\/admin\/login/); await settle(page, 400);
    await jpg(page, 'admin-login');
    adminShots = { user, secret };
    await ctx.close();
    // phone view of the admin area
    const m = await ctxFor('mobile'); const mp = await m.newPage();
    await mp.goto(`${BASE}/admin/login`); await mp.locator('input[name=username]').fill(user.username); await mp.locator('input[name=password]').fill(user.password);
    await mp.getByRole('button', { name: 'Continue' }).click(); await mp.waitForURL(/\/admin\/verify/);
    await mp.locator('input[name=code]').fill(totp(secret, nowStep())); await mp.getByRole('button', { name: 'Sign in' }).click();
    await mp.waitForURL((u) => u.pathname === '/admin'); await settle(mp, 700);
    await jpg(mp, 'admin-mobile');
    await m.close();
  }

  if (has('landing')) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await ctxFor('desktop', scheme); const page = await ctx.newPage();
      await page.goto(`${BASE}/`); await settle(page, 1800);
      await jpg(page, scheme === 'light' ? 'landing-hero' : 'landing-hero-dark');
      if (scheme === 'light') {
        await scrollThrough(page);
        const at = async (id, frac, name) => {
          const el = page.locator(`#${id}`);
          if (!(await el.count())) return;
          await el.evaluate((e, f) => { const r = e.getBoundingClientRect(); const top = r.top + window.scrollY; window.scrollTo(0, top + Math.max(0, r.height - window.innerHeight) * f - (f === 0 ? 20 : 0)); }, frac);
          await page.waitForTimeout(1400);
          await jpg(page, name);
        };
        await at('story', 0.0, 'landing-story'); await at('story', 0.55, 'landing-story-2');
        for (const id of ['proof', 'features', 'compat', 'releases', 'help']) await at(id, 0.0, `landing-${id}`);
      }
      await ctx.close();
    }
    const m = await ctxFor('mobile'); const mp = await m.newPage();
    await mp.goto(`${BASE}/`); await settle(mp, 1800);
    await jpg(mp, 'landing-mobile');
    await scrollThrough(mp);
    await mp.evaluate(() => document.querySelector('#story')?.scrollIntoView()); await mp.waitForTimeout(1200);
    await jpg(mp, 'landing-mobile-story');
    await m.close();
  }

  // ---- private pages ---------------------------------------------------------------------------------------------------------
  if (has('signin')) {
    const ctx = await ctxFor('desktop'); const page = await ctx.newPage();
    await page.goto(`${BASE}/login`); await settle(page, 500);
    await jpg(page, 'signin');
    await page.locator('input[name=password]').fill(env.DASHBOARD_PASSWORD); await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login')); await settle(page, 900);
    if (has('dashboard')) {
      await page.goto(`${BASE}/dashboard`); await settle(page, 900);
      await jpg(page, 'dashboard');
      await jpg(page, 'dashboard-full', { fullPage: true });
      const cards = page.locator('.rec-card');
      if (await cards.count()) {
        await cards.first().click(); await page.waitForURL(/\/records\//); await settle(page, 900);
        await jpg(page, 'record', { fullPage: true });
      }
    }
    if (has('connect')) { await page.goto(`${BASE}/connect`); await settle(page, 700); await jpg(page, 'connect'); }
    await ctx.close();

    const m = await ctxFor('mobile'); const mp = await m.newPage();
    await mp.goto(`${BASE}/login`); await mp.locator('input[name=password]').fill(env.DASHBOARD_PASSWORD); await mp.getByRole('button', { name: 'Sign in' }).click();
    await mp.waitForURL((u) => !u.pathname.startsWith('/login')); await settle(mp, 800);
    if (has('dashboard')) {
      await mp.goto(`${BASE}/dashboard`); await settle(mp, 900); await jpg(mp, 'dashboard-mobile');
      const c = mp.locator('.rec-card'); if (await c.count()) { await c.first().click(); await mp.waitForURL(/\/records\//); await settle(mp, 800); await jpg(mp, 'record-mobile'); }
    }
    if (has('connect')) { await mp.goto(`${BASE}/connect`); await settle(mp, 700); await jpg(mp, 'connect-mobile'); }
    await m.close();

    if (has('dashboard')) {
      const d = await ctxFor('desktop', 'dark'); const dp = await d.newPage();
      await dp.goto(`${BASE}/login`); await dp.locator('input[name=password]').fill(env.DASHBOARD_PASSWORD); await dp.getByRole('button', { name: 'Sign in' }).click();
      await dp.waitForURL((u) => !u.pathname.startsWith('/login')); await dp.goto(`${BASE}/dashboard`); await settle(dp, 900);
      await jpg(dp, 'dashboard-dark');
      await d.close();
    }
  }
  console.log(`done: ${site.brand.name}`);
} finally {
  await browser.close();
  await stop();
}
