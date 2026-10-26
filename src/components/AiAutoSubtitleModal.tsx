import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Mic,
  FileVideo,
  AlertCircle,
  CheckCircle2,
  AudioWaveform,
} from 'lucide-react';
import { SubtitleCue } from '../utils/subtitleEngine';
import {
  extractVoiceFromVideoFile,
  DetectedVoiceSegment,
} from '../utils/voiceAudioEngine';

interface AiAutoSubtitleModalProps {
  isOpen: boolean;
  currentDuration: number;
  currentTitle: string;
  onClose: () => void;
  onVideoFileSelected: (
    file: File,
    voiceData?: {
      duration: number;
      waveformPeaks: number[];
      voiceSegments: DetectedVoiceSegment[];
    }
  ) => void;
  onSubtitlesGenerated: (cues: SubtitleCue[], title?: string) => void;
}

export const AiAutoSubtitleModal: React.FC<AiAutoSubtitleModalProps> = ({
  isOpen,
  currentDuration,
  currentTitle,
  onClose,
  onVideoFileSelected,
  onSubtitlesGenerated,
}) => {
  const [videoTitle, setVideoTitle] = useState(currentTitle);
  const [spokenHints, setSpokenHints] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number>(
    currentDuration || 24
  );
  const [extractedWavBase64, setExtractedWavBase64] = useState<string | null>(
    null
  );
  const [voiceSegments, setVoiceSegments] = useState<DetectedVoiceSegment[]>(
    []
  );
  const [statusStep, setStatusStep] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    setSelectedFile(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setVideoTitle(cleanName);
    setErrorMsg(null);
    setStatusStep('Extracting 16kHz voice audio & detecting speech segments...');

    try {
      const voiceResult = await extractVoiceFromVideoFile(file);
      setDetectedDuration(voiceResult.duration);
      setExtractedWavBase64(voiceResult.wavBase64);
      setVoiceSegments(voiceResult.voiceSegments);
      setStatusStep(
        `Extracted voice track (${voiceResult.duration}s) · ${voiceResult.voiceSegments.length} spoken segments detected`
      );
      onVideoFileSelected(file, {
        duration: voiceResult.duration,
        waveformPeaks: voiceResult.waveformPeaks,
        voiceSegments: voiceResult.voiceSegments,
      });
    } catch {
      // Fallback if video has no browser-decodable audio track: server FFmpeg will extract audio
      setStatusStep(
        'Video loaded — Server FFmpeg will extract voice audio during transcription'
      );
      onVideoFileSelected(file);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleRunAutoSubtitler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoTitle.trim() && !selectedFile) {
      setErrorMsg('Please select a video file or enter a video title/topic.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      let mediaBase64: string | undefined = extractedWavBase64 || undefined;
      let mimeType: string | undefined = extractedWavBase64
        ? 'audio/wav'
        : undefined;
      let uploadedFileId: string | undefined;

      // If browser WebAudio didn't extract WAV, stream the video file to server for FFmpeg voice extraction
      if (!mediaBase64 && selectedFile) {
        setStatusStep('Streaming video to server for FFmpeg voice extraction...');
        const ext =
          selectedFile.name.split('.').pop()?.toLowerCase() || 'mp4';
        const upRes = await fetch('/api/video/upload-source', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-file-ext': ext,
          },
          body: selectedFile,
        });
        const upData = await upRes.json();
        if (upRes.ok && upData.fileId) {
          uploadedFileId = upData.fileId;
        }
      }

      setStatusStep(
        'Transcribing spoken voice into বাংলা & English subtitles with Gemini AI...'
      );

      const response = await fetch('/api/subtitles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaBase64,
          mimeType,
          uploadedFileId,
          duration: detectedDuration,
          videoTitle: videoTitle.trim() || 'Uploaded Video',
          spokenHints: spokenHints.trim(),
          voiceSegments,
        }),
      });

      const data = await response.json();
      if (!response.ok || !Array.isArray(data.cues)) {
        throw new Error(
          data.error || 'Failed to generate voice-aligned subtitles.'
        );
      }

      onSubtitlesGenerated(data.cues, videoTitle.trim());
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Error communicating with AI voice transcription server.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg bg-[#0F172A] border border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-amber-400" />
            <h2 id="ai-modal-title" className="text-sm font-semibold text-white">
              Video Voice-to-Subtitle Generator (বাংলা + English)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Subtitle Modal"
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleRunAutoSubtitler} className="p-5 space-y-4">
          {/* File Dropzone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChange(f);
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-4 border border-dashed border-slate-700 hover:border-amber-500/80 bg-slate-900/60 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-colors"
            >
              {selectedFile ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">
                    {selectedFile.name}
                  </span>
                  <span className="text-[11px] text-emerald-300 font-mono-tabular">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ·{' '}
                    {detectedDuration}s · {voiceSegments.length} Voice Segments
                  </span>
                </>
              ) : (
                <>
                  <FileVideo className="w-6 h-6 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    Select Video File (.MP4, .MOV, .WEBM) to Extract Voice
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Extracts 16kHz voice audio &amp; auto-aligns বাংলা + English
                    subtitles to spoken voice
                  </span>
                </>
              )}
            </button>
          </div>

          {statusStep && (
            <div className="px-3 py-2 rounded bg-slate-900 border border-slate-800 text-xs text-amber-300 flex items-center gap-2">
              <AudioWaveform className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{statusStep}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="ai-video-title"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Video Title or Topic Context
            </label>
            <input
              id="ai-video-title"
              type="text"
              required
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="e.g., সুন্দরবন ডকুমেন্টারি / Tech Review"
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label
              htmlFor="ai-spoken-hints"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Speaker Terms / Proper Nouns (Optional — improves specific names)
            </label>
            <textarea
              id="ai-spoken-hints"
              rows={2}
              value={spokenHints}
              onChange={(e) => setSpokenHints(e.target.value)}
              placeholder="Optional names, technical terms, or script hints in বাংলা or English..."
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:border-amber-500 bangla-text-render"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {isProcessing
                  ? 'Transcribing Video Voice...'
                  : 'Auto-Generate Subtitles from Voice'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
