# Changelog

## 0.2.0 — 2026-11-18

**Class sweep: one phrase, one reading, and positions in your own text.** This is a deliberate
behaviour change. Each item below is pinned by `tests/parityMatrix.test.ts`, which failed on 0.1.3
(181 of its 293 cells).

### Changed
- **Match positions are in the text you pass in.** `offset` and `length` used to be positions in the
  normalized text, so they drifted by every collapsed whitespace run, line break and ligature before
  the match; a consumer highlighting the document marked the wrong characters. Now
  `text.slice(offset, offset + length)` is the phrase as written, and `context` is taken from your text.
- **The dictionary and the text are read by one tokenizer.** Before, the text tokenizer kept only
  `[a-z]` letters, while dictionary entries were split on spaces and trimmed of non-letters. So entries
  written with a number, a digit inside a word, a slash or brackets (`walk 2020`, `f1-score`) never
  matched, and an entry such as `1/3-birthday party` was cut to `birthday party` and matched ordinary
  prose. Now every non-whitelisted entry of the bundled dictionary is found in a sentence of its own.
- **Equivalent shapes read the same.** Hyphenated, spaced and Unicode-hyphen forms (`man-made`,
  `man made`, `man‐made`), line breaks and double or non-breaking spaces, curly or straight apostrophes,
  and PDF ligatures (`ﬂuffy`) now give one match. `tokenize` treats a hyphen as a word separator
  (`self-organizing` is two words), so the word count it gives is slightly higher than before.
- **Word boundaries are enforced.** A match may not start inside a hyphenated compound
  (`self-regulated learning` is not the entry `regulated learning`), and the text between its words
  must match the entry's separators (no match across a full stop, slash or bracket the entry lacks).
- **`getRiskLevel(0, 0)` is `not_checked`, not `clean`.** A caller that passes a word count of 0 (an
  empty or failed text extraction), or `NaN`, no longer receives an all-clear. Calls without a word
  count keep their meaning. The README example counts words with `tokenize(normalizeText(text))`, so an
  empty text gives 0 (its old `text.split(/\s+/).length` gave 1 and so `clean`).
- **Shapes found by a second-model review** (each pinned by a test that failed before the fix): accents
  written as a letter plus a combining mark read like the precomposed letter; soft hyphens and zero-width
  characters inside a word are ignored; quotation marks between the words count as a space
  (`counterfeit "consciousness"`); a phrase after an en or em dash (`AI—fluffy logic`) is matched, since
  only a true hyphen makes a compound; the last word may carry a footnote number glued on by extraction
  (`consciousness12`, `consciousness¹`) or a possessive (`brainpower's`). The glued-number, zero-width and
  quotation-mark shapes were read by 0.1.3 and lost in an earlier draft of this release.
- `context` never cuts a surrogate pair (an emoji or mathematical letter) in half.

### Added
- `matchedText` on each match: the phrase exactly as written.
- `normalizeWithMap(text)`: the normalisation plus the map back to the original characters.
- `dictionaryCoverage(phrases)` and the `DictionaryCoverage` type: what the scanner can and cannot see
  of a dictionary (indexed, single-word, unmatchable, whitelisted, and `duplicates`: entries that read
  exactly like an earlier entry).

### Licence
- Licensed AGPL-3.0-only, with citation metadata (changed after 0.1.3, first tagged here).

### Corpus check
Before/after scan of 8,773 full-text psychology articles (0.1.3 vs 0.2.0, same dictionary):
- Matches 955 -> 867. Reported positions point at the phrase as written in 0 of 955 matches before and
  867 of 867 after.
- Dictionary entries the scanner can reach: 7,916 -> 7,936 of 7,942 multi-word entries (the 6 left are
  whitelisted on purpose).
- Lost 116, all false matches in 0.1.3: entries whose digits or punctuation were stripped
  ("1/3-birthday party" read as "birthday party", 30; "center i7", 9; "preserved at 9.5", 9) and
  matches that crossed a comma, colon, bracket or slash ("education (16.8%), information",
  "green: money", "census.gov/.../education/data").
