#!/usr/bin/env node
// Builds and drives every example config, plain and with every optional layer switched on, and prints one table. Run it after any change
// to the generator, the templates or the verifier: it is the "did I break any site type" check.
//
//   node tools/regress.mjs [--examples coffee,legal,quotes-tags-braces] [--variants plain,max] [--parallel 3] [--out ./regress-out] [--no-verify]
//                          [--modules ./some/node_modules]
//
// For each example it: scaffolds the site (the "max" variant adds figures, icons and the aurora-glass effects), type-checks it, runs
// `npm run build` (which also runs the project's own icon and figure sync), and drives it in Chromium with verify.mjs. The projects share
// one dependency install: the first run does `npm install` once (or pass --modules to reuse an existing node_modules).
// Needs Node 20+, and for the browser part `npm i playwright && npx playwright install chromium` somewhere resolvable from the cwd.
//
// A step that cannot run (a missing browser, no network for npm) says so; it is not reported as a pass.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.join(HERE, '..', 'skill', 'sitewright');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);

// Two kinds of site: the skill's examples (run plain, and with every layer switched on) and tools/fixtures (stress cases with their own
// settings - a brand name full of quotes, near-black and near-white colours, single modules, effect combinations - run as they are).
const listJson = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : []);
const EX_DIR = path.join(SKILL, 'examples'), FIX_DIR = path.join(HERE, 'fixtures');
const sites = [...listJson(EX_DIR).map((name) => ({ name, file: path.join(EX_DIR, `${name}.json`), fixture: false })), ...listJson(FIX_DIR).map((name) => ({ name, file: path.join(FIX_DIR, `${name}.json`), fixture: true }))];
const wanted = arg('examples', '') ? arg('examples', '').split(',') : null;
const chosen = sites.filter((s) => !wanted || wanted.includes(s.name));
const variants = arg('variants', 'plain,max').split(',');
const parallel = Math.max(1, Number(arg('parallel', 3)));
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'sitewright-regress')));
const win = process.platform === 'win32';
fs.mkdirSync(OUT, { recursive: true });

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, shell: win && /^(npm|npx)$/.test(cmd) ? true : opts.shell });
    let out = '';
    p.stdout?.on('data', (d) => { out += d; });
    p.stderr?.on('data', (d) => { out += d; });
    p.on('error', (e) => resolve({ code: 1, out: String(e.message) }));
    p.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

// one shared install of the dependencies (the full module set is a superset of every other)
let modulesDir = arg('modules', '');
async function ensureModules() {
  if (modulesDir) return path.resolve(modulesDir);
  const dir = path.join(OUT, '_deps');
  if (fs.existsSync(path.join(dir, 'node_modules'))) return path.join(dir, 'node_modules');
  console.log('installing dependencies once (a few minutes) ...');
  fs.rmSync(dir, { recursive: true, force: true });
  const sc = await run(process.execPath, [path.join(SKILL, 'scripts', 'scaffold.mjs'), '--config', path.join(SKILL, 'examples', 'coffee.json'), '--out', dir, '--quiet', '--offline-icons']);
  if (sc.code) throw new Error(`scaffold failed:\n${sc.out}`);
  const inst = await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir });
  if (inst.code) throw new Error(`npm install failed:\n${inst.out.slice(-1500)}`);
  return path.join(dir, 'node_modules');
}

