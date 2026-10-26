/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Video, CheckCircle2 } from 'lucide-react';
import {
  SubtitleCue,
  SubtitleStyleConfig,
  DEFAULT_STYLE_CONFIG,
  findActiveCue,
  auditSubtitleCues,
  autoFixSubtitleMismatches,
  splitCueAtTime,
  normalizeSubtitleText,
} from './utils/subtitleEngine';
import {
  SAMPLE_VIDEO_PROJECTS,
  SampleVideoProject,
} from './utils/sampleProjects';
import {
  extractVoiceFromVideoFile,
  DetectedVoiceSegment,
  safeParseResponseJson,
  buildVoiceSegmentAlignedCues,
} from './utils/voiceAudioEngine';
import { VideoPreviewStage } from './components/VideoPreviewStage';
import { SubtitleCueTable } from './components/SubtitleCueTable';
import { TypographyAndSyncPanel } from './components/TypographyAndSyncPanel';
import { ExportAndImportModal } from './components/ExportAndImportModal';
import { AiAutoSubtitleModal } from './components/AiAutoSubtitleModal';
import { VideoDownloadModal } from './components/VideoDownloadModal';

const DEFAULT_WAVEFORM_PEAKS: number[] = Array.from({ length: 96 }, (_, i) =>
  Number((0.2 + Math.abs(Math.sin(i * 0.35)) * 0.72).toFixed(2))
);

