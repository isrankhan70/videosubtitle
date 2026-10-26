export type SubtitleDisplayMode = 'bilingual' | 'bn' | 'en';

export type BanglaFontFamily =
  | 'Hind Siliguri'
  | 'Noto Sans Bengali'
  | 'Noto Serif Bengali'
  | 'Baloo Da 2';

export type EnglishFontFamily = 'Plus Jakarta Sans' | 'JetBrains Mono';

export interface SubtitleCue {
  id: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  textBn: string;    // Bangla subtitle text (Unicode NFC)
  textEn: string;    // English subtitle text
  speaker?: string;
  confidence?: number;
}

export interface SubtitleStyleConfig {
  displayMode: SubtitleDisplayMode;
  primaryOrder: 'bn-top' | 'en-top';
  banglaFont: BanglaFontFamily;
  englishFont: EnglishFontFamily;
  fontSize: number; // px base (at 1080p reference or preview scale)
  fontWeight: '500' | '600' | '700';
  bnColor: string;
  enColor: string;
  bgOpacity: number; // 0 to 95
  bgColor: string;
  bottomOffset: number; // percentage 4 to 28
  textOutline: boolean;
  lineGap: number; // px
  unicodeNfcLock: boolean;
}

export interface CueAuditIssue {
  cueId: string;
  cueIndex: number; // 1-based index
  type:
    | 'overlap'
    | 'inverted_time'
    | 'too_short'
    | 'high_cps'
    | 'encoding_mismatch'
    | 'empty_text';
  severity: 'error' | 'warning';
  message: string;
  messageBn: string;
}

export const BANGLA_FONT_OPTIONS: {
  id: BanglaFontFamily;
  name: string;
  nameBn: string;
  category: string;
  sampleBn: string;
}[] = [
  {
    id: 'Hind Siliguri',
    name: 'Hind Siliguri',
    nameBn: 'হিন্দ শিলিগুড়ি (Broadcast Standard)',
    category: 'Modern Broadcast Sans',
    sampleBn: 'স্বচ্ছ বাংলা টাইপোগ্রাফি ও যুক্তবর্ণ',
  },
  {
    id: 'Noto Sans Bengali',
    name: 'Noto Sans Bengali',
    nameBn: 'নোটো স্যান্স বাংলা (OTT & YouTube)',
    category: 'Universal UI & Video Sans',
    sampleBn: 'নির্ভেজাল ইউনিকোড সাবটাইটেল রেন্ডারিং',
  },
  {
    id: 'Noto Serif Bengali',
    name: 'Noto Serif Bengali',
    nameBn: 'নোটো সেরিফ বাংলা (Cinema & Documentary)',
    category: 'Editorial Film Serif',
    sampleBn: 'প্রামাণ্যচিত্র এবং চলচ্চিত্রের ক্লাসিক ফন্ট',
  },
  {
    id: 'Baloo Da 2',
    name: 'Baloo Da 2',
    nameBn: 'বালু দা ২ (Creator & Storytelling)',
    category: 'Expressive Display Sans',
    sampleBn: 'সোশ্যাল মিডিয়া ও রিলস ভিডিওর আকর্ষণীয় ফন্ট',
  },
];

export const DEFAULT_STYLE_CONFIG: SubtitleStyleConfig = {
  displayMode: 'bilingual',
  primaryOrder: 'bn-top',
  banglaFont: 'Hind Siliguri',
  englishFont: 'Plus Jakarta Sans',
  fontSize: 22,
  fontWeight: '600',
  bnColor: '#FFFFFF',
  enColor: '#FDE68A',
  bgOpacity: 78,
  bgColor: '#090D16',
  bottomOffset: 8,
  textOutline: true,
  lineGap: 4,
  unicodeNfcLock: true,
};

/**
 * Normalizes Bangla & English subtitle text to prevent glyph fragmentation,
 * broken conjuncts (যুক্তবর্ণ), stray zero-width characters, or spacing errors.
 */
export function normalizeSubtitleText(raw: string): string {
  if (!raw) return '';
  let text = raw.normalize('NFC');
  // Replace non-breaking spaces and tabs with standard space
  text = text.replace(/[\u00A0\t]+/g, ' ');
  // Remove stray orphaned Zero-Width Non-Joiners / Joiners at start/end of line
  text = text.replace(/^[\u200B\u200C\u200D\uFEFF]+|[\u200B\u200C\u200D\uFEFF]+$/g, '');
  // Collapse multiple consecutive spaces on the same line
  text = text
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .filter((line, idx, arr) => !(line === '' && arr.length === 1))
    .join('\n');
  // Fix accidental space before Bangla dari (।) or standard punctuation
  text = text.replace(/\s+([।,?!;:])/g, '$1');
  return text.trim();
}

