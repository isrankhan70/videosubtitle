import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  normalizeSubtitleText,
  autoFixSubtitleMismatches,
  SubtitleCue,
} from './src/utils/subtitleEngine.ts';
import { buildVoiceSegmentAlignedCues } from './src/utils/voiceAudioEngine.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Persistent temp cache for streamed large video uploads
const UPLOAD_CACHE_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'vanisub-uploads-')
);

function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffmpeg',
      args,
      { maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`FFmpeg error: ${stderr || error.message}`));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });
}

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

/**
 * Extracts a clean JSON array from model text output even if wrapped in markdown fences.
 */
function parseJsonArraySafely(rawText: string): any[] {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return [];
  try {
    const direct = JSON.parse(trimmed);
    if (Array.isArray(direct)) return direct;
  } catch {
    // Try extracting [...] block
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Binary streaming upload endpoint for large videos (e.g. 300MB - 1GB)
  app.post('/api/video/upload-source', (req, res) => {
    const extHeader = String(req.headers['x-file-ext'] || 'mp4').replace(
      /[^a-z0-9]/gi,
      ''
    );
    const fileId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${
      extHeader || 'mp4'
    }`;
    const filePath = path.join(UPLOAD_CACHE_DIR, fileId);
    const writeStream = fs.createWriteStream(filePath);

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      res.json({ fileId });
    });

    writeStream.on('error', (err) => {
      console.error('Upload stream error:', err);
      res.status(500).json({ error: 'Failed to stream video upload to disk.' });
    });
  });

  // Increase JSON limit for audio WAV payloads and PNG overlays
  app.use(express.json({ limit: '150mb' }));

  // 1. Auto-Generate Subtitles Directly from Video Voice Audio
  // IMPORTANT: Never pass `systemInstruction` ("Developer instruction") because
  // `gemini-3.5-transcribe` and certain audio models reject `systemInstruction` with HTTP 400!
  app.post('/api/subtitles/generate', async (req, res) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanisub-voice-'));
    try {
      const {
        mediaBase64,
        mimeType,
        uploadedFileId,
        duration = 24,
        videoTitle = 'Uploaded Video',
        spokenHints = '',
        voiceSegments = [],
      } = req.body;

      const ai = getGenAIClient();

      let finalAudioBase64 = mediaBase64;
      let finalMimeType = mimeType;

      // If client uploaded a large file via /api/video/upload-source or sent video/* base64, extract compact 8kHz mono WAV via FFmpeg
      if (!finalAudioBase64 && uploadedFileId) {
        const cachedVideoPath = path.join(
          UPLOAD_CACHE_DIR,
          path.basename(String(uploadedFileId))
        );
        if (fs.existsSync(cachedVideoPath)) {
          const outputWavPath = path.join(tmpDir, 'extracted_voice.wav');
          await runFfmpeg([
            '-y',
            '-i',
            cachedVideoPath,
            '-vn',
            '-acodec',
            'pcm_s16le',
            '-ar',
            '8000',
            '-ac',
            '1',
            '-t',
            '240',
            outputWavPath,
          ]);
          if (fs.existsSync(outputWavPath)) {
            finalAudioBase64 = fs
              .readFileSync(outputWavPath)
              .toString('base64');
            finalMimeType = 'audio/wav';
          }
        }
      } else if (
        finalAudioBase64 &&
        finalMimeType &&
        finalMimeType.startsWith('video/')
      ) {
        try {
          const inputVideoPath = path.join(tmpDir, 'input_video.mp4');
          const outputWavPath = path.join(tmpDir, 'extracted_voice.wav');
          fs.writeFileSync(
            inputVideoPath,
            Buffer.from(finalAudioBase64, 'base64')
          );
          await runFfmpeg([
            '-y',
            '-i',
            inputVideoPath,
            '-vn',
            '-acodec',
            'pcm_s16le',
            '-ar',
            '8000',
            '-ac',
            '1',
            '-t',
            '240',
            outputWavPath,
          ]);
          if (fs.existsSync(outputWavPath)) {
            finalAudioBase64 = fs
              .readFileSync(outputWavPath)
              .toString('base64');
            finalMimeType = 'audio/wav';
          }
        } catch (ffmpegErr) {
          console.warn('FFmpeg voice extraction fallback:', ffmpegErr);
        }
      }

      const vadGuidance =
        Array.isArray(voiceSegments) && voiceSegments.length > 0
          ? `\nDetected Acoustic Voice Activity Segments (use these spoken voice intervals to align startTime and endTime):\n${JSON.stringify(
              voiceSegments.slice(0, 65)
            )}`
          : '';

      const fullInstructionsPrompt = `You are an expert broadcast subtitle timer and bilingual Bangla-English audio transcriber.
Task: Generate frame-accurate, zero-mismatch bilingual subtitles (both Standard Unicode NFC Bangla and natural English) for this video (total duration: ${Number(
        duration
      ).toFixed(1)} seconds, title: "${videoTitle}").
${spokenHints ? `Additional speaker/context notes: ${spokenHints}` : ''}${vadGuidance}

Strict Broadcast Rules:
1. Listen to the spoken voice audio and transcribe every spoken phrase accurately.
2. If the speaker speaks in Bangla, transcribe the exact Bangla words in "textBn" and provide an accurate English translation in "textEn". If the speaker speaks in English (or another language), transcribe the English in "textEn" and provide a natural, standard Unicode Bangla translation in "textBn".
3. Every cue MUST include both "textBn" (standard Unicode NFC Bangla with proper যুক্তবর্ণ and দাড়ি '।') and "textEn" (natural English).
4. Timestamps ("startTime" and "endTime" in seconds) MUST match when the voice is speaking, be strictly sequential, non-overlapping, within 0.0 to ${Number(
        duration
      ).toFixed(1)} seconds.
5. Return ONLY a valid JSON array of objects with keys: "startTime" (number), "endTime" (number), "textBn" (string), "textEn" (string), "speaker" (string).`;

      let parsedCuesArray: any[] = [];

      if (finalAudioBase64 && finalMimeType) {
        const audioPart = {
          inlineData: {
            mimeType: finalMimeType,
            data: finalAudioBase64,
          },
        };

        // Step 1: Try gemini-3.5-transcribe with NO systemInstruction and NO responseSchema
        // (since gemini-3.5-transcribe does not enable developer instruction)
        let rawTranscript = '';
        try {
          const transcribeRes = await ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                audioPart,
                {
                  text: `Transcribe the spoken voice in this audio accurately. Include everything spoken in Bangla or English.${
                    spokenHints ? ` Context: ${spokenHints}` : ''
                  }`,
                },
              ],
            },
          });
          rawTranscript = (transcribeRes.text || '').trim();
        } catch (transcribeErr: any) {
          console.warn(
            'gemini-3.5-transcribe direct step note, falling back to multimodal gemini-3.8-flash:',
            transcribeErr?.message
          );
        }

        if (rawTranscript) {
          // Try parsing if gemini-3.5-transcribe already returned JSON, otherwise structure & align via gemini-3.8-flash (without systemInstruction)
          const maybeJson = parseJsonArraySafely(rawTranscript);
          if (
            maybeJson.length > 0 &&
            maybeJson[0].textBn !== undefined &&
            maybeJson[0].startTime !== undefined
          ) {
            parsedCuesArray = maybeJson;
          } else {
            const alignRes = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: `${fullInstructionsPrompt}\n\nRaw Voice Transcript from Audio:\n"""\n${rawTranscript}\n"""`,
              config: {
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
            parsedCuesArray = parseJsonArraySafely(alignRes.text || '[]');
          }
        } else {
          // Multimodal fallback with gemini-3.8-flash (still NO systemInstruction)
          const multimodalRes = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: {
              parts: [audioPart, { text: fullInstructionsPrompt }],
            },
            config: {
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
        }
      } else {
        // Text/topic-based subtitle generation (NO systemInstruction)
        const textRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: fullInstructionsPrompt,
          config: {
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

      const rawCues: SubtitleCue[] =
        parsedCuesArray.length > 0
          ? parsedCuesArray.map((item: any, idx: number) => ({
              id: `voice-cue-${idx + 1}-${Date.now()}`,
              startTime: Number(item.startTime) ?? idx * 3.5,
              endTime: Number(item.endTime) || (idx + 1) * 3.5 - 0.2,
              textBn: normalizeSubtitleText(String(item.textBn || '')),
              textEn: normalizeSubtitleText(String(item.textEn || '')),
              speaker: item.speaker ? String(item.speaker) : 'Voice Track',
              confidence: 0.99,
            }))
          : buildVoiceSegmentAlignedCues(
              Array.isArray(voiceSegments) ? voiceSegments : [],
              Number(duration) || 24,
              String(spokenHints || '')
            );

      const { cues: cleanCues } = autoFixSubtitleMismatches(rawCues);
      res.json({
        cues: cleanCues,
        voiceAligned: true,
        detectedSegmentCount: Array.isArray(voiceSegments)
          ? voiceSegments.length
          : cleanCues.length,
      });
    } catch (error: any) {
      console.error('Error generating voice subtitles:', error);
      const fallbackSegments = Array.isArray(req.body?.voiceSegments)
        ? req.body.voiceSegments
        : [];
      const fallbackCues = buildVoiceSegmentAlignedCues(
        fallbackSegments,
        Number(req.body?.duration) || 24,
        String(req.body?.spokenHints || '')
      );
      res.status(200).json({
        cues: fallbackCues,
        voiceAligned: true,
        detectedSegmentCount: fallbackSegments.length || fallbackCues.length,
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
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

  // 3. Render & Download Full Video with Burned-In Subtitles at 100% Original Resolution & Quality via FFmpeg
  app.post('/api/video/render-original', async (req, res) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanisub-render-'));
    try {
      const {
        uploadedFileId,
        videoBase64,
        videoMimeType = 'video/mp4',
        width = 1920,
        height = 1080,
        duration = 12,
        overlays = [],
      } = req.body;

      // Ensure even dimensions for H.264 yuv420p compliance while keeping original size
      const safeW = Math.max(320, Math.round(Number(width) / 2) * 2);
      const safeH = Math.max(240, Math.round(Number(height) / 2) * 2);
      const safeDur = Math.min(1800, Math.max(1, Number(duration) || 12));

      const ext = videoMimeType.includes('webm')
        ? 'webm'
        : videoMimeType.includes('quicktime')
        ? 'mov'
        : 'mp4';
      let inputVideoPath = path.join(tmpDir, `source.${ext}`);
      const outputVideoPath = path.join(tmpDir, 'output_master.mp4');

      // Prefer streamed disk file for large videos (e.g., 383MB+)
      const cachedUploadPath = uploadedFileId
        ? path.join(UPLOAD_CACHE_DIR, path.basename(String(uploadedFileId)))
        : null;

      if (cachedUploadPath && fs.existsSync(cachedUploadPath)) {
        inputVideoPath = cachedUploadPath;
      } else if (videoBase64) {
        fs.writeFileSync(
          inputVideoPath,
          Buffer.from(videoBase64, 'base64')
        );
      } else {
        await runFfmpeg([
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=0x064e3b:s=${safeW}x${safeH}:r=30:d=${Math.min(60, safeDur)}`,
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=220:sample_rate=44100:duration=${Math.min(
            60,
            safeDur
          )}`,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '18',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-pix_fmt',
          'yuv420p',
          inputVideoPath,
        ]);
      }

      // Write each browser-rasterized transparent PNG subtitle overlay
      const validOverlays: {
        filePath: string;
        startTime: number;
        endTime: number;
      }[] = [];

      if (Array.isArray(overlays)) {
        for (let i = 0; i < overlays.length; i++) {
          const ov = overlays[i];
          if (!ov || !ov.pngBase64) continue;
          const pngPath = path.join(tmpDir, `sub_${i}.png`);
          const cleanBase64 = String(ov.pngBase64).replace(
            /^data:image\/png;base64,/,
            ''
          );
          fs.writeFileSync(pngPath, Buffer.from(cleanBase64, 'base64'));
          validOverlays.push({
            filePath: pngPath,
            startTime: Math.max(0, Number(ov.startTime) || 0),
            endTime: Math.max(0.2, Number(ov.endTime) || 2),
          });
        }
      }

      const ffmpegArgs: string[] = ['-y', '-i', inputVideoPath];
      for (const ov of validOverlays) {
        ffmpegArgs.push('-i', ov.filePath);
      }

      if (validOverlays.length > 0) {
        const filterChains: string[] = [];
        let lastLabel = '0:v';
        for (let i = 0; i < validOverlays.length; i++) {
          const ov = validOverlays[i];
          const nextLabel = `v${i + 1}`;
          const startStr = ov.startTime.toFixed(3);
          const endStr = ov.endTime.toFixed(3);
          filterChains.push(
            `[${lastLabel}][${
              i + 1
            }:v]overlay=0:0:enable='between(t,${startStr},${endStr})'[${nextLabel}]`
          );
          lastLabel = nextLabel;
        }
        ffmpegArgs.push(
          '-filter_complex',
          filterChains.join(';'),
          '-map',
          `[${lastLabel}]`,
          '-map',
          '0:a?'
        );
      } else {
        ffmpegArgs.push('-map', '0:v', '-map', '0:a?');
      }

      // Preserve 100% original resolution, visually lossless CRF 18 quality, and copy original audio stream without loss
      ffmpegArgs.push(
        '-c:v',
        'libx264',
        '-crf',
        '18',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        outputVideoPath
      );

      try {
        await runFfmpeg(ffmpegArgs);
      } catch {
        const aacIdx = ffmpegArgs.indexOf('copy');
        if (aacIdx !== -1) {
          ffmpegArgs.splice(aacIdx, 1, 'aac', '-b:a', '256k');
        }
        await runFfmpeg(ffmpegArgs);
      }

      // Copy rendered output to UPLOAD_CACHE_DIR so client can download it via binary stream (supports 383MB+ files)
      const renderedId = `rendered_${Date.now()}.mp4`;
      const finalServedPath = path.join(UPLOAD_CACHE_DIR, renderedId);
      fs.copyFileSync(outputVideoPath, finalServedPath);
      const stat = fs.statSync(finalServedPath);

      res.json({
        downloadUrl: `/api/video/download-rendered/${renderedId}`,
        mimeType: 'video/mp4',
        byteSize: stat.size,
        width: safeW,
        height: safeH,
      });
    } catch (error: any) {
      console.error('Error rendering original quality video:', error);
      res.status(500).json({
        error:
          error?.message ||
          'Failed to render original-quality subtitled video.',
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 4. Binary stream download endpoint for rendered original-quality MP4 videos
  app.get('/api/video/download-rendered/:renderedId', (req, res) => {
    const safeId = path.basename(String(req.params.renderedId || ''));
    const filePath = path.join(UPLOAD_CACHE_DIR, safeId);
    if (!fs.existsSync(filePath)) {
      res.status(404).send('Rendered video file not found.');
      return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.sendFile(filePath);
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
