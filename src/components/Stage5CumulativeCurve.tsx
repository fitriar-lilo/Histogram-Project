import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileDown,
  HelpCircle,
  MessageSquareText,
  RotateCcw,
  Spline,
  Trash2,
  Undo2,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import {
  ClassWidthType,
  CumulativeInterval,
  CumulativePoint,
  CumulativePointFeedback,
  StudentCumulativeTableInputs,
} from '../types/statistics';
import { buildSmoothOgivePath, formatNum, niceAxisMax, roundTo } from '../utils/mathStats';

interface Stage5CumulativeCurveProps {
  cumTitle: string;
  cumVariableName: string;
  cumUnit: string;
  cumWidthType: ClassWidthType;
  cumIntervals: CumulativeInterval[];
  cumTableInputs: StudentCumulativeTableInputs;
  points: CumulativePoint[];
  curveConnected: boolean;
  feedback: CumulativePointFeedback[];
  hasChecked: boolean;
  reflection: string;
  onUpdatePoints: (points: CumulativePoint[]) => void;
  onToggleCurveConnected: (connected: boolean) => void;
  onResetCurve: () => void;
  onCheckCurve: () => void;
  onUpdateReflection: (text: string) => void;
  onDownloadPdf: () => void;
  isExporting: boolean;
}

