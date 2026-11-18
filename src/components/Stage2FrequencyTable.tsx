import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import {
  ClassInterval,
  RowFeedback,
  StudentSummaryCalculations,
  StudentTableInputs,
  SummaryFeedback,
} from '../types/statistics';
import { formatNum } from '../utils/mathStats';

interface Stage2FrequencyTableProps {
  rawValues: number[];
  variableName?: string;
  unit: string;
  intervals: ClassInterval[];
  tableInputs: StudentTableInputs;
  summaryInputs: StudentSummaryCalculations;
  onUpdateCell: (
    intervalId: string,
    field: 'lowerBound' | 'upperBound' | 'classWidth' | 'midValue' | 'frequency' | 'fxProduct',
    value: string
  ) => void;
  onUpdateSummary: (
    field: keyof StudentSummaryCalculations,
    value: string
  ) => void;
  tableFeedback: RowFeedback[];
  summaryFeedback: SummaryFeedback;
  hasChecked: boolean;
  onCheckTable: () => void;
  onClearTable: () => void;
  onNextStage: () => void;
}

export function Stage2FrequencyTable({
  rawValues,
  variableName,
  unit,
  intervals,
  tableInputs,
  summaryInputs,
  onUpdateCell,
  onUpdateSummary,
  tableFeedback,
  summaryFeedback,
  hasChecked,
  onCheckTable,
  onClearTable,
  onNextStage,
}: Stage2FrequencyTableProps) {
  const [dataOrder, setDataOrder] = useState<'sorted' | 'original'>('sorted');

  const sortedRaw = [...rawValues].sort((a, b) => a - b);
  const displayedRaw = dataOrder === 'sorted' ? sortedRaw : rawValues;
  const minVal = sortedRaw.length > 0 ? sortedRaw[0] : 0;
  const maxVal = sortedRaw.length > 0 ? sortedRaw[sortedRaw.length - 1] : 0;

  // Total checks: 5 cells per row (interval + width + mid + freq + fx) + 2 totals cells + 2 summary answers
  const totalChecks = intervals.length * 5 + 4;
  const rowCorrectCount = tableFeedback.reduce((acc, row) => {
    let count = 0;
    if (row.interval.status === 'correct') count++;
    if (row.classWidth.status === 'correct') count++;
    if (row.midValue.status === 'correct') count++;
    if (row.frequency.status === 'correct') count++;
    if (row.fxProduct.status === 'correct' || row.fxProduct.status === 'close') count++;
    return acc + count;
  }, 0);

  let summaryCorrectCount = 0;
  if (summaryFeedback.totalFrequency.status === 'correct') summaryCorrectCount++;
  if (summaryFeedback.totalFx.status === 'correct' || summaryFeedback.totalFx.status === 'close') summaryCorrectCount++;
  if (summaryFeedback.meanAnswer.status === 'correct' || summaryFeedback.meanAnswer.status === 'close') summaryCorrectCount++;
  if (summaryFeedback.modalClassAnswer.status === 'correct') summaryCorrectCount++;

  const correctChecks = rowCorrectCount + summaryCorrectCount;

  const renderStatusIcon = (status: 'empty' | 'correct' | 'close' | 'incorrect') => {
    if (!hasChecked) return null;
    if (status === 'correct') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 mt-1">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Correct</span>
        </span>
      );
    }
    if (status === 'close') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 mt-1">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Accepted (rounding)</span>
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
    if (!hasChecked || !status) return 'border-slate-300 focus:ring-blue-600';
    if (status === 'correct' || status === 'close')
      return 'border-emerald-400 bg-emerald-50/40 focus:ring-emerald-600';
    if (status === 'empty')
      return 'border-amber-400 bg-amber-50/40 focus:ring-amber-600';
    return 'border-red-400 bg-red-50/40 focus:ring-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Raw Data Reference Card Above Frequency Table */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1E3A5F]">
              Raw Data Reference{variableName?.trim() ? ` — ${variableName.trim()}` : ''}
              {unit ? ` (${unit})` : ''}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {rawValues.length > 0 ? (
                <>
                  Total <span className="font-mono-tabular font-medium text-slate-700">n = {rawValues.length}</span> · Min{' '}
                  <span className="font-mono-tabular font-medium text-slate-700">{formatNum(minVal)}</span> · Max{' '}
                  <span className="font-mono-tabular font-medium text-slate-700">{formatNum(maxVal)}</span>
                  {intervals.length > 0 && (
                    <>
                      {' '}· Start Bound{' '}
                      <span className="font-mono-tabular font-medium text-slate-700">{formatNum(intervals[0].lower)}</span> · Equal Width{' '}
                      <span className="font-mono-tabular font-medium text-[#1D4ED8]">{formatNum(intervals[0].trueWidth)}</span>
                    </>
                  )}
                </>
              ) : (
                'No raw values entered yet. Enter your data in Stage 01 first.'
              )}
            </p>
          </div>

          {rawValues.length > 0 && (
            <div
              role="group"
              aria-label="Raw data display order"
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

      {/* Frequency Table Card */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              02. Grouped Data Table, Mid-Values, Totals, Mean &amp; Modal Class
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Fill in each Class Interval (a ≤ x &lt; b), Class Width, Mid-value, Frequency, and Product (f × Mid-value), then calculate Totals, Estimated Mean, and Modal Class.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClearTable}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Inputs</span>
            </button>
            <button
              type="button"
              onClick={onCheckTable}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Check Table &amp; Answers</span>
            </button>
          </div>
        </div>

        {/* Formula Reminder Bar */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-[#F2F6FC] border border-[#D6E4FF] rounded-lg p-3.5">
          <div>
            <span className="font-semibold text-[#1E3A5F]">Class Width (w):</span>{' '}
            <span className="font-mono-tabular text-slate-700">b − a (equal)</span>
          </div>
          <div>
            <span className="font-semibold text-[#1E3A5F]">Mid-value (x):</span>{' '}
            <span className="font-mono-tabular text-slate-700">(a + b) ÷ 2</span>
          </div>
          <div>
            <span className="font-semibold text-[#0F766E]">Product (fx):</span>{' '}
            <span className="font-mono-tabular text-slate-700">Frequency × Mid-value</span>
          </div>
          <div>
            <span className="font-semibold text-[#4338CA]">Estimated Mean:</span>{' '}
            <span className="font-mono-tabular text-slate-700">Σ(f × x) ÷ Σf</span>
          </div>
        </div>

        {/* Interactive Table */}
        <div className="mt-5 overflow-x-auto border border-[#DCE4F0] rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EEF4FC] border-b border-[#DCE4F0] text-xs font-semibold text-[#1E3A5F]">
                <th className="py-3 px-4">Group Data (Class Interval)</th>
                <th className="py-3 px-4">Class Width (w)</th>
                <th className="py-3 px-4">Mid-value (x)</th>
                <th className="py-3 px-4">Frequency (f)</th>
                <th className="py-3 px-4">f × Mid-value (fx)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {intervals.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-xs text-slate-500 bg-white">
                    No raw data entered yet. Please go to <span className="font-semibold text-[#1E3A5F]">01. Raw Data &amp; Equal Width</span> and enter your own data values first.
                  </td>
                </tr>
              )}
              {intervals.map((iv, idx) => {
                const isLast = idx === intervals.length - 1;
                const row = tableInputs[iv.id] ?? {
                  lowerBound: '',
                  upperBound: '',
                  classWidth: '',
                  midValue: '',
                  frequency: '',
                  fxProduct: '',
                };
                const fb = tableFeedback[idx];

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
                          onChange={(e) => onUpdateCell(iv.id, 'lowerBound', e.target.value)}
                          placeholder="a"
                          aria-label={`Lower bound for Class ${idx + 1}`}
                          className={`w-16 px-2 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
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
                          onChange={(e) => onUpdateCell(iv.id, 'upperBound', e.target.value)}
                          placeholder="b"
                          aria-label={`Upper bound for Class ${idx + 1}`}
                          className={`w-16 px-2 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                            fb?.interval.status
                          )}`}
                        />
                        {unit && <span className="text-xs text-slate-400">{unit}</span>}
                      </div>
                      <div>{renderStatusIcon(fb?.interval.status ?? 'empty')}</div>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="any"
                        value={row.classWidth}
                        onChange={(e) => onUpdateCell(iv.id, 'classWidth', e.target.value)}
                        placeholder="w"
                        aria-label={`Class width for Class ${idx + 1}`}
                        className={`w-28 px-3 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                          fb?.classWidth.status
                        )}`}
                      />
                      <div>{renderStatusIcon(fb?.classWidth.status ?? 'empty')}</div>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="any"
                        value={row.midValue}
                        onChange={(e) => onUpdateCell(iv.id, 'midValue', e.target.value)}
                        placeholder="x"
                        aria-label={`Mid-value for Class ${idx + 1}`}
                        className={`w-28 px-3 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                          fb?.midValue.status
                        )}`}
                      />
                      <div>{renderStatusIcon(fb?.midValue.status ?? 'empty')}</div>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="1"
                        value={row.frequency}
                        onChange={(e) => onUpdateCell(iv.id, 'frequency', e.target.value)}
                        placeholder="f"
                        aria-label={`Frequency for Class ${idx + 1}`}
                        className={`w-28 px-3 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                          fb?.frequency.status
                        )}`}
                      />
                      <div>{renderStatusIcon(fb?.frequency.status ?? 'empty')}</div>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="any"
                        value={row.fxProduct}
                        onChange={(e) => onUpdateCell(iv.id, 'fxProduct', e.target.value)}
                        placeholder="f × x"
                        aria-label={`Frequency times mid-value for Class ${idx + 1}`}
                        className={`w-32 px-3 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                          fb?.fxProduct.status
                        )}`}
                      />
                      <div>{renderStatusIcon(fb?.fxProduct.status ?? 'empty')}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Extra Row for Total Frequency and Total (f × Mid-value) */}
            <tfoot className="bg-[#EFF5FD] border-t-2 border-[#CBD9ED] text-sm">
              <tr className="align-top">
                <td className="py-3.5 px-4 font-semibold text-[#1E3A5F]">
                  Total
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-400 font-mono-tabular">
                  —
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-400 font-mono-tabular">
                  —
                </td>
                <td className="py-3 px-4">
                  <label htmlFor="total-freq-input" className="block text-[11px] font-medium text-[#1E3A5F] mb-1">
                    Total Frequency (Σf)
                  </label>
                  <input
                    id="total-freq-input"
                    type="number"
                    step="1"
                    value={summaryInputs.totalFrequency}
                    onChange={(e) => onUpdateSummary('totalFrequency', e.target.value)}
                    placeholder="Σf"
                    className={`w-28 px-3 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                      summaryFeedback.totalFrequency.status
                    )}`}
                  />
                  <div>{renderStatusIcon(summaryFeedback.totalFrequency.status)}</div>
                </td>
                <td className="py-3 px-4">
                  <label htmlFor="total-fx-input" className="block text-[11px] font-medium text-[#1E3A5F] mb-1">
                    Total (f × Mid-value)
                  </label>
                  <input
                    id="total-fx-input"
                    type="number"
                    step="any"
                    value={summaryInputs.totalFx}
                    onChange={(e) => onUpdateSummary('totalFx', e.target.value)}
                    placeholder="Σfx"
                    className={`w-32 px-3 py-1.5 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                      summaryFeedback.totalFx.status
                    )}`}
                  />
                  <div>{renderStatusIcon(summaryFeedback.totalFx.status)}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Free Calculation Boxes for Estimated Mean & Modal Class */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Box 1: Estimated Mean of Grouped Data */}
          <div className="p-4 bg-[#F5F8FF] border border-[#D6E4FF] rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#1E3A5F]">
                  Calculate Estimated Mean of Grouped Data
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Show your working steps and enter the estimated mean ({unit || 'units'}).
                </p>
              </div>
              <span className="text-xs font-mono-tabular font-semibold text-[#1D4ED8]">
                x̄ = Σfx ÷ Σf
              </span>
            </div>

            <div>
              <label htmlFor="mean-working" className="block text-xs font-medium text-slate-700 mb-1">
                Working / Method Space (included in PDF)
              </label>
              <textarea
                id="mean-working"
                rows={3}
                value={summaryInputs.meanWorking}
                onChange={(e) => onUpdateSummary('meanWorking', e.target.value)}
                placeholder="Write your working here, e.g. Mean = 845 ÷ 40 = ..."
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-[#DCE4F0] rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-[180px]">
                <label htmlFor="mean-answer" className="block text-xs font-medium text-slate-700 mb-1">
                  Estimated Mean Answer {unit ? `(${unit})` : ''}
                </label>
                <input
                  id="mean-answer"
                  type="number"
                  step="any"
                  value={summaryInputs.meanAnswer}
                  onChange={(e) => onUpdateSummary('meanAnswer', e.target.value)}
                  placeholder="Enter mean value"
                  className={`w-full px-3 py-2 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                    summaryFeedback.meanAnswer.status
                  )}`}
                />
                <div>{renderStatusIcon(summaryFeedback.meanAnswer.status)}</div>
              </div>
            </div>
          </div>

          {/* Box 2: Modal Class (Class Mode) */}
          <div className="p-4 bg-[#F2FBF8] border border-[#CBEFE6] rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#134E4A]">
                  Determine Modal Class (Class Mode)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Identify the class interval with the highest frequency and explain your reasoning.
                </p>
              </div>
              <span className="text-xs font-mono-tabular font-semibold text-[#0F766E]">
                Max f
              </span>
            </div>

            <div>
              <label htmlFor="modal-working" className="block text-xs font-medium text-slate-700 mb-1">
                Explanation / Working Space (included in PDF)
              </label>
              <textarea
                id="modal-working"
                rows={3}
                value={summaryInputs.modalClassWorking}
                onChange={(e) => onUpdateSummary('modalClassWorking', e.target.value)}
                placeholder="Write why you chose this class, e.g. Highest frequency is 18 in the interval..."
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="modal-answer" className="block text-xs font-medium text-slate-700 mb-1">
                Modal Class Interval (e.g. 10 ≤ x &lt; 20 or 10-20)
              </label>
              <input
                id="modal-answer"
                type="text"
                value={summaryInputs.modalClassAnswer}
                onChange={(e) => onUpdateSummary('modalClassAnswer', e.target.value)}
                placeholder="e.g. 10 <= x < 20"
                className={`w-full px-3 py-2 text-sm font-mono-tabular bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${inputBorder(
                  summaryFeedback.modalClassAnswer.status
                )}`}
              />
              {hasChecked && (
                <div>
                  {summaryFeedback.modalClassAnswer.status === 'correct' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Correct modal class</span>
                    </span>
                  )}
                  {summaryFeedback.modalClassAnswer.status === 'empty' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 mt-1">
                      <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Required</span>
                    </span>
                  )}
                  {summaryFeedback.modalClassAnswer.status === 'incorrect' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Check interval</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step-by-Step Table & Calculation Feedback Panel */}
        {hasChecked && (
          <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Step-by-Step Verification ({correctChecks} / {totalChecks} accurate)
              </h3>
              <span className="text-xs font-mono-tabular text-slate-600">
                {correctChecks === totalChecks
                  ? 'All calculations verified'
                  : 'Review highlighted hints below'}
              </span>
            </div>

            {correctChecks === totalChecks ? (
              <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>
                  Excellent! All class intervals, widths, mid-values, frequencies, products, totals, estimated mean, and modal class are accurate.
                </span>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {tableFeedback.map((row, idx) => {
                  const issues = [
                    row.interval.status !== 'correct' && `Interval: ${row.interval.message}`,
                    row.classWidth.status !== 'correct' && `Width: ${row.classWidth.message}`,
                    row.midValue.status !== 'correct' && `Mid-value: ${row.midValue.message}`,
                    row.frequency.status !== 'correct' && `Frequency: ${row.frequency.message}`,
                    row.fxProduct.status !== 'correct' &&
                      row.fxProduct.status !== 'close' &&
                      `f×x: ${row.fxProduct.message}`,
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

                {summaryFeedback.totalFrequency.status !== 'correct' && (
                  <div className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-700">
                    <span className="font-semibold text-slate-900">Total Frequency (Σf):</span>{' '}
                    {summaryFeedback.totalFrequency.message}
                  </div>
                )}

                {summaryFeedback.totalFx.status !== 'correct' &&
                  summaryFeedback.totalFx.status !== 'close' && (
                    <div className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-700">
                      <span className="font-semibold text-slate-900">Total (f × Mid-value):</span>{' '}
                      {summaryFeedback.totalFx.message}
                    </div>
                  )}

                {summaryFeedback.meanAnswer.status !== 'correct' &&
                  summaryFeedback.meanAnswer.status !== 'close' && (
                    <div className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-700">
                      <span className="font-semibold text-slate-900">Estimated Mean:</span>{' '}
                      {summaryFeedback.meanAnswer.message}
                    </div>
                  )}

                {summaryFeedback.modalClassAnswer.status !== 'correct' && (
                  <div className="text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-700">
                    <span className="font-semibold text-slate-900">Modal Class:</span>{' '}
                    {summaryFeedback.modalClassAnswer.message}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onNextStage}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            <span>Proceed to Manual Histogram Builder</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
