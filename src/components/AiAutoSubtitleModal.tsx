import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Sparkles,
  FileVideo,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { SubtitleCue } from '../utils/subtitleEngine';

interface AiAutoSubtitleModalProps {
  isOpen: boolean;
  currentDuration: number;
  currentTitle: string;
  onClose: () => void;
  onVideoFileSelected: (file: File) => void;
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setVideoTitle(file.name.replace(/\.[^/.]+$/, ''));
    setErrorMsg(null);
    onVideoFileSelected(file);

    // Probe duration with temporary HTMLMediaElement
    const tempUrl = URL.createObjectURL(file);
    const media = document.createElement(
      file.type.startsWith('audio/') ? 'audio' : 'video'
    );
    media.preload = 'metadata';
    media.src = tempUrl;
    media.onloadedmetadata = () => {
      if (media.duration && Number.isFinite(media.duration)) {
        setDetectedDuration(Math.min(180, Math.max(8, Math.round(media.duration))));
      }
      URL.revokeObjectURL(tempUrl);
    };
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
      let mediaBase64: string | undefined;
      let mimeType: string | undefined;

      // Send inline media if file is under 18MB
      if (selectedFile && selectedFile.size <= 18 * 1024 * 1024) {
        mediaBase64 = await fileToBase64(selectedFile);
        mimeType = selectedFile.type || 'video/mp4';
      }

      const response = await fetch('/api/subtitles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaBase64,
          mimeType,
          duration: detectedDuration,
          videoTitle: videoTitle.trim() || 'Untitled Video',
          spokenHints: spokenHints.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !Array.isArray(data.cues)) {
        throw new Error(
          data.error || 'Failed to generate bilingual subtitles.'
        );
      }

      onSubtitlesGenerated(data.cues, videoTitle.trim());
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Error communicating with AI subtitle server.'
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
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 id="ai-modal-title" className="text-sm font-semibold text-white">
              AI Auto-Subtitle Generator (বাংলা + English)
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
                  <span className="text-[11px] text-slate-400 font-mono-tabular">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ·{' '}
                    {detectedDuration}s detected
                  </span>
                </>
              ) : (
                <>
                  <FileVideo className="w-6 h-6 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    Click to select Video or Audio File (.MP4, .WEBM, .MP3, .WAV)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Transcribes audio &amp; aligns both বাংলা and English tracks
                  </span>
                </>
              )}
            </button>
          </div>

          <div>
            <label
              htmlFor="ai-video-title"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Video Title or Topic
            </label>
            <input
              id="ai-video-title"
              type="text"
              required
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="e.g., পদ্মা সেতুর ডকুমেন্টারি / Padma Bridge Documentary"
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label
              htmlFor="ai-spoken-hints"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Spoken Script / Context Notes (Optional — helps exact proper nouns)
            </label>
            <textarea
              id="ai-spoken-hints"
              rows={3}
              value={spokenHints}
              onChange={(e) => setSpokenHints(e.target.value)}
              placeholder="Paste raw spoken script, names, or topic details in Bangla or English..."
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
                  ? 'Generating Frame-Synced Subtitles...'
                  : 'Generate Bilingual Subtitles'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