export function Stage5CumulativeCurve({
  cumTitle,
  cumVariableName,
  cumUnit,
  cumWidthType,
  cumIntervals,
  cumTableInputs,
  points,
  curveConnected,
  feedback,
  hasChecked,
  reflection,
  onUpdatePoints,
  onToggleCurveConnected,
  onResetCurve,
  onCheckCurve,
  onUpdateReflection,
  onDownloadPdf,
  isExporting,
}: Stage5CumulativeCurveProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [xSnapMode, setXSnapMode] = useState<'boundary' | 'free'>('boundary');
  const [ySnapStep, setYSnapStep] = useState<number>(1);
  const [showTargetGuide, setShowTargetGuide] = useState(false);

  const width = 760;
  const height = 460;
  const pad = { top: 28, right: 32, bottom: 56, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const minX = cumIntervals.length > 0 ? cumIntervals[0].lower : 0;
  const maxX = cumIntervals.length > 0 ? cumIntervals[cumIntervals.length - 1].upper : 100;
  const xSpan = Math.max(1e-6, maxX - minX);

  const maxTrueCf =
    cumIntervals.length > 0
      ? cumIntervals[cumIntervals.length - 1].trueCumulativeFrequency
      : 10;
  const maxPlottedY = Math.max(0, ...points.map((p) => p.y));
  const yMax = niceAxisMax(Math.max(5, maxTrueCf, maxPlottedY) * 1.15, 5);

  const boundarySet = new Set<number>();
  cumIntervals.forEach((iv) => {
    boundarySet.add(iv.lower);
    boundarySet.add(iv.upper);
  });
  const sortedBoundaries = Array.from(boundarySet).sort((a, b) => a - b);

  const sx = (x: number) => pad.left + ((x - minX) / xSpan) * plotW;
  const sy = (y: number) => pad.top + plotH - (y / Math.max(1e-6, yMax)) * plotH;

  const freeXStep = xSpan >= 200 ? 5 : xSpan >= 40 ? 1 : xSpan >= 10 ? 0.5 : 0.2;

  const clientToCoords = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: minX, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const svgX = (clientX - rect.left) * scaleX;
    const svgY = (clientY - rect.top) * scaleY;

    const rawX = minX + ((svgX - pad.left) / plotW) * xSpan;
    const clampedX = Math.max(minX, Math.min(maxX, rawX));

    let snappedX = clampedX;
    if (xSnapMode === 'boundary' && sortedBoundaries.length > 0) {
      snappedX = sortedBoundaries.reduce((best, b) =>
        Math.abs(b - clampedX) < Math.abs(best - clampedX) ? b : best
      );
    } else {
      snappedX = roundTo(Math.round(clampedX / freeXStep) * freeXStep, 2);
      snappedX = Math.max(minX, Math.min(maxX, snappedX));
    }

    const rawY = ((pad.top + plotH - svgY) / plotH) * yMax;
    const clampedY = Math.max(0, Math.min(yMax, rawY));
    const snappedY = roundTo(Math.round(clampedY / ySnapStep) * ySnapStep, 1);

    return { x: snappedX, y: snappedY };
  };

  const handlePlotAreaPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (cumIntervals.length === 0) return;
    e.stopPropagation();
    const coords = clientToCoords(e.clientX, e.clientY);
    const newId = `pt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newPoint: CumulativePoint = { id: newId, x: coords.x, y: coords.y };
    onUpdatePoints([...points, newPoint]);
    setSelectedPointId(newId);
    setDraggingPointId(newId);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const handlePointPointerDown = (
    e: React.PointerEvent<SVGGElement>,
    pointId: string
  ) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setSelectedPointId(pointId);
    setDraggingPointId(pointId);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingPointId) return;
    const coords = clientToCoords(e.clientX, e.clientY);
    onUpdatePoints(
      points.map((p) => (p.id === draggingPointId ? { ...p, x: coords.x, y: coords.y } : p))
    );
  };

  const handleSvgPointerUp = () => {
    setDraggingPointId(null);
  };

  const handleUndoPoint = () => {
    if (points.length === 0) return;
    const removed = points[points.length - 1];
    const next = points.slice(0, -1);
    onUpdatePoints(next);
    if (selectedPointId === removed.id) {
      setSelectedPointId(next[next.length - 1]?.id ?? null);
    }
    if (next.length < 2 && curveConnected) {
      onToggleCurveConnected(false);
    }
  };

  const handleRemovePoint = (id: string) => {
    const next = points.filter((p) => p.id !== id);
    onUpdatePoints(next);
    if (selectedPointId === id) {
      setSelectedPointId(next[0]?.id ?? null);
    }
    if (next.length < 2 && curveConnected) {
      onToggleCurveConnected(false);
    }
  };

  const yTicks = 5;
  const minorPerMajor = 4;
  const totalMinorY = yTicks * minorPerMajor;

  const sortedPoints = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const sortedPointsPx = sortedPoints.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  const ogivePathD =
    curveConnected && sortedPointsPx.length >= 2
      ? buildSmoothOgivePath(sortedPointsPx)
      : '';
  const areaPathD =
    ogivePathD && sortedPointsPx.length >= 2
      ? `${ogivePathD} L ${sortedPointsPx[sortedPointsPx.length - 1].x.toFixed(2)} ${(
          pad.top + plotH
        ).toFixed(2)} L ${sortedPointsPx[0].x.toFixed(2)} ${(pad.top + plotH).toFixed(2)} Z`
      : '';

  // Target guide coordinates
  const targetPointsPx =
    cumIntervals.length > 0
      ? [
          { x: sx(cumIntervals[0].lower), y: sy(0) },
          ...cumIntervals.map((iv) => ({
            x: sx(iv.upper),
            y: sy(iv.trueCumulativeFrequency),
          })),
        ]
      : [];
  const targetPathD =
    showTargetGuide && targetPointsPx.length >= 2
      ? buildSmoothOgivePath(targetPointsPx)
      : '';

  const pointStatusMap = new Map<string, CumulativePointFeedback['status']>();
  feedback.forEach((fb) => {
    if (fb.matchedPointId) {
      pointStatusMap.set(fb.matchedPointId, fb.status);
    }
  });

  const accuratePointCount = feedback.filter(
    (f) => f.status === 'accurate' || f.status === 'close'
  ).length;
  const selectedPoint = points.find((p) => p.id === selectedPointId) ?? null;

  return (
    <div className="space-y-6">
      {/* Stage 04 Cumulative Frequency Table Reference Card */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#1E3A5F]">
              Stage 04 Cumulative Frequency Table Reference
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Plot the start point{' '}
              <span className="font-mono-tabular font-semibold text-slate-700">
                ({cumIntervals.length > 0 ? formatNum(cumIntervals[0].lower) : 'a'}, 0)
              </span>{' '}
              and each{' '}
              <span className="font-semibold text-[#1D4ED8]">
                (Upper Boundary, Cumulative Frequency)
              </span>{' '}
              point by point, then connect all points into a smooth curve.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              Width Type:{' '}
              <strong className="text-[#1E3A5F] capitalize">{cumWidthType}</strong>
            </span>
            <span className="font-mono-tabular">
              Classes: <strong className="text-[#1E3A5F]">{cumIntervals.length}</strong>
            </span>
            <span className="font-mono-tabular">
              Plotted Points: <strong className="text-[#1D4ED8]">{points.length}</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-[#DCE4F0] rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#EEF4FC] border-b border-[#DCE4F0] font-semibold text-[#1E3A5F]">
                <th className="py-2 px-3">Class</th>
                <th className="py-2 px-3">Interval Group</th>
                <th className="py-2 px-3 bg-[#EBF3FE] text-[#1E3A5F]">Upper Boundary (x)</th>
                <th className="py-2 px-3">Frequency (f)</th>
                <th className="py-2 px-3 bg-[#E3EEFD] text-[#1D4ED8]">
                  Cumulative Frequency (cf)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono-tabular">
              {cumIntervals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 px-3 text-center font-sans text-slate-500">
                    No cumulative data configured yet. Complete Stage 04 first.
                  </td>
                </tr>
              ) : (
                cumIntervals.map((iv, idx) => {
                  const isLast = idx === cumIntervals.length - 1;
                  const row = cumTableInputs[iv.id];
                  const hasInterval = Boolean(
                    row?.lowerBound?.trim() || row?.upperBound?.trim()
                  );
                  const intervalText = hasInterval
                    ? `${row?.lowerBound?.trim() || '?'} ≤ x ${isLast ? '≤' : '<'} ${
                        row?.upperBound?.trim() || '?'
                      }${cumUnit ? ` ${cumUnit}` : ''}`
                    : 'Not entered yet';
                  return (
                    <tr key={iv.id} className="bg-white">
                      <td className="py-2 px-3 text-slate-500">Class {idx + 1}</td>
                      <td
                        className={`py-2 px-3 ${
                          hasInterval
                            ? 'text-slate-900 font-medium'
                            : 'text-slate-400 italic font-sans'
                        }`}
                      >
                        {intervalText}
                      </td>
                      <td className="py-2 px-3 bg-[#F7FAFF] font-semibold text-[#1E3A5F]">
                        {row?.upperBound?.trim() || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {row?.frequency?.trim() || '—'}
                      </td>
                      <td className="py-2 px-3 bg-[#F5F8FF] font-semibold text-[#1D4ED8]">
                        {row?.cumulativeFrequency?.trim() || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Cumulative Frequency Curve Sketcher Card */}
      <div className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              05. Cumulative Frequency Curve (Ogive) Sketcher
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Click on the grid to plot each coordinate point by point, drag to adjust, then click{' '}
              <span className="font-semibold text-[#1E3A5F]">Connect Points with Curve</span> to draw your cumulative frequency curve.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* X Snap Mode */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-xs text-slate-700">
              <label htmlFor="cum-x-snap" className="font-medium">
                X Snap:
              </label>
              <select
                id="cum-x-snap"
                value={xSnapMode}
                onChange={(e) => setXSnapMode(e.target.value as 'boundary' | 'free')}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-900"
              >
                <option value="boundary">Class Boundaries</option>
                <option value="free">Free Grid</option>
              </select>
            </div>

            {/* Y Grid Snap */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-xs text-slate-700">
              <label htmlFor="cum-y-snap" className="font-medium">
                Y Snap:
              </label>
              <select
                id="cum-y-snap"
                value={ySnapStep}
                onChange={(e) => setYSnapStep(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono-tabular text-xs text-slate-900"
              >
                <option value={0.5}>0.5</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={5}>5</option>
              </select>
            </div>

            {/* Connect Points with Curve */}
            <button
              type="button"
              disabled={points.length < 2}
              onClick={() => onToggleCurveConnected(!curveConnected)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                curveConnected
                  ? 'bg-[#0F766E] text-white hover:bg-[#0D625B]'
                  : 'bg-[#1E3A5F] text-white hover:bg-[#173056]'
              }`}
            >
              <Spline className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {curveConnected ? 'Curve Connected (Click to Disconnect)' : 'Connect Points with Curve'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowTargetGuide((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showTargetGuide ? (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{showTargetGuide ? 'Hide Guide' : 'Show Target Guide'}</span>
            </button>

            <button
              type="button"
              onClick={handleUndoPoint}
              disabled={points.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Undo</span>
            </button>

            <button
              type="button"
              onClick={onResetCurve}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Curve</span>
            </button>

            <button
              type="button"
              onClick={onCheckCurve}
              disabled={cumIntervals.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Check Curve</span>
            </button>
          </div>
        </div>

        {/* Empty Notice */}
        {cumIntervals.length === 0 && (
          <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            <span>
              No cumulative data configured yet. Go to <span className="font-semibold">04. Cumulative Table</span> to enter raw data and class intervals first.
            </span>
          </div>
        )}

        {/* Two-Zone Graph & Feedback Layout */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Zone: Interactive Graph Paper + Point Inspector */}
          <div className="lg:col-span-8 space-y-3">
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                onPointerMove={handleSvgPointerMove}
                onPointerUp={handleSvgPointerUp}
                onPointerCancel={handleSvgPointerUp}
                className="w-full h-auto bg-white border border-slate-200 rounded-lg select-none touch-none"
                role="img"
                aria-label="Interactive Cumulative Frequency Curve Sketching Grid"
              >
                {/* Horizontal Gridlines */}
                {Array.from({ length: totalMinorY + 1 }).map((_, idx) => {
                  const val = (yMax / totalMinorY) * idx;
                  const y = sy(val);
                  const isMajor = idx % minorPerMajor === 0;
                  return (
                    <g key={`chy-${idx}`}>
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
                    <g key={`cvx-${b}`}>
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

                {/* Optional Target Guide Curve & Markers */}
                {showTargetGuide && targetPathD && (
                  <g className="pointer-events-none">
                    <path
                      d={targetPathD}
                      fill="none"
                      stroke="#64748B"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                    />
                    {targetPointsPx.map((tp, idx) => (
                      <circle
                        key={`target-pt-${idx}`}
                        cx={tp.x}
                        cy={tp.y}
                        r={5}
                        fill="none"
                        stroke="#475569"
                        strokeWidth="1.8"
                        strokeDasharray="2 2"
                      />
                    ))}
                  </g>
                )}

                {/* Connected Smooth Ogive Curve */}
                {curveConnected && areaPathD && (
                  <path
                    d={areaPathD}
                    fill="#DBEAFE"
                    fillOpacity="0.35"
                    className="pointer-events-none"
                  />
                )}
                {curveConnected && ogivePathD && (
                  <path
                    d={ogivePathD}
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none"
                  />
                )}

                {/* Clickable Plot Surface for Adding Points */}
                <rect
                  x={pad.left}
                  y={pad.top}
                  width={plotW}
                  height={plotH}
                  fill="transparent"
                  className={cumIntervals.length > 0 ? 'cursor-crosshair' : 'cursor-not-allowed'}
                  onPointerDown={handlePlotAreaPointerDown}
                />

                {/* Plotted Interactive Point Handles */}
                {points.map((pt) => {
                  const cx = sx(pt.x);
                  const cy = sy(pt.y);
                  const isSelected = selectedPointId === pt.id;
                  const status = hasChecked ? pointStatusMap.get(pt.id) : undefined;

                  let stroke = '#1D4ED8';
                  let fill = isSelected ? '#DBEAFE' : '#FFFFFF';
                  if (status === 'accurate' || status === 'close') {
                    stroke = '#059669';
                    fill = '#D1FAE5';
                  } else if (status === 'off') {
                    stroke = '#D97706';
                    fill = '#FEF3C7';
                  }

                  return (
                    <g
                      key={pt.id}
                      onPointerDown={(e) => handlePointPointerDown(e, pt.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      {/* Larger invisible hit area */}
                      <circle cx={cx} cy={cy} r={13} fill="transparent" />
                      {isSelected && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={10}
                          fill="none"
                          stroke="#3B82F6"
                          strokeWidth="1.5"
                          strokeOpacity="0.45"
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={isSelected ? 2.8 : 2.2}
                      />
                      <text
                        x={cx}
                        y={Math.max(pad.top + 12, cy - 11)}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        className="font-mono pointer-events-none"
                        fill="#1E293B"
                      >
                        ({formatNum(pt.x, 1)}, {formatNum(pt.y, 1)})
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

                {/* Axis Titles */}
                <text
                  x={pad.left + plotW / 2}
                  y={height - 14}
                  textAnchor="middle"
                  fontSize="12.5"
                  fontWeight="600"
                  className="fill-slate-800"
                >
                  {cumUnit
                    ? `${cumVariableName || 'Upper Class Boundary'} (${cumUnit})`
                    : cumVariableName || 'Upper Class Boundary'}
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
                  Cumulative Frequency (cf)
                </text>
              </svg>

              {/* Selected Point Fine Editor & Point Chips */}
              <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    Plotted Points ({points.length})
                  </span>
                  {selectedPoint ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1 text-slate-600">
                        <span>x:</span>
                        <input
                          type="number"
                          step="any"
                          value={selectedPoint.x}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (!Number.isFinite(val)) return;
                            onUpdatePoints(
                              points.map((p) =>
                                p.id === selectedPoint.id ? { ...p, x: val } : p
                              )
                            );
                          }}
                          aria-label="Selected point x coordinate"
                          className="w-20 px-2 py-1 font-mono-tabular bg-slate-50 border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1 text-slate-600">
                        <span>cf:</span>
                        <input
                          type="number"
                          min="0"
                          step={ySnapStep}
                          value={selectedPoint.y}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            onUpdatePoints(
                              points.map((p) =>
                                p.id === selectedPoint.id ? { ...p, y: val } : p
                              )
                            );
                          }}
                          aria-label="Selected point cumulative frequency coordinate"
                          className="w-20 px-2 py-1 font-mono-tabular bg-slate-50 border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemovePoint(selectedPoint.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Remove Point</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      Click the grid to plot a point, or click any plotted point to adjust coordinates.
                    </span>
                  )}
                </div>

                {sortedPoints.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                    {sortedPoints.map((pt) => {
                      const isSel = pt.id === selectedPointId;
                      return (
                        <button
                          key={pt.id}
                          type="button"
                          onClick={() => setSelectedPointId(pt.id)}
                          className={`px-2 py-1 rounded border font-mono-tabular text-[11px] transition-colors cursor-pointer ${
                            isSel
                              ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          ({formatNum(pt.x, 1)}, {formatNum(pt.y, 1)})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Zone: Feedback, Ogive Checklist & Download PDF */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Point-by-Point Feedback
                </h3>
                {hasChecked && (
                  <span className="text-xs font-mono-tabular font-semibold text-slate-700">
                    {accuratePointCount} / {feedback.length} Points
                  </span>
                )}
              </div>

              {!hasChecked ? (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Plot the origin{' '}
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    ({formatNum(minX)}, 0)
                  </span>{' '}
                  and every <span className="font-semibold text-slate-800">(Upper Boundary, cf)</span>{' '}
                  point, connect them with a smooth curve, then click{' '}
                  <span className="font-semibold text-slate-900">Check Curve</span>.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                      curveConnected
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    <Spline className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {curveConnected
                        ? 'Points connected with smooth cumulative curve.'
                        : 'Click "Connect Points with Curve" to draw the smooth ogive.'}
                    </span>
                  </div>

                  {feedback.map((item) => (
                    <div
                      key={item.targetIndex}
                      onClick={() => {
                        if (item.matchedPointId) setSelectedPointId(item.matchedPointId);
                      }}
                      className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1 cursor-pointer hover:border-blue-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono-tabular font-semibold text-slate-900">
                          {item.label}
                        </span>
                        {item.status === 'accurate' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Accurate</span>
                          </span>
                        )}
                        {item.status === 'close' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Close</span>
                          </span>
                        )}
                        {item.status === 'off' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Adjust</span>
                          </span>
                        )}
                        {item.status === 'missing' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Missing</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">{item.guidance}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 text-xs text-slate-600">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Spline className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <span>Cumulative Frequency Curve Checklist</span>
              </div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Start at the lowest lower boundary with Cumulative Frequency = 0.</li>
                <li>Plot each point at the <strong>upper boundary</strong> of its class interval.</li>
                <li>Connect all plotted points sequentially with a smooth rising curve.</li>
              </ul>
            </div>

            <div className="p-4 bg-gradient-to-br from-[#1E3A5F] to-[#162C46] text-white rounded-xl space-y-2.5 shadow-sm">
              <div className="text-sm font-semibold">Export Complete Report</div>
              <p className="text-xs text-blue-100 leading-relaxed">
                Download your A4 PDF including both the Histogram section and Cumulative Frequency Table &amp; Curve.
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

        {/* Cumulative Curve Interpretation & Median/Quartiles Notes */}
        <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-lg bg-[#EEF4FF] text-[#1D4ED8] shrink-0 mt-0.5">
              <MessageSquareText className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1E3A5F]">
                Cumulative Frequency Curve Interpretation (Median, Quartiles &amp; Meaning)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record your observations from your cumulative frequency curve for{' '}
                <span className="font-medium text-slate-700">
                  {cumTitle?.trim() || cumVariableName || 'this dataset'}
                </span>{' '}
                (e.g., estimated median at cf = n/2, lower/upper quartiles, interquartile range, or real-world meaning).
              </p>
            </div>
          </div>

          <textarea
            id="cum-reflection-textarea"
            rows={4}
            value={reflection}
            onChange={(e) => onUpdateReflection(e.target.value)}
            placeholder="Write your interpretation of the cumulative frequency curve, estimated median, quartiles, and real-world meaning (included in PDF)..."
            className="w-full px-3.5 py-2.5 text-xs bg-[#F8FAFF] border border-[#CBD9ED] rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}
