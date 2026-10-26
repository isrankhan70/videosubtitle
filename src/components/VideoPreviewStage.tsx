import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Camera,
  Upload,
  Maximize2,
  Mic,
  Video,
} from 'lucide-react';
import {
  SubtitleCue,
  SubtitleStyleConfig,
  findActiveCue,
  formatTimestampDisplay,
  normalizeSubtitleText,
} from '../utils/subtitleEngine';
import { SampleVideoProject } from '../utils/sampleProjects';

interface VideoPreviewStageProps {
  project: SampleVideoProject;
  uploadedVideoUrl: string | null;
  uploadedVideoName: string | null;
  nativeWidth: number;
  nativeHeight: number;
  waveformPeaks: number[];
  isExtractingVoice: boolean;
  cues: SubtitleCue[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  styleConfig: SubtitleStyleConfig;
  selectedCueId: string | null;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onNativeDimensionsChange: (width: number, height: number) => void;
  onPlayPauseToggle: () => void;
  onSelectCue: (cueId: string, seekTime?: number) => void;
  onUploadVideoFile: (file: File) => void;
  onRetranscribeVoice: () => void;
  onOpenVideoDownload: () => void;
}

export const VideoPreviewStage: React.FC<VideoPreviewStageProps> = ({
  project,
  uploadedVideoUrl,
  uploadedVideoName,
  nativeWidth,
  nativeHeight,
  waveformPeaks,
  isExtractingVoice,
  cues,
  currentTime,
  duration,
  isPlaying,
  styleConfig,
  selectedCueId,
  onTimeUpdate,
  onDurationChange,
  onNativeDimensionsChange,
  onPlayPauseToggle,
  onSelectCue,
  onUploadVideoFile,
  onRetranscribeVoice,
  onOpenVideoDownload,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [snapshotSavedMsg, setSnapshotSavedMsg] = useState<string | null>(null);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const activeCue = findActiveCue(cues, currentTime);

  // Sync HTML5 video element when uploadedVideoUrl is active
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !uploadedVideoUrl) return;
    if (Math.abs(vid.currentTime - currentTime) > 0.25) {
      vid.currentTime = currentTime;
    }
  }, [currentTime, uploadedVideoUrl]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !uploadedVideoUrl) return;
    if (isPlaying) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isPlaying, uploadedVideoUrl]);

  // Procedural timer when playing built-in sample project
  useEffect(() => {
    if (uploadedVideoUrl || !isPlaying) return;

    let lastTick = performance.now();
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      const nextTime = currentTimeRef.current + dt;
      if (nextTime >= durationRef.current) {
        onTimeUpdate(0);
      } else {
        onTimeUpdate(Number(nextTime.toFixed(3)));
      }
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [isPlaying, uploadedVideoUrl, onTimeUpdate]);

  // Render crisp broadcast scene onto canvas when using sample projects
  const drawSampleScene = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      time: number
    ) => {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      if (project.sceneType === 'documentary') {
        grad.addColorStop(0, '#042f2e');
        grad.addColorStop(0.5, '#064e3b');
        grad.addColorStop(1, '#022c22');
      } else if (project.sceneType === 'tech-keynote') {
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#1e1b4b');
        grad.addColorStop(1, '#090d16');
      } else {
        grad.addColorStop(0, '#1f122b');
        grad.addColorStop(0.5, '#31102f');
        grad.addColorStop(1, '#0f172a');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const gridStep = 64;
      const offset = (time * 16) % gridStep;
      for (let x = -offset; x < width; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Dynamic acoustic voice wave visualization in center-top of frame
      const centerY = height * 0.38;
      const barCount = 42;
      const totalBarWidth = width * 0.56;
      const startX = (width - totalBarWidth) / 2;
      const barSpacing = totalBarWidth / barCount;

      for (let i = 0; i < barCount; i++) {
        const wave1 = Math.sin(time * 4.2 + i * 0.35);
        const wave2 = Math.cos(time * 2.7 - i * 0.2);
        const activeBoost = activeCue ? 1.0 : 0.22;
        const amp = Math.max(
          6,
          Math.abs(wave1 * 0.65 + wave2 * 0.35) * 68 * activeBoost
        );

        ctx.fillStyle =
          i % 3 === 0 ? project.accentColor : 'rgba(255, 255, 255, 0.35)';
        const bx = startX + i * barSpacing;
        ctx.beginPath();
        ctx.roundRect(bx, centerY - amp / 2, barSpacing * 0.58, amp, 3);
        ctx.fill();
      }

      const marginX = width * 0.05;
      const marginY = height * 0.06;
      const cornerLen = 18;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(marginX, marginY + cornerLen);
      ctx.lineTo(marginX, marginY);
      ctx.lineTo(marginX + cornerLen, marginY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(width - marginX - cornerLen, marginY);
      ctx.lineTo(width - marginX, marginY);
      ctx.lineTo(width - marginX, marginY + cornerLen);
      ctx.stroke();
    },
    [project, activeCue]
  );

  useEffect(() => {
    if (uploadedVideoUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawSampleScene(ctx, canvas.width, canvas.height, currentTime);
  }, [currentTime, project, uploadedVideoUrl, drawSampleScene]);

  // Export high-res burned-in subtitle frame snapshot (.PNG) at native resolution
  const handleExportFrameSnapshot = async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const offscreen = document.createElement('canvas');
    offscreen.width = nativeWidth || 1920;
    offscreen.height = nativeHeight || 1080;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    if (uploadedVideoUrl && videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0, offscreen.width, offscreen.height);
    } else {
      drawSampleScene(ctx, offscreen.width, offscreen.height, currentTime);
    }

    if (activeCue) {
      const bnText = normalizeSubtitleText(activeCue.textBn);
      const enText = normalizeSubtitleText(activeCue.textEn);
      const lines: { text: string; isBn: boolean }[] = [];

      if (styleConfig.displayMode === 'bn' && bnText) {
        lines.push({ text: bnText, isBn: true });
      } else if (styleConfig.displayMode === 'en' && enText) {
        lines.push({ text: enText, isBn: false });
      } else if (styleConfig.displayMode === 'bilingual') {
        if (styleConfig.primaryOrder === 'bn-top') {
          if (bnText) lines.push({ text: bnText, isBn: true });
          if (enText) lines.push({ text: enText, isBn: false });
        } else {
          if (enText) lines.push({ text: enText, isBn: false });
          if (bnText) lines.push({ text: bnText, isBn: true });
        }
      }

      if (lines.length > 0) {
        const scale = offscreen.height / 540;
        const basePx = Math.round(styleConfig.fontSize * scale);
        const lineHeight = basePx * 1.45;
        const boxPaddingX = Math.round(24 * scale);
        const boxPaddingY = Math.round(12 * scale);
        const totalTextHeight = lines.length * lineHeight;
        const bottomY =
          offscreen.height - (offscreen.height * styleConfig.bottomOffset) / 100;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let maxWidth = Math.round(240 * scale);
        lines.forEach((l) => {
          ctx.font = `${styleConfig.fontWeight} ${
            l.isBn ? basePx : Math.round(basePx * 0.86)
          }px "${
            l.isBn ? styleConfig.banglaFont : styleConfig.englishFont
          }", sans-serif`;
          const m = ctx.measureText(l.text);
          if (m.width > maxWidth) maxWidth = m.width;
        });

        const boxW = Math.min(offscreen.width - 80, maxWidth + boxPaddingX * 2);
        const boxH = totalTextHeight + boxPaddingY * 2;
        const boxX = (offscreen.width - boxW) / 2;
        const boxY = bottomY - boxH;

        if (styleConfig.bgOpacity > 0) {
          ctx.fillStyle = `rgba(9, 13, 22, ${styleConfig.bgOpacity / 100})`;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, Math.round(8 * scale));
          ctx.fill();
        }

        lines.forEach((l, idx) => {
          const fontPx = l.isBn ? basePx : Math.round(basePx * 0.86);
          ctx.font = `${styleConfig.fontWeight} ${fontPx}px "${
            l.isBn ? styleConfig.banglaFont : styleConfig.englishFont
          }", sans-serif`;
          const ly = boxY + boxPaddingY + (idx + 0.5) * lineHeight;
          if (styleConfig.textOutline) {
            ctx.strokeStyle = 'rgba(0,0,0,0.9)';
            ctx.lineWidth = Math.max(2, Math.round(3.5 * scale));
            ctx.strokeText(l.text, offscreen.width / 2, ly);
          }
          ctx.fillStyle = l.isBn ? styleConfig.bnColor : styleConfig.enColor;
          ctx.fillText(l.text, offscreen.width / 2, ly);
        });
      }
    }

    const dataUrl = offscreen.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `vanisub-frame-${offscreen.width}x${
      offscreen.height
    }-${formatTimestampDisplay(currentTime).replace(/[:.]/g, '-')}.png`;
    a.click();
    setSnapshotSavedMsg(`Saved ${offscreen.width}×${offscreen.height} PNG`);
    window.setTimeout(() => setSnapshotSavedMsg(null), 2500);
  };

  const handleStepCue = (direction: -1 | 1) => {
    if (cues.length === 0) return;
    const currentIndex = activeCue
      ? cues.findIndex((c) => c.id === activeCue.id)
      : cues.findIndex((c) => c.startTime >= currentTime);

    let targetIndex = 0;
    if (currentIndex === -1) {
      targetIndex = direction === 1 ? 0 : cues.length - 1;
    } else {
      targetIndex = Math.max(
        0,
        Math.min(cues.length - 1, currentIndex + direction)
      );
    }
    const targetCue = cues[targetIndex];
    if (targetCue) {
      onSelectCue(
        targetCue.id,
        Number((targetCue.startTime + 0.05).toFixed(3))
      );
    }
  };

  const renderOverlayContent = () => {
    if (!activeCue) return null;
    const bn = normalizeSubtitleText(activeCue.textBn);
    const en = normalizeSubtitleText(activeCue.textEn);

    const showBn =
      (styleConfig.displayMode === 'bilingual' ||
        styleConfig.displayMode === 'bn') &&
      Boolean(bn);
    const showEn =
      (styleConfig.displayMode === 'bilingual' ||
        styleConfig.displayMode === 'en') &&
      Boolean(en);

    if (!showBn && !showEn) return null;

    const bnNode = showBn ? (
      <p
        key="bn"
        data-testid="live-subtitle-bn"
        style={{
          fontFamily: `"${styleConfig.banglaFont}", sans-serif`,
          fontSize: `${styleConfig.fontSize}px`,
          fontWeight: styleConfig.fontWeight,
          color: styleConfig.bnColor,
        }}
        className={`bangla-text-render text-center leading-snug tracking-normal break-words ${
          styleConfig.textOutline ? 'subtitle-outline-strong' : ''
        }`}
      >
        {bn}
      </p>
    ) : null;

    const enNode = showEn ? (
      <p
        key="en"
        data-testid="live-subtitle-en"
        style={{
          fontFamily: `"${styleConfig.englishFont}", sans-serif`,
          fontSize: `${Math.max(13, Math.round(styleConfig.fontSize * 0.84))}px`,
          fontWeight: '500',
          color: styleConfig.enColor,
        }}
        className={`text-center leading-snug tracking-tight break-words ${
          styleConfig.textOutline ? 'subtitle-outline-strong' : ''
        }`}
      >
        {en}
      </p>
    ) : null;

    return (
      <div
        data-testid="subtitle-overlay-box"
        style={{
          bottom: `${styleConfig.bottomOffset}%`,
          backgroundColor: `rgba(9, 13, 22, ${styleConfig.bgOpacity / 100})`,
          gap: `${styleConfig.lineGap}px`,
        }}
        className="absolute left-1/2 -translate-x-1/2 max-w-[88%] w-max px-5 py-2.5 rounded-lg border border-white/10 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none transition-all duration-100"
      >
        {styleConfig.primaryOrder === 'bn-top' ? (
          <>
            {bnNode}
            {enNode}
          </>
        ) : (
          <>
            {enNode}
            {bnNode}
          </>
        )}
      </div>
    );
  };

  return (
    <section
      aria-label="Video Preview and Timeline Stage"
      className="flex flex-col bg-[#0B1120] border-b border-slate-800"
    >
      {/* 16:9 Broadcast Video Canvas Container */}
      <div className="relative w-full bg-[#060911] flex items-center justify-center px-4 py-2.5">
        <div
          ref={stageContainerRef}
          className="relative w-full max-w-[760px] aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800/90 shadow-sm"
        >
          {uploadedVideoUrl ? (
            <video
              ref={videoRef}
              src={uploadedVideoUrl}
              muted={isMuted}
              playsInline
              onTimeUpdate={(e) =>
                onTimeUpdate(Number(e.currentTarget.currentTime.toFixed(3)))
              }
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.duration && Number.isFinite(v.duration)) {
                  onDurationChange(Number(v.duration.toFixed(2)));
                }
                if (v.videoWidth && v.videoHeight) {
                  onNativeDimensionsChange(v.videoWidth, v.videoHeight);
                }
              }}
              onClick={onPlayPauseToggle}
              className="w-full h-full object-contain cursor-pointer"
            />
          ) : (
            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              onClick={onPlayPauseToggle}
              data-testid="preview-video-canvas"
              className="w-full h-full object-cover cursor-pointer"
            />
          )}

          {/* Top-left project title overlay */}
          {!uploadedVideoUrl && (
            <div className="absolute top-3 left-3 pointer-events-none">
              <div className="text-[11px] font-semibold tracking-wider text-slate-200/85 uppercase">
                {project.title}
              </div>
              <div
                style={{ fontFamily: `"${styleConfig.banglaFont}", sans-serif` }}
                className="text-xs text-emerald-200/80 bangla-text-render"
              >
                {project.titleBn}
              </div>
            </div>
          )}

          {/* Voice Extraction Overlay when processing uploaded video audio */}
          {isExtractingVoice && (
            <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-30">
              <Mic className="w-7 h-7 text-amber-400 animate-bounce" />
              <p className="text-xs font-semibold text-white">
                Extracting Video Voice &amp; Generating বাংলা / English Subtitles...
              </p>
              <p className="text-[11px] text-slate-300">
                16kHz PCM Voice Activity Detection + Gemini Audio Transcription
              </p>
            </div>
          )}

          {/* Top-right quiet metadata overlay */}
          <div className="absolute top-3 right-3 flex items-center gap-2 text-xs text-slate-300 bg-slate-950/75 px-2.5 py-1 rounded border border-slate-800/80 pointer-events-none font-mono-tabular">
            <span>
              {nativeWidth}×{nativeHeight} Original
            </span>
            <span aria-hidden="true">·</span>
            <span>{styleConfig.banglaFont}</span>
            <span aria-hidden="true">·</span>
            <span>Voice Synced</span>
          </div>

          {/* Live Synchronized Bangla & English Subtitle Overlay */}
          {renderOverlayContent()}
        </div>
      </div>

      {/* Transport Bar & Voice Waveform Timeline Cue Scrubber */}
      <div className="px-4 py-2 bg-[#0F172A] border-t border-slate-800/80 flex flex-col gap-2">
        {/* Interactive Timeline Track with Acoustic Voice Waveform + Cue Blocks */}
        <div className="flex flex-col gap-1">
          <div className="relative h-8 bg-slate-900 rounded border border-slate-800 overflow-hidden select-none">
            {/* Background Acoustic Voice Waveform Bars */}
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-end justify-between px-1 py-0.5 opacity-25 pointer-events-none"
            >
              {waveformPeaks.map((peak, i) => (
                <div
                  key={i}
                  style={{ height: `${Math.round(peak * 100)}%` }}
                  className="w-[1px] bg-emerald-400 rounded-full"
                />
              ))}
            </div>

            {/* Render each subtitle cue segment on timeline */}
            {cues.map((cue, idx) => {
              const safeDuration = Math.max(1, duration);
              const leftPct = Math.max(
                0,
                Math.min(100, (cue.startTime / safeDuration) * 100)
              );
              const widthPct = Math.max(
                0.8,
                Math.min(
                  100 - leftPct,
                  ((cue.endTime - cue.startTime) / safeDuration) * 100
                )
              );
              const isSelected = cue.id === selectedCueId;
              const isCurrent = activeCue?.id === cue.id;

              return (
                <button
                  key={cue.id}
                  type="button"
                  onClick={() =>
                    onSelectCue(
                      cue.id,
                      Number((cue.startTime + 0.05).toFixed(3))
                    )
                  }
                  title={`#${idx + 1}: ${cue.textBn || cue.textEn}`}
                  aria-label={`Jump to cue ${idx + 1} at ${formatTimestampDisplay(
                    cue.startTime
                  )}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                  className={`absolute top-1 bottom-1 rounded-sm transition-colors text-[10px] font-mono-tabular px-1 truncate text-left ${
                    isCurrent
                      ? 'bg-amber-500/90 text-slate-950 font-semibold z-10'
                      : isSelected
                      ? 'bg-amber-500/45 text-amber-100 border border-amber-400/70'
                      : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600/90'
                  }`}
                >
                  #{idx + 1}
                </button>
              );
            })}

            {/* Playhead indicator */}
            <div
              style={{
                left: `${Math.min(
                  100,
                  Math.max(0, (currentTime / Math.max(1, duration)) * 100)
                )}%`,
              }}
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400 pointer-events-none z-20"
            />
          </div>

          {/* Accessible range scrubber */}
          <div className="flex items-center gap-3">
            <label htmlFor="timeline-scrubber" className="sr-only">
              Timeline Playhead Position
            </label>
            <input
              id="timeline-scrubber"
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.05}
              value={Math.min(currentTime, Math.max(1, duration))}
              onChange={(e) => onTimeUpdate(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* Transport Controls Row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleStepCue(-1)}
              aria-label="Previous Subtitle Cue"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onPlayPauseToggle}
              aria-label={isPlaying ? 'Pause Video' : 'Play Video'}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Preview</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleStepCue(1)}
              aria-label="Next Subtitle Cue"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {uploadedVideoUrl && (
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
            )}

            <div
              data-testid="transport-timecode"
              className="ml-1 text-xs font-mono-tabular text-slate-300"
            >
              <span className="text-amber-400 font-medium">
                {formatTimestampDisplay(currentTime)}
              </span>
              <span className="mx-1 text-slate-600">/</span>
              <span>{formatTimestampDisplay(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {snapshotSavedMsg && (
              <span className="text-xs text-emerald-400 font-medium">
                {snapshotSavedMsg}
              </span>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadVideoFile(file);
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Video (Auto Voice-to-Subtitle)</span>
            </button>

            <button
              type="button"
              disabled={isExtractingVoice}
              onClick={onRetranscribeVoice}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Mic className="w-3.5 h-3.5 text-amber-400" />
              <span>Auto-Detect Voice Cues</span>
            </button>

            <button
              type="button"
              onClick={onOpenVideoDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-slate-800 hover:bg-slate-700 border border-amber-500/40 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Download Video ({nativeWidth}×{nativeHeight})</span>
            </button>

            <button
              type="button"
              onClick={handleExportFrameSnapshot}
              aria-label="Save Burned Frame PNG"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded border border-slate-700/80 transition-colors"
              title="Save Native Resolution Frame PNG"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (stageContainerRef.current?.requestFullscreen) {
                  stageContainerRef.current.requestFullscreen().catch(() => {});
                }
              }}
              aria-label="Fullscreen Preview"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