- Gained 28: hyphenated or line-broken forms the old reader missed ("search-engine", "speech-processing",
  "bag-of-words", "PC-assisted") and one possessive ("mutual information's"). One gain crosses a table
  line break ("exchange / Work").
- Kept as in 0.1.3: `computer-based "intelligence test"` still matches the entry `computer-based
  intelligence`, because quotation marks between words count as a space (see Limitations in the README).
- Risk level changed for 106 articles.

## 0.1.3 — 2026-09-30

**No behavioural change.** Documentation, tooling and source comments only.

### Added
- A full README covering the scientific basis (by DOI), a runnable quickstart, the API
  and types, the risk-level rules, the whitelist, and the limitations. The limitations
  include that 7 of the 7,942 dictionary entries are never indexed and 15 more can never
  match, and that match offsets refer to the normalized text.
- `scripts/check-docs-coverage.mjs`, a documentation-drift gate. It derives the public
  surface from `src/index.ts` with the TypeScript compiler API and fails on any
  undocumented token or on a version mismatch between `package.json`, `CHANGELOG.md`,
  `CITATION.cff` and the README install pin. It also builds the package and runs the
  README quickstart. `tests/docsCoverageGate.test.ts` pins the gate two-sided, and it
  runs as part of `npm test`.
- `CITATION.cff` and `CONTRIBUTING.md`.

### Fixed
- The README install example pinned `v0.1.1` instead of the current tag.

## 0.1.2 — 2026-09-11

**No behavioural change.** A documentation and naming release, tagged so that
consumers pinning by tag can install the current tree: three commits had
accumulated past v0.1.1 and were therefore invisible to anyone installing by
tag, which is what the fleet identity gate flags.

Measured before tagging: **0 non-comment lines changed in `src/`** across
`v0.1.1..HEAD` — the whole diff is comments, README and CHANGELOG prose.
Build clean, 1 suite / 37 tests passed.

### Changed
- The platform is referred to by its product name throughout, and local
  filesystem paths are no longer named in comments or docs.
- `DOWNSTREAM.md` records Scimeto as a downstream consumer.
- The distribution model is stated explicitly; a stale version claim is gone.

## 0.1.1 — 2026-06-08

Precision-first hardening (via the platform's hardening workflow). Verified against the
known-legitimate Scimeto corpus (6 real published papers, 74k words):
**0 false positives** both before and after — the existing `PHRASE_WHITELIST`
already held the line; this release locks that in and extends it for the
psych/neuro/medicine audience.

### Added
- **Whitelist regression coverage.** Before this release the `PHRASE_WHITELIST`
  precision guard had **zero** test coverage — deleting the
  `PHRASE_WHITELIST.has(...)` check still passed all 30 tests, so the guard could
  regress silently. New tests assert that whitelisted phrases are not flagged
  and that a genuine tortured phrase still fires (recall preserved). (+7 tests,
  30 → 37.)
- **Four domain terms added to `PHRASE_WHITELIST`**: `brain organization`,
  `feedback processing`, `facial expression processing`, `malignant growth`.
  Each is a PPS dictionary "tortured" entry but is also ordinary scientific prose
  in psychology / neuroscience / medicine (Scimeto's core audience), where
  it is an implausible paraphrase target. Whitelisting them prevents false
  accusations on legitimate papers at near-zero recall cost.

### Notes
- Deliberately **not** whitelisted (left detectable; add reactively on a real
  false-positive report): `component extraction` / `grouping methods` (legitimate
  PCA / cluster-analysis terms, and used as positive detection fixtures), plus
  `supply chain control`, `place of interest`, `area unit`, `vital determinant`,
  `information mining` (genuinely ambiguous or outside the core audience).

## 0.1.0

- Initial behavior-preserving extraction from the Scimeto platform.
