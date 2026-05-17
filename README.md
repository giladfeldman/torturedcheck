# torturedcheck

Tortured-phrase detection for academic documents. Identifies machine-paraphrased
/ paper-mill content by scanning for nonsensical synonym-substituted phrases from
the [Problematic Paper Screener (PPS)](https://dbrech.irit.fr/pls/apex/f?p=9999:5:::NO:::)
dictionary by Cabanac, Labbé & Magazinov.

Pure `text → structured data` — no I/O, no database, no HTTP. Bundles the PPS
dictionary; works offline out of the box.

Extracted from the CitationGuard platform so the community can validate and
reuse it. Status: 0.1.0, behavior-preserving extraction; accuracy iteration
is ongoing.

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
