import React, { useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  FileUp,
  FileText,
} from 'lucide-react';
import {
  SubtitleCue,
  SubtitleDisplayMode,
  SubtitleStyleConfig,
  exportToSRT,
  exportToVTT,
  parseSRT,
} from '../utils/subtitleEngine';

interface ExportAndImportModalProps {
  isOpen: boolean;
  cues: SubtitleCue[];
  styleConfig: SubtitleStyleConfig;
  projectTitle: string;
  onClose: () => void;
  onImportCues: (imported: SubtitleCue[]) => void;
}

export const ExportAndImportModal: React.FC<ExportAndImportModalProps> = ({
  isOpen,
  cues,
  styleConfig,
  projectTitle,
  onClose,
  onImportCues,
}) => {
  const [format, setFormat] = useState<'srt' | 'vtt' | 'json'>('srt');
  const [exportTrack, setExportTrack] = useState<SubtitleDisplayMode>(
    styleConfig.displayMode
  );
  const [includeUtf8Bom, setIncludeUtf8Bom] = useState(true);
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importError, setImportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const getFormattedOutput = () => {
    if (format === 'srt') {
      return exportToSRT(cues, exportTrack, styleConfig.primaryOrder);
    }
    if (format === 'vtt') {
      return exportToVTT(cues, exportTrack, styleConfig.primaryOrder);
    }
    return JSON.stringify(cues, null, 2);
  };

  const outputText = getFormattedOutput();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadFile = () => {
    const prefix = includeUtf8Bom ? '\uFEFF' : '';
    const mime =
      format === 'json'
        ? 'application/json;charset=utf-8'
        : 'text/plain;charset=utf-8';
    const blob = new Blob([prefix + outputText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = projectTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    a.href = url;
    a.download = `${slug || 'subtitles'}-${exportTrack}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleParseImport = () => {
    setImportError(null);
    if (!importText.trim()) {
      setImportError('Please paste valid .SRT or .VTT subtitle text first.');
      return;
    }
    const parsed = parseSRT(importText);
    if (parsed.length === 0) {
      setImportError(
        'Could not parse any valid timestamped cues (00:00:01,000 --> 00:00:04,000).'
      );
      return;
    }
    onImportCues(parsed);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-2xl bg-[#0F172A] border border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" />
            <h2
              id="export-modal-title"
              className="text-sm font-semibold text-white"
            >
              Export &amp; Import Subtitles (.SRT / .VTT / UTF-8 BOM)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Export Modal"
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 pt-3 border-b border-slate-800/80 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'export'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Export Subtitle File ({cues.length} Cues)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'import'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Import .SRT / .VTT File
          </button>
        </div>

        {activeTab === 'export' ? (
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Subtitle File Format
                </label>
                <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md">
                  {(['srt', 'vtt', 'json'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormat(fmt)}
                      className={`flex-1 py-1 text-xs font-medium uppercase rounded transition-colors ${
                        format === fmt
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      .{fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Included Language Track
                </label>
                <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md">
                  {(
                    [
                      { id: 'bilingual', label: 'বাংলা + EN' },
                      { id: 'bn', label: 'বাংলা Only' },
                      { id: 'en', label: 'English' },
                    ] as const
                  ).map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => setExportTrack(tr.id)}
                      className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                        exportTrack === tr.id
                          ? 'bg-slate-800 text-amber-300 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tr.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-md">
              <div>
                <div className="text-xs font-medium text-slate-200">
                  Include UTF-8 Byte Order Mark (BOM)
                </div>
                <div className="text-[11px] text-slate-400">
                  Prevents Bangla conjunct (যুক্তবর্ণ) corruption in Premiere Pro,
                  DaVinci Resolve &amp; CapCut
                </div>
              </div>
              <input
                type="checkbox"
                checked={includeUtf8Bom}
                onChange={(e) => setIncludeUtf8Bom(e.target.checked)}
                aria-label="Include UTF-8 BOM"
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-300">
                  Live File Output Preview
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied to Clipboard</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Subtitle Text</span>
                    </>
                  )}
                </button>
              </div>
              <pre
                data-testid="export-preview-content"
                style={{ fontFamily: `"${styleConfig.banglaFont}", monospace` }}
                className="w-full h-56 p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 overflow-y-auto whitespace-pre-wrap bangla-text-render"
              >
                {outputText}
              </pre>
            </div>

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
                onClick={handleDownloadFile}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .{format.toUpperCase()} File</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            <div>
              <label
                htmlFor="srt-paste-area"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Paste .SRT or .VTT Content (Bangla &amp; English lines are
                auto-detected via Unicode script range)
              </label>
              <textarea
                id="srt-paste-area"
                rows={8}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`1\n00:00:00,500 --> 00:00:04,000\nআমাদের নতুন ভিডিওতে স্বাগতম।\nWelcome to our new video.`}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono-tabular focus:outline-none focus:border-amber-500"
              />
              {importError && (
                <p className="text-xs text-rose-400 mt-1.5">{importError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleParseImport}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Import &amp; Normalize Cues</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
