// Icons for generated sites. Config names icons as "prefix:name" (Iconify ids, the same ids the better-icons tool finds:
// github.com/better-auth/better-icons, MIT) or as a bare "name" in the site's default set (lucide). At generation time each icon is
// resolved to its SVG once, checked, and written into the project as plain data (src/components/icons/icons.ts), so a built site makes
// no icon requests and has no icon dependency.
//
// Where an icon comes from, in this order:
//   1. the pack shipped with the kit (templates/icons/lucide.json: 200+ common Lucide icons, ISC), so a site has icons with no network;
//   2. an installed @iconify-json/<prefix> package (every Iconify set is published that way: npm i -D @iconify-json/tabler);
//   3. the cache from an earlier run (~/.cache/sitewright/icons);
//   4. the Iconify API (api.iconify.design), the service better-icons searches, unless --offline-icons.
//
// Icon data is untrusted text that ends up inlined in a page, so every body is re-built from an allow-list of SVG elements and
// attributes (no scripts, no handlers, no links, no styles); anything else rejects the icon.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK_DIR = path.join(HERE, '..', '..', 'templates', 'icons');
export const DEFAULT_SET = 'lucide';
export const API = 'https://api.iconify.design';

// ---- ids -----------------------------------------------------------------------------------------------------------------------
const PART = '[a-z0-9]+(?:-[a-z0-9]+)*';
const ID = new RegExp(`^(${PART}):(${PART})$`);

/** "coffee" -> "lucide:coffee" (in the default set), "mdi:home" stays. Returns null for anything that is not an icon id. */
export function normalizeId(raw, set = DEFAULT_SET) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes(':')) return ID.test(s) ? s : null;
  return new RegExp(`^${PART}$`).test(s) ? `${set}:${s}` : null;
}