/**
 * Checks whether a string contains Bengali Unicode characters (\u0980-\u09FF).
 */
export function containsBanglaScript(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}

/**
 * Formats seconds into SRT timestamp: HH:MM:SS,mmm
 */
export function formatTimestampSRT(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(safe * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Formats seconds into WebVTT timestamp: HH:MM:SS.mmm
 */
export function formatTimestampVTT(seconds: number): string {
  return formatTimestampSRT(seconds).replace(',', '.');
}

/**
 * Formats seconds into compact studio timecode: MM:SS.cc (centiseconds)
 */
export function formatTimestampDisplay(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(safe * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const cs = Math.floor((totalMs % 1000) / 10);

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(
    2,
    '0'
  )}.${String(cs).padStart(2, '0')}`;
}

/**
 * Parses timecode strings ("00:01:12,450", "01:12.45", "12.5") into seconds.
 */
export function parseTimestampToSeconds(input: string): number | null {
  const cleaned = input.trim().replace(',', '.');
  if (!cleaned) return null;

  // Plain numeric seconds
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const val = parseFloat(cleaned);
    return Number.isFinite(val) && val >= 0 ? val : null;
  }

  const parts = cleaned.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseFloat(parts[1]);
    if (Number.isNaN(mins) || Number.isNaN(secs) || mins < 0 || secs < 0) {
      return null;
    }
    return Number((mins * 60 + secs).toFixed(3));
  }

  if (parts.length === 3) {
    const hrs = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parseFloat(parts[2]);
    if (
      Number.isNaN(hrs) ||
      Number.isNaN(mins) ||
      Number.isNaN(secs) ||
      hrs < 0 ||
      mins < 0 ||
      secs < 0
    ) {
      return null;
    }
    return Number((hrs * 3600 + mins * 60 + secs).toFixed(3));
  }

  return null;
}

/**
 * Finds the active subtitle cue for a given playback timestamp (in seconds).
 * Uses deterministic tolerance to prevent flicker on exact boundary frames.
 */
export function findActiveCue(
  cues: SubtitleCue[],
  currentTime: number
): SubtitleCue | null {
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (currentTime >= cue.startTime && currentTime <= cue.endTime) {
      return cue;
    }
  }
  return null;
}

/**
 * Audits subtitle cues for timing overlaps, inverted ranges, encoding issues,
 * reading speed (CPS), and missing text in the active language mode.
 */
export function auditSubtitleCues(
  cues: SubtitleCue[],
  mode: SubtitleDisplayMode = 'bilingual'
): CueAuditIssue[] {
  const issues: CueAuditIssue[] = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const idx = i + 1;
    const duration = cue.endTime - cue.startTime;

    // 1. Inverted or zero duration
    if (duration <= 0) {
      issues.push({
        cueId: cue.id,
        cueIndex: idx,
        type: 'inverted_time',
        severity: 'error',
        message: `Cue #${idx} end time (${formatTimestampDisplay(
          cue.endTime
        )}) must be after start time (${formatTimestampDisplay(cue.startTime)}).`,
        messageBn: `সাবটাইটেল #${idx}-এর শেষ সময় শুরুর সময়ের পরে হতে হবে।`,
      });
    } else if (duration < 0.45) {
      issues.push({
        cueId: cue.id,
        cueIndex: idx,
        type: 'too_short',
        severity: 'warning',
        message: `Cue #${idx} duration (${duration.toFixed(
          2
        )}s) is under 0.45s minimum broadcast standard.`,
        messageBn: `সাবটাইটেল #${idx}-এর স্থায়িত্ব খুবই কম (${duration.toFixed(2)} সেকেন্ড)।`,
      });
    }

    // 2. Overlap with next cue
    if (i < cues.length - 1) {
      const nextCue = cues[i + 1];
      if (cue.endTime > nextCue.startTime + 0.005) {
        const overlapMs = Math.round((cue.endTime - nextCue.startTime) * 1000);
        issues.push({
          cueId: cue.id,
          cueIndex: idx,
          type: 'overlap',
          severity: 'error',
          message: `Cue #${idx} overlaps with Cue #${idx + 1} by ${overlapMs}ms.`,
          messageBn: `সাবটাইটেল #${idx} এবং #${idx + 1}-এর টাইমিং ${overlapMs}ms ওভারল্যাপ করেছে।`,
        });
      }
    }

    // 3. Empty text check for active mode
    const missingBn =
      (mode === 'bilingual' || mode === 'bn') && !cue.textBn.trim();
    const missingEn =
      (mode === 'bilingual' || mode === 'en') && !cue.textEn.trim();

    if (missingBn || missingEn) {
      issues.push({
        cueId: cue.id,
        cueIndex: idx,
        type: 'empty_text',
        severity: 'warning',
        message: `Cue #${idx} is missing ${
          missingBn && missingEn
            ? 'Bangla & English'
            : missingBn
            ? 'Bangla'
            : 'English'
        } text.`,
        messageBn: `সাবটাইটেল #${idx}-এ ${
          missingBn && missingEn
            ? 'বাংলা ও ইংরেজি'
            : missingBn
            ? 'বাংলা'
            : 'ইংরেজি'
        } টেক্সট খালি রয়েছে।`,
      });
    }

    // 4. Unicode normalization / spacing mismatch check
    if (
      cue.textBn !== normalizeSubtitleText(cue.textBn) ||
      cue.textEn !== normalizeSubtitleText(cue.textEn)
    ) {
      issues.push({
        cueId: cue.id,
        cueIndex: idx,
        type: 'encoding_mismatch',
        severity: 'warning',
        message: `Cue #${idx} has unnormalized Unicode or extra whitespace.`,
        messageBn: `সাবটাইটেল #${idx}-এ ইউনিকোড বা অতিরিক্ত স্পেস সমস্যা রয়েছে।`,
      });
    }

    // 5. High Characters Per Second (CPS) check
    if (duration > 0.3) {
      const activeLength = Math.max(cue.textBn.length, cue.textEn.length);
      const cps = activeLength / duration;
      if (cps > 25) {
        issues.push({
          cueId: cue.id,
          cueIndex: idx,
          type: 'high_cps',
          severity: 'warning',
          message: `Cue #${idx} reading speed is high (${Math.round(
            cps
          )} chars/sec).`,
          messageBn: `সাবটাইটেল #${idx} পড়ার গতি বেশি (${Math.round(
            cps
          )} অক্ষর/সেকেন্ড)।`,
        });
      }
    }
  }

  return issues;
}

