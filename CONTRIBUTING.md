# Contributing to torturedcheck

Issues and pull requests are welcome at https://github.com/giladfeldman/torturedcheck.

## Setup

```bash
npm install
npm run build
npm test
```

`npm test` runs the Jest suite, which includes the documentation-drift gate's two-sided
test.

## Ground rules

- **Watch a test fail against the defect before fixing it.** A regression test written
  after the fix, which only re-asserts current behaviour, proves nothing. A false positive
  here is a public suggestion that a real paper was machine-paraphrased.
- **Precision comes first.** When a legitimate phrase is flagged, the fix is a whitelist
  entry with a test, not a lower threshold. Add a whitelist entry only in response to a
  real false positive, and give the reason in a comment.
- **Keep the dictionary snapshot attributed.** It comes from the Problematic Paper
  Screener under CC BY 4.0. Keep its `source`, `sourceUrl` and `license` fields when you
  update it, and record the update in `CHANGELOG.md`.
- **Keep the docs in step with the code.** `node scripts/check-docs-coverage.mjs` derives
  the public surface from `src/index.ts` and fails when any export, field, parameter or
  returned value is missing from `README.md` or `docs/`. Document new API in the same pull
  request, and never exempt a name to get the check to pass.
- **Releases.** Bump `package.json`, `CITATION.cff` and the install pin in the README
  together (the gate checks that they agree), add a `CHANGELOG.md` entry, then tag
  `vX.Y.Z`.

## Licence

By contributing you agree that your code contributions are licensed under the MIT
License.
