import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  normalizeSubtitleText,
  autoFixSubtitleMismatches,
  SubtitleCue,
} from '../../src/utils/subtitleEngine';

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { cues, direction = 'auto' } = req.body || {};
  if (!Array.isArray(cues) || cues.length === 0) {
    res.status(400).json({ error: 'No subtitle cues provided.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const { cues: fixed } = autoFixSubtitleMismatches(cues);
    res.status(200).json({ cues: fixed });
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

    const prompt = `You are a senior broadcast subtitle translator and Bangla-English typographer.
Review the following subtitle cues and ensure 100% zero-mismatch bilingual alignment (${direction}):
- If "textBn" is missing or out of sync with "textEn", translate/update "textBn" into natural, broadcast-standard Unicode Bangla (with proper যুক্তবর্ণ and দাড়ি '।').
- If "textEn" is missing or out of sync with "textBn", translate/update "textEn" into crisp, natural broadcast English.
- Preserve the exact "id" of each cue.

Input Cues JSON:
${JSON.stringify(
  cues.map((c: SubtitleCue) => ({
    id: c.id,
    textBn: c.textBn,
    textEn: c.textEn,
  }))
)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              textBn: { type: Type.STRING },
              textEn: { type: Type.STRING },
            },
            required: ['id', 'textBn', 'textEn'],
          },
        },
      },
    });

    const updatedList = parseJsonArraySafely(response.text || '[]');
    const mapById = new Map<string, { textBn: string; textEn: string }>();
    for (const item of updatedList) {
      if (item && item.id) {
        mapById.set(String(item.id), {
          textBn: normalizeSubtitleText(String(item.textBn || '')),
          textEn: normalizeSubtitleText(String(item.textEn || '')),
        });
      }
    }

    const mergedCues: SubtitleCue[] = cues.map((c: SubtitleCue) => {
      const match = mapById.get(c.id);
      if (!match) return c;
      return {
        ...c,
        textBn: match.textBn || c.textBn,
        textEn: match.textEn || c.textEn,
      };
    });

    const { cues: fixed } = autoFixSubtitleMismatches(mergedCues);
    res.status(200).json({ cues: fixed });
  } catch {
    const { cues: fixed } = autoFixSubtitleMismatches(cues);
    res.status(200).json({ cues: fixed });
  }
}