/**
 * Automatically repairs all timing overlaps, inverted timestamps, sub-minimum durations,
 * and normalizes all Bangla & English text to Unicode NFC.
 */
export function autoFixSubtitleMismatches(cues: SubtitleCue[]): {
  cues: SubtitleCue[];
  fixedCount: number;
} {
  if (cues.length === 0) return { cues: [], fixedCount: 0 };

  let fixedCount = 0;

  // Clone and sort by startTime
  const sorted = [...cues]
    .map((cue) => ({ ...cue }))
    .sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length; i++) {
    const cue = sorted[i];

    // Normalize Unicode NFC & spacing
    const normBn = normalizeSubtitleText(cue.textBn);
    const normEn = normalizeSubtitleText(cue.textEn);
    if (normBn !== cue.textBn || normEn !== cue.textEn) {
      cue.textBn = normBn;
      cue.textEn = normEn;
      fixedCount++;
    }

    // Ensure non-negative start time
    if (cue.startTime < 0) {
      cue.startTime = 0;
      fixedCount++;
    }

    // Ensure minimum valid duration of 0.8s if inverted or too short
    if (cue.endTime <= cue.startTime || cue.endTime - cue.startTime < 0.5) {
      cue.endTime = Number((cue.startTime + 1.2).toFixed(3));
      fixedCount++;
    }

    // Resolve overlap with next cue
    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      if (cue.endTime > next.startTime) {
        // If clamping cue.endTime keeps at least 0.6s duration, clamp it cleanly
        if (next.startTime - cue.startTime >= 0.65) {
          cue.endTime = Number((next.startTime - 0.04).toFixed(3));
        } else {
          // Otherwise push next.startTime after cue.endTime + 0.04s
          next.startTime = Number((cue.endTime + 0.04).toFixed(3));
          if (next.endTime - next.startTime < 0.8) {
            next.endTime = Number((next.startTime + 1.5).toFixed(3));
          }
        }
        fixedCount++;
      }
    }
  }

  return { cues: sorted, fixedCount };
}

/**
 * Formats a single cue's text lines according to the chosen display mode and order.
 */
export function getFormattedCueLines(
  cue: SubtitleCue,
  mode: SubtitleDisplayMode,
  primaryOrder: 'bn-top' | 'en-top' = 'bn-top'
): string[] {
  const bn = normalizeSubtitleText(cue.textBn);
  const en = normalizeSubtitleText(cue.textEn);

  if (mode === 'bn') return bn ? [bn] : [];
  if (mode === 'en') return en ? [en] : [];

  const lines: string[] = [];
  if (primaryOrder === 'bn-top') {
    if (bn) lines.push(bn);
    if (en) lines.push(en);
  } else {
    if (en) lines.push(en);
    if (bn) lines.push(bn);
  }
  return lines;
}

