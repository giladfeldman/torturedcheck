/**
 * Tests for Tortured Phrases Detection
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  normalizeText,
  tokenize,
  buildFirstWordIndex,
  scanForTorturedPhrases,
  getRiskLevel,
} from '../src/torturedPhrasesDetection.js';
import type { TorturedPhraseMatch } from '../src/torturedPhrasesDetection.js';

// Small inline test dictionary
const TEST_DICTIONARY = {
  version: '1.0.0-test',
  lastUpdated: '2026-03-06',
  source: 'test',
  sourceUrl: '',
  license: 'test',
  totalPhrases: 8,
  phrases: [
    { tortured: 'counterfeit consciousness', correct: 'artificial intelligence' },
    { tortured: 'kidney disappointment', correct: 'kidney failure' },
    { tortured: 'surface region', correct: 'surface area' },
    { tortured: 'loss characteristic', correct: 'loss function' },
    { tortured: 'grouping methods', correct: 'classification methods' },
    { tortured: 'design acknowledgement', correct: 'pattern recognition' },
    { tortured: 'neural organization', correct: 'neural network' },
    { tortured: 'component extraction', correct: 'feature extraction' },
  ],
};

describe('normalizeText', () => {
  it('should lowercase text', () => {
    expect(normalizeText('Hello World')).toBe('hello world');
  });

  it('should collapse whitespace', () => {
    expect(normalizeText('hello   world\n\ttest')).toBe('hello world test');
  });

  it('should normalize smart quotes', () => {
    expect(normalizeText('\u201Chello\u201D \u2018world\u2019')).toBe('"hello" \'world\'');
  });

  it('should normalize dashes', () => {
    expect(normalizeText('hello\u2013world\u2014test')).toBe('hello-world-test');
  });

  it('should handle empty text', () => {
    expect(normalizeText('')).toBe('');
  });

  it('should trim leading/trailing whitespace', () => {
    expect(normalizeText('  hello world  ')).toBe('hello world');
  });
});

describe('tokenize', () => {
  it('should tokenize words with offsets', () => {
    const tokens = tokenize('hello world');
    expect(tokens).toEqual([
      { word: 'hello', offset: 0 },
      { word: 'world', offset: 6 },
    ]);
  });

  it('should handle punctuation', () => {
    const tokens = tokenize('hello, world!');
    expect(tokens).toEqual([
      { word: 'hello', offset: 0 },
      { word: 'world', offset: 7 },
    ]);
  });

  it('should handle hyphenated words', () => {
    const tokens = tokenize("self-organizing");
    expect(tokens.length).toBe(1);
    expect(tokens[0].word).toBe('self-organizing');
  });

  it('should handle empty text', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('buildFirstWordIndex', () => {
  it('should index phrases by first word', () => {
    const index = buildFirstWordIndex([
      { tortured: 'counterfeit consciousness', correct: 'artificial intelligence' },
      { tortured: 'component extraction', correct: 'feature extraction' },
    ]);

    expect(index.has('counterfeit')).toBe(true);
    expect(index.has('component')).toBe(true);
    expect(index.has('consciousness')).toBe(false);

    const counterEntries = index.get('counterfeit')!;
    expect(counterEntries.length).toBe(1);
    expect(counterEntries[0].words).toEqual(['counterfeit', 'consciousness']);
    expect(counterEntries[0].correct).toBe('artificial intelligence');
  });

  it('should filter out single-word entries (too generic, cause false positives)', () => {
    const index = buildFirstWordIndex([
      { tortured: 'counterfeit consciousness', correct: 'artificial intelligence' },
      { tortured: 'learning', correct: 'dense forest' },
      { tortured: 'rate', correct: 'response rate' },
      { tortured: 'signal', correct: 'frequency domain' },
      { tortured: 'mobile', correct: 'mobile platforms' },
    ]);

    // Multi-word phrase should be indexed
    expect(index.has('counterfeit')).toBe(true);
    // Single-word entries should be excluded
    expect(index.has('learning')).toBe(false);
    expect(index.has('rate')).toBe(false);
    expect(index.has('signal')).toBe(false);
    expect(index.has('mobile')).toBe(false);
  });

  it('should not match single-word dictionary entries in text', () => {
    const dict = {
      ...TEST_DICTIONARY,
      phrases: [
        ...TEST_DICTIONARY.phrases,
        { tortured: 'learning', correct: 'dense forest' },
        { tortured: 'rate', correct: 'response rate' },
      ],
    };
    const text = 'collaborative learning and approval rate in the study';
    const matches = scanForTorturedPhrases(text, dict);

    // "learning" and "rate" should NOT be flagged
    expect(matches.length).toBe(0);
  });

  it('should sort longer phrases first within same first word', () => {
    const index = buildFirstWordIndex([
      { tortured: 'neural organization', correct: 'neural network' },
      { tortured: 'neural organization model', correct: 'neural network model' },
    ]);

    const entries = index.get('neural')!;
    expect(entries.length).toBe(2);
    // Longer phrase first
    expect(entries[0].wordCount).toBe(3);
    expect(entries[1].wordCount).toBe(2);
  });
});

describe('scanForTorturedPhrases', () => {
  // Reset the cached index before each test since we use different dictionaries
  let testIndex: Map<string, any>;

  beforeEach(() => {
    testIndex = buildFirstWordIndex(TEST_DICTIONARY.phrases);
  });

  it('should detect a single tortured phrase', () => {
    const text = 'This paper uses counterfeit consciousness to solve the problem.';
    // Need to build a fresh index for each test to avoid caching issues
    const freshIndex = new Map(testIndex);
    const matches = scanForTorturedPhrases(text, TEST_DICTIONARY, freshIndex);

    expect(matches.length).toBe(1);
    expect(matches[0].tortured).toBe('counterfeit consciousness');
    expect(matches[0].correct).toBe('artificial intelligence');
  });

  it('should detect multiple different tortured phrases', () => {
    const text = 'We applied counterfeit consciousness and component extraction techniques.';
    const matches = scanForTorturedPhrases(text, TEST_DICTIONARY, testIndex);

    expect(matches.length).toBe(2);
    const torturedSet = new Set(matches.map(m => m.tortured));
    expect(torturedSet.has('counterfeit consciousness')).toBe(true);
    expect(torturedSet.has('component extraction')).toBe(true);
  });

  it('should return no matches for clean text', () => {
    const text = 'We used artificial intelligence and feature extraction for our analysis.';
    const matches = scanForTorturedPhrases(text, TEST_DICTIONARY, testIndex);

    expect(matches.length).toBe(0);
  });

  it('should be case insensitive', () => {
    const text = 'We applied COUNTERFEIT CONSCIOUSNESS to solve it.';
    const matches = scanForTorturedPhrases(text, TEST_DICTIONARY, testIndex);

    expect(matches.length).toBe(1);
    expect(matches[0].tortured).toBe('counterfeit consciousness');
  });

  it('should handle phrases spanning line breaks', () => {
    const text = 'We studied counterfeit\nconsciousness in depth.';
    const matches = scanForTorturedPhrases(text, TEST_DICTIONARY, testIndex);

    expect(matches.length).toBe(1);
    expect(matches[0].tortured).toBe('counterfeit consciousness');
  });

  it('should not produce overlapping matches', () => {
    // Create a dictionary with overlapping phrase possibilities
    const overlapDict = {
      ...TEST_DICTIONARY,
      phrases: [
        { tortured: 'neural organization', correct: 'neural network' },
        { tortured: 'neural organization model', correct: 'neural network model' },
      ],
    };
    const overlapIndex = buildFirstWordIndex(overlapDict.phrases);
    const text = 'The neural organization model was applied.';
    const matches = scanForTorturedPhrases(text, overlapDict, overlapIndex);

    // Should prefer longer match
    expect(matches.length).toBe(1);
    expect(matches[0].tortured).toBe('neural organization model');
  });

  it('should handle empty text', () => {
    const matches = scanForTorturedPhrases('', TEST_DICTIONARY, testIndex);
    expect(matches.length).toBe(0);
  });

  it('should include context in matches', () => {
    const text = 'The researchers used counterfeit consciousness algorithms for their experiments.';
    const matches = scanForTorturedPhrases(text, TEST_DICTIONARY, testIndex);

    expect(matches.length).toBe(1);
    expect(matches[0].context).toContain('counterfeit consciousness');
    expect(matches[0].context).toContain('researchers');
  });

  it('should detect the same phrase appearing multiple times', () => {
    const text = 'First, counterfeit consciousness was used. Then counterfeit consciousness was verified.';
    const matches = scanForTorturedPhrases(text, TEST_DICTIONARY, testIndex);

    expect(matches.length).toBe(2);
    expect(matches[0].tortured).toBe('counterfeit consciousness');
    expect(matches[1].tortured).toBe('counterfeit consciousness');
    expect(matches[0].offset).not.toBe(matches[1].offset);
  });

  it('should include correct offsets', () => {
    const text = 'the kidney disappointment was severe';
    const normalized = normalizeText(text);
    const matches = scanForTorturedPhrases(text, TEST_DICTIONARY, testIndex);

    expect(matches.length).toBe(1);
    const match = matches[0];
    expect(normalized.substring(match.offset, match.offset + match.length)).toBe('kidney disappointment');
  });
});

describe('PHRASE_WHITELIST — precision guard (PU9 + domain terms, 2026-06-08)', () => {
  // The whitelist is the library's primary precision mechanism: phrases that
  // appear in the PPS dictionary as "tortured" but are ordinary scientific
  // prose. Before these tests the whitelist had ZERO coverage — removing the
  // `PHRASE_WHITELIST.has(...)` check still passed all 30 tests, so the guard
  // could regress silently. These tests fail if the check is removed or a
  // curated entry is dropped, protecting the observed 100% precision on real
  // papers. Each scans a dictionary whose ONLY entry is the whitelisted phrase
  // (so a non-zero result can only mean the whitelist failed).
  function scanOne(tortured: string, correct: string, sentence: string): TorturedPhraseMatch[] {
    const dict = { ...TEST_DICTIONARY, phrases: [{ tortured, correct }] };
    return scanForTorturedPhrases(sentence, dict, buildFirstWordIndex(dict.phrases));
  }

  it('blocks a whitelisted ML collocation that is itself a PPS tortured form', () => {
    // "machine learning" is in the PPS dictionary as a torture of "discriminative learning"
    expect(scanOne('machine learning', 'discriminative learning',
      'We trained a machine learning model on the data.')).toHaveLength(0);
  });

  it('blocks a whitelisted stats term ("effect size")', () => {
    expect(scanOne('effect size', 'impact magnitude',
      'The effect size was small but reliable.')).toHaveLength(0);
  });

  it.each([
    ['brain organization', 'neural network', 'Functional brain organization was assessed with fMRI.'],
    ['feedback processing', 'back propagation', 'Reward feedback processing elicited a frontal negativity.'],
    ['facial expression processing', 'facial expression recognition', 'Facial expression processing was impaired in the clinical group.'],
    ['malignant growth', 'cancer', 'Patients with a malignant growth were excluded from the sample.'],
  ])('blocks in-domain legitimate prose "%s" (precision-first whitelist, 2026-06-08)', (tortured, correct, sentence) => {
    expect(scanOne(tortured, correct, sentence)).toHaveLength(0);
  });

  it('still DETECTS a genuine tortured phrase that is NOT whitelisted (recall preserved)', () => {
    // Guard against over-broad whitelisting: a real torture must still fire.
    expect(scanOne('counterfeit consciousness', 'artificial intelligence',
      'The system uses counterfeit consciousness to decide.')).toHaveLength(1);
  });
});

describe('getRiskLevel — density-aware (B30, curated 2026-04-29)', () => {
  it('returns clean when no matches', () => {
    expect(getRiskLevel(0).level).toBe('clean');
    expect(getRiskLevel(0, 10000).level).toBe('clean');
  });

  it('stays at "low" when density is below noise floor even with several matches', () => {
    // 2 matches in 10k words = 0.2/1000 — below the 0.3 noise floor
    const risk = getRiskLevel(2, 10000);
    expect(risk.level).toBe('low');
  });

  it('escalates to "suspicious" only when density and count both clear thresholds', () => {
    // 5 matches in 5k words = 1.0/1000 — above suspicious density, count >= 3
    const risk = getRiskLevel(5, 5000);
    expect(risk.level).toBe('suspicious');
  });

  it('escalates to "high" when density and count both clear high thresholds', () => {
    // 10 matches in 5k words = 2.0/1000 — above high density, count >= 6
    const risk = getRiskLevel(10, 5000);
    expect(risk.level).toBe('high');
  });

  it('falls back to legacy absolute thresholds when wordCount missing', () => {
    expect(getRiskLevel(2).level).toBe('low');
    expect(getRiskLevel(5).level).toBe('suspicious');
    expect(getRiskLevel(10).level).toBe('high');
  });

  it('does NOT flag a long paper with a handful of incidental matches as high risk', () => {
    // The exact regression that motivated B30: 30-page paper, 6 incidental
    // matches, was previously flagged "high risk - paper mill". With density
    // gating it should be at most "suspicious" (still surfaced) and on long
    // enough papers stays "low".
    const longPaperRisk = getRiskLevel(6, 25000); // density 0.24 — below floor
    expect(longPaperRisk.level).toBe('low');
  });
});
