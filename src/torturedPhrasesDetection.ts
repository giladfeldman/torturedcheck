/**
 * Tortured Phrases Detection - Pure algorithmic functions
 * Separated from processor to allow testing without import.meta.url dependency.
 */

export interface TorturedPhrase {
  tortured: string;
  correct: string;
}

export interface TorturedPhrasesDictionary {
  version: string;
  lastUpdated: string;
  source: string;
  sourceUrl: string;
  license: string;
  totalPhrases: number;
  phrases: TorturedPhrase[];
}

export interface TorturedPhraseMatch {
  tortured: string;
  correct: string;
  offset: number;
  length: number;
  context: string;
}

interface FirstWordEntry {
  words: string[];
  wordCount: number;
  correct: string;
  original: string;
}

/**
 * Normalize text for matching: lowercase, collapse whitespace, normalize unicode
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize text into words with character offsets (operates on normalized text)
 */
export function tokenize(text: string): Array<{ word: string; offset: number }> {
  const tokens: Array<{ word: string; offset: number }> = [];
  const regex = /[a-z]+(?:[-'][a-z]+)*/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({ word: match[0], offset: match.index });
  }
  return tokens;
}

/**
 * Build first-word index from dictionary phrases.
 * Maps each first word to all candidate phrases starting with that word.
 *
 * Filters out single-word entries: common words like "learning", "signal",
 * "rate", "mobile", "algorithm" appear everywhere in academic text and
 * produce massive false positives. Real tortured phrases are multi-word
 * synonym substitutions (e.g. "thick woods" for "dense forest").
 */
export function buildFirstWordIndex(phrases: TorturedPhrase[]): Map<string, FirstWordEntry[]> {
  const index = new Map<string, FirstWordEntry[]>();

  for (const phrase of phrases) {
    const normalized = normalizeText(phrase.tortured);
    const words = normalized.split(/\s+/).filter(w => /[a-z]/.test(w));
    if (words.length < 2) continue;

    const cleanWords = words.map(w => w.replace(/^[^a-z]+|[^a-z]+$/g, ''));
    const firstWord = cleanWords[0];
    if (!firstWord) continue;

    const entry: FirstWordEntry = {
      words: cleanWords,
      wordCount: cleanWords.length,
      correct: phrase.correct,
      original: phrase.tortured,
    };

    const existing = index.get(firstWord);
    if (existing) {
      existing.push(entry);
    } else {
      index.set(firstWord, [entry]);
    }
  }

  // Sort each bucket so longer phrases are checked first
  for (const [, entries] of index) {
    entries.sort((a, b) => b.wordCount - a.wordCount);
  }

  return index;
}

/**
 * Whitelist: multi-word phrases that appear in the PPS dictionary but are
 * legitimate academic language. These produce false positives on normal papers.
 *
 * Curation notes (B30, 2026-04-29):
 * - The shipped dictionary has zero single-word entries (verified 2026-04-29:
 *   `phrases.filter(p => p.tortured.split(/\s+/).length < 2).length === 0`).
 *   The single-word filter in `buildFirstWordIndex` therefore acts as a
 *   future-proof guard, not a real purge — if the upstream Cabanac/Labbé
 *   list ever ships single-word entries, they will be silently dropped.
 * - The whitelist below is the real curation knob. It is biased toward
 *   common English / academic collocations that overlap with the
 *   Cabanac/Labbé list (e.g. "machine learning" = "discriminative learning",
 *   "neural network" = "[neural network] layer outputs"). Anything that
 *   reads as ordinary scientific prose belongs here, not in the dictionary.
 * - When in doubt, prefer to whitelist (false negative on a true tortured
 *   phrase is recoverable; false positive on legitimate prose erodes user
 *   trust in the entire plugin).
 */
const PHRASE_WHITELIST = new Set([
  // Filler / connectors
  'as follows',
  'a number of',
  'for example',
  'for instance',
  'in addition',
  'in this paper',
  'in this study',
  'in summary',
  'in particular',
  'in general',
  'in contrast',
  'in detail',
  'in practice',
  'in fact',
  'on the other hand',
  // ML / AI / CS collocations
  'machine learning',
  'deep learning',
  'neural network',
  'neural networks',
  'big data',
  'data set',
  'data sets',
  'real time',
  'real world',
  'open source',
  'state of the art',
  'logistic regression',
  'linear regression',
  'random forest',
  'decision tree',
  'support vector',
  'natural language',
  'transfer learning',
  'feature extraction',
  'image processing',
  'signal processing',
  'information retrieval',
  'knowledge base',
  'data mining',
  'time series',
  'genetic algorithm',
  'computer vision',
  'reinforcement learning',
  'training set',
  'test set',
  'validation set',
  // Methodology / general academic
  'case study',
  'case studies',
  'gold standard',
  'black box',
  'white paper',
  'best practice',
  'best practices',
  'false positive',
  'false positives',
  'false negative',
  'false negatives',
  'ground truth',
  'high quality',
  'low quality',
  'large scale',
  'small scale',
  'long term',
  'short term',
  'meta analysis',
  'well being',
  'well known',
  'body mass',
  // Health / clinical
  'social media',
  'mental health',
  'public health',
  'primary care',
  'health care',
  'clinical trial',
  'clinical trials',
  'cross sectional',
  // Stats / methods terms
  'factor analysis',
  'content analysis',
  'path analysis',
  'effect size',
  'effect sizes',
  'sample size',
  'sample sizes',
  'standard deviation',
  'standard error',
  'confidence interval',
  'confidence intervals',
  'null hypothesis',
  'control group',
  'treatment group',
  'experimental group',
  'control groups',
  'treatment groups',
  'experimental groups',
]);

/**
 * Scan normalized text for tortured phrases using first-word index lookup
 */
export function scanForTorturedPhrases(
  text: string,
  dictionary: TorturedPhrasesDictionary,
  firstWordIndex?: Map<string, FirstWordEntry[]>
): TorturedPhraseMatch[] {
  const normalized = normalizeText(text);
  const tokens = tokenize(normalized);
  const index = firstWordIndex ?? buildFirstWordIndex(dictionary.phrases);

  const matches: TorturedPhraseMatch[] = [];
  const coveredRanges: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const candidates = index.get(token.word);
    if (!candidates) continue;

    for (const candidate of candidates) {
      if (i + candidate.wordCount > tokens.length) continue;

      let allMatch = true;
      for (let j = 0; j < candidate.wordCount; j++) {
        if (tokens[i + j].word !== candidate.words[j]) {
          allMatch = false;
          break;
        }
      }

      if (!allMatch) continue;

      // Skip whitelisted phrases (PU9)
      if (PHRASE_WHITELIST.has(candidate.words.join(' '))) continue;

      const startOffset = tokens[i].offset;
      const lastToken = tokens[i + candidate.wordCount - 1];
      const endOffset = lastToken.offset + lastToken.word.length;

      const overlaps = coveredRanges.some(
        r => startOffset < r.end && endOffset > r.start
      );
      if (overlaps) continue;

      const ctxStart = Math.max(0, startOffset - 80);
      const ctxEnd = Math.min(normalized.length, endOffset + 80);
      const context =
        (ctxStart > 0 ? '...' : '') +
        normalized.slice(ctxStart, ctxEnd) +
        (ctxEnd < normalized.length ? '...' : '');

      matches.push({
        tortured: candidate.original,
        correct: candidate.correct,
        offset: startOffset,
        length: endOffset - startOffset,
        context,
      });

      coveredRanges.push({ start: startOffset, end: endOffset });
      break;
    }
  }

  return matches;
}

