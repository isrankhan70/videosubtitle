import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  normalizeSubtitleText,
  autoFixSubtitleMismatches,
  SubtitleCue,
} from './src/utils/subtitleEngine.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase JSON limit for base64 audio/video snippets
  app.use(express.json({ limit: '35mb' }));

  // 1. Auto-Generate Subtitles from Audio/Video or Transcript Prompt
  app.post('/api/subtitles/generate', async (req, res) => {
    try {
      const {
        mediaBase64,
        mimeType,
        duration = 24,
        videoTitle = 'Uploaded Video',
        spokenHints = '',
      } = req.body;

      const ai = getGenAIClient();

      const parts: any[] = [];
      let modelName = 'gemini-3.8-flash';

      if (mediaBase64 && mimeType) {
        // Use gemini-3.5-transcribe for audio transcription or gemini-3.8-flash for multimodal video+audio
        if (mimeType.startsWith('audio/')) {
          modelName = 'gemini-3.5-transcribe';
        }
        parts.push({
          inlineData: {
            mimeType,
            data: mediaBase64,
          },
        });
      }

      const systemPrompt = `You are an expert broadcast subtitle timer and bilingual Bangla-English linguist.
Generate frame-accurate, zero-mismatch bilingual subtitles (both Standard Unicode NFC Bangla and natural English) for the provided media (total duration: ${Number(
        duration
      ).toFixed(1)} seconds, title: "${videoTitle}").
${spokenHints ? `Additional context/transcript notes: ${spokenHints}` : ''}

Strict Broadcast Rules:
1. Every cue MUST include both "textBn" (pure, grammatically accurate, standard Unicode Bangla with proper যুক্তবর্ণ and দাড়ি '।') and "textEn" (natural, accurate English translation).
2. Timestamps ("startTime" and "endTime" in seconds) MUST be strictly sequential, non-overlapping, within 0.0 to ${Number(
        duration
      ).toFixed(1)} seconds, with each cue lasting between 1.5 and 5.0 seconds.
3. Never output Bijoy/ANSI garbled characters; use 100% standard UTF-8 Bengali Unicode.`;

      parts.push({
        text: mediaBase64
          ? 'Transcribe and translate this media into frame-accurate bilingual Bangla and English subtitle cues.'
          : `Create a realistic, frame-accurate bilingual (Bangla & English) subtitle track for a ${Number(
              duration
            ).toFixed(1)}-second video titled "${videoTitle}". ${spokenHints}`,
      });

      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startTime: {
                  type: Type.NUMBER,
                  description: 'Start timestamp in seconds (e.g. 0.5)',
                },
                endTime: {
                  type: Type.NUMBER,
                  description: 'End timestamp in seconds (e.g. 4.2)',
                },
                textBn: {
                  type: Type.STRING,
                  description: 'Standard Unicode Bangla subtitle text',
                },
                textEn: {
                  type: Type.STRING,
                  description: 'Standard English subtitle text',
                },
                speaker: {
                  type: Type.STRING,
                  description: 'Speaker label',
                },
              },
              required: ['startTime', 'endTime', 'textBn', 'textEn'],
            },
          },
        },
      });

      const rawText = response.text || '[]';
      const parsed = JSON.parse(rawText);
      const rawCues: SubtitleCue[] = (Array.isArray(parsed) ? parsed : []).map(
        (item: any, idx: number) => ({
          id: `ai-cue-${idx + 1}-${Date.now()}`,
          startTime: Number(item.startTime) || idx * 3.5,
          endTime: Number(item.endTime) || (idx + 1) * 3.5 - 0.2,
          textBn: normalizeSubtitleText(String(item.textBn || '')),
          textEn: normalizeSubtitleText(String(item.textEn || '')),
          speaker: item.speaker ? String(item.speaker) : 'Speaker 1',
          confidence: 0.99,
        })
      );

      const { cues: cleanCues } = autoFixSubtitleMismatches(rawCues);
      res.json({ cues: cleanCues });
    } catch (error: any) {
      console.error('Error generating subtitles:', error);
      res.status(500).json({
        error:
          error?.message ||
          'Failed to generate subtitles with Gemini AI. Please try again.',
      });
    }
  });

  // 2. Bilingual Sync Translation & Standard Polish (Bangla <-> English)
  app.post('/api/subtitles/translate', async (req, res) => {
    try {
      const { cues, direction = 'auto' } = req.body;
      if (!Array.isArray(cues) || cues.length === 0) {
        res.status(400).json({ error: 'No subtitle cues provided.' });
        return;
      }

      const ai = getGenAIClient();

      const prompt = `You are a senior broadcast subtitle translator and Bangla-English typographer.
Review the following subtitle cues and ensure 100% zero-mismatch bilingual alignment (${direction}):
- If "textBn" is missing or out of sync with "textEn", translate/update "textBn" into natural, broadcast-standard Unicode Bangla (with proper যুক্তবর্ণ and দাড়ি '।').
- If "textEn" is missing or out of sync with "textBn", translate/update "textEn" into crisp, natural broadcast English.
- Polish any spelling or spacing glitches while preserving the exact "id" of each cue.

Input Cues JSON:
${JSON.stringify(
  cues.map((c: SubtitleCue) => ({
    id: c.id,
    textBn: c.textBn,
    textEn: c.textEn,
  }))
)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
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

      const updatedList = JSON.parse(response.text || '[]');
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
      res.json({ cues: fixed });
    } catch (error: any) {
      console.error('Error translating/polishing subtitles:', error);
      res.status(500).json({
        error:
          error?.message ||
          'Failed to synchronize bilingual translations. Please try again.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VaniSub Studio server listening on http://localhost:${PORT}`);
  });
}

startServer();
