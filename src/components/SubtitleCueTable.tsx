import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Scissors,
  Search,
  CheckCircle2,
  AlertTriangle,
  Wand2,
  Languages,
  Play,
} from 'lucide-react';
import {
  SubtitleCue,
  SubtitleStyleConfig,
  CueAuditIssue,
  formatTimestampDisplay,
  normalizeSubtitleText,
} from '../utils/subtitleEngine';

interface SubtitleCueTableProps {
  cues: SubtitleCue[];
  activeCueId: string | null;
  selectedCueId: string | null;
  styleConfig: SubtitleStyleConfig;
  auditIssues: CueAuditIssue[];
  isGeneratingAi: boolean;
  isTranslatingAi: boolean;
  onSelectCue: (cueId: string, seekTime?: number) => void;
  onUpdateCue: (cueId: string, patch: Partial<SubtitleCue>) => void;
  onAddCueAfter: (afterCueId?: string) => void;
  onDeleteCue: (cueId: string) => void;
  onSplitCue: (cueId: string) => void;
  onAutoFixAll: () => void;
  onAiSyncTranslate: () => void;
  onOpenAiGenerator: () => void;
}

export const SubtitleCueTable: React.FC<SubtitleCueTableProps> = ({
  cues,
  activeCueId,
  selectedCueId,
  styleConfig,
  auditIssues,
  isGeneratingAi,
  isTranslatingAi,
  onSelectCue,
  onUpdateCue,
  onAddCueAfter,
  onDeleteCue,
  onSplitCue,
  onAutoFixAll,
  onAiSyncTranslate,
  onOpenAiGenerator,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'issues'>('all');

  const issueMap = new Map<string, CueAuditIssue[]>();
  for (const issue of auditIssues) {
    const list = issueMap.get(issue.cueId) || [];
    list.push(issue);
    issueMap.set(issue.cueId, list);
  }

  const filteredCues = cues.filter((cue, idx) => {
    if (filterMode === 'issues' && !issueMap.has(cue.id)) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      cue.textBn.toLowerCase().includes(q) ||
      cue.textEn.toLowerCase().includes(q) ||
      String(idx + 1).includes(q) ||
      formatTimestampDisplay(cue.startTime).includes(q)
    );
  });

  return (
    <section
      aria-label="Subtitle Cue Editor"
      className="flex-1 flex flex-col bg-[#0F172A] min-h-[320px]"
    >
      {/* Editor Toolbar Header */}
      <div className="px-4 py-2.5 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-100 whitespace-nowrap">
            Subtitle Timeline Cues ({cues.length})
          </h2>

          {/* Segmented filter control */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                filterMode === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Cues ({cues.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('issues')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                filterMode === 'issues'
                  ? 'bg-slate-800 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sync Check ({auditIssues.length})
            </button>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="cue-search-input" className="sr-only">
              Search Bangla or English subtitles
            </label>
            <input
              id="cue-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search বাংলা or English..."
              className="pl-8 pr-3 py-1 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 w-48 sm:w-56"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {auditIssues.length > 0 ? (
            <button
              type="button"
              onClick={onAutoFixAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Fix {auditIssues.length} Mismatches</span>
            </button>
          ) : (
            <div
              data-testid="zero-mismatch-status"
              className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-2 py-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Zero Mismatch · NFC Locked</span>
            </div>
          )}

          <button
            type="button"
            disabled={isTranslatingAi || cues.length === 0}
            onClick={onAiSyncTranslate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Languages className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isTranslatingAi ? 'Syncing Bilingual...' : 'AI Sync বাংলা ↔ EN'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onAddCueAfter(selectedCueId || undefined)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Subtitle Cue</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton State when AI is transcribing */}
      {isGeneratingAi && (
        <div className="p-4 space-y-2.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-16 bg-slate-900/90 border border-slate-800 rounded-md animate-pulse flex items-center px-4 gap-4"
            >
              <div className="w-8 h-4 bg-slate-800 rounded" />
              <div className="w-24 h-8 bg-slate-800 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isGeneratingAi && filteredCues.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-medium text-slate-300 mb-1">
            {cues.length === 0
              ? 'No subtitle cues in this timeline yet'
              : 'No subtitle cues match your current filter'}
          </p>
          <p className="text-xs text-slate-400 max-w-md mb-4">
            {cues.length === 0
              ? 'Generate automatic Bangla and English subtitles from your video using AI, or insert your first manual cue below.'
              : 'Try clearing the search query or switching back to All Cues.'}
          </p>
          <div className="flex items-center gap-2.5">
            {cues.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={onOpenAiGenerator}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Auto-Generate Subtitles</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAddCueAfter()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Cue</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterMode('all');
                }}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* High-Density Subtitle Cue Rows */}
      {!isGeneratingAi && filteredCues.length > 0 && (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
          {filteredCues.map((cue) => {
            const realIndex = cues.findIndex((c) => c.id === cue.id) + 1;
            const isCurrent = cue.id === activeCueId;
            const isSelected = cue.id === selectedCueId;
            const rowIssues = issueMap.get(cue.id) || [];
            const duration = Math.max(0.1, cue.endTime - cue.startTime);
            const maxChars = Math.max(cue.textBn.length, cue.textEn.length);
            const cps = Math.round(maxChars / duration);

            return (
              <div
                key={cue.id}
                data-testid={`cue-row-${realIndex}`}
                onClick={() => onSelectCue(cue.id)}
                className={`px-4 py-2.5 transition-colors flex flex-col lg:flex-row lg:items-center gap-3 ${
                  isCurrent
                    ? 'bg-amber-500/[0.08]'
                    : isSelected
                    ? 'bg-slate-800/60'
                    : 'hover:bg-slate-900/60'
                }`}
              >
                {/* Cue Index + Seek Play Button + Timing Inputs */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCue(
                        cue.id,
                        Number((cue.startTime + 0.05).toFixed(3))
                      );
                    }}
                    aria-label={`Play from Cue ${realIndex}`}
                    className={`w-8 h-8 rounded flex items-center justify-center font-mono-tabular text-xs font-semibold transition-colors ${
                      isCurrent
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {isCurrent ? (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      `#${realIndex}`
                    )}
                  </button>

                  {/* Start / End Time in seconds with tabular-nums */}
                  <div className="grid grid-cols-2 gap-1.5 w-44">
                    <div>
                      <label
                        htmlFor={`start-${cue.id}`}
                        className="block text-[10px] text-slate-400 font-mono-tabular"
                      >
                        Start (s) · {formatTimestampDisplay(cue.startTime)}
                      </label>
                      <input
                        id={`start-${cue.id}`}
                        type="number"
                        step="0.1"
                        min="0"
                        value={cue.startTime}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val) && val >= 0) {
                            onUpdateCue(cue.id, {
                              startTime: Number(val.toFixed(2)),
                            });
                          }
                        }}
                        className="w-full px-2 py-1 text-xs font-mono-tabular bg-slate-900 border border-slate-700/90 rounded text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`end-${cue.id}`}
                        className="block text-[10px] text-slate-400 font-mono-tabular"
                      >
                        End (s) · {formatTimestampDisplay(cue.endTime)}
                      </label>
                      <input
                        id={`end-${cue.id}`}
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={cue.endTime}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val) && val >= 0) {
                            onUpdateCue(cue.id, {
                              endTime: Number(val.toFixed(2)),
                            });
                          }
                        }}
                        className="w-full px-2 py-1 text-xs font-mono-tabular bg-slate-900 border border-slate-700/90 rounded text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Bilingual Text Inputs (Bangla Unicode NFC + English) */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {/* Bangla Input */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label
                        htmlFor={`bn-input-${realIndex}`}
                        className="text-[11px] font-medium text-slate-300"
                      >
                        বাংলা সাবটাইটেল (Bangla Track)
                      </label>
                      <span className="text-[10px] font-mono-tabular text-slate-400">
                        {cue.textBn.length} chars · {styleConfig.banglaFont}
                      </span>
                    </div>
                    <input
                      id={`bn-input-${realIndex}`}
                      type="text"
                      value={cue.textBn}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateCue(cue.id, { textBn: e.target.value })
                      }
                      onBlur={(e) => {
                        if (styleConfig.unicodeNfcLock) {
                          onUpdateCue(cue.id, {
                            textBn: normalizeSubtitleText(e.target.value),
                          });
                        }
                      }}
                      style={{
                        fontFamily: `"${styleConfig.banglaFont}", sans-serif`,
                      }}
                      placeholder="বাংলা সাবটাইটেল লিখুন..."
                      className="w-full px-2.5 py-1.5 text-sm bg-slate-900/95 border border-slate-700/90 rounded text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 bangla-text-render"
                    />
                  </div>

                  {/* English Input */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label
                        htmlFor={`en-input-${realIndex}`}
                        className="text-[11px] font-medium text-slate-300"
                      >
                        English Subtitle Track
                      </label>
                      <span className="text-[10px] font-mono-tabular text-slate-400">
                        {duration.toFixed(1)}s · {cps} CPS
                      </span>
                    </div>
                    <input
                      id={`en-input-${realIndex}`}
                      type="text"
                      value={cue.textEn}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateCue(cue.id, { textEn: e.target.value })
                      }
                      onBlur={(e) => {
                        if (styleConfig.unicodeNfcLock) {
                          onUpdateCue(cue.id, {
                            textEn: normalizeSubtitleText(e.target.value),
                          });
                        }
                      }}
                      placeholder="Enter English subtitle..."
                      className="w-full px-2.5 py-1.5 text-sm bg-slate-900/95 border border-slate-700/90 rounded text-amber-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Per-Row Actions & Audit Status */}
                <div className="flex items-center justify-between lg:justify-end gap-1.5 shrink-0">
                  {rowIssues.length > 0 && (
                    <span
                      title={rowIssues.map((i) => i.message).join(' | ')}
                      className="text-[11px] text-amber-400 font-medium mr-1 flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden xl:inline">
                        {rowIssues[0].type === 'overlap'
                          ? 'Overlap'
                          : 'Check Timing'}
                      </span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSplitCue(cue.id);
                    }}
                    title="Split Cue in Half"
                    aria-label={`Split Cue ${realIndex}`}
                    className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddCueAfter(cue.id);
                    }}
                    title="Insert New Cue Below"
                    aria-label={`Insert cue after Cue ${realIndex}`}
                    className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCue(cue.id);
                    }}
                    title="Delete Cue"
                    aria-label={`Delete Cue ${realIndex}`}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
