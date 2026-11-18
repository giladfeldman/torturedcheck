# torturedcheck

Tortured-phrase detection for academic text, as a TypeScript library. It flags the
nonsensical synonym substitutions that paraphrasing tools leave behind, such as
"counterfeit consciousness" for *artificial intelligence* or "kidney disappointment" for
*kidney failure*. These substitutions are a known marker of machine-paraphrased and
paper-mill manuscripts.

It works from text to structured data. The library makes no network calls and uses no
database. It needs no configuration and no environment variables, and it works offline:
the dictionary is bundled.

The library was extracted from the Scimeto platform so that the community can inspect,
validate and reuse it.

## Scientific basis

Tortured phrases were described by Cabanac, Labbé & Magazinov (2021), *Tortured phrases:
A dubious writing style emerging in science*,
[10.48550/arXiv.2107.06751](https://doi.org/10.48550/arXiv.2107.06751). Their Problematic
Paper Screener (PPS) maintains the list of known tortured phrases and the expressions they
replace.

This package bundles a snapshot of that list: `tortured-phrases.json`, with 7,942 pairs,
dated 2026-03-06 and licensed CC BY 4.0. It is attributed in the file's `source`,
`sourceUrl` and `license` fields. The source is the
[Problematic Paper Screener](https://dbrech.irit.fr/pls/apex/f?p=9999:5:::NO:::).

**A match is a signal for a human to review, not a verdict.** The list is curated from
real paraphrased papers. Some of its entries are also ordinary phrasing in some fields,
which is why this library adds a precision whitelist (see *Detection rules*).

## Install

**torturedcheck is distributed as a git-tag dependency, not through npm.** It is
deliberately not published to the npm registry, so `npm i torturedcheck` will not work.
Pin a tag:

```jsonc
// package.json
"dependencies": {
  "torturedcheck": "github:giladfeldman/torturedcheck#v0.2.0"
}
```

npm clones the repository and runs the `prepare` script, which builds `dist/` and copies
the dictionary into `dist/data/`. Always pin an explicit tag: a bare
`github:giladfeldman/torturedcheck` follows the default branch, so upstream changes land
in your build without warning. The package requires Node.js 18 or later and is ESM-only
(`import`, not `require`). npm 11 prints an `allow-scripts` warning about the `prepare`
script during this install. The build still runs: this was verified with npm 11.16 by
installing from a local git URL into an empty project.

## Quickstart

`node scripts/check-docs-coverage.mjs` executes this block against a fresh build on
every run.

```js
import { loadDictionary, buildFirstWordIndex, scanForTorturedPhrases, getRiskLevel } from 'torturedcheck';

const text =
  'Our counterfeit consciousness model reduced the kidney disappointment rate. ' +
  'The   Surface Region was measured.';

const dictionary = loadDictionary();                     // bundled PPS list (cached)
const index = buildFirstWordIndex(dictionary.phrases);   // build once, reuse across texts
const matches = scanForTorturedPhrases(text, dictionary, index);

for (const m of matches) console.log(`${m.tortured} -> ${m.correct} @${m.offset}+${m.length} "${m.matchedText}"`);
// counterfeit consciousness -> artificial intelligence @4+25 "counterfeit consciousness"
// kidney disappointment -> kidney failure @48+21 "kidney disappointment"
// surface region -> surface area @82+14 "Surface Region"
// (offsets are in `text` as passed in: text.slice(82, 96) === 'Surface Region')

const risk = getRiskLevel(matches.length, text.split(/\s+/).length);
console.log(risk.level, '-', risk.description);
// suspicious - Suspicious - density 214.29/1000 words across 3 matches
```

## API

| Export | Signature | Does |
|---|---|---|
| `loadDictionary` | `() => TorturedPhrasesDictionary` | Reads the bundled `dist/data/tortured-phrases.json` and caches it for the life of the process. |
| `buildFirstWordIndex` | `(phrases: TorturedPhrase[]) => Map<string, FirstWordEntry[]>` | Indexes the phrases by their first word, reading each entry with the same `normalizeText` + `tokenize` as the text. Phrases with fewer than two words are skipped, and longer phrases are tried first. |
| `scanForTorturedPhrases` | `(text, dictionary, firstWordIndex?) => TorturedPhraseMatch[]` | Runs the detection. If `firstWordIndex` is omitted, the index is rebuilt from `dictionary.phrases` on every call, so pass a prebuilt index when you scan many texts. |
| `getRiskLevel` | `(matchCount, wordCount?) => { level, description }` | Rates the whole document from the match count and the match density. A `wordCount` of 0 or less gives `not_checked`. |
| `dictionaryCoverage` | `(phrases: TorturedPhrase[]) => DictionaryCoverage` | Counts what the scanner can and cannot see of a dictionary, so "N phrases checked" is measured rather than read from `totalPhrases`. |
| `normalizeWithMap` | `(text) => { normalized, map }` | The normalisation behind `normalizeText`, plus `map`: for each character of `normalized`, the index of the character of `text` it came from (`map[normalized.length] === text.length`). |
| `normalizeText` | `(text) => string` | Applies Unicode compatibility form (PDF ligatures such as `ﬁ` become `fi`), lower-cases, straightens curly quotes and apostrophes to `'` and `"`, turns every Unicode dash and hyphen into `-`, collapses whitespace (line breaks and non-breaking spaces included) and trims. |
| `tokenize` | `(text) => { word, offset }[]` | Returns the words: runs of letters or digits, with internal apostrophes allowed (`dulbecco's`). Hyphens, slashes, commas and brackets separate words, so `man-made`, `man made` and `man‐made` read the same. Use it on normalized text. |

### Types

**`TorturedPhrase`**, a dictionary entry:

| Field | Meaning |
|---|---|
| `tortured` | The paraphrased form, for example `counterfeit consciousness`. |
| `correct` | The established expression it replaces, for example `artificial intelligence`. |

**`TorturedPhrasesDictionary`**, the bundled file:

| Field | Value in the bundled file |
|---|---|
| `version` | `1.0.0` |
| `lastUpdated` | `2026-03-06` |
| `source` | The attribution: Problematic Paper Screener (PPS) by Cabanac, Labbé & Magazinov. |
| `sourceUrl` | The PPS URL. |
| `license` | `CC BY 4.0` |
| `totalPhrases` | 7942 |
| `phrases` | A `TorturedPhrase[]`. |

You can pass your own dictionary of the same shape to `scanForTorturedPhrases` (with a
matching index), for example a newer PPS export.

**`TorturedPhraseMatch`**, one hit:

| Field | Meaning |
|---|---|
| `tortured` | The dictionary entry as written in the dictionary. |
| `correct` | The expression it replaces. |
| `offset` | The start position in the text you passed in: `text.slice(offset, offset + length)` is the phrase as written. (Before 0.2.0 this was a position in the normalized text, off by every collapsed whitespace run and ligature before the match.) |
| `length` | The length of the match in the text you passed in. |
| `matchedText` | The matched phrase exactly as written in the text you passed in. |
| `context` | Up to 80 characters of your text on each side of the match, whitespace collapsed. `...` marks where the text was cut. |

**`DictionaryCoverage`**, returned by `dictionaryCoverage`:

| Field | Meaning |
|---|---|
| `total` | Entries in the dictionary. |
| `indexed` | Multi-word entries the scanner can match. |
| `skippedSingleWord` | Entries of one word, not indexed (too common to flag). Empty for the bundled dictionary. |
| `unmatchable` | Entries in which no word survives tokenisation. Empty for the bundled dictionary. |
| `whitelisted` | Indexed entries suppressed on purpose (see Whitelist). 6 in the bundled dictionary. |

**`FirstWordEntry`**, the value type of the index. It is not exported by name:

| Field | Meaning |
|---|---|
| `words` | The phrase's words after normalization. |
| `gaps` | What separates consecutive words in the entry, with spaces and hyphens removed: `''` for `fluffy logic` or `man-made`, `,` for `accuracy, review`, `(` for `intelligence (ai)`. |
| `wordCount` | The number of words. |
| `correct` | The expression the phrase replaces. |
| `original` | The `tortured` string as written in the dictionary. |

### `getRiskLevel(matchCount, wordCount?)`

`level` is one of `not_checked`, `clean`, `low`, `suspicious` or `high`. `description` is a
human-readable reason that includes the density.

| Condition | `level` |
|---|---|
| `wordCount` is given and is 0 or less (nothing to scan) | `not_checked` |
| `matchCount` is 0 | `clean` |
| density < 0.3 per 1,000 words | `low`, whatever the count |
| density ≥ 1.2 per 1,000 words **and** `matchCount` ≥ 6 | `high` |
| density ≥ 0.6 per 1,000 words **and** `matchCount` ≥ 3 | `suspicious` |
| anything else | `low` |

When `wordCount` is omitted, only the count is used: 1–3 matches is `low`, 4–8 is
`suspicious`, and 9 or more is `high`. Pass `wordCount` whenever you can, because long
papers collect incidental matches.

## Detection rules

The text is normalized and tokenized. At each token, the scan tries the dictionary
phrases that begin with that word, longest first. It keeps the first phrase that matches
word for word. It skips a match that overlaps an earlier one, and it skips whitelisted
phrases.

- **Whitelist.** 98 multi-word phrases are never reported, although some of them are in
  the dictionary. They are common academic and technical collocations such as
  `machine learning`, `effect size`, `confidence interval`, `control group` and
  `mental health`, plus four psychology, neuroscience and medicine terms: `brain
  organization`, `feedback processing`, `facial expression processing` and `malignant
  growth`. The list is fixed in the source (`PHRASE_WHITELIST` in
  `src/torturedPhrasesDetection.ts`) and cannot be changed at runtime.
- **Word boundaries.** A phrase may not start inside a hyphenated compound
  (`self-regulated learning` does not match the entry `regulated learning`), and what
  separates its words in the text must be what separates them in the entry, where a
  space, a line break and a hyphen count as the same (`fluffy-logic` matches
  `fluffy logic`; `fluffy. Logic`, `fluffy/logic` and `fluffy (logic` do not).
- **Whole words only.** Matching compares complete tokens. Inflected forms are not matched
  unless the dictionary lists them.

## Limitations and failure modes

- **Recall is limited to the dictionary.** The scan finds only phrases in the bundled
  snapshot. New paraphrases, or inflected forms the snapshot does not list, are not found.
- **Every entry is searchable.** Since 0.2.0 the dictionary and the text are read by the
  same tokenizer, so all 7,942 entries are indexed and each is found in a sentence of its
  own, except the 6 that are whitelisted on purpose (`tests/parityMatrix.test.ts`). Before,
  entries with a number as a word (`walk 2020`), a digit, `/` or brackets inside a word
  (`f1-score`), or a hyphen written as a space or a Unicode hyphen were missed, and an
  entry such as `1/3-birthday party` was cut down to `birthday party` and matched
  ordinary prose.
- **The risk levels are heuristics.** The `getRiskLevel` thresholds are set by hand
  (the reasoning is in the source comments) and depend on the word count you pass. They
  are not a validated classifier.
- **A match is not proof of misconduct.** Legitimate but unusual phrasing, and phrasing
  from translated text, can match. Review each hit in context.
- **The input must be plain text.** Extracting text from a PDF or DOCX is up to you.
  Hyphenation and line-break artefacts can split phrases.

## Development

```bash
npm install
npm run build        # tsc + copy the dictionary into dist/data/
npm test             # jest; includes the docs gate's two-sided test
node scripts/check-docs-coverage.mjs   # documentation-drift gate: builds, runs the Quickstart
```

## How to cite

Please cite the software (see [CITATION.cff](CITATION.cff)): Feldman, G. (2026).
*torturedcheck: tortured-phrase detection for academic documents* (Version 0.1.2)
[Computer software]. https://github.com/giladfeldman/torturedcheck

Please also cite the source of the dictionary: Cabanac, Labbé & Magazinov (2021),
[10.48550/arXiv.2107.06751](https://doi.org/10.48550/arXiv.2107.06751).

## Third-party data

The bundled dictionary data comes from the Problematic Paper Screener and is licensed under CC BY 4.0.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes are recorded in [CHANGELOG.md](CHANGELOG.md).
Downstream consumers are listed in [DOWNSTREAM.md](DOWNSTREAM.md).

<!-- license-citation:start -->
## License and citation

Copyright (C) 2026 Gilad Feldman.

This software is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). You may use, study, modify and share it, including for commercial purposes, provided that the complete source code of any modified version is published under the same licence - including when the modified version is offered as a hosted online service.

**Commercial licences** without these conditions are available from the author: Gilad Feldman (https://orcid.org/0000-0003-2812-6599).

Versions released before 2026-11-06 were licensed under MIT and remain available under those terms.

**How to cite.** If you use this software in research, please cite it. GitHub's *Cite this repository* button (from [CITATION.cff](CITATION.cff)) gives APA and BibTeX. In APA style:

> Feldman, G. (2026). *torturedcheck: tortured-phrase detection for academic documents* (Version 0.2.0) [Computer software]. https://github.com/giladfeldman/torturedcheck#readme

<!-- license-citation:end -->