async function devSmoke(dir, port) {
  const p = spawn('npm', ['run', 'dev', '--', '-p', String(port)], { cwd: dir, shell: win, detached: !win, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  let log = ''; p.stdout.on('data', (d) => { log += d; }); p.stderr.on('data', (d) => { log += d; });
  try {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch(`http://localhost:${port}/`, { redirect: 'manual' });
        return res.status >= 500 ? `/ answered ${res.status}: ${(log.match(/(?:⨯|Error).*/) || [''])[0].slice(0, 120)}` : '';
      } catch { /* not listening yet */ }
    }
    return 'did not start in 90s';
  } finally { if (win) spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']); else { try { process.kill(-p.pid); } catch { p.kill(); } } }
}

async function one(site, variant, port, modules) {
  const example = site.name;
  const dir = path.join(OUT, `${example}-${variant}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const r = { name: `${example} ${variant}`, scaffold: '-', tsc: '-', build: '-', verify: '-', fails: [] };
  const extra = variant === 'max' && example !== 'gallery' && !site.fixture ? ['--figures', 'auto', '--icons', 'auto', '--preset', 'aurora-glass', '--offline-icons'] : ['--offline-icons'];
  const sc = await run(process.execPath, [path.join(SKILL, 'scripts', 'scaffold.mjs'), '--config', site.file, '--out', dir, '--quiet', ...extra]);
  if (sc.code) { r.scaffold = 'FAIL'; r.fails.push(sc.out.trim().split('\n').slice(-2).join(' ')); return r; }
  r.scaffold = 'ok';
  fs.symlinkSync(modules, path.join(dir, 'node_modules'), 'junction');
  const tsc = await run('npx', ['tsc', '--noEmit'], { cwd: dir });
  r.tsc = tsc.code ? 'FAIL' : 'ok'; if (tsc.code) r.fails.push(tsc.out.trim().split('\n').slice(0, 3).join(' '));
  const build = await run('npm', ['run', 'build'], { cwd: dir });
  r.build = build.code ? 'FAIL' : 'ok'; if (build.code) { r.fails.push(build.out.trim().split('\n').slice(-6).join(' ')); return r; }
  // `npm run dev` is what people actually use, and it renders differently from the production build (it once answered every page that
  // touched the database with a 500 while the build verified clean), so start it and make sure the first page comes back.
  const dev = await devSmoke(dir, port + 1000);
  if (dev) { r.build = 'ok'; r.fails.push(`dev server: ${dev}`); }
  if (flag('no-verify')) { r.verify = 'skipped'; return r; }
  const v = await run(process.execPath, [path.join(SKILL, 'scripts', 'verify.mjs'), '--site', dir, '--port', String(port), '--out', path.join(dir, '_shots')], { cwd: process.cwd() });
  const m = /(\d+)\/(\d+) checks passed(?:, (\d+) skipped[^,]*)?(?:, (\d+) FAILED)?/.exec(v.out);
  if (!m) { r.verify = 'could not run'; r.fails.push(v.out.trim().split('\n').slice(-3).join(' ')); return r; }
  r.verify = `${m[1]}/${m[2]}${m[3] ? ` (${m[3]} skipped)` : ''}${m[4] ? ` ${m[4]} FAILED` : ''}`;
  r.fails.push(...[...v.out.matchAll(/^ {2}FAIL {2}(.+)\n {8}(.+)$/gm)].map((x) => `${x[1]}: ${x[2]}`));
  return r;
}

const modules = await ensureModules();
const jobs = chosen.flatMap((s) => variants.filter((v) => !(s.name === 'gallery' && v === 'max') && !(s.fixture && v === 'max')).map((v) => [s, v]));
const results = []; let next = 0, port = 5200;
await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
  while (next < jobs.length) {
    const [s, v] = jobs[next++]; const p = port++;
    const r = await one(s, v, p, modules); results.push(r);
    console.log(`${r.name.padEnd(22)} scaffold ${r.scaffold}  tsc ${r.tsc}  build ${r.build}  verify ${r.verify}`);
  }
}));

console.log('\n' + 'site'.padEnd(22) + 'scaffold  tsc   build  verify');
for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) console.log(`${r.name.padEnd(22)}${r.scaffold.padEnd(10)}${r.tsc.padEnd(6)}${r.build.padEnd(7)}${r.verify}`);
const failing = results.filter((r) => r.fails.length || [r.scaffold, r.tsc, r.build].includes('FAIL') || /FAILED|could not/.test(r.verify));
if (failing.length) { console.log('\nWhat failed:'); for (const r of failing) for (const f of r.fails) console.log(`  ${r.name}: ${f}`.slice(0, 300)); }
console.log(failing.length ? `\n${failing.length} of ${results.length} sites have failures.` : `\nAll ${results.length} sites pass.`);
process.exit(failing.length ? 1 : 0);