/**
 * Determine risk level based on match count and density (per-1000-words rate).
 *
 * B30 (2026-04-29): rework from absolute-count-only thresholds to a
 * density-aware model. Long papers naturally produce more incidental
 * matches; the absolute thresholds (>5 = high) over-flagged 30+ page
 * manuscripts that had a normal background rate of incidental
 * collocations. The new model requires BOTH a meaningful absolute
 * count AND a density above the noise floor before escalating.
 *
 * Tunable thresholds:
 *   - DENSITY_NOISE_FLOOR: matches per 1000 words below which we never
 *     flag as more than 'low'. Empirically ~0.3 keeps a ~10k-word paper
 *     with 2 incidental matches at 'low'.
 *   - SUSPICIOUS_DENSITY: density that triggers 'suspicious' when
 *     count is also >= 3.
 *   - HIGH_DENSITY: density that triggers 'high' when count is
 *     also >= 6.
 *
 * `wordCount` is optional for backwards compatibility with callers
 * that still pass only the count. When omitted, falls back to the
 * legacy absolute thresholds (with all bands shifted up by one to
 * be more conservative).
 */
const DENSITY_NOISE_FLOOR = 0.3;
const SUSPICIOUS_DENSITY = 0.6;
const HIGH_DENSITY = 1.2;

export function getRiskLevel(
  matchCount: number,
  wordCount?: number,
): { level: string; description: string } {
  if (matchCount === 0) return { level: 'clean', description: 'No tortured phrases detected' };

  // Legacy fallback when no wordCount available (more conservative than original)
  if (!wordCount || wordCount <= 0) {
    if (matchCount <= 3) return { level: 'low', description: 'Low concern - could be coincidental word choices' };
    if (matchCount <= 8) return { level: 'suspicious', description: 'Suspicious - multiple tortured phrases suggest machine paraphrasing' };
    return { level: 'high', description: 'High risk - likely paper mill or machine-paraphrased content' };
  }

  const density = (matchCount / wordCount) * 1000;

  // Below noise floor: never escalate beyond 'low' regardless of count.
  if (density < DENSITY_NOISE_FLOOR) {
    return {
      level: 'low',
      description: `Low concern - ${matchCount} matches across ${wordCount} words (density ${density.toFixed(2)}/1000) below noise floor`,
    };
  }

  if (density >= HIGH_DENSITY && matchCount >= 6) {
    return {
      level: 'high',
      description: `High risk - density ${density.toFixed(2)}/1000 words suggests paper-mill or machine-paraphrased content`,
    };
  }

  if (density >= SUSPICIOUS_DENSITY && matchCount >= 3) {
    return {
      level: 'suspicious',
      description: `Suspicious - density ${density.toFixed(2)}/1000 words across ${matchCount} matches`,
    };
  }

  return {
    level: 'low',
    description: `Low concern - ${matchCount} matches across ${wordCount} words (density ${density.toFixed(2)}/1000)`,
  };
}
