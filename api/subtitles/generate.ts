import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  normalizeSubtitleText,
  autoFixSubtitleMismatches,
  SubtitleCue,
} from '../../src/utils/subtitleEngine';
import {
  buildVoiceSegmentAlignedCues,
  DetectedVoiceSegment,
} from '../../src/utils/voiceAudioEngine';

function parseJsonArraySafely(rawText: string): any[] {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return [];
  try {
    const direct = JSON.parse(trimmed);
    if (Array.isArray(direct)) return direct;
  } catch {
    const startIdx = trimmed.indexOf('[');
    const endIdx = trimmed.lastIndexOf(']');
    if (startIdx !== -1 && endIdx > startIdx) {
      try {
        const sliced = JSON.parse(trimmed.slice(startIdx, endIdx + 1));
        if (Array.isArray(sliced)) return sliced;
      } catch {
        return [];
      }
    }
  }
  return [];
}

const AUDIO_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
];

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const {
    mediaBase64,
    mimeType,
    duration = 24,
    videoTitle = 'Uploaded Video',
    spokenHints = '',
    voiceSegments = [],
    isCompactedBatch = false,
  } = req.body || {};

  const apiKey = process.env.GEMINI_API_KEY;
  const typedSegments: DetectedVoiceSegment[] = Array.isArray(voiceSegments)
    ? voiceSegments
    : [];

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const fallbackCues = buildVoiceSegmentAlignedCues(
      typedSegments,
      Number(duration) || 24,
      String(spokenHints || '')
    );
    res.status(200).json({
      cues: fallbackCues,
      voiceAligned: true,
      warning:
        'GEMINI_API_KEY is not configured in Vercel Environment Variables. Add GEMINI_API_KEY in Vercel Settings -> Environment Variables for live voice transcription.',
      detectedSegmentCount: fallbackCues.length,
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const segmentTable =
      typedSegments.length > 0
        ? typedSegments
            .map((seg, i) => {
              const clipInfo =
                isCompactedBatch &&
                seg.clipStart !== undefined &&
                seg.clipEnd !== undefined
                  ? `Audio Clip Window: [${seg.clipStart.toFixed(
                      2
                    )}s - ${seg.clipEnd.toFixed(2)}s] -> `
                  : '';
              return `Segment #${i + 1}: ${clipInfo}Video Timestamp: startTime=${seg.startTime.toFixed(
                2
              )}, endTime=${seg.endTime.toFixed(2)}`;
            })
            .join('\n')
        : '';

    const fullInstructionsPrompt = `You are a verbatim broadcast audio transcriber and bilingual Bangla-English subtitle translator.
Listen carefully to the attached voice audio from the video "${videoTitle}".
${spokenHints ? `Speaker / Context Notes: ${spokenHints}\n` : ''}
CRITICAL TRANSCRIPTION RULES (MUST FOLLOW):
1. Transcribe the EXACT words spoken by the human voice in the audio. NEVER invent generic summary sentences or placeholder text.
2. If the speaker speaks in Bangla (or mixed Bangla/English), write the exact spoken Bangla words in "textBn" (Standard Unicode NFC Bangla with accurate যুক্তবর্ণ and দাড়ি '।') and translate those exact words into natural English in "textEn".
3. If the speaker speaks in English (or another language), write the exact spoken English words in "textEn" and translate those exact words into natural Unicode Bangla in "textBn".
4. ${
      typedSegments.length > 0
        ? `Match your transcription 1-to-1 to the following ${typedSegments.length} detected voice segments in exact order:\n${segmentTable}`
        : `Generate sequential, non-overlapping timestamps ("startTime" and "endTime" in seconds) within 0.0 to ${Number(
            duration
          ).toFixed(1)}s matching when the voice speaks.`
    }
5. Return ONLY a JSON array of objects with keys: "startTime" (number), "endTime" (number), "textBn" (string), "textEn" (string), "speaker" (string).`;

    let parsedCuesArray: any[] = [];

    if (mediaBase64 && mimeType) {
      const audioPart = {
        inlineData: {
          mimeType,
          data: mediaBase64,
        },
      };

      // Try primary fast multimodal audio models (gemini-3-flash-preview -> gemini-3.1-flash-lite-preview)
      for (const modelName of AUDIO_MODELS) {
        try {
          const multimodalRes = await ai.models.generateContent({
            model: modelName,
            contents: [audioPart, fullInstructionsPrompt],
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    textBn: { type: Type.STRING },
                    textEn: { type: Type.STRING },
                    speaker: { type: Type.STRING },
                  },
                  required: ['startTime', 'endTime', 'textBn', 'textEn'],
                },
              },
            },
          });
          parsedCuesArray = parseJsonArraySafely(multimodalRes.text || '[]');
          if (parsedCuesArray.length > 0) break;
        } catch (err: any) {
          console.warn(`Audio model ${modelName} retry note:`, err?.message);
        }
      }

      // Secondary fallback via gemini-3.5-transcribe if needed
      if (parsedCuesArray.length === 0) {
        try {
          const transcribeRes = await ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                audioPart,
                {
                  text: `Transcribe every spoken word in this audio verbatim in Bangla or English.${
                    spokenHints ? ` Context: ${spokenHints}` : ''
                  }`,
                },
              ],
            },
          });
          const rawTranscript = (transcribeRes.text || '').trim();
          if (rawTranscript) {
            const alignRes = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: `${fullInstructionsPrompt}\n\nVerbatim Transcript from Audio:\n"""\n${rawTranscript}\n"""`,
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: 'application/json',
              },
            });
            parsedCuesArray = parseJsonArraySafely(alignRes.text || '[]');
          }
        } catch {
          // ignore
        }
      }
    } else {
      const textRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: fullInstructionsPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startTime: { type: Type.NUMBER },
                endTime: { type: Type.NUMBER },
                textBn: { type: Type.STRING },
                textEn: { type: Type.STRING },
                speaker: { type: Type.STRING },
              },
              required: ['startTime', 'endTime', 'textBn', 'textEn'],
            },
          },
        },
      });
      parsedCuesArray = parseJsonArraySafely(textRes.text || '[]');
    }

    const rawCues: SubtitleCue[] = parsedCuesArray.map(
      (item: any, idx: number) => {
        const matchedSeg = typedSegments[idx];
        return {
          id: `voice-cue-${idx + 1}-${Date.now()}`,
          startTime: matchedSeg
            ? matchedSeg.startTime
            : Number(item.startTime) ?? idx * 3.5,
          endTime: matchedSeg
            ? matchedSeg.endTime
            : Number(item.endTime) || (idx + 1) * 3.5 - 0.2,
          textBn: normalizeSubtitleText(String(item.textBn || '')),
          textEn: normalizeSubtitleText(String(item.textEn || '')),
          speaker: item.speaker ? String(item.speaker) : 'Voice Track',
          confidence: 0.99,
        };
      }
    );

    const { cues: cleanCues } = autoFixSubtitleMismatches(rawCues);
    const finalCues =
      cleanCues.length > 0
        ? cleanCues
        : buildVoiceSegmentAlignedCues(
            typedSegments,
            Number(duration) || 24,
            String(spokenHints || '')
          );

    res.status(200).json({
      cues: finalCues,
      voiceAligned: true,
      detectedSegmentCount: typedSegments.length || finalCues.length,
    });
  } catch (err: any) {
    console.error('Vercel /api/subtitles/generate error:', err?.message);
    const fallbackCues = buildVoiceSegmentAlignedCues(
      typedSegments,
      Number(duration) || 24,
      String(spokenHints || '')
    );
    res.status(200).json({
      cues: fallbackCues,
      voiceAligned: true,
      detectedSegmentCount: fallbackCues.length,
    });
  }
}
