/**
 * Voice Audio Extraction, Voice Activity Detection (VAD), and 16kHz Mono WAV Encoder.
 * Extracts the spoken voice track from any uploaded video file in the browser so
 * Gemini can transcribe spoken words into frame-accurate Bangla & English subtitles.
 */

export interface DetectedVoiceSegment {
  startTime: number;
  endTime: number;
  rmsEnergy: number;
}

export interface ExtractedVoiceResult {
  wavBase64: string;
  mimeType: string;
  duration: number;
  sampleRate: number;
  voiceSegments: DetectedVoiceSegment[];
  waveformPeaks: number[];
}

/**
 * Computes normalized waveform peaks (0.05 to 1.0) for timeline visualization.
 */
export function computeWaveformPeaks(
  samples: Float32Array,
  bucketCount: number = 96
): number[] {
  if (!samples || samples.length === 0 || bucketCount <= 0) {
    return Array.from({ length: Math.max(1, bucketCount) }, () => 0.15);
  }

  const samplesPerBucket = Math.max(1, Math.floor(samples.length / bucketCount));
  const rawPeaks: number[] = [];
  let maxPeak = 0.001;

  for (let i = 0; i < bucketCount; i++) {
    const start = i * samplesPerBucket;
    const end = Math.min(samples.length, start + samplesPerBucket);
    let sumSq = 0;
    let count = 0;
    for (let j = start; j < end; j += 2) {
      const val = samples[j];
      sumSq += val * val;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    if (rms > maxPeak) maxPeak = rms;
    rawPeaks.push(rms);
  }

  return rawPeaks.map((p) =>
    Number(Math.max(0.08, Math.min(1.0, p / maxPeak)).toFixed(3))
  );
}

/**
 * Pure Voice Activity Detection (VAD) from mono PCM Float32 samples.
 * Identifies speech onset and offset timestamps so subtitles align to real spoken voice.
 */
export function detectVoiceSegmentsFromSamples(
  samples: Float32Array,
  sampleRate: number,
  options?: {
    windowSec?: number;
    minSpeechSec?: number;
    maxSegmentSec?: number;
    silenceBridgeSec?: number;
  }
): DetectedVoiceSegment[] {
  if (!samples || samples.length === 0 || sampleRate <= 0) return [];

  const windowSec = options?.windowSec ?? 0.1;
  const minSpeechSec = options?.minSpeechSec ?? 0.65;
  const maxSegmentSec = options?.maxSegmentSec ?? 4.8;
  const silenceBridgeSec = options?.silenceBridgeSec ?? 0.35;

  const windowSize = Math.max(1, Math.floor(sampleRate * windowSec));
  const numWindows = Math.ceil(samples.length / windowSize);
  const energies: number[] = [];

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = Math.min(samples.length, start + windowSize);
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    energies.push(rms);
  }

  // Adaptive energy threshold based on median/mean RMS
  const sorted = [...energies].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.25)] || 0.002;
  const peakEnergy = sorted[Math.floor(sorted.length * 0.92)] || 0.05;
  const threshold = Math.max(
    0.008,
    noiseFloor + (peakEnergy - noiseFloor) * 0.22
  );

  // Collect raw active windows
  const rawSegments: DetectedVoiceSegment[] = [];
  let inSpeech = false;
  let segStart = 0;
  let energySum = 0;
  let energyCount = 0;

  for (let w = 0; w < numWindows; w++) {
    const t = w * windowSec;
    const isVocal = energies[w] >= threshold;

    if (isVocal && !inSpeech) {
      inSpeech = true;
      segStart = t;
      energySum = energies[w];
      energyCount = 1;
    } else if (isVocal && inSpeech) {
      energySum += energies[w];
      energyCount++;
      // Split if segment exceeds maxSegmentSec for readable subtitle pacing
      if (t + windowSec - segStart >= maxSegmentSec) {
        rawSegments.push({
          startTime: Number(segStart.toFixed(2)),
          endTime: Number((t + windowSec).toFixed(2)),
          rmsEnergy: Number((energySum / energyCount).toFixed(4)),
        });
        inSpeech = false;
      }
    } else if (!isVocal && inSpeech) {
      rawSegments.push({
        startTime: Number(segStart.toFixed(2)),
        endTime: Number(t.toFixed(2)),
        rmsEnergy: Number((energySum / Math.max(1, energyCount)).toFixed(4)),
      });
      inSpeech = false;
    }
  }

  if (inSpeech) {
    const totalDuration = samples.length / sampleRate;
    rawSegments.push({
      startTime: Number(segStart.toFixed(2)),
      endTime: Number(totalDuration.toFixed(2)),
      rmsEnergy: Number((energySum / Math.max(1, energyCount)).toFixed(4)),
    });
  }

  // Bridge micro-pauses shorter than silenceBridgeSec (provided combined <= maxSegmentSec)
  const merged: DetectedVoiceSegment[] = [];
  for (const seg of rawSegments) {
    if (merged.length === 0) {
      merged.push({ ...seg });
      continue;
    }
    const prev = merged[merged.length - 1];
    const gap = seg.startTime - prev.endTime;
    const combinedDuration = seg.endTime - prev.startTime;

    if (gap <= silenceBridgeSec && combinedDuration <= maxSegmentSec) {
      prev.endTime = seg.endTime;
      prev.rmsEnergy = Number(((prev.rmsEnergy + seg.rmsEnergy) / 2).toFixed(4));
    } else {
      merged.push({ ...seg });
    }
  }

  // Filter out tiny clicks shorter than minSpeechSec
  return merged.filter((s) => s.endTime - s.startTime >= minSpeechSec);
}

/**
 * Encodes Float32 mono audio samples into a standard 44-byte RIFF 16-bit PCM WAV Uint8Array.
 */
export function encodeMonoWavPcm16(
  samples: Float32Array,
  sampleRate: number = 16000
): Uint8Array {
  const numSamples = samples.length;
  const dataByteLength = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // Mono = 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16-bit
  writeAscii(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Converts a Uint8Array to base64 string safely in browser or Node.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunkSize));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
}

/**
 * Extracts and downsamples the voice audio track from any uploaded video/audio File
 * into a 16kHz mono WAV + VAD segments + waveform peaks.
 */
export async function extractVoiceFromVideoFile(
  file: File,
  maxDurationSec: number = 240
): Promise<ExtractedVoiceResult> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioCtx();

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    // Use 8kHz wideband speech rate for videos > 90s so 4-minute audio stays under 3.8MB
    const targetSampleRate = decoded.duration > 90 ? 8000 : 16000;
    const clippedDuration = Math.min(decoded.duration, maxDurationSec);
    const frameCount = Math.max(
      1,
      Math.floor(clippedDuration * targetSampleRate)
    );

    const offlineCtx = new OfflineAudioContext(
      1,
      frameCount,
      targetSampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const monoSamples = rendered.getChannelData(0);

    const voiceSegments = detectVoiceSegmentsFromSamples(
      monoSamples,
      targetSampleRate
    );
    const waveformPeaks = computeWaveformPeaks(monoSamples, 96);
    const wavBytes = encodeMonoWavPcm16(monoSamples, targetSampleRate);
    const wavBase64 = uint8ArrayToBase64(wavBytes);

    return {
      wavBase64,
      mimeType: 'audio/wav',
      duration: Number(decoded.duration.toFixed(2)),
      sampleRate: targetSampleRate,
      voiceSegments,
      waveformPeaks,
    };
  } finally {
    audioCtx.close().catch(() => {});
  }
}
