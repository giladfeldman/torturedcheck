import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TorturedPhrasesDictionary } from './torturedPhrasesDetection.js';

// Lazy __dirname resolution to avoid import.meta.url at module level
// (matches the referencecheck/beallsList.ts pattern; keeps Jest happy).
let _cachedDirname: string | null = null;
function getDirname(): string {
  if (!_cachedDirname) {
    _cachedDirname = dirname(fileURLToPath(import.meta.url));
  }
  return _cachedDirname;
}

let cachedDictionary: TorturedPhrasesDictionary | null = null;

/**
 * Load the bundled PPS tortured-phrases dictionary (cached after first load).
 * Resolves `dist/data/tortured-phrases.json` relative to the compiled module.
 * The dictionary is copied into dist/data/ by the `copy-data` build step.
 */
export function loadDictionary(): TorturedPhrasesDictionary {
  if (cachedDictionary) return cachedDictionary;
  // Compiled module sits at dist/loadDictionary.js; the bundled dataset is
  // copied to dist/data/tortured-phrases.json by the copy-data build step.
  const dataPath = join(getDirname(), 'data', 'tortured-phrases.json');
  const raw = readFileSync(dataPath, 'utf-8');
  cachedDictionary = JSON.parse(raw) as TorturedPhrasesDictionary;
  return cachedDictionary;
}