export default function App() {
  const [activeProject, setActiveProject] = useState<SampleVideoProject>(
    SAMPLE_VIDEO_PROJECTS[0]
  );
  const [cues, setCues] = useState<SubtitleCue[]>(SAMPLE_VIDEO_PROJECTS[0].cues);
  const [styleConfig, setStyleConfig] = useState<SubtitleStyleConfig>(
    DEFAULT_STYLE_CONFIG
  );

  // Playback & selection state
  const [currentTime, setCurrentTime] = useState<number>(1.2);
  const [duration, setDuration] = useState<number>(
    SAMPLE_VIDEO_PROJECTS[0].duration
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(
    SAMPLE_VIDEO_PROJECTS[0].cues[0]?.id || null
  );

  // Custom uploaded video file & original native dimensions
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedVideoName, setUploadedVideoName] = useState<string | null>(
    null
  );
  const [nativeWidth, setNativeWidth] = useState<number>(1920);
  const [nativeHeight, setNativeHeight] = useState<number>(1080);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>(
    DEFAULT_WAVEFORM_PEAKS
  );
  const [isExtractingVoice, setIsExtractingVoice] = useState<boolean>(false);

  // Modals & AI states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isVideoDownloadModalOpen, setIsVideoDownloadModalOpen] =
    useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isTranslatingAi, setIsTranslatingAi] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 3800);
  }, []);

  const activeCue = useMemo(
    () => findActiveCue(cues, currentTime),
    [cues, currentTime]
  );

  const auditIssues = useMemo(
    () => auditSubtitleCues(cues, styleConfig.displayMode),
    [cues, styleConfig.displayMode]
  );

  // Switch between curated bilingual sample projects
  const handleSelectProject = useCallback((project: SampleVideoProject) => {
    setIsPlaying(false);
    setUploadedVideoFile(null);
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setNativeWidth(1920);
    setNativeHeight(1080);
    setWaveformPeaks(DEFAULT_WAVEFORM_PEAKS);
    setActiveProject(project);
    setCues(project.cues);
    setDuration(project.duration);
    setCurrentTime(
      project.cues[0]?.startTime ? project.cues[0].startTime + 0.2 : 0.5
    );
    setSelectedCueId(project.cues[0]?.id || null);
  }, []);

  // Transcribe extracted voice audio via /api/subtitles/generate with safe JSON & VAD fallback
  const runVoiceTranscription = useCallback(
    async (params: {
      mediaBase64?: string;
      mimeType?: string;
      uploadedFileId?: string;
      dur: number;
      title: string;
      voiceSegments?: DetectedVoiceSegment[];
    }) => {
      setIsExtractingVoice(true);
      setIsGeneratingAi(true);
      try {
        const response = await fetch('/api/subtitles/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaBase64: params.mediaBase64,
            mimeType: params.mimeType,
            uploadedFileId: params.uploadedFileId,
            duration: params.dur,
            videoTitle: params.title,
            voiceSegments: params.voiceSegments || [],
          }),
        });
        const parsed = await safeParseResponseJson(response);
        if (
          parsed.ok &&
          parsed.data &&
          Array.isArray(parsed.data.cues) &&
          parsed.data.cues.length > 0
        ) {
          setCues(parsed.data.cues);
          setSelectedCueId(parsed.data.cues[0].id);
          setCurrentTime(
            Number((parsed.data.cues[0].startTime + 0.05).toFixed(2))
          );
          showToast(
            `Auto-generated ${parsed.data.cues.length} বাংলা & English subtitles directly from video voice — Ready to edit!`
          );
        } else {
          const fallbackCues = buildVoiceSegmentAlignedCues(
            params.voiceSegments || [],
            params.dur
          );
          setCues(fallbackCues);
          if (fallbackCues.length > 0) {
            setSelectedCueId(fallbackCues[0].id);
            setCurrentTime(
              Number((fallbackCues[0].startTime + 0.05).toFixed(2))
            );
          }
          showToast(
            `Aligned ${fallbackCues.length} বাংলা & English subtitle cues to detected voice segments — Ready to edit!`
          );
        }
      } catch {
        const fallbackCues = buildVoiceSegmentAlignedCues(
          params.voiceSegments || [],
          params.dur
        );
        setCues(fallbackCues);
        if (fallbackCues.length > 0) {
          setSelectedCueId(fallbackCues[0].id);
          setCurrentTime(
            Number((fallbackCues[0].startTime + 0.05).toFixed(2))
          );
        }
        showToast(
          `Aligned ${fallbackCues.length} বাংলা & English subtitle cues to detected voice segments — Ready to edit!`
        );
      } finally {
        setIsExtractingVoice(false);
        setIsGeneratingAi(false);
      }
    },
    [showToast]
  );

  // Load user's custom video file AND automatically extract voice -> auto-subtitle!
  const handleUploadVideoFile = useCallback(
    async (
      file: File,
      preExtractedVoice?: {
        duration: number;
        waveformPeaks: number[];
        voiceSegments: DetectedVoiceSegment[];
      }
    ) => {
      const url = URL.createObjectURL(file);
      setUploadedVideoFile(file);
      setUploadedVideoUrl(url);
      setUploadedVideoName(file.name);
      setIsPlaying(false);
      setCurrentTime(0.2);

      if (preExtractedVoice) {
        setDuration(preExtractedVoice.duration);
        setWaveformPeaks(preExtractedVoice.waveformPeaks);
        return;
      }

      // Automatically extract spoken voice from uploaded video and generate subtitles
      setIsExtractingVoice(true);
      showToast(
        `Extracting voice from "${file.name}" to auto-generate বাংলা & English subtitles...`
      );
      try {
        const voiceData = await extractVoiceFromVideoFile(file);
        setDuration(voiceData.duration);
        setWaveformPeaks(voiceData.waveformPeaks);
        await runVoiceTranscription({
          mediaBase64: voiceData.wavBase64,
          mimeType: voiceData.mimeType,
          dur: voiceData.duration,
          title: file.name.replace(/\.[^/.]+$/, ''),
          voiceSegments: voiceData.voiceSegments,
        });
      } catch {
        // Fallback: stream video file to server so FFmpeg extracts 8kHz WAV voice track
        try {
          const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
          const upRes = await fetch('/api/video/upload-source', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-file-ext': ext,
            },
            body: file,
          });
          const upData = await upRes.json();
          if (upRes.ok && upData.fileId) {
            await runVoiceTranscription({
              uploadedFileId: upData.fileId,
              dur: duration,
              title: file.name.replace(/\.[^/.]+$/, ''),
            });
            return;
          }
        } catch {
          // ignore
        }
        setIsExtractingVoice(false);
        showToast(
          `Loaded "${file.name}" — Click "Auto-Detect Voice Cues" to transcribe`
        );
      }
    },
    [runVoiceTranscription, showToast, duration]
  );

  // Re-transcribe voice on demand
  const handleRetranscribeVoice = useCallback(async () => {
    if (uploadedVideoFile) {
      await handleUploadVideoFile(uploadedVideoFile);
    } else {
      await runVoiceTranscription({
        dur: duration,
        title: activeProject.title,
      });
    }
  }, [
    uploadedVideoFile,
    handleUploadVideoFile,
    runVoiceTranscription,
    duration,
    activeProject.title,
  ]);

  // Select a cue and optionally seek video to its start time
  const handleSelectCue = useCallback((cueId: string, seekTime?: number) => {
    setSelectedCueId(cueId);
    if (typeof seekTime === 'number') {
      setCurrentTime(seekTime);
    }
  }, []);

  // Edit a cue's text or timestamps
  const handleUpdateCue = useCallback(
    (cueId: string, patch: Partial<SubtitleCue>) => {
      setCues((prev) =>
        prev.map((c) => (c.id === cueId ? { ...c, ...patch } : c))
      );
    },
    []
  );

  // Add a new subtitle cue right after the specified cue (or at the end) with zero overlap
  const handleAddCueAfter = useCallback((afterCueId?: string) => {
    setCues((prev) => {
      const idx = afterCueId
        ? prev.findIndex((c) => c.id === afterCueId)
        : prev.length - 1;
      const insertIndex = idx === -1 ? prev.length : idx + 1;
      const refCue = prev[insertIndex - 1];

      const newStart = refCue
        ? Number((refCue.endTime + 0.1).toFixed(2))
        : 0.0;
      const newEnd = Number((newStart + 2.4).toFixed(2));

      const newCue: SubtitleCue = {
        id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        startTime: newStart,
        endTime: newEnd,
        textBn: normalizeSubtitleText('নতুন বাংলা সাবটাইটেল লাইন।'),
        textEn: 'New English subtitle line.',
        speaker: 'Speaker',
        confidence: 1.0,
      };

      const rawUpdated = [...prev];
      rawUpdated.splice(insertIndex, 0, newCue);

      for (let i = insertIndex + 1; i < rawUpdated.length; i++) {
        const prevCue = rawUpdated[i - 1];
        const currCue = rawUpdated[i];
        if (currCue.startTime < prevCue.endTime + 0.1) {
          const dur = Math.max(1.2, currCue.endTime - currCue.startTime);
          const shiftedStart = Number((prevCue.endTime + 0.1).toFixed(2));
          rawUpdated[i] = {
            ...currCue,
            startTime: shiftedStart,
            endTime: Number((shiftedStart + dur).toFixed(2)),
          };
        }
      }

      setSelectedCueId(newCue.id);
      setCurrentTime(Number((newCue.startTime + 0.05).toFixed(2)));
      return rawUpdated;
    });
  }, []);

  // Delete a cue
  const handleDeleteCue = useCallback((cueId: string) => {
    setCues((prev) => prev.filter((c) => c.id !== cueId));
  }, []);

  // Split a cue into two sequential cues
  const handleSplitCue = useCallback(
    (cueId: string) => {
      setCues((prev) => splitCueAtTime(prev, cueId));
      showToast('Subtitle cue split into two balanced segments');
    },
    [showToast]
  );

  // Auto-fix all timing overlaps and normalize Unicode NFC
  const handleAutoFixAll = useCallback(() => {
    setCues((prev) => {
      const { cues: fixed, fixedCount } = autoFixSubtitleMismatches(prev);
      showToast(
        fixedCount > 0
          ? `Repaired ${fixedCount} timing/Unicode mismatches`
          : 'All cues verified: Zero timing or Unicode mismatches'
      );
      return fixed;
    });
  }, [showToast]);

  // AI Sync & Translate between Bangla and English
  const handleAiSyncTranslate = useCallback(async () => {
    if (cues.length === 0) return;
    setIsTranslatingAi(true);
    try {
      const response = await fetch('/api/subtitles/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cues, direction: 'bilingual-sync' }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.cues)) {
        throw new Error(data.error || 'Failed to sync translations');
      }
      setCues(data.cues);
      showToast('Bilingual বাংলা ↔ English subtitles synchronized with AI');
    } catch (err: any) {
      showToast(err?.message || 'Could not reach AI translation service');
    } finally {
      setIsTranslatingAi(false);
    }
  }, [cues, showToast]);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-[#0F172A] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3 bg-[#0B1120] border-b border-slate-800 shrink-0">
        {/* Zone 1: Brand Title */}
        <a
          href="#workspace"
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          VaniSub Studio
        </a>

        {/* Zone 2: 4 Concise Single-Line Navigation Links */}
        <nav
          aria-label="Workspace Navigation"
          className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300"
        >
          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Voice Auto-Subtitler
          </button>
          <button
            type="button"
            onClick={handleAutoFixAll}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Zero-Mismatch Sync
          </button>
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Export SRT / VTT
          </button>
          <button
            type="button"
            onClick={() => handleSelectProject(SAMPLE_VIDEO_PROJECTS[0])}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Reset Sample
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action Button (Original Quality Video Download) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsVideoDownloadModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Download Video (Original Quality)</span>
          </button>
        </div>
      </header>

      {/* Non-intrusive Status Notification Bar */}
      {statusBanner && (
        <div
          role="status"
          className="bg-amber-500/15 border-b border-amber-500/30 px-6 py-1.5 text-xs text-amber-200 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{statusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-[11px] text-amber-300 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workstation Layout */}
      <main
        id="workspace"
        className="flex-1 flex flex-col lg:flex-row overflow-hidden"
      >
        <TypographyAndSyncPanel
          activeProject={activeProject}
          uploadedVideoName={uploadedVideoName}
          styleConfig={styleConfig}
          auditIssues={auditIssues}
          onSelectProject={handleSelectProject}
          onUpdateStyle={(patch) =>
            setStyleConfig((prev) => ({ ...prev, ...patch }))
          }
          onAutoFixAll={handleAutoFixAll}
          onOpenAiGenerator={() => setIsAiModalOpen(true)}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <VideoPreviewStage
            project={activeProject}
            uploadedVideoUrl={uploadedVideoUrl}
            uploadedVideoName={uploadedVideoName}
            nativeWidth={nativeWidth}
            nativeHeight={nativeHeight}
            waveformPeaks={waveformPeaks}
            isExtractingVoice={isExtractingVoice}
            cues={cues}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            styleConfig={styleConfig}
            selectedCueId={selectedCueId}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setDuration}
            onNativeDimensionsChange={(w, h) => {
              setNativeWidth(w);
              setNativeHeight(h);
            }}
            onPlayPauseToggle={() => setIsPlaying((p) => !p)}
            onSelectCue={handleSelectCue}
            onUploadVideoFile={(f) => handleUploadVideoFile(f)}
            onRetranscribeVoice={handleRetranscribeVoice}
            onOpenVideoDownload={() => setIsVideoDownloadModalOpen(true)}
          />

          <SubtitleCueTable
            cues={cues}
            activeCueId={activeCue?.id || null}
            selectedCueId={selectedCueId}
            styleConfig={styleConfig}
            auditIssues={auditIssues}
            isGeneratingAi={isGeneratingAi}
            isTranslatingAi={isTranslatingAi}
            onSelectCue={handleSelectCue}
            onUpdateCue={handleUpdateCue}
            onAddCueAfter={handleAddCueAfter}
            onDeleteCue={handleDeleteCue}
            onSplitCue={handleSplitCue}
            onAutoFixAll={handleAutoFixAll}
            onAiSyncTranslate={handleAiSyncTranslate}
            onOpenAiGenerator={() => setIsAiModalOpen(true)}
          />
        </div>
      </main>

      {/* Export / Import SRT & VTT Modal */}
      <ExportAndImportModal
        isOpen={isExportModalOpen}
        cues={cues}
        styleConfig={styleConfig}
        projectTitle={uploadedVideoName || activeProject.title}
        onClose={() => setIsExportModalOpen(false)}
        onImportCues={(imported) => {
          const { cues: fixed } = autoFixSubtitleMismatches(imported);
          setCues(fixed);
          if (fixed.length > 0) {
            setCurrentTime(Number((fixed[0].startTime + 0.05).toFixed(2)));
            setSelectedCueId(fixed[0].id);
            const maxEnd = fixed[fixed.length - 1].endTime;
            if (maxEnd > duration) setDuration(Math.ceil(maxEnd + 2));
          }
          showToast(
            `Imported and normalized ${fixed.length} bilingual subtitle cues`
          );
        }}
      />

      {/* Voice-to-Subtitle AI Modal */}
      <AiAutoSubtitleModal
        isOpen={isAiModalOpen}
        currentDuration={duration}
        currentTitle={uploadedVideoName || activeProject.title}
        onClose={() => setIsAiModalOpen(false)}
        onVideoFileSelected={(file, voiceData) =>
          handleUploadVideoFile(file, voiceData)
        }
        onSubtitlesGenerated={(generatedCues, newTitle) => {
          setIsGeneratingAi(false);
          setCues(generatedCues);
          if (generatedCues.length > 0) {
            setSelectedCueId(generatedCues[0].id);
            setCurrentTime(
              Number((generatedCues[0].startTime + 0.05).toFixed(2))
            );
            const lastEnd = generatedCues[generatedCues.length - 1].endTime;
            if (lastEnd > duration) setDuration(Math.ceil(lastEnd + 1));
          }
          showToast(
            `Voice-aligned ${generatedCues.length} বাংলা & English subtitles placed on video${
              newTitle ? ` for "${newTitle}"` : ''
            }`
          );
        }}
      />

      {/* Original-Quality Subtitled Video Download Modal */}
      <VideoDownloadModal
        isOpen={isVideoDownloadModalOpen}
        cues={cues}
        styleConfig={styleConfig}
        uploadedVideoFile={uploadedVideoFile}
        nativeWidth={nativeWidth}
        nativeHeight={nativeHeight}
        duration={duration}
        projectTitle={uploadedVideoName || activeProject.title}
        onClose={() => setIsVideoDownloadModalOpen(false)}
        onUpdateStyle={(patch) =>
          setStyleConfig((prev) => ({ ...prev, ...patch }))
        }
      />
    </div>
  );
}
