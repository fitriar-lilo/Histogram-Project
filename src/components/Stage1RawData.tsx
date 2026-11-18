import { AlertTriangle, ArrowRight, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import { ClassInterval } from '../types/statistics';
import { checkCoverage, formatNum, parseNumberList } from '../utils/mathStats';

interface Stage1RawDataProps {
  topicTitle: string;
  onTopicTitleChange: (title: string) => void;
  rawInputText: string;
  onRawInputTextChange: (text: string) => void;
  rawValues: number[];
  variableName: string;
  unit: string;
  onVariableChange: (name: string, unit: string) => void;
  startBound: number;
  classWidth: number;
  onEqualClassConfigChange: (startBound: number, classWidth: number) => void;
  boundaries: number[];
  intervals: ClassInterval[];
  onClearData: () => void;
  onNextStage: () => void;
}

export function Stage1RawData({
  topicTitle,
  onTopicTitleChange,
  rawInputText,
  onRawInputTextChange,
  rawValues,
  variableName,
  unit,
  onVariableChange,
  startBound,
  classWidth,
  onEqualClassConfigChange,
  boundaries,
  intervals,
  onClearData,
  onNextStage,
}: Stage1RawDataProps) {
  const { invalidTokens } = parseNumberList(rawInputText);
  const sortedValues = [...rawValues].sort((a, b) => a - b);
  const minVal = sortedValues.length > 0 ? sortedValues[0] : 0;
  const maxVal = sortedValues.length > 0 ? sortedValues[sortedValues.length - 1] : 0;
  const coverage = checkCoverage(rawValues, boundaries);

  const ALLOWED_WIDTHS = [5, 6, 7, 8, 9, 10, 11, 12] as const;

  const handleSuggestEqualWidth = () => {
    if (rawValues.length === 0) return;
    const range = Math.max(5, maxVal - minVal);
    const rough = range / 6;
    const chosen = ALLOWED_WIDTHS.find((s) => s >= rough) ?? 12;
    const niceStart = Math.floor(minVal / chosen) * chosen;
    onEqualClassConfigChange(niceStart, chosen);
  };

  return (
    <div className="space-y-6">
      {/* Data Title Card */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              01. Data Title
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Write a title for your own dataset, then enter your raw single data values and equal class width below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClearData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-[#F1F5FB] hover:bg-[#E2EAF6] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear Data</span>
          </button>
        </div>

        <div className="p-4 bg-[#F5F8FF] border border-[#D6E4FF] rounded-lg">
          <label
            htmlFor="data-title-input"
            className="block text-xs font-semibold text-[#1E3A5F] mb-1.5"
          >
            Data Title
          </label>
          <input
            id="data-title-input"
            type="text"
            value={topicTitle}
            onChange={(e) => onTopicTitleChange(e.target.value)}
            placeholder="Write the title of your data (e.g., Daily Travel Time of Year 10 Students)"
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#CBD9ED] rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
      </div>

      {/* Main Two-Column Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Raw Single Data Input */}
        <div className="lg:col-span-6 bg-white border border-[#3B629C]/35 rounded-xl p-5 space-y-4 shadow-xl shadow-[#0E203D]/25">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-slate-900">Raw Single Data Input</h3>
            <span className="text-xs font-mono-tabular text-slate-500">
              Count n = {rawValues.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="var-name" className="block text-xs font-medium text-slate-700 mb-1">
                Variable Name
              </label>
              <input
                id="var-name"
                type="text"
                value={variableName}
                onChange={(e) => onVariableChange(e.target.value, unit)}
                placeholder="e.g., Time taken"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="var-unit" className="block text-xs font-medium text-slate-700 mb-1">
                Unit of Measurement
              </label>
              <input
                id="var-unit"
                type="text"
                value={unit}
                onChange={(e) => onVariableChange(variableName, e.target.value)}
                placeholder="e.g., minutes, cm"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="raw-data-textarea" className="block text-xs font-medium text-slate-700 mb-1">
              Enter Single Observations (separate with commas, spaces, or new lines)
            </label>
            <textarea
              id="raw-data-textarea"
              rows={5}
              value={rawInputText}
              onChange={(e) => onRawInputTextChange(e.target.value)}
              placeholder="Example: 4, 7, 11, 13, 15, 18, 22, 27, 34, 42"
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
                {rawValues.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Minimum</div>
              <div className="text-base font-semibold font-mono-tabular text-slate-900">
                {rawValues.length > 0 ? formatNum(minVal) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Maximum</div>
              <div className="text-base font-semibold font-mono-tabular text-slate-900">
                {rawValues.length > 0 ? formatNum(maxVal) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Range</div>
              <div className="text-base font-semibold font-mono-tabular text-slate-900">
                {rawValues.length > 0 ? formatNum(maxVal - minVal) : '—'}
              </div>
            </div>
          </div>

          {/* Sorted Data Preview */}
          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs font-medium text-slate-700 mb-2">
              Sorted Raw Values (for counting &amp; verification)
            </div>
            {sortedValues.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No numeric values entered yet.</p>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-32 overflow-y-auto text-xs font-mono-tabular text-slate-700 leading-relaxed">
                {sortedValues.map((v) => formatNum(v)).join(', ')}
              </div>
            )}
          </div>
        </div>

        {/* Right: Student Determines Equal Class Width */}
        <div className="lg:col-span-6 bg-white border border-[#3B629C]/35 rounded-xl p-5 space-y-4 shadow-xl shadow-[#0E203D]/25">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#1E3A5F]">
                Determine Equal Class Width
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Choose your starting lower bound and a uniform class width for every group.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSuggestEqualWidth}
              disabled={rawValues.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4338CA] bg-[#EEF2FF] hover:bg-[#E0E7FF] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Suggest Equal Width</span>
            </button>
          </div>

          {/* Class Width & Start Bound Controls */}
          <div className="space-y-3 p-3.5 bg-[#F4F7FC] border border-[#DCE4F0] rounded-lg">
            <div>
              <label htmlFor="start-bound" className="block text-xs font-medium text-slate-700 mb-1">
                Starting Lower Bound {unit ? `(${unit})` : ''}
              </label>
              <input
                id="start-bound"
                type="number"
                step="any"
                value={startBound}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) {
                    onEqualClassConfigChange(val, classWidth);
                  }
                }}
                className="w-full sm:w-48 px-3 py-2 text-sm font-mono-tabular bg-white border border-[#CBD5E1] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                Choose Equal Class Width (w) {unit ? `(${unit})` : ''}
              </span>
              <div
                role="group"
                aria-label="Allowed equal class widths"
                className="grid grid-cols-4 gap-2"
              >
                {ALLOWED_WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onEqualClassConfigChange(startBound, w)}
                    className={`py-2 px-3 text-sm font-mono-tabular font-medium rounded-lg border transition-colors cursor-pointer ${
                      classWidth === w
                        ? 'bg-[#1E3A5F] text-white border-[#1E3A5F] shadow-xs'
                        : 'bg-white text-slate-700 border-[#DCE4F0] hover:bg-[#EEF4FF] hover:border-[#93C5FD]'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Class Structure Summary (without auto-filling intervals) */}
          <div className="p-4 bg-[#F5F8FF] border border-[#D6E4FF] rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1E3A5F]">
                Grouped Table Blueprint
              </span>
              <span className="text-xs font-mono-tabular font-medium text-[#1D4ED8]">
                {intervals.length} class {intervals.length === 1 ? 'row' : 'rows'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2 bg-white border border-[#DCE4F0] rounded-md">
                <div className="text-[11px] text-slate-500">Start Bound</div>
                <div className="text-sm font-mono-tabular font-semibold text-slate-900">
                  {formatNum(startBound)} {unit}
                </div>
              </div>
              <div className="p-2 bg-white border border-[#DCE4F0] rounded-md">
                <div className="text-[11px] text-slate-500">Equal Width (w)</div>
                <div className="text-sm font-mono-tabular font-semibold text-[#1D4ED8]">
                  {formatNum(classWidth)} {unit}
                </div>
              </div>
              <div className="p-2 bg-white border border-[#DCE4F0] rounded-md">
                <div className="text-[11px] text-slate-500">Data Span</div>
                <div className="text-sm font-mono-tabular font-semibold text-slate-900">
                  {boundaries.length >= 2
                    ? `${formatNum(boundaries[0])} – ${formatNum(boundaries[boundaries.length - 1])}`
                    : '—'}
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              {rawValues.length === 0
                ? 'Enter your raw single data values on the left to compute the number of class rows and total span.'
                : `In Stage 2, you will construct and fill in each equal-width class interval (a ≤ x < b) yourself starting from ${formatNum(startBound)} with width ${formatNum(classWidth)}.`}
            </p>
          </div>

          {/* Data Coverage Validation Banner */}
          {rawValues.length > 0 && boundaries.length >= 2 && (
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
                    <span className="font-semibold">All {rawValues.length} values covered.</span>{' '}
                    Equal-width classes span from {formatNum(boundaries[0])} to{' '}
                    {formatNum(boundaries[boundaries.length - 1])} {unit}.
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span className="font-semibold">
                      {coverage.uncoveredValues.length} value(s) below your starting lower bound ({formatNum(startBound)}):
                    </span>{' '}
                    {coverage.uncoveredValues.map((v) => formatNum(v)).join(', ')}. Lower your starting bound to {formatNum(Math.floor(minVal))} or less.
                  </div>
                </>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onNextStage}
              disabled={rawValues.length === 0 || intervals.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              <span>Proceed to Frequency Table</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
