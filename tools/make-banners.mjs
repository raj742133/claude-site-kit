// Renders the README banner (1600x640) and the social-share image (1200x630) from banner.html with Playwright.
//   cd <folder where `npm i playwright` has been run> && node make-banners.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const html = pathToFileURL(path.join(here, 'banner.html')).href;
const out = path.join(here, '..', 'site', 'assets');
const browser = await chromium.launch();
for (const [file, w, h, hash] of [['banner.png', 1600, 640, ''], ['og.png', 1200, 630, '#og']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(html + hash);
  await page.addStyleTag({ content: `:root{--w:${w}px;--h:${h}px}` });
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, file) });
  console.log('wrote', file);
}
await browser.close();
