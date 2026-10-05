#!/usr/bin/env node
// Builds skill/sitewright/templates/icons/lucide.json: the icons the kit ships with so a site can have icons with no network.
//   npm pack @iconify-json/lucide && tar xzf iconify-json-lucide-*.tgz
//   npm pack lucide-static && tar xzf lucide-static-*.tgz -C ls      (for its LICENSE: ISC, plus MIT for the icons derived from Feather)
//   node tools/make-icon-pack.mjs ./package ./ls/package/LICENSE
// Lucide is ISC licensed; the licence and author travel in the pack and end up in every generated site's icons/NOTICE.md.
// Any other set (or any other Lucide icon) is fetched from Iconify at generation time, or read from an installed @iconify-json/<set>.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(process.argv[2] ?? 'package');
const licenseFile = process.argv[3] ? path.resolve(process.argv[3]) : null;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skill/sitewright/templates/icons/lucide.json');

const NAMES = `
house layout-dashboard smartphone tablet laptop monitor package package-check package-open box boxes truck store shopping-cart shopping-bag
credit-card wallet receipt banknote coins tag tags percent gift coffee utensils cake-slice pizza wine beer leaf sprout flame droplet sun moon
cloud zap battery wifi signal bluetooth globe map-pin map compass navigation calendar calendar-check clock timer hourglass history bell bell-ring
mail message-circle message-square phone send share-2 link qr-code scan-line camera image images video mic music file file-text file-check
folder folder-open archive download upload cloud-upload cloud-download save copy clipboard-list clipboard-check list-checks list layers
layout-grid table chart-bar chart-line chart-pie trending-up trending-down activity gauge target flag bookmark star heart thumbs-up smile
user users user-check user-plus user-round id-card key-round lock lock-open shield shield-check fingerprint eye eye-off search filter
sliders-horizontal settings wrench hammer cog plug power refresh-cw rotate-ccw undo-2 redo-2 plus minus x check check-check circle-check
circle-x circle-alert triangle-alert info circle-help ban trash-2 pencil pen-line square-pen scissors paperclip arrow-right arrow-left
arrow-up arrow-down arrow-up-right chevron-right chevron-down external-link menu ellipsis sparkles wand-sparkles rocket lightbulb puzzle
code terminal database server hard-drive cpu git-branch bug graduation-cap book-open newspaper scale gavel briefcase building-2 factory
warehouse hospital stethoscope pill dumbbell bike car plane ship tree-pine mountain palette brush shirt scan-barcode barcode wheat apple
carrot fish egg milk handshake badge-check award trophy crown wrench-screwdriver ruler pocket-knife paintbrush
`.split(/\s+/).filter(Boolean);

const json = JSON.parse(fs.readFileSync(path.join(src, 'icons.json'), 'utf8'));
const info = JSON.parse(fs.readFileSync(path.join(src, 'info.json'), 'utf8'));
const alias = (n) => { let c = n, d = 0; while (json.aliases?.[c] && d++ < 10) c = json.aliases[c].parent; return c; };
const icons = {}, missing = [];
for (const n of NAMES) { const real = alias(n); const ic = json.icons[real]; if (ic) icons[n] = { body: ic.body }; else missing.push(n); }
const pack = {
  prefix: 'lucide', width: json.width ?? 24, height: json.height ?? 24,
  info: { name: info.name, author: info.author, license: info.license, source: 'https://github.com/lucide-icons/lucide', licenseText: licenseFile ? fs.readFileSync(licenseFile, 'utf8').trim() : undefined, version: JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version },
  icons,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(pack) + '\n');
console.log(`wrote ${Object.keys(icons).length} icons to ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
if (missing.length) console.log('not in this version of the set, left out:', missing.join(', '));
