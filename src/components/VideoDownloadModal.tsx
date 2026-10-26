import React, { useState } from 'react';
import {
  X,
  Video,
  Download,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  SubtitleCue,
  SubtitleStyleConfig,
  SubtitleDisplayMode,
} from '../utils/subtitleEngine';
import { renderAllCuesToTransparentPngs } from '../utils/videoSubtitleRenderer';

interface VideoDownloadModalProps {
  isOpen: boolean;
  cues: SubtitleCue[];
  styleConfig: SubtitleStyleConfig;
  uploadedVideoFile: File | null;
  nativeWidth: number;
  nativeHeight: number;
  duration: number;
  projectTitle: string;
  onClose: () => void;
  onUpdateStyle: (patch: Partial<SubtitleStyleConfig>) => void;
}

export const VideoDownloadModal: React.FC<VideoDownloadModalProps> = ({
  isOpen,
  cues,
  styleConfig,
  uploadedVideoFile,
  nativeWidth,
  nativeHeight,
  duration,
  projectTitle,
  onClose,
  onUpdateStyle,
}) => {
  const [isRendering, setIsRendering] = useState(false);
  const [renderStep, setRenderStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedVideoInfo, setCompletedVideoInfo] = useState<{
    url: string;
    filename: string;
    byteSize: number;
    width: number;
    height: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleRenderAndDownloadVideo = async () => {
    setIsRendering(true);
    setErrorMsg(null);
    setCompletedVideoInfo(null);

    try {
      const targetW = nativeWidth || 1920;
      const targetH = nativeHeight || 1080;

      setRenderStep(
        `Rasterizing ${cues.length} বাংলা/EN subtitle overlays at native ${targetW}×${targetH}...`
      );
      const overlays = await renderAllCuesToTransparentPngs(
        cues,
        styleConfig,
        targetW,
        targetH
      );

      let uploadedFileId: string | undefined;
      let videoMimeType = 'video/mp4';

      if (uploadedVideoFile) {
        videoMimeType = uploadedVideoFile.type || 'video/mp4';
        const ext =
          uploadedVideoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
        setRenderStep(
          `Streaming original video (${(
            uploadedVideoFile.size /
            (1024 * 1024)
          ).toFixed(2)} MB) to studio renderer...`
        );

        const uploadRes = await fetch('/api/video/upload-source', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-file-ext': ext,
          },
          body: uploadedVideoFile,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.fileId) {
          throw new Error(
            uploadData.error || 'Failed to upload source video stream.'
          );
        }
        uploadedFileId = uploadData.fileId;
      } else {
        setRenderStep(
          `Preparing master ${targetW}×${targetH} broadcast video stream...`
        );
      }

      setRenderStep(
        `Compositing subtitles at original ${targetW}×${targetH} resolution & CRF 18 lossless quality...`
      );

      const response = await fetch('/api/video/render-original', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadedFileId,
          videoMimeType,
          width: targetW,
          height: targetH,
          duration: Math.min(1800, Math.max(4, duration)),
          overlays,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.downloadUrl) {
        throw new Error(
          data.error || 'Failed to render original-quality video.'
        );
      }

      const slug = projectTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const filename = `${slug || 'video'}-subtitled-${data.width}x${
        data.height
      }.mp4`;

      setCompletedVideoInfo({
        url: data.downloadUrl,
        filename,
        byteSize: data.byteSize || 0,
        width: data.width || targetW,
        height: data.height || targetH,
      });

      // Trigger automatic download
      const a = document.createElement('a');
      a.href = data.downloadUrl;
      a.download = filename;
      a.click();
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Error while rendering original-quality subtitled video.'
      );
    } finally {
      setIsRendering(false);
      setRenderStep('');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-download-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-xl bg-[#0F172A] border border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-amber-400" />
            <h2
              id="video-download-modal-title"
              className="text-sm font-semibold text-white"
            >
              Download Subtitled Video (100% Original Resolution &amp; Quality)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Video Download Modal"
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Source Video File</span>
              <span className="font-medium text-white truncate max-w-[260px]">
                {uploadedVideoFile
                  ? `${uploadedVideoFile.name} (${(
                      uploadedVideoFile.size /
                      (1024 * 1024)
                    ).toFixed(2)} MB)`
                  : `${projectTitle} (Studio Master)`}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Output Dimensions (Original Size Lock)
              </span>
              <span
                data-testid="modal-native-resolution"
                className="font-mono-tabular text-emerald-400 font-semibold"
              >
                {nativeWidth} × {nativeHeight} px (1:1 Original)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Video &amp; Audio Fidelity</span>
              <span className="font-mono-tabular text-slate-200">
                H.264 CRF 18 Lossless + Original Audio Copy
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Burned-In Typography &amp; Shaping
              </span>
              <span className="font-mono-tabular text-amber-300">
                {styleConfig.banglaFont} · {cues.length} Cues (UTF-8 NFC)
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Subtitle Track to Burn Into Video
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              {(
                [
                  { id: 'bilingual', label: 'বাংলা + English' },
                  { id: 'bn', label: 'শুধু বাংলা (Bangla)' },
                  { id: 'en', label: 'English Only' },
                ] as { id: SubtitleDisplayMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdateStyle({ displayMode: opt.id })}
                  className={`py-1.5 px-2 text-xs font-medium rounded transition-colors ${
                    styleConfig.displayMode === opt.id
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              Subtitles are rasterized at native{' '}
              <span className="font-mono-tabular text-white font-medium">
                {nativeWidth}×{nativeHeight}
              </span>{' '}
              using your browser&apos;s exact{' '}
              <span className="text-amber-300 font-medium">
                {styleConfig.banglaFont}
              </span>{' '}
              glyph engine and composited onto the original video stream via
              FFmpeg without resizing or quality loss.
            </div>
          </div>

          {isRendering && (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <div className="text-xs text-amber-200 font-medium">
                {renderStep || 'Rendering original-quality subtitled video...'}
              </div>
            </div>
          )}

          {completedVideoInfo && (
            <div
              data-testid="video-render-complete-banner"
              className="p-3.5 rounded-lg bg-emerald-950/50 border border-emerald-700/60 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {completedVideoInfo.filename}
                  </div>
                  <div className="text-[11px] text-emerald-300 font-mono-tabular">
                    {completedVideoInfo.width}×{completedVideoInfo.height} px ·{' '}
                    {completedVideoInfo.byteSize > 1024 * 1024
                      ? `${(
                          completedVideoInfo.byteSize /
                          (1024 * 1024)
                        ).toFixed(2)} MB`
                      : `${(completedVideoInfo.byteSize / 1024).toFixed(
                          1
                        )} KB`}{' '}
                    · Original Quality MP4
                  </div>
                </div>
              </div>
              <a
                href={completedVideoInfo.url}
                download={completedVideoInfo.filename}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Save MP4 Again
              </a>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
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
              Close
            </button>
            <button
              type="button"
              disabled={isRendering}
              onClick={handleRenderAndDownloadVideo}
              data-testid="render-download-mp4-btn"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isRendering
                  ? 'Rendering Original Video...'
                  : `Render & Download MP4 (${nativeWidth}×${nativeHeight})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
