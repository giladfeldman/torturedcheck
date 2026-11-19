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

// Shapes found by the tier-2 consult of 2026-11-18 (Sonnet), each watched failing on the
// build before the fix. Three of them (glued footnote digit, zero-width space, quotes
// between the words) were read correctly by 0.1.3 and broken by the first 0.2.0 draft.
describe('torturedcheck: consult shapes (2026-11-18)', () => {
  const index = buildFirstWordIndex(DICT.phrases);
  const cells: Array<[string, string, string]> = [
    // [label, text, the verbatim span the match must cover]
    ['en dash before', 'in the field of AI–fluffy logic is used', 'fluffy logic'],
    ['em dash before', 'in the field of AI—fluffy logic is used', 'fluffy logic'],
    ['glued footnote digit', 'counterfeit consciousness12 is', 'counterfeit consciousness'],
    ['superscript footnote', 'counterfeit consciousness¹ is', 'counterfeit consciousness'],
    ['possessive', "man-made brainpower's limits", 'man-made brainpower'],
    ['decomposed accent', 'counterfeit consciouśness is', 'counterfeit consciouśness'],
    ['soft hyphen', 'counter­feit consciousness', 'counter­feit consciousness'],
    ['zero-width space', 'counterfeit​ consciousness', 'counterfeit​ consciousness'],
    ['double quotes', 'counterfeit "consciousness"', 'counterfeit "consciousness'],
    ['single quotes', "counterfeit 'consciousness'", "counterfeit 'consciousness"],
    ['curly quotes', 'counterfeit “consciousness”', 'counterfeit “consciousness'],
  ];
  it.each(cells)('%s', (_label, text, span) => {
    const m = scanForTorturedPhrases(text, DICT, index);
    expect(m).toHaveLength(1);
    expect(text.slice(m[0].offset, m[0].offset + m[0].length)).toBe(span);
    expect(m[0].matchedText).toBe(span);
  });
  it.each([
    'counterfeit consciousnesses',   // a longer word is not the entry word
    'counterfeit consciousnessx',
    'ASCII semi-fluffy logic',       // a true hyphen still makes a compound
  ])('no match in %j', text => {
    expect(scanForTorturedPhrases(text, DICT, index)).toEqual([]);
  });
  it('a failed word count (NaN) is not "clean"', () => {
    expect(getRiskLevel(0, NaN).level).toBe('not_checked');
  });
  it('an empty text counted the README way is not "clean"', () => {
    expect(getRiskLevel(0, tokenize(normalizeText('')).length).level).toBe('not_checked');
  });
  it('dictionary entries that read identically are reported as duplicates', () => {
    const cov = dictionaryCoverage([
      { tortured: 'fluffy logic', correct: 'fuzzy logic' },
      { tortured: 'Fluffy  Logic', correct: 'fuzzy logic (2)' },
      { tortured: 'fluffy, logic', correct: 'other' },
    ]);
    expect(cov.duplicates).toEqual(['Fluffy  Logic']);
  });
  it('the context never cuts a surrogate pair in half', () => {
    // The leading 'x' puts both 80-character cut points on the second half of a pair.
    const text = 'x' + '\u{1D400}'.repeat(60) + ' counterfeit consciousness ' + '\u{1D400}'.repeat(60);
    const [m] = scanForTorturedPhrases(text, DICT, index);
    expect(m.context).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
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

// Second-model review of the 293650d fixes (Sonnet, 2026-11-19), each reproduced before the
// fix: an acute accent used as an apostrophe read as a space; bidi and other format
// characters split a word or a gap; an accent on the last letter fell outside the span; a
// match crossed a paragraph break or an em dash; NaN/negative counts and an empty
// dictionary looked like a scan that found nothing.
describe('torturedcheck: consult round 2 shapes', () => {
  const index = buildFirstWordIndex(DICT.phrases);
  const one: Array<[string, string, string]> = [
    ['acute accent as apostrophe', 'dulbecco´s changed eagle´s medium was used', 'dulbecco´s changed eagle´s medium'],
    ['left-to-right mark in gap', 'Our counterfeit‎ consciousness model', 'counterfeit‎ consciousness'],
    ['right-to-left mark in word', 'Our counter‏feit consciousness model', 'counter‏feit consciousness'],
    ['bidi isolate in gap', 'Our counterfeit ⁦consciousness⁩ model', 'counterfeit ⁦consciousness'],
    ['accent on last letter', 'Our counterfeit consciousnesś model', 'counterfeit consciousnesś'],
    ['spacing diaeresis inside word', 'Our counterfeit consciousn¨ess model', 'counterfeit consciousn¨ess'],
    ['unspaced en dash as hyphen', 'Our man–made brainpower', 'man–made brainpower'],
  ];
  it.each(one)('%s: one match, span as written', (_l, text, span) => {
    const r = scanForTorturedPhrases(text, DICT, index);
    expect(r).toHaveLength(1);
    expect(r[0].matchedText).toBe(span);
    expect(text.slice(r[0].offset, r[0].offset + r[0].length)).toBe(span);
  });
  const none: Array<[string, string]> = [
    ['paragraph break', 'It was fluffy\n\nLogic is next.'],
    ['paragraph break with spaces', 'It was fluffy \n \n Logic is next.'],
    ['em dash', 'It was fluffy—logic.'],
    ['spaced em dash', 'It was fluffy — logic.'],
    ['spaced en dash', 'It was fluffy – logic.'],
    ['horizontal bar', 'It was fluffy―logic.'],
  ];
  it.each(none)('%s: no match', (_l, text) => {
    expect(scanForTorturedPhrases(text, DICT, index)).toEqual([]);
  });
  it('a single line break still joins a phrase (wrapped line)', () => {
    expect(scanForTorturedPhrases('It was fluffy\nlogic here.', DICT, index)).toHaveLength(1);
  });
  it.each([
    ['NaN matches, no word count', NaN, undefined],
    ['NaN matches with word count', NaN, 1000],
    ['negative matches', -1, 1000],
    ['infinite matches', Infinity, 1000],
  ])('%s is not_checked', (_l, m, w) => {
    expect(getRiskLevel(m as number, w as number | undefined).level).toBe('not_checked');
  });
  it('an empty dictionary throws instead of reporting no matches', () => {
    expect(() => scanForTorturedPhrases('fluffy logic', { ...DICT, phrases: [] })).toThrow();
  });
  it('non-string text throws instead of reporting no matches', () => {
    expect(() => scanForTorturedPhrases(null as unknown as string, DICT, index)).toThrow();
  });
});
