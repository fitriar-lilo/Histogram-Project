import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  HelpCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import {
  ClassWidthType,
  CumulativeInterval,
  CumulativeRowFeedback,
  StudentCumulativeTableInputs,
} from '../types/statistics';
import { checkCoverage, formatNum, parseNumberList, roundTo } from '../utils/mathStats';

interface Stage4CumulativeDataTableProps {
  cumTitle: string;
  cumRawInputText: string;
  cumVariableName: string;
  cumUnit: string;
  cumWidthType: ClassWidthType;
  cumStartBound: number;
  cumEqualWidth: number;
  cumUnequalWidths: number[];
  cumRawValues: number[];
  cumBoundaries: number[];
  cumIntervals: CumulativeInterval[];
  cumTableInputs: StudentCumulativeTableInputs;
  cumTableFeedback: CumulativeRowFeedback[];
  hasCheckedCumTable: boolean;
  hasStage1Data: boolean;
  onCopyFromStage1: () => void;
  onUpdateCumConfig: (patch: {
    cumTitle?: string;
    cumRawInputText?: string;
    cumVariableName?: string;
    cumUnit?: string;
    cumWidthType?: ClassWidthType;
    cumStartBound?: number;
    cumEqualWidth?: number;
    cumUnequalWidths?: number[];
  }) => void;
  onUpdateCumTableCell: (
    intervalId: string,
    field: 'lowerBound' | 'upperBound' | 'frequency' | 'cumulativeFrequency',
    value: string
  ) => void;
  onResetCumTable: () => void;
  onCheckCumTable: () => void;
  onClearAllCumData: () => void;
  onNextStage: () => void;
}

const EQUAL_QUICK_WIDTHS = [2, 5, 10, 15, 20, 25];

