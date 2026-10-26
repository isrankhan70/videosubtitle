import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSubtitleText,
  formatTimestampSRT,
  formatTimestampVTT,
  parseTimestampToSeconds,
  findActiveCue,
  auditSubtitleCues,
  autoFixSubtitleMismatches,
  exportToSRT,
  parseSRT,
  splitCueAtTime,
  SubtitleCue,
} from './subtitleEngine';
import {
  detectVoiceSegmentsFromSamples,
  encodeMonoWavPcm16,
  computeWaveformPeaks,
  buildVoiceSegmentAlignedCues,
  safeParseResponseJson,
  createSpeechCompactedBatches,
} from './voiceAudioEngine';

test('normalizeSubtitleText normalizes Bangla Unicode NFC and cleans punctuation spacing', () => {
  const messy = '  আজকের   ভিডিওতে আপনাদের স্বাগতম ।  ';
  const clean = normalizeSubtitleText(messy);
  assert.equal(clean, 'আজকের ভিডিওতে আপনাদের স্বাগতম।');
});

test('formatTimestampSRT and parseTimestampToSeconds roundtrip accurately', () => {
  const formatted = formatTimestampSRT(65.42);
  assert.equal(formatted, '00:01:05,420');
  assert.equal(formatTimestampVTT(65.42), '00:01:05.420');
  assert.equal(parseTimestampToSeconds(formatted), 65.42);
  assert.equal(parseTimestampToSeconds('01:05.42'), 65.42);
});

test('findActiveCue returns matching cue at exact frame timestamp', () => {
  const cues: SubtitleCue[] = [
    {
      id: 'c1',
      startTime: 0.0,
      endTime: 3.5,
      textBn: 'প্রথম লাইন',
      textEn: 'First line',
    },
    {
      id: 'c2',
      startTime: 3.6,
      endTime: 7.0,
      textBn: 'দ্বিতীয় লাইন',
      textEn: 'Second line',
    },
  ];
  assert.equal(findActiveCue(cues, 2.1)?.id, 'c1');
  assert.equal(findActiveCue(cues, 3.55), null);
  assert.equal(findActiveCue(cues, 5.0)?.id, 'c2');
});

test('auditSubtitleCues detects timing overlaps and autoFixSubtitleMismatches repairs them', () => {
  const brokenCues: SubtitleCue[] = [
    {
      id: 'c1',
      startTime: 0,
      endTime: 4.5, // overlaps with c2 startTime 3.8
      textBn: 'বাংলা সাবটাইটেল  এক ।',
      textEn: 'Bangla subtitle one.',
    },
    {
      id: 'c2',
      startTime: 3.8,
      endTime: 3.2, // inverted endTime < startTime
      textBn: 'দ্বিতীয় সাবটাইটেল।',
      textEn: 'Second subtitle.',
    },
  ];

  const initialIssues = auditSubtitleCues(brokenCues, 'bilingual');
  assert.ok(initialIssues.some((i) => i.type === 'overlap'));
  assert.ok(initialIssues.some((i) => i.type === 'inverted_time'));
  assert.ok(initialIssues.some((i) => i.type === 'encoding_mismatch'));

  const { cues: fixedCues, fixedCount } = autoFixSubtitleMismatches(brokenCues);
  assert.ok(fixedCount >= 3);

  const postIssues = auditSubtitleCues(fixedCues, 'bilingual');
  const postErrors = postIssues.filter((i) => i.severity === 'error');
  assert.equal(postErrors.length, 0);
  assert.ok(fixedCues[0].endTime < fixedCues[1].startTime);
  assert.ok(fixedCues[1].endTime > fixedCues[1].startTime);
  assert.equal(fixedCues[0].textBn, 'বাংলা সাবটাইটেল এক।');
});

test('exportToSRT and parseSRT preserve bilingual Bangla and English tracks', () => {
  const cues: SubtitleCue[] = [
    {
      id: 'c1',
      startTime: 1.0,
      endTime: 4.0,
      textBn: 'কৃত্রিম বুদ্ধিমত্তা আমাদের কাজের ধরণ বদলে দিচ্ছে।',
      textEn: 'Artificial intelligence is transforming how we work.',
    },
  ];
  const srt = exportToSRT(cues, 'bilingual', 'bn-top');
  const parsed = parseSRT(srt);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].startTime, 1.0);
  assert.equal(parsed[0].endTime, 4.0);
  assert.equal(
    parsed[0].textBn,
    'কৃত্রিম বুদ্ধিমত্তা আমাদের কাজের ধরণ বদলে দিচ্ছে।'
  );
  assert.equal(
    parsed[0].textEn,
    'Artificial intelligence is transforming how we work.'
  );
});