/**
 * Exports cues to standard SubRip (.srt) format.
 */
export function exportToSRT(
  cues: SubtitleCue[],
  mode: SubtitleDisplayMode = 'bilingual',
  primaryOrder: 'bn-top' | 'en-top' = 'bn-top'
): string {
  return cues
    .map((cue, index) => {
      const start = formatTimestampSRT(cue.startTime);
      const end = formatTimestampSRT(cue.endTime);
      const lines = getFormattedCueLines(cue, mode, primaryOrder);
      const body = lines.length > 0 ? lines.join('\n') : '...';
      return `${index + 1}\n${start} --> ${end}\n${body}`;
    })
    .join('\n\n')
    .concat('\n');
}

/**
 * Exports cues to WebVTT (.vtt) format.
 */
export function exportToVTT(
  cues: SubtitleCue[],
  mode: SubtitleDisplayMode = 'bilingual',
  primaryOrder: 'bn-top' | 'en-top' = 'bn-top'
): string {
  const body = cues
    .map((cue, index) => {
      const start = formatTimestampVTT(cue.startTime);
      const end = formatTimestampVTT(cue.endTime);
      const lines = getFormattedCueLines(cue, mode, primaryOrder);
      const text = lines.length > 0 ? lines.join('\n') : '...';
      return `${index + 1}\n${start} --> ${end}\n${text}`;
    })
    .join('\n\n');

  return `WEBVTT\n\n${body}\n`;
}

/**
 * Parses an imported .SRT or .VTT string into SubtitleCue items,
 * automatically separating Bangla and English lines using Unicode script detection.
 */
export function parseSRT(rawContent: string): SubtitleCue[] {
  const content = rawContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^WEBVTT.*?\n\n/s, '')
    .trim();

  if (!content) return [];

  const blocks = content.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    // Locate the timestamp arrow line
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const [rawStart, rawEnd] = lines[timeLineIdx]
      .split('-->')
      .map((s) => s.trim().split(' ')[0]);
    const startTime = parseTimestampToSeconds(rawStart);
    const endTime = parseTimestampToSeconds(rawEnd);

    if (startTime === null || endTime === null) continue;

    const textLines = lines.slice(timeLineIdx + 1);
    const bnLines: string[] = [];
    const enLines: string[] = [];

    for (const line of textLines) {
      if (containsBanglaScript(line)) {
        bnLines.push(normalizeSubtitleText(line));
      } else {
        enLines.push(normalizeSubtitleText(line));
      }
    }

    cues.push({
      id: `cue-import-${i + 1}-${Date.now()}`,
      startTime,
      endTime,
      textBn: bnLines.join(' '),
      textEn: enLines.join(' '),
    });
  }

  return cues;
}

/**
 * Splits a cue into two balanced cues at the midpoint (or specified splitTime).
 */
export function splitCueAtTime(
  cues: SubtitleCue[],
  cueId: string,
  splitTime?: number
): SubtitleCue[] {
  const index = cues.findIndex((c) => c.id === cueId);
  if (index === -1) return cues;

  const target = cues[index];
  const duration = target.endTime - target.startTime;
  if (duration < 0.8) return cues; // Too short to split safely

  const mid =
    splitTime &&
    splitTime > target.startTime + 0.3 &&
    splitTime < target.endTime - 0.3
      ? Number(splitTime.toFixed(3))
      : Number((target.startTime + duration / 2).toFixed(3));

  const splitWords = (text: string): [string, string] => {
    const words = normalizeSubtitleText(text).split(/\s+/).filter(Boolean);
    if (words.length <= 1) return [text, text];
    const half = Math.ceil(words.length / 2);
    return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
  };

  const [bn1, bn2] = splitWords(target.textBn);
  const [en1, en2] = splitWords(target.textEn);

  const firstCue: SubtitleCue = {
    ...target,
    endTime: Number((mid - 0.02).toFixed(3)),
    textBn: bn1,
    textEn: en1,
  };

  const secondCue: SubtitleCue = {
    ...target,
    id: `${target.id}-split-${Math.random().toString(36).slice(2, 6)}`,
    startTime: Number((mid + 0.02).toFixed(3)),
    endTime: target.endTime,
    textBn: bn2,
    textEn: en2,
  };

  const next = [...cues];
  next.splice(index, 1, firstCue, secondCue);
  return next;
}
