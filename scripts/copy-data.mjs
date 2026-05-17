// Copies the bundled PPS dictionary from src/data into dist/data after the
// tsc build, since tsc only emits .ts -> .js and ignores data files.
import { mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'src', 'data');
const distDir = join(root, 'dist', 'data');
mkdirSync(distDir, { recursive: true });
copyFileSync(join(srcDir, 'tortured-phrases.json'), join(distDir, 'tortured-phrases.json'));
console.log('copied tortured-phrases.json');