test('splitCueAtTime splits cue into two sequential non-overlapping NFC cues', () => {
  const cues: SubtitleCue[] = [
    {
      id: 'c1',
      startTime: 0.0,
      endTime: 4.0,
      textBn: 'প্রথম অংশ দ্বিতীয় অংশ',
      textEn: 'First part Second part',
    },
  ];
  const split = splitCueAtTime(cues, 'c1', 2.0);
  assert.equal(split.length, 2);
  assert.ok(split[0].endTime < split[1].startTime);
  assert.equal(split[0].textBn, 'প্রথম অংশ');
  assert.equal(split[1].textBn, normalizeSubtitleText('দ্বিতীয় অংশ'));
});

test('detectVoiceSegmentsFromSamples detects spoken voice intervals and ignores silence', () => {
  const sampleRate = 1000;
  // 5 seconds of audio: speech at 0.5s..2.0s and 2.8s..4.2s
  const samples = new Float32Array(sampleRate * 5);
  for (let i = 500; i < 2000; i++) {
    samples[i] = Math.sin(i * 0.25) * 0.6;
  }
  for (let i = 2800; i < 4200; i++) {
    samples[i] = Math.sin(i * 0.3) * 0.7;
  }

  const segments = detectVoiceSegmentsFromSamples(samples, sampleRate);
  assert.equal(segments.length, 2);
  assert.ok(Math.abs(segments[0].startTime - 0.5) <= 0.15);
  assert.ok(Math.abs(segments[0].endTime - 2.0) <= 0.15);
  assert.ok(Math.abs(segments[1].startTime - 2.8) <= 0.15);
  assert.ok(Math.abs(segments[1].endTime - 4.2) <= 0.15);
});

test('encodeMonoWavPcm16 creates valid 44-byte RIFF WAVE header and PCM payload', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const wav = encodeMonoWavPcm16(samples, 16000);
  assert.equal(wav.byteLength, 44 + samples.length * 2);
  const header = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]);
  assert.equal(header, 'RIFF');
  const format = String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
  assert.equal(format, 'WAVE');
  const peaks = computeWaveformPeaks(samples, 4);
  assert.equal(peaks.length, 4);
});

test('createSpeechCompactedBatches packs 81 voice segments into Vercel-safe speech WAV batches preserving video timestamps', () => {
  const sampleRate = 1000;
  const totalSamples = new Float32Array(sampleRate * 945);
  const segments = Array.from({ length: 81 }, (_, idx) => ({
    startTime: idx * 11,
    endTime: idx * 11 + 3.0,
    rmsEnergy: 0.45,
  }));

  const batches = createSpeechCompactedBatches(
    totalSamples,
    sampleRate,
    segments,
    18
  );
  assert.equal(batches.length, 5); // ceil(81 / 18) = 5 batches
  assert.equal(batches[0].segments.length, 18);
  assert.equal(batches[4].segments.length, 9);
  // Last segment preserves its original 880s video timestamp while having a compact clipStart/clipEnd
  const lastSeg = batches[4].segments[8];
  assert.equal(lastSeg.startTime, 880);
  assert.equal(lastSeg.endTime, 883);
  assert.ok((lastSeg.clipEnd || 0) < 40);
});

test('buildVoiceSegmentAlignedCues maps 81 voice segments to zero-mismatch bilingual cues and safeParseResponseJson handles plain text', async () => {
  const segments = Array.from({ length: 81 }, (_, idx) => ({
    startTime: idx * 10,
    endTime: idx * 10 + 4.5,
    rmsEnergy: 0.4,
  }));
  const cues = buildVoiceSegmentAlignedCues(segments, 944.98);
  assert.equal(cues.length, 81);
  assert.ok(cues[0].textBn.length > 0);
  assert.ok(cues[0].textEn.length > 0);

  const mock404 = new Response('The page could not be found\n\nNOT_FOUND', {
    status: 404,
  });
  const parsed = await safeParseResponseJson(mock404);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data, null);
  assert.ok(parsed.rawText.includes('The page could not be found'));
});
