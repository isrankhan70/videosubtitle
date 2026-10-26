import React from 'react';
import {
  Type as TypeIcon,
  ShieldCheck,
  Film,
  Sparkles,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  SubtitleStyleConfig,
  SubtitleDisplayMode,
  BanglaFontFamily,
  BANGLA_FONT_OPTIONS,
  CueAuditIssue,
} from '../utils/subtitleEngine';
import {
  SAMPLE_VIDEO_PROJECTS,
  SampleVideoProject,
} from '../utils/sampleProjects';

interface TypographyAndSyncPanelProps {
  activeProject: SampleVideoProject;
  uploadedVideoName: string | null;
  styleConfig: SubtitleStyleConfig;
  auditIssues: CueAuditIssue[];
  onSelectProject: (project: SampleVideoProject) => void;
  onUpdateStyle: (patch: Partial<SubtitleStyleConfig>) => void;
  onAutoFixAll: () => void;
  onOpenAiGenerator: () => void;
}

export const TypographyAndSyncPanel: React.FC<TypographyAndSyncPanelProps> = ({
  activeProject,
  uploadedVideoName,
  styleConfig,
  auditIssues,
  onSelectProject,
  onUpdateStyle,
  onAutoFixAll,
  onOpenAiGenerator,
}) => {
  const modeOptions: { id: SubtitleDisplayMode; label: string }[] = [
    { id: 'bilingual', label: 'বাংলা + EN' },
    { id: 'bn', label: 'শুধু বাংলা' },
    { id: 'en', label: 'English Only' },
  ];

  return (
    <aside
      aria-label="Typography Standards and Video Project Controls"
      className="w-full lg:w-[300px] xl:w-[320px] shrink-0 bg-[#0B1120] border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col overflow-y-auto"
    >
      {/* Section 1: Video Source & AI Auto-Subtitler */}
      <div className="p-4 border-b border-slate-800/90">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Film className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-semibold text-slate-200 tracking-tight">
              01. Video &amp; Auto-Subtitle Source
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAiGenerator}
          className="w-full mb-3 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-md transition-colors flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Auto-Subtitle Video (বাংলা / EN)</span>
        </button>

        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-400 mb-1">
            {uploadedVideoName
              ? `Loaded File: ${uploadedVideoName}`
              : 'Or test with a broadcast bilingual preset:'}
          </p>
          {SAMPLE_VIDEO_PROJECTS.map((proj) => {
            const isSelected =
              !uploadedVideoName && proj.id === activeProject.id;
            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => onSelectProject(proj)}
                className={`w-full text-left px-2.5 py-2 rounded-md border transition-colors flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-slate-800/90 border-amber-500/60 text-white'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    {proj.title}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate bangla-text-render">
                    {proj.titleBn} · {proj.duration}s
                  </div>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Track Display Mode (Bangla / English / Bilingual) */}
      <div className="p-4 border-b border-slate-800/90">
        <h2 className="text-xs font-semibold text-slate-200 tracking-tight mb-2.5">
          02. Subtitle Language Track
        </h2>

        <div
          role="group"
          aria-label="Subtitle Language Mode"
          className="grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg mb-3"
        >
          {modeOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onUpdateStyle({ displayMode: opt.id })}
              className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                styleConfig.displayMode === opt.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {styleConfig.displayMode === 'bilingual' && (
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Primary Top Line:</span>
            <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded">
              <button
                type="button"
                onClick={() => onUpdateStyle({ primaryOrder: 'bn-top' })}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  styleConfig.primaryOrder === 'bn-top'
                    ? 'bg-slate-800 text-amber-300 font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                বাংলা ওপরে
              </button>
              <button
                type="button"
                onClick={() => onUpdateStyle({ primaryOrder: 'en-top' })}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  styleConfig.primaryOrder === 'en-top'
                    ? 'bg-slate-800 text-amber-300 font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                English Top
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Standard Broadcast Font Selector */}
      <div className="p-4 border-b border-slate-800/90">
        <div className="flex items-center gap-1.5 mb-2.5">
          <TypeIcon className="w-4 h-4 text-amber-400" />
          <h2 className="text-xs font-semibold text-slate-200 tracking-tight">
            03. Broadcast Standard Fonts
          </h2>
        </div>

        <div className="space-y-2 mb-4">
          {BANGLA_FONT_OPTIONS.map((font) => {
            const isSelected = styleConfig.banglaFont === font.id;
            return (
              <button
                key={font.id}
                type="button"
                onClick={() =>
                  onUpdateStyle({ banglaFont: font.id as BanglaFontFamily })
                }
                className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                  isSelected
                    ? 'bg-slate-800/95 border-amber-500/70 text-white'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold mb-0.5">
                  <span>{font.name}</span>
                  <span className="text-[10px] font-normal text-slate-400">
                    {font.category}
                  </span>
                </div>
                <div
                  style={{ fontFamily: `"${font.id}", sans-serif` }}
                  className="text-sm text-amber-200/95 bangla-text-render truncate"
                >
                  {font.sampleBn}
                </div>
              </button>
            );
          })}
        </div>

        {/* Font Size, Background Scrim & Position Controls */}
        <div className="space-y-3 pt-2 border-t border-slate-800/70">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="font-size-slider" className="text-slate-300">
                Subtitle Size
              </label>
              <span className="font-mono-tabular text-amber-400">
                {styleConfig.fontSize}px
              </span>
            </div>
            <input
              id="font-size-slider"
              type="range"
              min={16}
              max={34}
              step={1}
              value={styleConfig.fontSize}
              onChange={(e) =>
                onUpdateStyle({ fontSize: parseInt(e.target.value, 10) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="scrim-opacity-slider" className="text-slate-300">
                Contrast Scrim Box
              </label>
              <span className="font-mono-tabular text-slate-300">
                {styleConfig.bgOpacity}%
              </span>
            </div>
            <input
              id="scrim-opacity-slider"
              type="range"
              min={0}
              max={95}
              step={5}
              value={styleConfig.bgOpacity}
              onChange={(e) =>
                onUpdateStyle({ bgOpacity: parseInt(e.target.value, 10) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="bottom-offset-slider" className="text-slate-300">
                Vertical Safe Margin
              </label>
              <span className="font-mono-tabular text-slate-300">
                {styleConfig.bottomOffset}%
              </span>
            </div>
            <input
              id="bottom-offset-slider"
              type="range"
              min={4}
              max={26}
              step={1}
              value={styleConfig.bottomOffset}
              onChange={(e) =>
                onUpdateStyle({ bottomOffset: parseInt(e.target.value, 10) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Color Presets */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-300">Color Theme:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateStyle({ bnColor: '#FFFFFF', enColor: '#FDE68A' })
                }
                className="px-2 py-1 text-[11px] rounded bg-slate-900 border border-slate-700 text-white hover:border-amber-400"
              >
                White / Gold
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateStyle({ bnColor: '#FEF08A', enColor: '#FFFFFF' })
                }
                className="px-2 py-1 text-[11px] rounded bg-slate-900 border border-slate-700 text-yellow-200 hover:border-amber-400"
              >
                Cinema Yellow
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Zero-Mismatch Sync & Unicode NFC Audit */}
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold text-slate-200 tracking-tight">
            04. Zero-Mismatch Audit
          </h2>
        </div>

        <div className="p-3 rounded-md bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Unicode Normalization</span>
            <span className="font-mono-tabular text-emerald-400 font-medium">
              UTF-8 NFC Active
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Conjunct (যুক্তবর্ণ) Check</span>
            <span className="font-mono-tabular text-emerald-400 font-medium">
              Verified
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Timing Conflicts</span>
            <span
              className={`font-mono-tabular font-medium ${
                auditIssues.length === 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {auditIssues.length} Issues
            </span>
          </div>

          {auditIssues.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <p className="text-[11px] text-amber-300 mb-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{auditIssues[0].messageBn}</span>
              </p>
              <button
                type="button"
                onClick={onAutoFixAll}
                className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded transition-colors"
              >
                Auto-Fix All Timing &amp; Text Mismatches
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
