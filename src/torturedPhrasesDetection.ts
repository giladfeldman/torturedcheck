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
  /** The dictionary entry that matched. */
  tortured: string;
  correct: string;
  /**
   * Position of the match in the text the CALLER passed in (not in the normalised text):
   * `text.slice(offset, offset + length)` is the phrase as written. Before the 2026-11-18
   * class sweep these were offsets into the normalised text, so they drifted by every
   * collapsed whitespace run and every ligature before the match.
   */
  offset: number;
  length: number;
  /** The matched phrase exactly as written in the caller's text. */
  matchedText: string;
  /** About 80 characters either side of the match, from the caller's text, whitespace collapsed. */
  context: string;
}

interface FirstWordEntry {
  words: string[];
  /**
   * What separates consecutive words in the entry, canonicalised by `gapKey` ('' for a
   * space or hyphen, ',' for "accuracy, review", '(' for "intelligence (ai)"). The text
   * between matched words must have the same key, so a match never runs across a full
   * stop, a slash or a bracket that the entry does not have.
   */
  gaps: string[];
  wordCount: number;
  correct: string;
  original: string;
}

const APOSTROPHES = /[\u2018\u2019\u201A\u201B\u02BC\u2032`\u00B4]/;
// True hyphens join a compound ("self-regulated"); an en or em dash is punctuation
// ("AI\u2014fuzzy logic") even though both are read as "-" for matching.
const COMPOUND_HYPHEN = /[-\u2010\u2011]/;
// Characters extraction leaves inside words that nobody sees: soft hyphen, zero-width
// space / joiners, word joiner, byte-order mark. They are dropped, never read as a break.
// Every Unicode format character (\p{Cf}) is included: left-to-right and right-to-left
// marks, bidi embeddings and isolates, invisible operators (consult round 2, 2026-11-19).
const INVISIBLE = /[\u00AD\p{Cf}]/u;
const QUOTES = /[\u201C\u201D\u201E\u201F]/;
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/;

/**
 * Normalise text for matching and keep, for every character of the result, the index of
 * the character of `text` it came from (`map[i]`; `map[result.length] = text.length`).
 * Per character: Unicode compatibility decomposition (PDF ligatures "\uFB01" -> "fi",
 * full-width forms) with accents and other combining marks removed, so precomposed and
 * decomposed text read the same ("e\u0301" = "\u00E9" = "e"); lower case; curly quotes and
 * apostrophes to straight; every Unicode dash and hyphen to "-"; soft hyphens and
 * zero-width characters dropped; whitespace runs to one space, leading and trailing
 * whitespace dropped.
 */
export function normalizeWithMap(text: string): { normalized: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  let pendingSpace = -1;
  let i = 0;
  for (const ch of text ?? '') {
    const at = i;
    i += ch.length;
    if (/\s/.test(ch)) {
      if (out.length > 0 && pendingSpace < 0) pendingSpace = at;
      continue;
    }
    if (INVISIBLE.test(ch)) continue;
    // Apostrophe, quote and dash classes are tested on the character as written: the acute
    // accent U+00B4 decomposes to a space plus a mark, so testing after decomposition read
    // "dulbecco\u00B4s" as "dulbecco s" (consult round 2, 2026-11-19).
    let piece: string;
    if (APOSTROPHES.test(ch)) piece = "'";
    else if (QUOTES.test(ch)) piece = '"';
    else if (DASHES.test(ch)) piece = '-';
    else {
      piece = ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
      if (APOSTROPHES.test(piece)) piece = "'";
      else if (QUOTES.test(piece)) piece = '"';
      else if (DASHES.test(piece)) piece = '-';
      // A spacing diacritic ("\u00A8", "\u00AF", "\u02DC") decomposes to a space plus a
      // mark; it is a stray accent glyph from extraction, never a word break.
      else if (piece.trim().length === 0) piece = '';
    }
    if (piece.length === 0) continue;
    if (pendingSpace >= 0) {
      out += ' ';
      map.push(pendingSpace);
      pendingSpace = -1;
    }
    for (let k = 0; k < piece.length; k++) map.push(at);
    out += piece;
  }
  map.push(text?.length ?? 0);
  return { normalized: out, map };
}

/**
 * Normalize text for matching: Unicode compatibility form (ligatures), lowercase, straight
 * quotes, one hyphen, collapsed whitespace. Same reading as `normalizeWithMap`.
 */
export function normalizeText(text: string): string {
  return normalizeWithMap(text).normalized;
}

/**
 * Tokenize normalized text into words with character offsets. A word is a run of letters
 * or digits, with internal apostrophes ("dulbecco's"). Hyphens, slashes, commas and
 * brackets separate words, so "man-made", "man made" and "man\u2010made" read the same,
 * and "f1-score" or "acid/base" tokenise identically in the dictionary and in the text.
 * The dictionary is tokenised with this same function (class sweep 2026-11-18): before,
 * letters-only text tokens could never match dictionary entries containing digits,
 * slashes or brackets, and hyphenated entries missed their spaced and Unicode-hyphen forms.
 */
export function tokenize(text: string): Array<{ word: string; offset: number }> {
  const tokens: Array<{ word: string; offset: number }> = [];
  const regex = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({ word: match[0], offset: match.index });
  }
  return tokens;
}

/** Words of one dictionary entry, read exactly as text is read. */
function entryWords(tortured: string): string[] {
  return tokenize(normalizeText(tortured)).map(t => t.word);
}

/**
 * True when the text between two words, as WRITTEN, separates them even though it reads as
 * a space or hyphen once normalised: a paragraph break (a blank line), an em dash or
 * horizontal bar, or an en dash or minus sign with a space on either side (consult round 2,
 * 2026-11-19). An unspaced en dash stays a hyphen (extraction often writes "man\u2013made"),
 * and so does a spaced ASCII hyphen, which the dictionary itself uses ("pre- and post-handling").
 */
function gapSeparates(written: string): boolean {
  return /\n[^\S\n]*\n/.test(written) || /[\u2014\u2015]/.test(written) ||
    /\s[\u2012\u2013\u2212]|[\u2012\u2013\u2212]\s/.test(written);
}

/** Canonical separator between two words: spaces and hyphens are equivalent and vanish. */
function gapKey(between: string): string {
  // Spaces, hyphens and quotation marks are not separators that change a phrase:
  // counterfeit "consciousness" is the entry "counterfeit consciousness".
  return between.replace(/[\s\-'"]+/g, '');
}

/** Separators between the words of one entry, read exactly as text gaps are read. */
function entryGaps(tortured: string): string[] {
  const norm = normalizeText(tortured);
  const toks = tokenize(norm);
  const gaps: string[] = [];
  for (let k = 1; k < toks.length; k++) {
    gaps.push(gapKey(norm.slice(toks[k - 1].offset + toks[k - 1].word.length, toks[k].offset)));
  }
  return gaps;
}

/**
 * True when the token at `offset` continues a hyphenated compound ("self-regulated",
 * "chi-square"): a phrase may not start inside a compound, or "self-regulated learning"
 * would read as the entry "regulated learning" (found by the 2026-11-18 corpus diff).
 */
function startsInsideCompound(normalized: string, map: number[], text: string, offset: number): boolean {
  return offset >= 2 && normalized[offset - 1] === '-' && /[\p{L}\p{N}]/u.test(normalized[offset - 2]) &&
    COMPOUND_HYPHEN.test(text[map[offset - 1]] ?? '');
}

/**
 * How many characters of a text word the entry word covers, or -1. Equal words match in
 * full. The LAST word of a phrase may also carry a footnote number glued on by extraction
 * ("consciousness12", "consciousness\u00B9") or a possessive ("brainpower's"); the match then
 * ends where the entry word ends.
 */
function wordMatch(textWord: string, entryWord: string, last: boolean): number {
  if (textWord === entryWord) return textWord.length;
  if (!last || entryWord.length < 3 || !textWord.startsWith(entryWord) || !/\p{L}$/u.test(entryWord)) return -1;
  const rest = textWord.slice(entryWord.length);
  return /^(?:\p{N}+|'s?)$/u.test(rest) ? entryWord.length : -1;
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
    const cleanWords = entryWords(phrase.tortured);
    if (cleanWords.length < 2) continue; // counted by dictionaryCoverage
    const firstWord = cleanWords[0];

    const entry: FirstWordEntry = {
      words: cleanWords,
      gaps: entryGaps(phrase.tortured),
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
  // Domain-specific standard terminology (psychology / neuroscience / medicine —
  // Scimeto's core audience). Each IS in the PPS dictionary as a tortured
  // form, but each is also ordinary scientific prose in its field, so flagging it
  // is a false accusation on a legitimate paper. Whitelisting trades a near-zero
  // recall risk (these are implausible paraphrase targets WITHIN psych/neuro/
  // medicine — e.g. a psych paper-mill is not paraphrasing "back propagation")
  // for precision, per the curation policy above and the precision-first
  // directive. Deliberately NOT whitelisted (left detectable — genuinely
  // ambiguous or out-of-core-domain; add reactively on a real FP report):
  // "component extraction" / "grouping methods" (legitimate PCA / cluster terms
  // AND used as positive detection fixtures in the test suite), "supply chain
  // control", "place of interest", "area unit", "vital determinant",
  // "information mining".
  'brain organization',           // PPS "correct": neural network — standard neuroscience
  'feedback processing',          // PPS "correct": back propagation — standard ERP/EEG cognitive psych
  'facial expression processing', // PPS "correct": facial expression recognition — affective neuroscience
  'malignant growth',             // PPS "correct": cancer — standard oncology / pathology English
]);

function isWhitelisted(words: string[]): boolean {
  return PHRASE_WHITELIST.has(words.join(' '));
}

/** What the scanner can and cannot see of a dictionary. */
export interface DictionaryCoverage {
  total: number;
  /** Entries in the first-word index (multi-word, matchable). */
  indexed: number;
  /** Entries dropped because they are a single word (too common to flag). */
  skippedSingleWord: string[];
  /** Entries that can never match text (no word survives tokenisation). Expected empty. */
  unmatchable: string[];
  /** Indexed entries suppressed on purpose as ordinary academic prose. */
  whitelisted: string[];
  /**
   * Entries that read exactly like an earlier entry (same words, same separators), so the
   * scanner can only ever report the earlier one and its correction.
   */
  duplicates: string[];
}

/**
 * Count every dictionary entry the scanner drops or suppresses, so "N phrases checked" is
 * a measured number rather than the dictionary's `totalPhrases` (class sweep 2026-11-18).
 */
export function dictionaryCoverage(phrases: TorturedPhrase[]): DictionaryCoverage {
  const cov: DictionaryCoverage = { total: phrases.length, indexed: 0, skippedSingleWord: [], unmatchable: [], whitelisted: [], duplicates: [] };
  const seen = new Set<string>();
  for (const p of phrases) {
    const words = entryWords(p.tortured);
    if (words.length === 0) cov.unmatchable.push(p.tortured);
    else if (words.length < 2) cov.skippedSingleWord.push(p.tortured);
    else {
      cov.indexed++;
      if (isWhitelisted(words)) cov.whitelisted.push(p.tortured);
      const key = `${words.join(' ')}|${entryGaps(p.tortured).join('|')}`;
      if (seen.has(key)) cov.duplicates.push(p.tortured);
      seen.add(key);
    }
  }
  return cov;
}

/**
 * Scan text for tortured phrases using first-word index lookup. Offsets in the result
 * refer to `text` as passed in.
 */
export function scanForTorturedPhrases(
  text: string,
  dictionary: TorturedPhrasesDictionary,
  firstWordIndex?: Map<string, FirstWordEntry[]>
): TorturedPhraseMatch[] {
  // "Could not check" must never look like "nothing found": a missing text or an empty
  // dictionary throws instead of returning [] (consult round 2, 2026-11-19).
  if (typeof text !== 'string') throw new TypeError('scanForTorturedPhrases: text must be a string');
  if (!dictionary || !Array.isArray(dictionary.phrases) || dictionary.phrases.length === 0) {
    throw new Error('scanForTorturedPhrases: the dictionary has no phrases, so nothing can be checked');
  }
  const { normalized, map } = normalizeWithMap(text);
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
      let lastLength = 0;
      for (let j = 0; j < candidate.wordCount; j++) {
        const n = wordMatch(tokens[i + j].word, candidate.words[j], j === candidate.wordCount - 1);
        if (n < 0) {
          allMatch = false;
          break;
        }
        lastLength = n;
      }

      if (!allMatch) continue;

      // Word boundaries (class sweep 2026-11-18): the phrase may not start inside a
      // hyphenated compound, and what separates its words in the text must be what
      // separates them in the entry (a space and a hyphen are the same; a full stop,
      // slash or bracket the entry lacks is not).
      if (startsInsideCompound(normalized, map, text, token.offset)) continue;
      let gapsMatch = true;
      for (let j = 1; j < candidate.wordCount; j++) {
        const prev = tokens[i + j - 1];
        const between = normalized.slice(prev.offset + prev.word.length, tokens[i + j].offset);
        if (gapKey(between) !== candidate.gaps[j - 1]) { gapsMatch = false; break; }
        const written = text.slice(map[prev.offset + prev.word.length - 1] + 1, map[tokens[i + j].offset]);
        if (gapSeparates(written)) { gapsMatch = false; break; }
      }
      if (!gapsMatch) continue;

      const startOffset = tokens[i].offset;
      const lastToken = tokens[i + candidate.wordCount - 1];
      const endOffset = lastToken.offset + lastLength;

      // Skip whitelisted phrases (PU9). The span is covered, so a shorter entry with the
      // same first word cannot report part of a whitelisted phrase.
      if (isWhitelisted(candidate.words)) {
        coveredRanges.push({ start: startOffset, end: endOffset });
        break;
      }

      const overlaps = coveredRanges.some(
        r => startOffset < r.end && endOffset > r.start
      );
      if (overlaps) continue;

      // Map back to the caller's text. The end maps through the last matched character
      // (a ligature expands to two normalised characters that share one source index).
      const lastSrc = map[endOffset - 1];
      const origStart = map[startOffset];
      let origEnd = lastSrc + ((text.codePointAt(lastSrc) ?? 0) > 0xffff ? 2 : 1);
      // Combining marks written after the last letter belong to it ("s\u0301"): they were
      // dropped from the normalised text, so the span is extended over them. Not when the
      // match ends inside a longer word (a glued footnote number or possessive follows).
      if (lastLength === lastToken.word.length) {
        while (origEnd < text.length && /\p{M}/u.test(text[origEnd])) origEnd++;
      }
      let ctxStart = Math.max(0, origStart - 80);
      let ctxEnd = Math.min(text.length, origEnd + 80);
      // Never cut a surrogate pair in half at either end of the context.
      if (ctxStart > 0 && /[\uDC00-\uDFFF]/.test(text[ctxStart])) ctxStart--;
      if (ctxEnd < text.length && /[\uDC00-\uDFFF]/.test(text[ctxEnd])) ctxEnd++;
      const context =
        (ctxStart > 0 ? '...' : '') +
        text.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ') +
        (ctxEnd < text.length ? '...' : '');

      matches.push({
        tortured: candidate.original,
        correct: candidate.correct,
        offset: origStart,
        length: origEnd - origStart,
        matchedText: text.slice(origStart, origEnd),
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
  // Nothing to scan is not a clean result (class sweep 2026-11-18): a caller that passes
  // wordCount 0 (empty or non-text extraction) gets 'not_checked', never 'clean'.
  // NaN (a failed count) is treated the same way.
  if (wordCount !== undefined && !(wordCount > 0)) {
    return { level: 'not_checked', description: 'No scannable words: nothing was checked' };
  }
  // A match count that is not a finite non-negative number is a failed scan, not a result.
  if (!Number.isFinite(matchCount) || matchCount < 0) {
    return { level: 'not_checked', description: 'No valid match count: nothing was checked' };
  }
  if (matchCount === 0) return { level: 'clean', description: 'No tortured phrases detected' };

  // Legacy fallback when no wordCount available (more conservative than original)
  if (wordCount === undefined) {
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
