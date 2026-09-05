# torturedcheck

Tortured-phrase detection for academic documents. Identifies machine-paraphrased
/ paper-mill content by scanning for nonsensical synonym-substituted phrases from
the [Problematic Paper Screener (PPS)](https://dbrech.irit.fr/pls/apex/f?p=9999:5:::NO:::)
dictionary by Cabanac, Labbé & Magazinov.

Pure `text → structured data` — no I/O, no database, no HTTP. Bundles the PPS
dictionary; works offline out of the box.

Extracted from the Scimeto platform so the community can validate and
reuse it. Accuracy iteration is ongoing — see [CHANGELOG.md](./CHANGELOG.md) and
the [release tags](https://github.com/giladfeldman/torturedcheck/tags) for the
current version. (No version is quoted here on purpose; a hardcoded one goes
stale silently.)

## Install

**Distributed as a git-tag dependency, not via npm.** This package is
deliberately not published to the npm registry, so `npm i torturedcheck` will
not work — the `import ... from 'torturedcheck'` below resolves via a tag pin:

```jsonc
// package.json
"dependencies": {
  "torturedcheck": "github:giladfeldman/torturedcheck#v0.1.1"
}
```

npm clones the repo and runs the `prepare` script, which builds `dist/` — a tag
pin installs a working build with no registry involved. The `files` field in
`package.json` is standard packaging metadata kept ready for a possible future
publish; it has no effect on the git-tag install path.

Always pin an explicit tag. A bare `github:giladfeldman/torturedcheck` floats on
the default branch, so upstream changes land in your build silently.

## API

```typescript
import {
  loadDictionary,           // Load the bundled PPS dictionary (cached)
  buildFirstWordIndex,      // Pre-index for fast scanning
  scanForTorturedPhrases,   // Core detection: text → TorturedPhraseMatch[]
  getRiskLevel,             // Risk-level classifier: count + density → level
  normalizeText,            // Normalize text for matching
  tokenize,                 // Tokenize normalized text with offsets
} from 'torturedcheck';

const dictionary = loadDictionary();
const index = buildFirstWordIndex(dictionary.phrases);
const matches = scanForTorturedPhrases(myText, dictionary, index);
const risk = getRiskLevel(matches.length, myText.split(/\s+/).length);
console.log(risk.level); // 'clean' | 'low' | 'suspicious' | 'high'
```
