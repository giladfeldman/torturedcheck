# Changelog

## 0.1.1 — 2026-06-08

Precision-first hardening (via `citationguard-iterate`). Verified against the
known-legitimate CitationGuard corpus (6 real published papers, 74k words):
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
  in psychology / neuroscience / medicine (CitationGuard's core audience), where
  it is an implausible paraphrase target. Whitelisting them prevents false
  accusations on legitimate papers at near-zero recall cost.

### Notes
- Deliberately **not** whitelisted (left detectable; add reactively on a real
  false-positive report): `component extraction` / `grouping methods` (legitimate
  PCA / cluster-analysis terms, and used as positive detection fixtures), plus
  `supply chain control`, `place of interest`, `area unit`, `vital determinant`,
  `information mining` (genuinely ambiguous or outside the core audience).

## 0.1.0

- Initial behavior-preserving extraction from the CitationGuard platform.