// ---- sanitiser -----------------------------------------------------------------------------------------------------------------
const ELEMENTS = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop']);
const ATTRS = new Set([
  'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity',
  'fill-opacity', 'fill-rule', 'clip-rule', 'opacity', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'width', 'height',
  'points', 'id', 'clip-path', 'mask', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'maskUnits', 'maskContentUnits',
  'clipPathUnits', 'spreadMethod', 'vector-effect',
]);
const URL_ATTRS = new Set(['fill', 'stroke', 'clip-path', 'mask']);
const SAFE_VALUE = /^[#\w\s.,:;()%+\-/*]*$/;

/** Re-builds an icon body from allowed elements and attributes only. Returns null when anything else is present. Ids are made unique per icon. */
export function sanitizeBody(body, uid = 'i') {
  if (typeof body !== 'string' || !body.trim() || body.length > 20000) return null;
  const tag = /<\s*(\/?)\s*([A-Za-z][\w:-]*)((?:\s+[^<>]*?)?)\s*(\/?)\s*>/g;
  let out = '', last = 0, depth = 0, m;
  const ids = new Set();
  const parts = [];
  while ((m = tag.exec(body))) {
    if (body.slice(last, m.index).trim() !== '') return null; // text between tags (a <title>, a <script> body, stray markup)
    last = tag.lastIndex;
    const [, close, name, rest, self] = m;
    if (!ELEMENTS.has(name)) return null;
    if (close) { if (self || rest.trim() || --depth < 0) return null; parts.push({ close: name }); continue; }
    const attrs = [];
    let left = rest.trim();
    const attr = /^([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*/;
    while (left) {
      const a = attr.exec(left);
      if (!a) return null;
      left = left.slice(a[0].length);
      const [, k, v1, v2] = a; const v = v1 ?? v2;
      if (!ATTRS.has(k) || !SAFE_VALUE.test(v) || /javascript:|data:|expression\(/i.test(v)) return null;
      if (/url\(/i.test(v) && !(URL_ATTRS.has(k) && /^url\(#[\w-]+\)$/.test(v.trim()))) return null;
      if (k === 'id') ids.add(v);
      attrs.push([k, v]);
    }
    if (!self) depth++;
    parts.push({ name, attrs, self: !!self });
  }
  if (body.slice(last).trim() !== '' || depth !== 0 || !parts.length) return null;
  const re = (v) => v.replace(/url\(#([\w-]+)\)/g, (x, id) => (ids.has(id) ? `url(#${uid}-${id})` : x));
  for (const p of parts) {
    if (p.close) { out += `</${p.close}>`; continue; }
    const a = p.attrs.map(([k, v]) => ` ${k}="${k === 'id' ? `${uid}-${v}` : re(v)}"`).join('');
    out += `<${p.name}${a}${p.self ? '/' : ''}>`;
  }
  return out;
}

// ---- Iconify data --------------------------------------------------------------------------------------------------------------
/** Wraps an alias that flips or rotates its parent. */
function transformed(body, w, h, a) {
  const t = [];
  if (a.hFlip || a.vFlip) t.push(`translate(${a.hFlip ? w : 0} ${a.vFlip ? h : 0}) scale(${a.hFlip ? -1 : 1} ${a.vFlip ? -1 : 1})`);
  if (a.rotate) t.push(`rotate(${(a.rotate % 4) * 90} ${w / 2} ${h / 2})`);
  return t.length ? `<g transform="${t.join(' ')}">${body}</g>` : body;
}

/** One icon out of an Iconify icon set (a parsed icons.json, or the API's reply), following aliases. */
export function pickIcon(set, name) {
  let cur = name, flips = {}, depth = 0;
  while (!set.icons?.[cur] && set.aliases?.[cur] && depth++ < 10) {
    const a = set.aliases[cur];
    flips = { hFlip: flips.hFlip !== a.hFlip && (flips.hFlip || a.hFlip), vFlip: flips.vFlip !== a.vFlip && (flips.vFlip || a.vFlip), rotate: ((flips.rotate ?? 0) + (a.rotate ?? 0)) % 4 };
    cur = a.parent;
  }
  const ic = set.icons?.[cur];
  if (!ic) return null;
  const w = ic.width ?? set.width ?? 16, h = ic.height ?? set.height ?? 16;
  return { body: transformed(ic.body, w, h, flips), w, h };
}

// ---- licences ------------------------------------------------------------------------------------------------------------------
const PERMISSIVE = new Set(['MIT', 'ISC', 'Apache-2.0', 'CC0-1.0', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Unlicense', 'MPL-2.0', 'OFL-1.1', 'Zlib']);
/** 'ok' = no more than keeping the notice (written for you); 'attribution' = needs credit visible to people; 'refuse' = not for a product. */
export function licenseKind(info) {
  const spdx = info?.license?.spdx ?? '';
  if (PERMISSIVE.has(spdx)) return 'ok';
  if (/^CC-BY-(\d|SA)/.test(spdx) && !/NC|ND/.test(spdx)) return 'attribution';
  return 'refuse';
}

// ---- sources -------------------------------------------------------------------------------------------------------------------
const cacheDir = () => process.env.SITEWRIGHT_ICON_CACHE || path.join(os.homedir(), '.cache', 'sitewright', 'icons');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

function kitPack(prefix) {
  const f = path.join(PACK_DIR, `${prefix}.json`);
  return fs.existsSync(f) ? readJson(f) : null;
}

/** A locally installed @iconify-json/<prefix>, found from the working folder or the folder this script is run from. */
function installedSet(prefix) {
  for (const base of [process.cwd(), HERE]) {
    try {
      const req = createRequire(path.join(base, 'noop.js'));
      const dir = path.dirname(req.resolve(`@iconify-json/${prefix}/package.json`));
      const icons = readJson(path.join(dir, 'icons.json'));
      if (icons) return { ...icons, info: readJson(path.join(dir, 'info.json')) };
    } catch { /* not installed here */ }
  }
  return null;
}

async function api(pathAndQuery, fetchImpl) {
  const res = await fetchImpl(`${API}${pathAndQuery}`, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${API}${pathAndQuery.split('?')[0]} answered ${res.status}`);
  return res.json();
}

/** Searches Iconify (what `better-icons search` does). Needs the network. */
export async function searchIcons(query, { prefix, limit = 24, fetchImpl = fetch } = {}) {
  const q = new URLSearchParams({ query, limit: String(Math.min(999, limit)) });
  if (prefix) q.set('prefix', prefix);
  const r = await api(`/search?${q}`, fetchImpl);
  return r.icons ?? [];
}

/** Searches the icons available without the network: names in the kit's pack and any installed set. */
export function searchLocal(query, prefix = DEFAULT_SET) {
  const words = query.toLowerCase().split(/[\s,-]+/).filter(Boolean);
  const pack = kitPack(prefix) ?? installedSet(prefix);
  if (!pack) return [];
  const names = Object.keys(pack.icons ?? {}).concat(Object.keys(pack.aliases ?? {}));
  return [...new Set(names)].filter((n) => words.every((w) => n.includes(w))).sort().map((n) => `${prefix}:${n}`);
}

/**
 * Resolves icon ids to sanitised SVG bodies.
 * @returns {{ icons: Record<string,{body:string,w:number,h:number}>, sets: Record<string, object>, missing: string[], problems: string[], notes: string[] }}
 */
export async function resolveIcons(ids, { offline = false, fetchImpl = fetch, allowLicenses = [] } = {}) {
  const want = [...new Set(ids)];
  const byPrefix = new Map();
  for (const id of want) { const [p, n] = id.split(':'); (byPrefix.get(p) ?? byPrefix.set(p, []).get(p)).push(n); }
  const icons = {}, sets = {}, missing = [], problems = [], notes = [];
  const cacheFile = (p) => path.join(cacheDir(), `${p}.json`);

  for (const [prefix, names] of byPrefix) {
    let info = null;
    const found = new Map(); // name -> { body, w, h }
    const take = (set, source) => {
      for (const n of names) if (!found.has(n)) { const ic = pickIcon(set, n); if (ic) found.set(n, ic); }
      if (!info && set.info) info = { ...set.info, source };
    };
    const kit = kitPack(prefix); if (kit) take(kit, 'kit');
    if (names.some((n) => !found.has(n))) { const inst = installedSet(prefix); if (inst) take(inst, 'installed'); }
    if (names.some((n) => !found.has(n))) { const cached = readJson(cacheFile(prefix)); if (cached) take(cached, 'cache'); }
    const lacking = () => names.filter((n) => !found.has(n));
    if (lacking().length && !offline) {
      try {
        const fresh = await api(`/${prefix}.json?icons=${lacking().join(',')}`, fetchImpl);
        const collections = info ? null : await api(`/collections?prefixes=${prefix}`, fetchImpl).catch(() => null);
        const infoFromApi = collections?.[prefix] ? { name: collections[prefix].name, author: collections[prefix].author, license: collections[prefix].license, source: 'iconify' } : null;
        take({ ...fresh, info: infoFromApi }, 'iconify');
        // remember what was fetched, so the next run does not need the network
        const prev = readJson(cacheFile(prefix)) ?? { prefix, icons: {}, aliases: {} };
        prev.icons = { ...prev.icons, ...(fresh.icons ?? {}) }; prev.aliases = { ...prev.aliases, ...(fresh.aliases ?? {}) };
        prev.width = fresh.width ?? prev.width; prev.height = fresh.height ?? prev.height; prev.info = infoFromApi ?? prev.info;
        try { fs.mkdirSync(cacheDir(), { recursive: true }); fs.writeFileSync(cacheFile(prefix), JSON.stringify(prev)); } catch { /* a read-only home is fine */ }
      } catch (e) { notes.push(`could not reach Iconify for ${prefix} (${e.message})`); }
    }
    if (!info && names.some((n) => found.has(n))) {
      // an icon set whose licence could not be read is not used until the person says so
      if (!allowLicenses.includes(prefix)) {
        problems.push(`${prefix}: the licence of this icon set could not be read (no network, or no info in the set), so its icons were left out. Allow it knowingly with --allow-icon-license ${prefix}, or use a set that is installed or in the kit.`);
        for (const n of names) missing.push(`${prefix}:${n}`);
        continue;
      }
      info = { name: prefix, license: { spdx: 'unknown', title: 'unknown (allowed by you)' }, source: 'unknown' };
    }
    if (info) {
      const kind = licenseKind(info);
      if (kind === 'refuse' && info.source !== 'unknown' && !allowLicenses.includes(prefix)) {
        problems.push(`${prefix}: the "${info.name ?? prefix}" set is licensed ${info.license?.spdx ?? info.license?.title ?? 'unknown'}, which is not for use in a product by default. Pick another set, or allow it knowingly with --allow-icon-license ${prefix}.`);
        for (const n of names) missing.push(`${prefix}:${n}`);
        continue;
      }
      if (kind === 'attribution') notes.push(`${prefix}: "${info.name}" is ${info.license.spdx}: credit the author where people can see it (written into icons/NOTICE.md).`);
      sets[prefix] = { ...info, kind: info.source === 'unknown' ? 'unknown' : kind };
    }
    for (const n of names) {
      const ic = found.get(n);
      if (!ic) { missing.push(`${prefix}:${n}`); continue; }
      const uid = `ic${crypto.createHash('sha1').update(`${prefix}:${n}`).digest('hex').slice(0, 6)}`;
      const body = sanitizeBody(ic.body, uid);
      if (!body) { problems.push(`${prefix}:${n}: the icon contains markup that is not plain drawing (scripts, links, styles or text), so it was left out.`); continue; }
      icons[`${prefix}:${n}`] = { body, w: ic.w, h: ic.h };
    }
  }
  return { icons, sets, missing, problems, notes };
}

/** Checks and cleans custom icons given as { name: "<path d='...'/>" } and returns them keyed "custom:name". */
export function customIcons(map = {}) {
  const icons = {}, problems = [];
  for (const [name, raw] of Object.entries(map ?? {})) {
    if (!new RegExp(`^${PART}$`).test(name)) { problems.push(`icons.custom: "${name}" must be lowercase letters, digits and dashes.`); continue; }
    // a pasted whole <svg>...</svg> is accepted: only what is inside it is kept, and its viewBox sets the size
    const m = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(String(raw));
    const vb = m && /viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(m[1]);
    const body = sanitizeBody(m ? m[2] : String(raw), `cu${name.length}${name.slice(0, 4).replace(/\W/g, '')}`);
    if (!body) { problems.push(`icons.custom.${name}: only plain shapes are allowed (path, circle, rect, line, polyline, polygon, ellipse, g and gradients).`); continue; }
    icons[`custom:${name}`] = { body, w: vb ? Number(vb[1]) : 24, h: vb ? Number(vb[2]) : 24 };
  }
  return { icons, problems };
}

// ---- choosing icons for the places a site has them ------------------------------------------------------------------------------
/** Words to icons for `icons: "auto"`. Whole-word stems (so "order" matches "orders" but "border" never matches); the specific rules come first.
 *  A title that matches nothing gets no icon, never a guess: a wrong icon is worse than none. */
const KEYWORDS = [
  ['coffee|roast|bean|brew|espresso|cafe', 'coffee'], ['bake|bread|cake|pastry|dessert', 'cake-slice'], ['food|meal|menu|kitchen|restaurant|catering', 'utensils'],
  ['gym|fitness|workout|training|exercise', 'dumbbell'], ['clinic|medical|doctor|health|patient', 'stethoscope'], ['law|legal|court|attorney|matter', 'scale'],
  ['design|studio|creative|artwork|palette', 'palette'], ['learn|course|lesson|school|student|teach', 'graduation-cap'], ['farm|crop|harvest|grain', 'wheat'],
  ['ship|shipped|dispatch|shipment|deliver|delivered|delivery|courier|freight', 'truck'], ['order|parcel|package|release|version|artifact', 'package'],
  ['payment|invoice|billing|bill|fee|price|paid|subscription', 'credit-card'], ['revenue|sales|growth|trend|analytics|metric|stat', 'chart-line'],
  ['customer|client|guest|member', 'user'], ['team|people|staff|crew|user', 'users'], ['schedule|appointment|booking|calendar', 'calendar'], ['time|hour|duration|deadline', 'clock'],
  ['pending|waiting|queue|review', 'hourglass'], ['attention|issue|problem|urgent|warning|alert|overdue', 'triangle-alert'], ['error|failed|rejected|cancel|declined', 'circle-x'],
  ['done|complete|ready|reviewed|approved|resolved|verified', 'circle-check'], ['new|fresh|latest', 'sparkles'],
  ['secure|security|private|password|sign|login|protect', 'lock'], ['scan|barcode|qr', 'qr-code'], ['photo|image|picture|gallery', 'image'],
  ['message|chat|support|help|question', 'message-circle'], ['mail|email|newsletter|inbox', 'mail'], ['map|location|address|store|shop|branch', 'map-pin'],
  ['fast|quick|instant|speed|real-time', 'zap'], ['track|status|progress|activity', 'activity'], ['sync|update|refresh|automatic|backup', 'refresh-cw'],
  ['guide|step|checklist|task|todo|plan', 'list-checks'], ['launch|begin|start', 'rocket'], ['search|find|lookup', 'search'], ['offline|connect|wifi|network', 'wifi'],
  ['phone|tablet|mobile|device|app', 'smartphone'], ['file|document|report|record|note', 'file-text'], ['share|send|invite', 'send'], ['download|install', 'download'],
].map(([stems, icon]) => [new RegExp(`\\b(?:${stems})\\w*`), icon]);
export const iconFor = (text, exclude = new Set()) => { const t = String(text ?? '').toLowerCase(); for (const [re, name] of KEYWORDS) if (re.test(t) && !exclude.has(name)) return name; return null; };
const NAV = { dashboard: 'layout-dashboard', connect: 'smartphone', publishing: 'package', team: 'users', home: 'house' };

/**
 * Every place in a config that can carry an icon, as { key, label, get, set }. `key` is what people type to point at it.
 *   nav.<id>  stats.<n>  statuses.<id>  features.ready.<n>  features.next.<n>  story.<n>
 */
export function iconSlots(cfg, modules = []) {
  const has = (m) => modules.includes(m);
  const slots = [];
  const nav = (cfg.nav ??= {}); nav.icons ??= {};
  for (const id of Object.keys(NAV)) {
    const visible = id === 'dashboard' ? has('dashboard') : id === 'connect' ? has('connect') : id === 'publishing' ? has('publishing') : id === 'team' ? has('mfa') && !has('publishing') : has('landing');
    if (visible) slots.push({ key: `nav.${id}`, label: id, fallback: NAV[id], get: () => nav.icons[id], set: (v) => { if (v) nav.icons[id] = v; else delete nav.icons[id]; } });
  }
  if (has('dashboard')) {
    const d = cfg.dashboard ?? {};
    (d.statuses ?? []).forEach((s) => slots.push({ key: `statuses.${s.id}`, label: `${s.id} ${s.label}`, fallback: { new: 'sparkles', reviewed: 'circle-check', attention: 'triangle-alert' }[s.id], get: () => s.icon, set: (v) => { if (v) s.icon = v; else delete s.icon; } }));
    (d.stats ?? []).forEach((s, i) => slots.push({ key: `stats.${i}`, label: s.label, get: () => s.icon, set: (v) => { if (v) s.icon = v; else delete s.icon; } }));
  }
  if (has('landing')) {
    const f = cfg.landing?.features;
    if (f) {
      (f.ready ?? []).forEach((t, i) => slots.push({ key: `features.ready.${i}`, label: t[0], more: t[1], get: () => t[2], set: (v) => { t[2] = v || ''; } }));
      (f.next ?? []).forEach((t, i) => slots.push({ key: `features.next.${i}`, label: t[0], more: t[1], get: () => t[3], set: (v) => { t[2] = t[2] ?? false; t[3] = v || ''; } }));
    }
    (cfg.landing?.story?.steps ?? []).forEach((s, i) => slots.push({ key: `story.${i}`, label: s.title, more: s.text, get: () => s.icon, set: (v) => { if (v) s.icon = v; else delete s.icon; } }));
  }
  return slots;
}

/** Normalises every icon in the config to a full id, and with `auto` fills the empty places that a word clearly names. Returns the ids in use. */
export function planIcons(cfg, modules, { auto = false, set = DEFAULT_SET } = {}) {
  const used = new Set(), problems = [];
  const group = (k) => k.split('.')[0];
  const taken = new Map(); // group -> icon names already in it, so one list never shows the same icon twice
  const slots = iconSlots(cfg, modules);
  for (const slot of slots) {
    const v = slot.get();
    if (!v) continue;
    const id = String(v).startsWith('custom:') ? String(v).toLowerCase() : normalizeId(v, set);
    if (!id) { problems.push(`${slot.key}: "${v}" is not an icon id. Use "prefix:name" (lucide:coffee) or just "coffee".`); slot.set(null); continue; }
    slot.set(id); used.add(id);
    (taken.get(group(slot.key)) ?? taken.set(group(slot.key), new Set()).get(group(slot.key))).add(id.split(':')[1]);
  }
  if (auto) {
    for (const slot of slots) {
      if (slot.get()) continue;
      const ex = taken.get(group(slot.key)) ?? taken.set(group(slot.key), new Set()).get(group(slot.key));
      const name = (slot.fallback && !ex.has(slot.fallback) ? slot.fallback : null) ?? iconFor(slot.label, ex);
      if (name) { const id = `${set}:${name}`; slot.set(id); used.add(id); ex.add(name); }
    }
  }
  return { used: [...used], problems };
}

/** The files a generated project gets: the icon data, and a notice with every set's licence. */
export function iconFiles({ icons, sets, custom }) {
  const entries = Object.entries({ ...icons, ...custom }).sort(([a], [b]) => a.localeCompare(b));
  const data = [
    '// Generated by Sitewright: the icons this site uses, as sanitised SVG. Change them with `scaffold.mjs --apply-icons` (or edit site.json and run it).',
    'export const ICONS: Record<string, { b: string; w: number; h: number }> = {',
    ...entries.map(([id, v]) => `  ${JSON.stringify(id)}: { b: ${JSON.stringify(v.body)}, w: ${v.w}, h: ${v.h} },`),
    '};',
    '',
  ].join('\n');
  const used = (p) => Object.keys(icons).filter((id) => id.startsWith(`${p}:`)).map((id) => id.split(':')[1]);
  const notice = [
    '# Icon notices',
    '',
    'The icons in `icons.ts` come from the open icon sets below, through [Iconify](https://iconify.design). Each stays under its own licence.',
    '',
    ...Object.entries(sets).flatMap(([p, s]) => [
      `## ${s.name ?? p} (\`${p}\`)`,
      '',
      `- Author: ${s.author?.name ?? 'see the set'}${s.author?.url ? ` (${s.author.url})` : ''}`,
      `- Licence: ${s.license?.title ?? s.license?.spdx ?? 'unknown'}${s.license?.url ? ` (${s.license.url})` : ''}`,
      ...(s.kind === 'attribution' ? ['- **This licence asks for credit where people can see it.** Add a line such as "Icons: ' + (s.name ?? p) + ' by ' + (s.author?.name ?? 'the authors') + ', ' + (s.license?.spdx ?? '') + '" to your footer or credits page.'] : []),
      `- Used: ${used(p).join(', ')}`,
      ...(s.licenseText ? ['', '```', s.licenseText, '```'] : []),
      '',
    ]),
    ...(Object.keys(custom).length ? ['## Your own icons (`custom`)', '', `Used: ${Object.keys(custom).map((i) => i.split(':')[1]).join(', ')}`, ''] : []),
  ].join('\n');
  return { data, notice };
}