export function Stage4CumulativeDataTable({
  cumTitle,
  cumRawInputText,
  cumVariableName,
  cumUnit,
  cumWidthType,
  cumStartBound,
  cumEqualWidth,
  cumUnequalWidths,
  cumRawValues,
  cumBoundaries,
  cumIntervals,
  cumTableInputs,
  cumTableFeedback,
  hasCheckedCumTable,
  hasStage1Data,
  onCopyFromStage1,
  onUpdateCumConfig,
  onUpdateCumTableCell,
  onResetCumTable,
  onCheckCumTable,
  onClearAllCumData,
  onNextStage,
}: Stage4CumulativeDataTableProps) {
  const [dataOrder, setDataOrder] = useState<'sorted' | 'original'>('sorted');
  const [equalWidthDraft, setEqualWidthDraft] = useState<string>(String(cumEqualWidth));

  const { invalidTokens } = parseNumberList(cumRawInputText);
  const sortedRaw = [...cumRawValues].sort((a, b) => a - b);
  const displayedRaw = dataOrder === 'sorted' ? sortedRaw : cumRawValues;
  const minVal = sortedRaw.length > 0 ? sortedRaw[0] : 0;
  const maxVal = sortedRaw.length > 0 ? sortedRaw[sortedRaw.length - 1] : 0;
  const coverage = checkCoverage(cumRawValues, cumBoundaries);

  const safeUnequalWidths =
    cumUnequalWidths.length > 0 ? cumUnequalWidths : [10, 10, 10];

  const handleSuggestEqualWidth = () => {
    if (cumRawValues.length === 0) return;
    const range = Math.max(2, maxVal - minVal);
    const rough = range / 6;
    const niceChoices = [1, 2, 3, 4, 5, 8, 10, 12, 15, 20, 25, 50, 100];
    const chosen = niceChoices.find((w) => w >= rough) ?? Math.ceil(rough);
    const niceStart = Math.floor(minVal / chosen) * chosen;
    setEqualWidthDraft(String(chosen));
    onUpdateCumConfig({
      cumWidthType: 'equal',
      cumStartBound: niceStart,
      cumEqualWidth: chosen,
    });
  };

  const handleEqualWidthInput = (raw: string) => {
    setEqualWidthDraft(raw);
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      onUpdateCumConfig({ cumEqualWidth: roundTo(num, 4) });
    }
  };

  const handleSelectWidthType = (nextType: ClassWidthType) => {
    if (nextType === cumWidthType) return;
    if (nextType === 'unequal' && safeUnequalWidths.length === 0) {
      onUpdateCumConfig({
        cumWidthType: 'unequal',
        cumUnequalWidths: [cumEqualWidth, cumEqualWidth, cumEqualWidth],
      });
    } else {
      onUpdateCumConfig({ cumWidthType: nextType });
    }
  };

  const handleUpdateUnequalWidth = (index: number, raw: string) => {
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) return;
    const next = [...safeUnequalWidths];
    next[index] = roundTo(val, 4);
    onUpdateCumConfig({ cumUnequalWidths: next });
  };

  const handleAddUnequalClass = () => {
    const lastWidth = safeUnequalWidths[safeUnequalWidths.length - 1] ?? 10;
    onUpdateCumConfig({
      cumUnequalWidths: [...safeUnequalWidths, lastWidth],
    });
  };

  const handleRemoveUnequalClass = (index: number) => {
    if (safeUnequalWidths.length <= 1) return;
    onUpdateCumConfig({
      cumUnequalWidths: safeUnequalWidths.filter((_, i) => i !== index),
    });
  };

  // Build preview bounds per unequal class row
  const unequalPreviews: { lower: number; upper: number }[] = [];
  let runningB = Number.isFinite(cumStartBound) ? cumStartBound : 0;
  for (const w of safeUnequalWidths) {
    const safeW = Number.isFinite(w) && w > 0 ? w : 1;
    const nextB = roundTo(runningB + safeW, 4);
    unequalPreviews.push({ lower: roundTo(runningB, 4), upper: nextB });
    runningB = nextB;
  }

  // Table check tally (3 cells per row: interval + frequency + cumulativeFrequency)
  const totalChecks = cumIntervals.length * 3;
  const correctChecks = cumTableFeedback.reduce((acc, row) => {
    let c = 0;
    if (row.interval.status === 'correct') c++;
    if (row.frequency.status === 'correct') c++;
    if (row.cumulativeFrequency.status === 'correct') c++;
    return acc + c;
  }, 0);

  const renderStatusIcon = (status: 'empty' | 'correct' | 'close' | 'incorrect') => {
    if (!hasCheckedCumTable) return null;
    if (status === 'correct' || status === 'close') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 mt-1">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Correct</span>
        </span>
      );
    }
    if (status === 'empty') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 mt-1">
          <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Required</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 mt-1">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Check value</span>
      </span>
    );
  };

  const inputBorder = (status?: 'empty' | 'correct' | 'close' | 'incorrect') => {
    if (!hasCheckedCumTable || !status) return 'border-slate-300 focus:ring-blue-600';
    if (status === 'correct' || status === 'close')
      return 'border-emerald-400 bg-emerald-50/40 focus:ring-emerald-600';
    if (status === 'empty')
      return 'border-amber-400 bg-amber-50/40 focus:ring-amber-600';
    return 'border-red-400 bg-red-50/40 focus:ring-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Title & Action Header Card */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              04. Cumulative Frequency — Raw Data &amp; Class Width Setup
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Enter your raw observations, choose Equal or Unequal class widths with any class length, and construct the Grouped Cumulative Frequency Table.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            {hasStage1Data && (
              <button
                type="button"
                onClick={onCopyFromStage1}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1D4ED8] bg-[#EEF4FF] hover:bg-[#DCE9FF] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy Raw Data from Stage 01</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClearAllCumData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-[#F1F5FB] hover:bg-[#E2EAF6] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Cumulative Data</span>
            </button>
          </div>
        </div>

        <div className="p-4 bg-[#F5F8FF] border border-[#D6E4FF] rounded-lg">
          <label
            htmlFor="cum-data-title"
            className="block text-xs font-semibold text-[#1E3A5F] mb-1.5"
          >
            Cumulative Investigation Data Title
          </label>
          <input
            id="cum-data-title"
            type="text"
            value={cumTitle}
            onChange={(e) => onUpdateCumConfig({ cumTitle: e.target.value })}
            placeholder="Write the title of your cumulative frequency dataset (e.g., Examination Scores of 60 Candidates)"
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#CBD9ED] rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
      </div>

      {/* Main Two-Column Setup Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Raw Single Data Input */}
        <div className="lg:col-span-6 bg-white border border-[#3B629C]/35 rounded-xl p-5 space-y-4 shadow-xl shadow-[#0E203D]/25">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Raw Single Data Input (Cumulative Frequency)
            </h3>
            <span className="text-xs font-mono-tabular text-slate-500">
              Count n = {cumRawValues.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cum-var-name" className="block text-xs font-medium text-slate-700 mb-1">
                Variable Name
              </label>
              <input
                id="cum-var-name"
                type="text"
                value={cumVariableName}
                onChange={(e) => onUpdateCumConfig({ cumVariableName: e.target.value })}
                placeholder="e.g., Test Score, Height"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="cum-var-unit" className="block text-xs font-medium text-slate-700 mb-1">
                Unit of Measurement
              </label>
              <input
                id="cum-var-unit"
                type="text"
                value={cumUnit}
                onChange={(e) => onUpdateCumConfig({ cumUnit: e.target.value })}
                placeholder="e.g., marks, cm, s"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cum-raw-textarea" className="block text-xs font-medium text-slate-700 mb-1">
              Enter Single Observations (separate with commas, spaces, or new lines)
            </label>
            <textarea
              id="cum-raw-textarea"
              rows={5}
              value={cumRawInputText}
              onChange={(e) => onUpdateCumConfig({ cumRawInputText: e.target.value })}
              placeholder="Example: 12, 18, 21, 24, 29, 31, 35, 38, 42, 47, 53, 58, 64, 71"
              className="w-full px-3.5 py-2.5 text-sm font-mono-tabular bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {invalidTokens.length > 0 && (
              <p className="mt-1.5 text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Ignored non-numeric entries: {invalidTokens.join(', ')}</span>
              </p>
            )}
          </div>

          {/* Summary Metrics Strip */}
          <div className="grid grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">Total (n)</div>
              <div className="text-base font-semibold font-mono-tabular text-slate-900">
                {cumRawValues.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Minimum</div>
              <div className="text-base font-semibold font-mono-tabular text-slate-900">
                {cumRawValues.length > 0 ? formatNum(minVal) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Maximum</div>
              <div className="text-base font-semibold font-mono-tabular text-slate-900">
                {cumRawValues.length > 0 ? formatNum(maxVal) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Range</div>
              <div className="text-base font-semibold font-mono-tabular text-slate-900">
                {cumRawValues.length > 0 ? formatNum(maxVal - minVal) : '—'}
              </div>
            </div>
          </div>

          {/* Sorted Data Preview */}
          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs font-medium text-slate-700 mb-2">
              Sorted Raw Values Preview
            </div>
            {sortedRaw.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No numeric values entered yet.</p>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-32 overflow-y-auto text-xs font-mono-tabular text-slate-700 leading-relaxed">
                {sortedRaw.map((v) => formatNum(v)).join(', ')}
              </div>
            )}
          </div>
        </div>

        {/* Right: Student Freely Chooses Equal or Unequal Class Width & Any Length */}
        <div className="lg:col-span-6 bg-white border border-[#3B629C]/35 rounded-xl p-5 space-y-4 shadow-xl shadow-[#0E203D]/25">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#1E3A5F]">
                Choose Class Width Type &amp; Length
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Freely choose Equal or Unequal class widths and set any positive class length(s).
              </p>
            </div>
            {cumWidthType === 'equal' && (
              <button
                type="button"
                onClick={handleSuggestEqualWidth}
                disabled={cumRawValues.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4338CA] bg-[#EEF2FF] hover:bg-[#E0E7FF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Suggest Width</span>
              </button>
            )}
          </div>

          {/* Class Width Type Selector */}
          <div
            role="group"
            aria-label="Class width type"
            className="grid grid-cols-2 gap-2 p-1 bg-[#EEF3FA] border border-[#DCE4F0] rounded-lg"
          >
            <button
              type="button"
              onClick={() => handleSelectWidthType('equal')}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                cumWidthType === 'equal'
                  ? 'bg-[#1E3A5F] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#1E3A5F]'
              }`}
            >
              Equal Class Width
            </button>
            <button
              type="button"
              onClick={() => handleSelectWidthType('unequal')}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                cumWidthType === 'unequal'
                  ? 'bg-[#0F766E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F766E]'
              }`}
            >
              Unequal Class Width
            </button>
          </div>

          {/* Starting Bound + Equal or Unequal Width Length Controls */}
          <div className="space-y-3 p-3.5 bg-[#F4F7FC] border border-[#DCE4F0] rounded-lg">
            <div>
              <label htmlFor="cum-start-bound" className="block text-xs font-medium text-slate-700 mb-1">
                Starting Lower Bound {cumUnit ? `(${cumUnit})` : ''}
              </label>
              <input
                id="cum-start-bound"
                type="number"
                step="any"
                value={cumStartBound}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) {
                    onUpdateCumConfig({ cumStartBound: val });
                  }
                }}
                className="w-full sm:w-48 px-3 py-2 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {cumWidthType === 'equal' ? (
              <div className="space-y-2.5">
                <div>
                  <label
                    htmlFor="cum-equal-width-input"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Class Width Length (any positive number) {cumUnit ? `(${cumUnit})` : ''}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="cum-equal-width-input"
                      type="number"
                      min="0.1"
                      step="any"
                      value={equalWidthDraft}
                      onChange={(e) => handleEqualWidthInput(e.target.value)}
                      onBlur={() => setEqualWidthDraft(String(cumEqualWidth))}
                      className="w-36 px-3 py-2 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {EQUAL_QUICK_WIDTHS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => {
                            setEqualWidthDraft(String(w));
                            onUpdateCumConfig({ cumEqualWidth: w });
                          }}
                          className={`px-2.5 py-1.5 text-xs font-mono-tabular font-medium rounded-md border transition-colors cursor-pointer ${
                            cumEqualWidth === w
                              ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                              : 'bg-white text-slate-700 border-[#DCE4F0] hover:bg-[#EEF4FF]'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">
                    Define Each Class Width Length ({safeUnequalWidths.length} classes)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddUnequalClass}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0F766E] bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5] rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Add Class</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {safeUnequalWidths.map((w, idx) => {
                    const preview = unequalPreviews[idx];
                    const isLast = idx === safeUnequalWidths.length - 1;
                    return (
                      <div
                        key={`unequal-row-${idx}`}
                        className="flex flex-wrap items-center gap-2 p-2 bg-white border border-[#DCE4F0] rounded-lg"
                      >
                        <span className="text-xs font-mono-tabular text-slate-500 w-14 shrink-0">
                          Class {idx + 1}
                        </span>
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                          <span>Width:</span>
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={w}
                            onChange={(e) => handleUpdateUnequalWidth(idx, e.target.value)}
                            aria-label={`Class ${idx + 1} width length`}
                            className="w-20 px-2 py-1 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                          />
                        </label>
                        <span className="text-xs font-mono-tabular text-slate-500 flex-1 min-w-[110px]">
                          Span: {formatNum(preview.lower)} ≤ x {isLast ? '≤' : '<'} {formatNum(preview.upper)}
                        </span>
                        {safeUnequalWidths.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveUnequalClass(idx)}
                            aria-label={`Remove Class ${idx + 1}`}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Class Structure Summary */}
          <div className="p-4 bg-[#F5F8FF] border border-[#D6E4FF] rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1E3A5F]">
                Cumulative Table Blueprint
              </span>
              <span className="text-xs font-mono-tabular font-medium text-[#1D4ED8]">
                {cumIntervals.length} class {cumIntervals.length === 1 ? 'row' : 'rows'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2 bg-white border border-[#DCE4F0] rounded-md">
                <div className="text-[11px] text-slate-500">Width Type</div>
                <div className="text-sm font-semibold text-[#1E3A5F] capitalize">
                  {cumWidthType}
                </div>
              </div>
              <div className="p-2 bg-white border border-[#DCE4F0] rounded-md">
                <div className="text-[11px] text-slate-500">Start Bound</div>
                <div className="text-sm font-mono-tabular font-semibold text-slate-900">
                  {formatNum(cumStartBound)} {cumUnit}
                </div>
              </div>
              <div className="p-2 bg-white border border-[#DCE4F0] rounded-md">
                <div className="text-[11px] text-slate-500">Data Span</div>
                <div className="text-sm font-mono-tabular font-semibold text-slate-900">
                  {cumBoundaries.length >= 2
                    ? `${formatNum(cumBoundaries[0])} – ${formatNum(cumBoundaries[cumBoundaries.length - 1])}`
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Data Coverage Validation Banner */}
          {cumRawValues.length > 0 && cumBoundaries.length >= 2 && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                coverage.uncoveredValues.length === 0
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {coverage.uncoveredValues.length === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span className="font-semibold">All {cumRawValues.length} values covered.</span>{' '}
                    Intervals span from {formatNum(cumBoundaries[0])} to{' '}
                    {formatNum(cumBoundaries[cumBoundaries.length - 1])} {cumUnit}.
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span className="font-semibold">
                      {coverage.uncoveredValues.length} value(s) outside [{formatNum(cumBoundaries[0])}, {formatNum(cumBoundaries[cumBoundaries.length - 1])}]:
                    </span>{' '}
                    {coverage.uncoveredValues.map((v) => formatNum(v)).join(', ')}. Adjust your starting bound or class width(s) to include all observations.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Raw Data Reference Card Above Table */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1E3A5F]">
              Raw Data Reference{cumVariableName?.trim() ? ` — ${cumVariableName.trim()}` : ''}
              {cumUnit ? ` (${cumUnit})` : ''}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {cumRawValues.length > 0 ? (
                <>
                  Total <span className="font-mono-tabular font-medium text-slate-700">n = {cumRawValues.length}</span> · Min{' '}
                  <span className="font-mono-tabular font-medium text-slate-700">{formatNum(minVal)}</span> · Max{' '}
                  <span className="font-mono-tabular font-medium text-slate-700">{formatNum(maxVal)}</span> · Mode{' '}
                  <span className="font-medium text-[#1D4ED8] capitalize">{cumWidthType} class width</span>
                </>
              ) : (
                'Enter your raw observations above to view them here while counting frequencies.'
              )}
            </p>
          </div>

          {cumRawValues.length > 0 && (
            <div
              role="group"
              aria-label="Cumulative raw data display order"
              className="inline-flex items-center gap-1 p-1 bg-[#EEF3FA] border border-[#DCE4F0] rounded-lg self-start sm:self-auto"
            >
              <button
                type="button"
                onClick={() => setDataOrder('sorted')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  dataOrder === 'sorted'
                    ? 'bg-white text-[#1E3A5F] shadow-xs'
                    : 'text-slate-600 hover:text-[#1E3A5F]'
                }`}
              >
                Sorted Order
              </button>
              <button
                type="button"
                onClick={() => setDataOrder('original')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  dataOrder === 'original'
                    ? 'bg-white text-[#1E3A5F] shadow-xs'
                    : 'text-slate-600 hover:text-[#1E3A5F]'
                }`}
              >
                Original Order
              </button>
            </div>
          )}
        </div>

        <div className="p-3.5 bg-[#F5F8FF] border border-[#D6E4FF] rounded-lg max-h-36 overflow-y-auto">
          {displayedRaw.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {displayedRaw.map((val, idx) => (
                <span
                  key={`${idx}-${val}`}
                  className="inline-flex items-center px-2 py-0.5 bg-white border border-[#DCE4F0] rounded text-xs font-mono-tabular text-slate-800"
                >
                  {formatNum(val)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No numeric values entered yet.</p>
          )}
        </div>
      </div>

      {/* Grouped Cumulative Frequency Table (3 Columns) */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              Grouped Data Table — Interval Group, Frequency &amp; Cumulative Frequency
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Convert your raw data into grouped intervals manually, count each Frequency (f), and calculate the running Cumulative Frequency (cf).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onResetCumTable}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Table Inputs</span>
            </button>
            <button
              type="button"
              onClick={onCheckCumTable}
              disabled={cumIntervals.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Check Cumulative Table</span>
            </button>
          </div>
        </div>

        {/* Formula Reminder Strip */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-[#F2F6FC] border border-[#D6E4FF] rounded-lg p-3.5">
          <div>
            <span className="font-semibold text-[#1E3A5F]">Interval Group:</span>{' '}
            <span className="font-mono-tabular text-slate-700">a ≤ x &lt; b (last ≤ b)</span>
          </div>
          <div>
            <span className="font-semibold text-[#0F766E]">Frequency (f):</span>{' '}
            <span className="font-mono-tabular text-slate-700">Count in each interval</span>
          </div>
          <div>
            <span className="font-semibold text-[#4338CA]">Cumulative Frequency (cf):</span>{' '}
            <span className="font-mono-tabular text-slate-700">Previous cf + Current f</span>
          </div>
        </div>

        {/* 3-Column Interactive Table */}
        <div className="mt-5 overflow-x-auto border border-[#DCE4F0] rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EEF4FC] border-b border-[#DCE4F0] text-xs font-semibold text-[#1E3A5F]">
                <th className="py-3 px-4">Interval Group</th>
                <th className="py-3 px-4">Frequency (f)</th>
                <th className="py-3 px-4 bg-[#E3EEFD] text-[#1D4ED8]">Cumulative Frequency (cf)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {cumIntervals.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 px-4 text-center text-xs text-slate-500 bg-white">
                    Enter your raw data values and configure your class width(s) above to build the grouped cumulative frequency table.
                  </td>
                </tr>
              )}
              {cumIntervals.map((iv, idx) => {
                const isLast = idx === cumIntervals.length - 1;
                const row = cumTableInputs[iv.id] ?? {
                  lowerBound: '',
                  upperBound: '',
                  frequency: '',
                  cumulativeFrequency: '',
                };
                const fb = cumTableFeedback[idx];

                return (
                  <tr key={iv.id} className="bg-white align-top">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-[11px] font-mono-tabular text-slate-400 mr-0.5">
                          {idx + 1}.
                        </span>
                        <input
                          type="number"
                          step="any"
                          value={row.lowerBound}
                          onChange={(e) => onUpdateCumTableCell(iv.id, 'lowerBound', e.target.value)}
                          placeholder="a"
                          aria-label={`Lower bound for Cumulative Class ${idx + 1}`}
                          className={`w-20 px-2.5 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                            fb?.interval.status
                          )}`}
                        />
                        <span className="text-xs font-mono-tabular text-slate-600 font-medium">
                          ≤ x {isLast ? '≤' : '<'}
                        </span>
                        <input
                          type="number"
                          step="any"
                          value={row.upperBound}
                          onChange={(e) => onUpdateCumTableCell(iv.id, 'upperBound', e.target.value)}
                          placeholder="b"
                          aria-label={`Upper bound for Cumulative Class ${idx + 1}`}
                          className={`w-20 px-2.5 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                            fb?.interval.status
                          )}`}
                        />
                        {cumUnit && <span className="text-xs text-slate-400">{cumUnit}</span>}
                        <span className="text-[11px] font-mono-tabular text-slate-400 ml-1">
                          (w = {formatNum(iv.trueWidth)})
                        </span>
                      </div>
                      <div>{renderStatusIcon(fb?.interval.status ?? 'empty')}</div>
                    </td>

                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={row.frequency}
                        onChange={(e) => onUpdateCumTableCell(iv.id, 'frequency', e.target.value)}
                        placeholder="f"
                        aria-label={`Frequency for Cumulative Class ${idx + 1}`}
                        className={`w-28 px-3 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                          fb?.frequency.status
                        )}`}
                      />
                      <div>{renderStatusIcon(fb?.frequency.status ?? 'empty')}</div>
                    </td>

                    <td className="py-3 px-4 bg-[#F9FBFF]">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={row.cumulativeFrequency}
                        onChange={(e) =>
                          onUpdateCumTableCell(iv.id, 'cumulativeFrequency', e.target.value)
                        }
                        placeholder="cf"
                        aria-label={`Cumulative frequency for Class ${idx + 1}`}
                        className={`w-32 px-3 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                          fb?.cumulativeFrequency.status
                        )}`}
                      />
                      <div>{renderStatusIcon(fb?.cumulativeFrequency.status ?? 'empty')}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Step-by-Step Verification Panel */}
        {hasCheckedCumTable && cumIntervals.length > 0 && (
          <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Step-by-Step Verification ({correctChecks} / {totalChecks} accurate)
              </h3>
              <span className="text-xs font-mono-tabular text-slate-600">
                {correctChecks === totalChecks
                  ? 'All cumulative entries verified'
                  : 'Review highlighted hints below'}
              </span>
            </div>

            {correctChecks === totalChecks ? (
              <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>
                  Excellent! All interval groups, frequencies, and cumulative frequencies are accurate. Proceed to Stage 05 to plot each upper-boundary point and connect the curve.
                </span>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {cumTableFeedback.map((row, idx) => {
                  const issues = [
                    row.interval.status !== 'correct' && `Interval: ${row.interval.message}`,
                    row.frequency.status !== 'correct' && `Frequency: ${row.frequency.message}`,
                    row.cumulativeFrequency.status !== 'correct' &&
                      `Cumulative Frequency: ${row.cumulativeFrequency.message}`,
                  ].filter(Boolean) as string[];
                  if (issues.length === 0) return null;
                  return (
                    <div
                      key={row.intervalId}
                      className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-700"
                    >
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        Class {idx + 1}:
                      </span>{' '}
                      {issues.join(' · ')}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onNextStage}
            disabled={cumIntervals.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            <span>Proceed to Cumulative Frequency Curve</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
