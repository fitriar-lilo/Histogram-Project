import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  FileDown,
  HelpCircle,
  MessageSquareText,
  RotateCcw,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import {
  ClassInterval,
  HistogramBarFeedback,
  StudentHistogramBar,
  StudentHistogramReflection,
  StudentSummaryCalculations,
  StudentTableInputs,
} from '../types/statistics';
import { formatNum, niceAxisMax, roundTo } from '../utils/mathStats';

interface Stage3HistogramBuilderProps {
  topicTitle?: string;
  variableName: string;
  unit: string;
  intervals: ClassInterval[];
  tableInputs: StudentTableInputs;
  summaryInputs: StudentSummaryCalculations;
  bars: StudentHistogramBar[];
  onUpdateBar: (intervalId: string, frequency: number) => void;
  onResetBars: () => void;
  feedback: HistogramBarFeedback[];
  hasChecked: boolean;
  onCheckHistogram: () => void;
  reflection: StudentHistogramReflection;
  onUpdateReflection: (field: keyof StudentHistogramReflection, value: string) => void;
  onClearReflections: () => void;
  onDownloadPdf: () => void;
  isExporting: boolean;
}

export function Stage3HistogramBuilder({
  topicTitle,
  variableName,
  unit,
  intervals,
  tableInputs,
  summaryInputs,
  bars,
  onUpdateBar,
  onResetBars,
  feedback,
  hasChecked,
  onCheckHistogram,
  reflection,
  onUpdateReflection,
  onClearReflections,
  onDownloadPdf,
  isExporting,
}: Stage3HistogramBuilderProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingIntervalId, setDraggingIntervalId] = useState<string | null>(null);
  const [selectedIntervalId, setSelectedIntervalId] = useState<string | null>(
    intervals[0]?.id ?? null
  );
  const [snapStep, setSnapStep] = useState<number>(1);
  const [showTargetOverlay, setShowTargetOverlay] = useState(false);

  const width = 760;
  const height = 460;
  const pad = { top: 28, right: 28, bottom: 56, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const minX = intervals.length > 0 ? intervals[0].lower : 0;
  const maxX = intervals.length > 0 ? intervals[intervals.length - 1].upper : 50;
  const maxTrueFreq = Math.max(5, ...intervals.map((i) => i.trueFrequency));
  const maxPlottedFreq = Math.max(0, ...bars.map((b) => b.plottedFrequency));
  const yMax = niceAxisMax(Math.max(maxTrueFreq, maxPlottedFreq) * 1.15, 5);

  const sx = (x: number) =>
    pad.left + ((x - minX) / Math.max(1e-6, maxX - minX)) * plotW;
  const sy = (y: number) =>
    pad.top + plotH - (y / Math.max(1e-6, yMax)) * plotH;

  const clientYToFreq = (clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const scaleY = height / rect.height;
    const svgY = (clientY - rect.top) * scaleY;
    const rawFreq = ((pad.top + plotH - svgY) / plotH) * yMax;
    const clamped = Math.max(0, Math.min(yMax, rawFreq));
    const snapped = Math.round(clamped / snapStep) * snapStep;
    return roundTo(snapped, 1);
  };

  const handleBarPointerDown = (
    e: React.PointerEvent<SVGRectElement | SVGGElement>,
    intervalId: string
  ) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDraggingIntervalId(intervalId);
    setSelectedIntervalId(intervalId);
    const freq = clientYToFreq(e.clientY);
    onUpdateBar(intervalId, freq);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingIntervalId) return;
    const freq = clientYToFreq(e.clientY);
    onUpdateBar(draggingIntervalId, freq);
  };

  const handlePointerUp = () => {
    setDraggingIntervalId(null);
  };

  const yTicks = 5;
  const minorPerMajor = 4;
  const totalMinorY = yTicks * minorPerMajor;

  const boundarySet = new Set<number>();
  intervals.forEach((iv) => {
    boundarySet.add(iv.lower);
    boundarySet.add(iv.upper);
  });
  const sortedBoundaries = Array.from(boundarySet).sort((a, b) => a - b);

  const accurateCount = feedback.filter((f) => f.status === 'accurate').length;
  const selectedInterval =
    intervals.find((iv) => iv.id === selectedIntervalId) ?? intervals[0] ?? null;
  const selectedBar = bars.find((b) => b.intervalId === selectedInterval?.id);

  return (
    <div className="space-y-6">
      {/* Frequency Table Reference Card Above Histogram */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#1E3A5F]">
              Frequency Table Reference
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Your Stage 02 entries are shown below so you can read each class interval and Frequency (f) while plotting bars.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-mono-tabular">
            <span>
              Total f: <strong className="text-[#1E3A5F]">{summaryInputs.totalFrequency || '—'}</strong>
            </span>
            <span>
              Total fx: <strong className="text-[#1E3A5F]">{summaryInputs.totalFx || '—'}</strong>
            </span>
            <span>
              Mean: <strong className="text-[#1D4ED8]">{summaryInputs.meanAnswer || '—'}</strong>
            </span>
            <span>
              Modal Class: <strong className="text-[#0F766E]">{summaryInputs.modalClassAnswer || '—'}</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-[#DCE4F0] rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#EEF4FC] border-b border-[#DCE4F0] font-semibold text-[#1E3A5F]">
                <th className="py-2 px-3">Class</th>
                <th className="py-2 px-3">Group Data (Class Interval)</th>
                <th className="py-2 px-3">Class Width (w)</th>
                <th className="py-2 px-3">Mid-value (x)</th>
                <th className="py-2 px-3 bg-[#E3EEFD] text-[#1D4ED8]">Frequency (f)</th>
                <th className="py-2 px-3">f × Mid-value (fx)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono-tabular">
              {intervals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 px-3 text-center font-sans text-slate-500">
                    No classes available yet. Enter your raw data in Stage 01 and complete the Frequency Table in Stage 02.
                  </td>
                </tr>
              ) : (
                intervals.map((iv, idx) => {
                  const isLast = idx === intervals.length - 1;
                  const row = tableInputs[iv.id];
                  const hasInterval = Boolean(row?.lowerBound?.trim() || row?.upperBound?.trim());
                  const intervalText = hasInterval
                    ? `${row?.lowerBound?.trim() || '?'} ≤ x ${isLast ? '≤' : '<'} ${row?.upperBound?.trim() || '?'}${unit ? ` ${unit}` : ''}`
                    : 'Not entered yet';
                  return (
                    <tr key={iv.id} className="bg-white">
                      <td className="py-2 px-3 text-slate-500">Class {idx + 1}</td>
                      <td className={`py-2 px-3 ${hasInterval ? 'text-slate-900 font-medium' : 'text-slate-400 italic font-sans'}`}>
                        {intervalText}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{row?.classWidth?.trim() || '—'}</td>
                      <td className="py-2 px-3 text-slate-700">{row?.midValue?.trim() || '—'}</td>
                      <td className="py-2 px-3 bg-[#F5F8FF] font-semibold text-[#1D4ED8]">
                        {row?.frequency?.trim() || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{row?.fxProduct?.trim() || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {intervals.length > 0 && (
              <tfoot className="bg-[#EFF5FD] border-t border-[#CBD9ED] font-mono-tabular font-semibold text-[#1E3A5F]">
                <tr>
                  <td colSpan={4} className="py-2 px-3 font-sans">Total</td>
                  <td className="py-2 px-3 text-[#1D4ED8]">{summaryInputs.totalFrequency?.trim() || '—'}</td>
                  <td className="py-2 px-3">{summaryInputs.totalFx?.trim() || '—'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Histogram Builder Card */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              03. Manual Histogram Construction (Equal Class Widths)
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Click or drag each bar vertically on the graph paper to plot the Frequency for each equal-width class interval.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-xs text-slate-700">
              <label htmlFor="snap-step" className="font-medium">
                Grid Snap:
              </label>
              <select
                id="snap-step"
                value={snapStep}
                onChange={(e) => setSnapStep(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono-tabular text-xs text-slate-900"
              >
                <option value={0.5}>0.5</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowTargetOverlay((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showTargetOverlay ? (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{showTargetOverlay ? 'Hide Target Guide' : 'Show Target Guide'}</span>
            </button>

            <button
              type="button"
              onClick={onResetBars}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Bars</span>
            </button>

            <button
              type="button"
              onClick={onCheckHistogram}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Check Histogram</span>
            </button>
          </div>
        </div>

        {/* Empty Data Notice */}
        {intervals.length === 0 && (
          <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            <span>
              No raw data entered yet. Go to <span className="font-semibold">01. Raw Data &amp; Equal Width</span> to enter your dataset and choose your equal class width first.
            </span>
          </div>
        )}

        {/* Two-Zone Sandbox */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Zone: Interactive Graph Paper SVG */}
          <div className="lg:col-span-8 bg-slate-50/70 border border-slate-200 rounded-xl p-4">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full h-auto bg-white border border-slate-200 rounded-lg select-none touch-none"
              role="img"
              aria-label="Interactive Equal-Width Histogram Construction Grid"
            >
              {/* Minor Horizontal Gridlines */}
              {Array.from({ length: totalMinorY + 1 }).map((_, idx) => {
                const val = (yMax / totalMinorY) * idx;
                const y = sy(val);
                const isMajor = idx % minorPerMajor === 0;
                return (
                  <g key={`hy-${idx}`}>
                    <line
                      x1={pad.left}
                      y1={y}
                      x2={width - pad.right}
                      y2={y}
                      stroke={isMajor ? '#CBD5E1' : '#F1F5F9'}
                      strokeWidth={isMajor ? 1 : 0.75}
                    />
                    {isMajor && (
                      <text
                        x={pad.left - 10}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-slate-600 font-mono"
                        fontSize="11"
                      >
                        {formatNum(val, 1)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Vertical Class Boundary Gridlines */}
              {sortedBoundaries.map((b) => {
                const x = sx(b);
                return (
                  <g key={`vx-${b}`}>
                    <line
                      x1={x}
                      y1={pad.top}
                      x2={x}
                      y2={pad.top + plotH}
                      stroke="#CBD5E1"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={x}
                      y={pad.top + plotH + 18}
                      textAnchor="middle"
                      className="fill-slate-700 font-mono"
                      fontSize="11"
                    >
                      {formatNum(b)}
                    </text>
                  </g>
                );
              })}

              {/* Interactive Bar Slots */}
              {intervals.map((iv, idx) => {
                const bar = bars.find((b) => b.intervalId === iv.id);
                const fb = feedback[idx];
                const freq = bar ? bar.plottedFrequency : 0;
                const x1 = sx(iv.lower);
                const x2 = sx(iv.upper);
                const barW = Math.max(2, x2 - x1);
                const barY = sy(freq);
                const barH = Math.max(0, pad.top + plotH - barY);
                const isSelected = selectedIntervalId === iv.id;

                const barPalette = [
                  { fill: '#DBEAFE', selectedFill: '#BFDBFE', stroke: '#2563EB' },
                  { fill: '#CCFBF1', selectedFill: '#99F6E4', stroke: '#0D9488' },
                  { fill: '#E0E7FF', selectedFill: '#C7D2FE', stroke: '#4F46E5' },
                  { fill: '#E0F2FE', selectedFill: '#BAE6FD', stroke: '#0284C7' },
                  { fill: '#EDE9FE', selectedFill: '#DDD6FE', stroke: '#7C3AED' },
                  { fill: '#D1FAE5', selectedFill: '#A7F3D0', stroke: '#059669' },
                ][idx % 6];

                let fill = isSelected ? barPalette.selectedFill : barPalette.fill;
                let stroke = barPalette.stroke;
                if (hasChecked && fb) {
                  if (fb.status === 'accurate') {
                    fill = '#D1FAE5';
                    stroke = '#059669';
                  } else if (fb.status === 'too-high' || fb.status === 'too-low') {
                    fill = '#FEF3C7';
                    stroke = '#D97706';
                  }
                }

                const targetY = sy(iv.trueFrequency);

                return (
                  <g key={iv.id}>
                    <rect
                      x={x1}
                      y={pad.top}
                      width={barW}
                      height={plotH}
                      fill="transparent"
                      className="cursor-ns-resize"
                      onPointerDown={(e) => handleBarPointerDown(e, iv.id)}
                    />

                    {freq > 0 && (
                      <rect
                        x={x1}
                        y={barY}
                        width={barW}
                        height={barH}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={isSelected ? 2.2 : 1.5}
                        className="pointer-events-none"
                      />
                    )}

                    <g
                      onPointerDown={(e) => handleBarPointerDown(e, iv.id)}
                      className="cursor-ns-resize"
                    >
                      <line
                        x1={x1 + 2}
                        y1={barY}
                        x2={x2 - 2}
                        y2={barY}
                        stroke={stroke}
                        strokeWidth={3.5}
                        strokeLinecap="round"
                      />
                      <circle
                        cx={x1 + barW / 2}
                        cy={barY}
                        r={5}
                        fill="#FFFFFF"
                        stroke={stroke}
                        strokeWidth={2}
                      />
                    </g>

                    {showTargetOverlay && (
                      <line
                        x1={x1}
                        y1={targetY}
                        x2={x2}
                        y2={targetY}
                        stroke="#0F172A"
                        strokeWidth={1.8}
                        strokeDasharray="5 3"
                        className="pointer-events-none"
                      />
                    )}

                    <text
                      x={x1 + barW / 2}
                      y={Math.max(pad.top + 14, barY - 10)}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontWeight="600"
                      className="font-mono pointer-events-none"
                      fill={stroke}
                    >
                      {formatNum(freq, 1)}
                    </text>
                  </g>
                );
              })}

              {/* Axes */}
              <line
                x1={pad.left}
                y1={pad.top}
                x2={pad.left}
                y2={pad.top + plotH}
                stroke="#0F172A"
                strokeWidth="1.75"
              />
              <line
                x1={pad.left}
                y1={pad.top + plotH}
                x2={width - pad.right}
                y2={pad.top + plotH}
                stroke="#0F172A"
                strokeWidth="1.75"
              />

              {/* Axis Labels */}
              <text
                x={pad.left + plotW / 2}
                y={height - 14}
                textAnchor="middle"
                fontSize="12.5"
                fontWeight="600"
                className="fill-slate-800"
              >
                {unit ? `${variableName} (${unit})` : variableName}
              </text>
              <text
                x={18}
                y={pad.top + plotH / 2}
                textAnchor="middle"
                transform={`rotate(-90 18 ${pad.top + plotH / 2})`}
                fontSize="12.5"
                fontWeight="600"
                className="fill-slate-800"
              >
                Frequency (f)
              </text>
            </svg>

            {/* Fine Numeric Bar Adjustment Strip */}
            {selectedInterval && (
              <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-900">Selected Class:</span>{' '}
                  <span className="font-mono-tabular text-slate-700">
                    {formatNum(selectedInterval.lower)} ≤ x &lt; {formatNum(selectedInterval.upper)} {unit}
                  </span>{' '}
                  <span className="text-slate-400">·</span>{' '}
                  <span className="font-mono-tabular text-slate-600">
                    Equal Width = {formatNum(selectedInterval.trueWidth)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="precise-freq-input" className="text-slate-600 font-medium">
                    Set Frequency:
                  </label>
                  <input
                    id="precise-freq-input"
                    type="number"
                    min="0"
                    step={snapStep}
                    value={selectedBar ? selectedBar.plottedFrequency : 0}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      onUpdateBar(selectedInterval.id, roundTo(val, 1));
                    }}
                    className="w-24 px-2.5 py-1 font-mono-tabular text-xs bg-slate-50 border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Zone: Step-by-Step Accuracy Feedback Deck */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Step-by-Step Feedback
                </h3>
                {hasChecked && (
                  <span className="text-xs font-mono-tabular font-semibold text-slate-700">
                    {accurateCount} / {intervals.length} Accurate
                  </span>
                )}
              </div>

              {!hasChecked ? (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Drag each bar on the grid so its height matches the Frequency from your table. Click{' '}
                  <span className="font-semibold text-slate-900">Check Histogram</span> for step-by-step accuracy feedback.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {feedback.map((item) => {
                    const isSelected = selectedIntervalId === item.intervalId;
                    return (
                      <button
                        key={item.intervalId}
                        type="button"
                        onClick={() => setSelectedIntervalId(item.intervalId)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-white border-blue-400 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-mono-tabular font-semibold text-slate-900">
                            {item.label}
                          </span>
                          {item.status === 'accurate' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Accurate</span>
                            </span>
                          )}
                          {item.status === 'too-high' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                              <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Too High</span>
                            </span>
                          )}
                          {item.status === 'too-low' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Too Low</span>
                            </span>
                          )}
                          {item.status === 'unplotted' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Unplotted</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {item.guidance}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 text-xs text-slate-600">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <span>Equal-Width Histogram Checklist</span>
              </div>
              <ul className="space-y-1 list-disc list-inside">
                <li>All class intervals have the same equal width.</li>
                <li>Vertical axis displays Frequency (f) directly.</li>
                <li>Bars touch continuously with zero gaps between boundaries.</li>
              </ul>
            </div>

            <div className="p-4 bg-gradient-to-br from-[#1E3A5F] to-[#162C46] text-white rounded-xl space-y-2.5 shadow-sm">
              <div className="text-sm font-semibold">Ready to Submit Your Work?</div>
              <p className="text-xs text-blue-100 leading-relaxed">
                Download your complete A4 PDF report including your name/group roster, grouped table, mean &amp; modal class workings, histogram, and written interpretation.
              </p>
              <button
                type="button"
                onClick={onDownloadPdf}
                disabled={isExporting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] bg-white hover:bg-[#EFF6FF] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
              >
                <FileDown className="w-4 h-4" aria-hidden="true" />
                <span>{isExporting ? 'Generating PDF...' : 'Download Result as PDF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Free-Response Student Interpretation & Real-World Reflection */}
        <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-[#EEF4FF] text-[#1D4ED8] shrink-0 mt-0.5">
                <MessageSquareText className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1E3A5F]">
                  Student Statistical Interpretation &amp; Real-Condition Analysis
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Write your own thoughts based on your histogram and calculations for{' '}
                  <span className="font-medium text-slate-700">
                    {topicTitle?.trim() || variableName || 'this dataset'}
                  </span>
                  . All written responses are included in the PDF report.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClearReflections}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Reflections</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1. Thought about the Mean */}
            <div className="p-4 bg-[#F5F8FF] border border-[#D6E4FF] rounded-xl flex flex-col space-y-2">
              <label
                htmlFor="reflection-mean"
                className="text-xs font-semibold text-[#1E3A5F]"
              >
                1. Your Thoughts on the Mean of the Data
              </label>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                What does the estimated mean ({unit || 'value'}) tell you about the typical observation, and how does it sit relative to your histogram bars?
              </p>
              <textarea
                id="reflection-mean"
                rows={4}
                value={reflection.meanThought}
                onChange={(e) => onUpdateReflection('meanThought', e.target.value)}
                placeholder={`Write your thoughts about the mean of ${variableName || 'the data'}...`}
                className="w-full flex-1 px-3 py-2 text-xs bg-white border border-[#CBD9ED] rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
              />
            </div>

            {/* 2. Thought about the Mode / Modal Class */}
            <div className="p-4 bg-[#F2FBF8] border border-[#CBEFE6] rounded-xl flex flex-col space-y-2">
              <label
                htmlFor="reflection-mode"
                className="text-xs font-semibold text-[#134E4A]"
              >
                2. Your Thoughts on the Mode / Modal Class
              </label>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Which bar is tallest in your histogram, and what does this modal class reveal about the most common cluster in the data?
              </p>
              <textarea
                id="reflection-mode"
                rows={4}
                value={reflection.modeThought}
                onChange={(e) => onUpdateReflection('modeThought', e.target.value)}
                placeholder="Write your thoughts about the modal class and peak frequency..."
                className="w-full flex-1 px-3 py-2 text-xs bg-white border border-[#BFE6DC] rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 leading-relaxed"
              />
            </div>

            {/* 3. General Meaning of the Real Condition */}
            <div className="p-4 bg-[#F6F5FF] border border-[#DDD6FE] rounded-xl flex flex-col space-y-2">
              <label
                htmlFor="reflection-real-condition"
                className="text-xs font-semibold text-[#312E81]"
              >
                3. General Meaning of the Real Condition
              </label>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                What overall conclusion can you draw about the real-world situation (spread, consistency, high/low extremes, or practical impact)?
              </p>
              <textarea
                id="reflection-real-condition"
                rows={4}
                value={reflection.realConditionMeaning}
                onChange={(e) => onUpdateReflection('realConditionMeaning', e.target.value)}
                placeholder="Explain what these statistics mean in the real-world context..."
                className="w-full flex-1 px-3 py-2 text-xs bg-white border border-[#D4CCF7] rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
