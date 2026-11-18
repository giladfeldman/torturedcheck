/**
 * Parity matrix (class sweep 2026-11-18): one tortured phrase, every shape it takes in
 * extracted text. Each cell must give exactly one match with the right correction, and
 * the reported offset/length must point at the phrase in the ORIGINAL text the caller
 * passed in (consumers use them to highlight the document).
 */
import { describe, it, expect } from '@jest/globals';
import * as tc from '../src/torturedPhrasesDetection.js';
const { scanForTorturedPhrases, buildFirstWordIndex, getRiskLevel, normalizeText, tokenize } = tc;
// Namespace access so this file compiles (and its cells fail one by one) against a
// build that lacks the function -- that is how the matrix was watched failing.
const dictionaryCoverage = (phrases: any[]) => (tc as any).dictionaryCoverage(phrases);
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The shipped dictionary, read from src/data (tests run before the build copies it to dist). */
function loadDictionaryFrom(): tc.TorturedPhrasesDictionary {
  return JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'tortured-phrases.json'), 'utf-8'));
}

const DICT = {
  version: 't', lastUpdated: '', source: 't', sourceUrl: '', license: 't', totalPhrases: 5,
  phrases: [
    { tortured: 'counterfeit consciousness', correct: 'artificial intelligence' },
    { tortured: 'man-made brainpower', correct: 'artificial intelligence' },
    { tortured: 'fluffy logic', correct: 'fuzzy logic' },
    { tortured: 'dulbecco’s changed eagle’s medium', correct: "Dulbecco's modified Eagle's medium" },
    { tortured: 'accuracy, review and f1-score', correct: 'accuracy, recall and F1-score' },
  ],
};

const FACTS: Array<{ base: string; correct: string }> = [
  { base: 'counterfeit consciousness', correct: 'artificial intelligence' },
  { base: 'man-made brainpower', correct: 'artificial intelligence' },
  { base: 'fluffy logic', correct: 'fuzzy logic' },
  { base: "dulbecco's changed eagle's medium", correct: "Dulbecco's modified Eagle's medium" },
  { base: 'accuracy, review and f1-score', correct: 'accuracy, recall and F1-score' },
];

function shapes(base: string): string[] {
  const out = new Set<string>([base]);
  out.add(base.toUpperCase());
  out.add(base.replace(/\b\w/g, c => c.toUpperCase()));
  out.add(base.replace(/ /g, '  '));
  out.add(base.replace(/ /g, '\n'));
  out.add(base.replace(/ /g, ' '));
  out.add(base.replace(/ /g, ' \r\n '));
  out.add(base.replace(/'/g, '’'));
  out.add(base.replace(/fl/g, 'ﬂ').replace(/fi/g, 'ﬁ'));   // PDF ligatures
  if (base.includes('-')) {
    out.add(base.replace(/-/g, ' '));
    out.add(base.replace(/-/g, '‐'));
    out.add(base.replace(/-/g, '‑'));
    out.add(base.replace(/-/g, '–'));
  } else {
    out.add(base.replace(/ /g, '-'));
  }
  return [...out];
}

const CONTEXTS: Array<(p: string) => string> = [
  p => p,
  p => `We applied ${p} to the data.`,
  p => `   Leading   whitespace\n\n\tand ${p}.`,      // collapsed whitespace BEFORE the match
  p => `(${p})`,
  p => `First sentence. ${p.charAt(0).toUpperCase()}${p.slice(1)} was used.`,
  p => `Naïve ﬁrst ﬂow, then ${p}`,       // non-ASCII + ligatures before the match
];

const fold = (s: string) => normalizeText(s).replace(/[-\s]+/g, ' ').replace(/[^\p{L}\p{N}' ]/gu, '');

describe('torturedcheck parity: one phrase, every shape and position', () => {
  const index = buildFirstWordIndex(DICT.phrases);
  const cells: Array<[string, string, string]> = [];
  for (const f of FACTS) for (const s of shapes(f.base)) for (const c of CONTEXTS) cells.push([f.correct, s, c(s)]);
  it.each(cells)('%s <- %j in %j', (correct, shape, text) => {
    const matches = scanForTorturedPhrases(text, DICT, index);
    expect(matches).toHaveLength(1);
    expect(matches[0].correct).toBe(correct);
    // Offsets are in the caller's text: slicing it gives the phrase as written.
    const slice = text.slice(matches[0].offset, matches[0].offset + matches[0].length);
    expect(fold(slice)).toBe(fold(shape));
  });
});

describe('torturedcheck: dictionary entries are tokenised exactly like text', () => {
  it('no entry of the shipped dictionary is unmatchable', () => {
    const dict = loadDictionaryFrom();
    const cov = dictionaryCoverage(dict.phrases);
    expect(cov.unmatchable).toEqual([]);
    expect(cov.total).toBe(dict.phrases.length);
    expect(cov.indexed + cov.skippedSingleWord.length + cov.unmatchable.length).toBe(cov.total);
  });
  it('every shipped multi-word entry is found in its own text', () => {
    const dict = loadDictionaryFrom();
    const index = buildFirstWordIndex(dict.phrases);
    const missed: string[] = [];
    for (const p of dict.phrases) {
      if (tokenize(normalizeText(p.tortured)).length < 2) continue;
      const m = scanForTorturedPhrases(`In this text ${p.tortured} appears.`, dict, index);
      if (m.length === 0) missed.push(p.tortured);
    }
    // Whitelisted entries are suppressed on purpose; everything else must be found.
    const cov = dictionaryCoverage(dict.phrases);
    expect(missed.filter(x => !cov.whitelisted.includes(x))).toEqual([]);
  });
});

describe('torturedcheck: "nothing found" vs "nothing checked"', () => {
  it('zero scannable words is not "clean"', () => {
    expect(getRiskLevel(0, 0).level).toBe('not_checked');
  });
  it('zero matches over real text is clean', () => {
    expect(getRiskLevel(0, 5000).level).toBe('clean');
  });
  it('legacy call without a word count keeps its meaning', () => {
    expect(getRiskLevel(0).level).toBe('clean');
  });
});

// Found by the 2026-11-18 corpus diff: after hyphens became word separators, a match could
// start inside a hyphenated compound ("self-regulated learning" read as the entry
// "regulated learning") or run across punctuation ("image. Acknowledgment",
// "Info/information"). Each control must give NO match; the positive twin must give one.
describe('torturedcheck: a phrase does not start inside a compound or cross punctuation', () => {
  const index = buildFirstWordIndex(DICT.phrases);
  const none: string[] = [
    'We used self-fluffy logic here.',          // starts inside a compound
    'We used chi-fluffy logic here.',
    'It was fluffy. Logic followed.',             // full stop between the words
    'It was fluffy/logic.',                        // slash
    'It was fluffy (logic) here.',                 // bracket the entry does not have
    'It was fluffy, logic.',                       // comma the entry does not have
    'man-made, brainpower',
    'accuracy review and f1-score',                // entry HAS a comma; text lacks it
  ];
  it.each(none)('no match in %j', text => {
    expect(scanForTorturedPhrases(text, DICT, index)).toEqual([]);
  });
  const one: string[] = [
    'We used fluffy logic here.',
    'We used fluffy-logic here.',
    '(fluffy logic)',
    'We used fluffy logic-based rules.',           // the compound ends after the phrase
    'accuracy, review and f1-score',
  ];
  it.each(one)('one match in %j', text => {
    expect(scanForTorturedPhrases(text, DICT, index)).toHaveLength(1);
  });
});
