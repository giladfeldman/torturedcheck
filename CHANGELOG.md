# Changelog

## Unreleased

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
