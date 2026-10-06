#!/usr/bin/env node
// `npm run dev`: the Next.js dev server, plus a watcher that keeps your icons in line with your code, so an <Icon name="rocket" />
// you just typed shows up as soon as you save. Everything else is plain `next dev` (extra arguments are passed on).
import { spawn } from 'node:child_process';
import { watchProject } from './icons/icons.mjs';

const stop = await watchProject(process.cwd(), {}, (m) => console.log(m)).catch((e) => { console.log(`icons: watcher off (${e.message})`); return () => {}; });
const win = process.platform === 'win32';
const child = spawn(win ? 'npx.cmd' : 'npx', ['next', 'dev', ...process.argv.slice(2)], { stdio: 'inherit', shell: win });
child.on('exit', (code) => { stop(); process.exit(code ?? 0); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
