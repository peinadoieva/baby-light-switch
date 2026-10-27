// Builds dist/baby-light-switch.html: index.html with engine.js inlined, so the whole app is one file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const engine = readFileSync(join(root, 'engine.js'), 'utf8').replace(/^export /gm, '');

const importLine = /^[ \t]*import \{[^}]*\} from '\.\/engine\.js';[ \t]*\n/m;
if (!importLine.test(html)) throw new Error("index.html has no import from './engine.js' to inline");
const full = html.replace(importLine, () => engine + '\n');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'baby-light-switch.html'), full);
console.log('wrote dist/baby-light-switch.html');
