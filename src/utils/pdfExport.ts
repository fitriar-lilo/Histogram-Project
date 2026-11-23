import { jsPDF } from 'jspdf';
import {
  ClassInterval,
  ClassWidthType,
  CumulativeInterval,
  CumulativePoint,
  CumulativePointFeedback,
  CumulativeRowFeedback,
  HistogramBarFeedback,
  RowFeedback,
  StudentCumulativeAnalysis,
  StudentCumulativeTableInputs,
  StudentHistogramBar,
  StudentHistogramReflection,
  StudentIdentity,
  StudentSummaryCalculations,
  StudentTableInputs,
  SummaryFeedback,
} from '../types/statistics';
import {
  buildSmoothOgivePath,
  formatNum,
  getTrueTableTotals,
  niceAxisMax,
} from './mathStats';

export interface PdfReportPayload {
  identity: StudentIdentity;
  variableName: string;
  unit: string;
  rawValues: number[];
  intervals: ClassInterval[];
  tableInputs: StudentTableInputs;
  summaryInputs: StudentSummaryCalculations;
  tableFeedback: RowFeedback[];
  summaryFeedback: SummaryFeedback;
  histogramBars: StudentHistogramBar[];
  histogramFeedback: HistogramBarFeedback[];
  histogramReflection: StudentHistogramReflection;
  // Stage 04 & 05: Cumulative Frequency
  cumTitle?: string;
  cumVariableName?: string;
  cumUnit?: string;
  cumWidthType?: ClassWidthType;
  cumRawValues?: number[];
  cumIntervals?: CumulativeInterval[];
  cumTableInputs?: StudentCumulativeTableInputs;
  cumTableFeedback?: CumulativeRowFeedback[];
  cumPoints?: CumulativePoint[];
  cumCurveConnected?: boolean;
  cumCurveFeedback?: CumulativePointFeedback[];
  cumAnalysis?: StudentCumulativeAnalysis;
  cumReflection?: string;
}

const PT_TO_MM = 0.352778;

function lineHeightMm(fontSizePt: number, factor = 1.32): number {
  return fontSizePt * PT_TO_MM * factor;
}

/**
 * Converts Unicode math/status symbols unsupported by jsPDF's standard WinAnsi
 * Helvetica font into clean ASCII/Latin-1 equivalents so glyph widths and
 * wrapping remain 100% accurate with zero garbled glyphs or overlaps.
 */
function sanitizePdfText(input: string): string {
  return String(input ?? '')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/\u2248/g, '~=')
    .replace(/\u03A3/g, 'Sum ')
    .replace(/\u2713|\u2714/g, '[OK]')
    .replace(/\u2717|\u2718/g, '[X]')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2212/g, '-')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00F7/g, '/')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF\n]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function drawLines(
  doc: jsPDF,
  lines: string[],
  x: number,
  startY: number,
  lh: number
): number {
  lines.forEach((line, idx) => {
    doc.text(line, x, startY + idx * lh);
  });
  return startY + lines.length * lh;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHistogramSvgString(
  intervals: ClassInterval[],
  bars: StudentHistogramBar[],
  feedback: HistogramBarFeedback[],
  variableName: string,
  unit: string
): string {
  const width = 760;
  const height = 430;
  const pad = { top: 30, right: 32, bottom: 60, left: 66 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const minX = intervals.length > 0 ? intervals[0].lower : 0;
  const maxX = intervals.length > 0 ? intervals[intervals.length - 1].upper : 50;
  const maxTrueFreq = Math.max(5, ...intervals.map((i) => i.trueFrequency));
  const maxPlottedFreq = Math.max(0, ...bars.map((b) => b.plottedFrequency));
  const yMax = niceAxisMax(Math.max(maxTrueFreq, maxPlottedFreq) * 1.15, 5);

  const sx = (x: number) => pad.left + ((x - minX) / Math.max(1e-6, maxX - minX)) * plotW;
  const sy = (y: number) => pad.top + plotH - (y / Math.max(1e-6, yMax)) * plotH;

  const gridLines: string[] = [];
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const val = (yMax / yTicks) * i;
    const y = sy(val);
    gridLines.push(
      `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#E2E8F0" stroke-width="1" />`
    );
    gridLines.push(
      `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="11" fill="#475569">${escapeXml(formatNum(val, 1))}</text>`
    );
  }

  const boundarySet = new Set<number>();
  intervals.forEach((iv) => {
    boundarySet.add(iv.lower);
    boundarySet.add(iv.upper);
  });
  const sortedBoundaries = Array.from(boundarySet).sort((a, b) => a - b);
  const stepPx =
    sortedBoundaries.length > 1 ? plotW / (sortedBoundaries.length - 1) : plotW;
  const xTickFontSize = stepPx < 28 ? 9 : stepPx < 40 ? 10 : 11;
  let lastLabelRight = -Infinity;

  sortedBoundaries.forEach((b, idx) => {
    const x = sx(b);
    gridLines.push(
      `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + plotH}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="3 3" />`
    );

    const labelStr = formatNum(b);
    const estHalfW = (labelStr.length * xTickFontSize * 0.64) / 2;
    const isLast = idx === sortedBoundaries.length - 1;
    const leftEdge = x - estHalfW;
    const rightEdge = x + estHalfW;

    // Prevent adjacent x-axis boundary labels from colliding when many bars exist
    if (leftEdge >= lastLabelRight + 6 || (isLast && leftEdge >= lastLabelRight + 2)) {
      gridLines.push(
        `<text x="${x}" y="${pad.top + plotH + 18}" text-anchor="middle" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="${xTickFontSize}" fill="#475569">${escapeXml(labelStr)}</text>`
      );
      lastLabelRight = rightEdge;
    }
  });

  const barRects = intervals
    .map((iv, idx) => {
      const bar = bars.find((b) => b.intervalId === iv.id);
      const fb = feedback.find((f) => f.intervalId === iv.id);
      const freq = bar ? bar.plottedFrequency : 0;
      const x1 = sx(iv.lower);
      const x2 = sx(iv.upper);
      const w = Math.max(1, x2 - x1);
      const y = sy(freq);
      const h = Math.max(0, pad.top + plotH - y);

      const barPalette = [
        { fill: '#DBEAFE', stroke: '#2563EB' },
        { fill: '#CCFBF1', stroke: '#0D9488' },
        { fill: '#E0E7FF', stroke: '#4F46E5' },
        { fill: '#E0F2FE', stroke: '#0284C7' },
        { fill: '#EDE9FE', stroke: '#7C3AED' },
        { fill: '#D1FAE5', stroke: '#059669' },
      ][idx % 6];

      let fill = barPalette.fill;
      let stroke = barPalette.stroke;
      if (fb?.status === 'accurate') {
        fill = '#D1FAE5';
        stroke = '#059669';
      } else if (fb?.status === 'too-high' || fb?.status === 'too-low') {
        fill = '#FEF3C7';
        stroke = '#D97706';
      }

      const labelY = Math.max(pad.top + 13, y - 6);
      const barFontSize = w < 24 ? 8.5 : 10;
      const freqLabel =
        freq > 0 && w >= 14
          ? `<text x="${x1 + w / 2}" y="${labelY}" text-anchor="middle" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="${barFontSize}" font-weight="600" fill="${stroke}">${escapeXml(formatNum(freq, 1))}</text>`
          : '';

      return `<rect x="${x1}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />${freqLabel}`;
    })
    .join('');

  const rawAxisTitle = unit ? `${variableName} (${unit})` : variableName;
  const xAxisTitle =
    rawAxisTitle.length > 68 ? `${rawAxisTitle.slice(0, 65)}...` : rawAxisTitle;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#FFFFFF" />
    ${gridLines.join('')}
    ${barRects}
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#0F172A" stroke-width="1.5" />
    <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" stroke="#0F172A" stroke-width="1.5" />
    <text x="${pad.left + plotW / 2}" y="${height - 14}" text-anchor="middle" font-family="'DM Sans', Arial, Helvetica, sans-serif" font-size="12" font-weight="600" fill="#1E293B">${escapeXml(xAxisTitle)}</text>
    <text x="18" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 18 ${pad.top + plotH / 2})" font-family="'DM Sans', Arial, Helvetica, sans-serif" font-size="12" font-weight="600" fill="#1E293B">Frequency (f)</text>
  </svg>`;
}

function buildCumulativeCurveSvgString(
  intervals: CumulativeInterval[],
  points: CumulativePoint[],
  curveConnected: boolean,
  feedback: CumulativePointFeedback[],
  variableName: string,
  unit: string
): string {
  const width = 760;
  const height = 430;
  const pad = { top: 30, right: 32, bottom: 60, left: 66 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const minX =
    intervals.length > 0
      ? intervals[0].lower
      : points.length > 0
      ? Math.min(...points.map((p) => p.x))
      : 0;
  const maxX =
    intervals.length > 0
      ? intervals[intervals.length - 1].upper
      : points.length > 0
      ? Math.max(...points.map((p) => p.x)) + 10
      : 100;
  const xSpan = Math.max(1e-6, maxX - minX);

  const maxTrueCf =
    intervals.length > 0
      ? intervals[intervals.length - 1].trueCumulativeFrequency
      : 10;
  const maxPlottedY = Math.max(0, ...points.map((p) => p.y));
  const yMax = niceAxisMax(Math.max(5, maxTrueCf, maxPlottedY) * 1.15, 5);

  const sx = (x: number) => pad.left + ((x - minX) / xSpan) * plotW;
  const sy = (y: number) => pad.top + plotH - (y / Math.max(1e-6, yMax)) * plotH;

  const gridLines: string[] = [];
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const val = (yMax / yTicks) * i;
    const y = sy(val);
    gridLines.push(
      `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#E2E8F0" stroke-width="1" />`
    );
    gridLines.push(
      `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="11" fill="#475569">${escapeXml(formatNum(val, 1))}</text>`
    );
  }

  const boundarySet = new Set<number>();
  intervals.forEach((iv) => {
    boundarySet.add(iv.lower);
    boundarySet.add(iv.upper);
  });
  const sortedBoundaries = Array.from(boundarySet).sort((a, b) => a - b);
  const stepPx =
    sortedBoundaries.length > 1 ? plotW / (sortedBoundaries.length - 1) : plotW;
  const xTickFontSize = stepPx < 28 ? 9 : stepPx < 40 ? 10 : 11;
  let lastLabelRight = -Infinity;

  sortedBoundaries.forEach((b, idx) => {
    const x = sx(b);
    gridLines.push(
      `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + plotH}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="3 3" />`
    );

    const labelStr = formatNum(b);
    const estHalfW = (labelStr.length * xTickFontSize * 0.64) / 2;
    const isLast = idx === sortedBoundaries.length - 1;
    const leftEdge = x - estHalfW;
    const rightEdge = x + estHalfW;

    if (leftEdge >= lastLabelRight + 6 || (isLast && leftEdge >= lastLabelRight + 2)) {
      gridLines.push(
        `<text x="${x}" y="${pad.top + plotH + 18}" text-anchor="middle" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="${xTickFontSize}" fill="#475569">${escapeXml(labelStr)}</text>`
      );
      lastLabelRight = rightEdge;
    }
  });

  const sortedPts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const sortedPx = sortedPts.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  const pathD =
    curveConnected && sortedPx.length >= 2 ? buildSmoothOgivePath(sortedPx) : '';
  const areaD =
    pathD && sortedPx.length >= 2
      ? `${pathD} L ${sortedPx[sortedPx.length - 1].x.toFixed(2)} ${(
          pad.top + plotH
        ).toFixed(2)} L ${sortedPx[0].x.toFixed(2)} ${(pad.top + plotH).toFixed(2)} Z`
      : '';

  const statusMap = new Map<string, CumulativePointFeedback['status']>();
  feedback.forEach((fb) => {
    if (fb.matchedPointId) statusMap.set(fb.matchedPointId, fb.status);
  });

  const pointMarks = sortedPts
    .map((pt) => {
      const cx = sx(pt.x);
      const cy = sy(pt.y);
      const st = statusMap.get(pt.id);
      const stroke =
        st === 'accurate' || st === 'close'
          ? '#059669'
          : st === 'off'
          ? '#D97706'
          : '#1D4ED8';
      const fill =
        st === 'accurate' || st === 'close'
          ? '#D1FAE5'
          : st === 'off'
          ? '#FEF3C7'
          : '#FFFFFF';
      const ly = Math.max(pad.top + 13, cy - 10);
      return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="2" />
      <text x="${cx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="middle" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="9" font-weight="600" fill="#1E293B">(${escapeXml(formatNum(pt.x, 1))}, ${escapeXml(formatNum(pt.y, 1))})</text>`;
    })
    .join('');

  const rawAxisTitle = unit
    ? `${variableName || 'Upper Boundary'} (${unit})`
    : variableName || 'Upper Boundary';
  const xAxisTitle =
    rawAxisTitle.length > 68 ? `${rawAxisTitle.slice(0, 65)}...` : rawAxisTitle;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#FFFFFF" />
    ${gridLines.join('')}
    ${areaD ? `<path d="${areaD}" fill="#DBEAFE" fill-opacity="0.35" />` : ''}
    ${pathD ? `<path d="${pathD}" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : ''}
    ${pointMarks}
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#0F172A" stroke-width="1.5" />
    <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" stroke="#0F172A" stroke-width="1.5" />
    <text x="${pad.left + plotW / 2}" y="${height - 14}" text-anchor="middle" font-family="'DM Sans', Arial, Helvetica, sans-serif" font-size="12" font-weight="600" fill="#1E293B">${escapeXml(xAxisTitle)}</text>
    <text x="18" y="${pad.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 18 ${pad.top + plotH / 2})" font-family="'DM Sans', Arial, Helvetica, sans-serif" font-size="12" font-weight="600" fill="#1E293B">Cumulative Frequency (cf)</text>
  </svg>`;
}

async function svgToPngDataUrl(svgString: string, width = 1520, height = 860): Promise<string> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not initialize canvas context'));
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export async function exportStatisticsPdf(payload: PdfReportPayload): Promise<void> {
  const {
    identity,
    variableName,
    unit,
    rawValues,
    intervals,
    tableInputs,
    summaryInputs,
    tableFeedback,
    summaryFeedback,
    histogramBars,
    histogramFeedback,
    histogramReflection,
    cumTitle = '',
    cumVariableName = '',
    cumUnit = '',
    cumWidthType = 'equal',
    cumRawValues = [],
    cumIntervals = [],
    cumTableInputs = {},
    cumTableFeedback = [],
    cumPoints = [],
    cumCurveConnected = false,
    cumCurveFeedback = [],
    cumAnalysis = {
      q1Thought: '',
      q2Thought: '',
      q3Thought: '',
      iqrThought: '',
    },
    cumReflection = '',
  } = payload;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 14;
  const topMargin = 16;
  const bottomLimit = pageH - 17; // 280mm, leaves dedicated space for footer
  const contentW = pageW - margin * 2; // 182mm
  const trueTotals = getTrueTableTotals(intervals);
  const safeUnit = sanitizePdfText(unit);

  let y = 0;

  const ensureSpace = (neededHeight: number, onNewPage?: () => void) => {
    if (y + neededHeight > bottomLimit) {
      doc.addPage();
      y = topMargin;
      if (onNewPage) onNewPage();
    }
  };

  // ---------------------------------------------------------------------------
  // Header Banner (dynamic height so long topic titles wrap cleanly)
  // ---------------------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  const bannerTitle = sanitizePdfText(
    'IGCSE Mathematics (0580) - Statistical Investigation Report'
  );
  const titleLines = doc.splitTextToSize(bannerTitle, contentW) as string[];
  const titleLh = lineHeightMm(14.5, 1.25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  const topicText = sanitizePdfText(
    `Topic: ${identity.topicTitle || variableName || 'Untitled Investigation'}  |  Grouped Mean, Modal Class & Equal-Width Histogram`
  );
  const topicLines = doc.splitTextToSize(topicText, contentW) as string[];
  const topicLh = lineHeightMm(9.2, 1.3);

  const bannerH = 9 + titleLines.length * titleLh + 1.5 + topicLines.length * topicLh + 5;
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, pageW, bannerH, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  let hy = drawLines(doc, titleLines, margin, 11, titleLh);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(203, 213, 225);
  drawLines(doc, topicLines, margin, hy + 1.5, topicLh);

  y = bannerH + 6;

  // ---------------------------------------------------------------------------
  // Student / Group Identity Box (strict non-overlapping wrapped grid)
  // ---------------------------------------------------------------------------
  const boxPadX = 4.5;
  const innerW = contentW - boxPadX * 2;
  const metaLeftW = innerW * 0.62;
  const metaRightW = innerW - metaLeftW - 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const primaryTitle = sanitizePdfText(
    identity.mode === 'individual'
      ? `Student Name: ${identity.individualName.trim() || '__________________________'}`
      : `Group Work: ${identity.groupName.trim() || 'Unnamed Group'}`
  );
  const primaryLines = doc.splitTextToSize(primaryTitle, innerW) as string[];
  const primaryLh = lineHeightMm(10, 1.28);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  const classLines = doc.splitTextToSize(
    sanitizePdfText(`Class / Set: ${identity.classSection.trim() || '________'}`),
    metaLeftW
  ) as string[];
  const dateLines = doc.splitTextToSize(
    sanitizePdfText(`Date: ${identity.date || '________'}`),
    metaRightW
  ) as string[];
  const metaLh = lineHeightMm(8.8, 1.28);
  const metaRowH = Math.max(classLines.length, dateLines.length) * metaLh;

  const memberColGap = 6;
  const memberColW = (innerW - memberColGap) / 2;
  const memberLh = lineHeightMm(8.4, 1.28);
  const activeMembers = identity.members.filter((m) => m.name.trim());

  interface MemberRowLayout {
    leftLines: string[];
    rightLines: string[];
    height: number;
  }
  const memberRowLayouts: MemberRowLayout[] = [];
  if (identity.mode === 'group' && activeMembers.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    for (let i = 0; i < activeMembers.length; i += 2) {
      const leftM = activeMembers[i];
      const rightM = activeMembers[i + 1];
      const leftLines = doc.splitTextToSize(
        sanitizePdfText(`- ${leftM.name} (${leftM.role || 'Contributor'})`),
        memberColW
      ) as string[];
      const rightLines = rightM
        ? (doc.splitTextToSize(
            sanitizePdfText(`- ${rightM.name} (${rightM.role || 'Contributor'})`),
            memberColW
          ) as string[])
        : [];
      const rowH = Math.max(leftLines.length, rightLines.length) * memberLh + 1.2;
      memberRowLayouts.push({ leftLines, rightLines, height: rowH });
    }
  }

  let idBoxH = 5 + primaryLines.length * primaryLh + 1.5 + metaRowH + 2.5;
  if (identity.mode === 'group') {
    idBoxH += 5; // "Group Members & Assigned Roles:" label
    if (memberRowLayouts.length === 0) {
      idBoxH += memberLh + 3;
    } else {
      idBoxH += memberRowLayouts.reduce((sum, r) => sum + r.height, 0) + 2.5;
    }
  } else {
    idBoxH += metaLh + 3;
  }

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentW, idBoxH, 2, 2, 'FD');

  let iy = y + 6.5;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  iy = drawLines(doc, primaryLines, margin + boxPadX, iy, primaryLh);
  iy += 1.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(71, 85, 105);
  drawLines(doc, classLines, margin + boxPadX, iy, metaLh);
  drawLines(doc, dateLines, margin + boxPadX + metaLeftW + 4, iy, metaLh);
  iy += metaRowH + 2;

  if (identity.mode === 'group') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(51, 65, 85);
    doc.text('Group Members & Assigned Roles:', margin + boxPadX, iy);
    iy += 4.5;

    doc.setFont('helvetica', 'normal');
    if (memberRowLayouts.length === 0) {
      doc.text('No group member names entered.', margin + boxPadX, iy);
    } else {
      memberRowLayouts.forEach((row) => {
        drawLines(doc, row.leftLines, margin + boxPadX, iy, memberLh);
        if (row.rightLines.length > 0) {
          drawLines(
            doc,
            row.rightLines,
            margin + boxPadX + memberColW + memberColGap,
            iy,
            memberLh
          );
        }
        iy += row.height;
      });
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(71, 85, 105);
    doc.text('Work Mode: Individual Assessment', margin + boxPadX, iy);
  }

  y += idBoxH + 7;

  // ---------------------------------------------------------------------------
  // 1. Raw Dataset Summary
  // ---------------------------------------------------------------------------
  const sortedRaw = [...rawValues].sort((a, b) => a - b);
  const hasRaw = sortedRaw.length > 0;
  const minVal = hasRaw ? sortedRaw[0] : 0;
  const maxVal = hasRaw ? sortedRaw[sortedRaw.length - 1] : 0;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const statsSummaryText = hasRaw
    ? sanitizePdfText(
        `Sample Size (n) = ${rawValues.length}  |  Min = ${formatNum(minVal)}${safeUnit ? ` ${safeUnit}` : ''}  |  Max = ${formatNum(maxVal)}${safeUnit ? ` ${safeUnit}` : ''}  |  Range = ${formatNum(maxVal - minVal)}${safeUnit ? ` ${safeUnit}` : ''}`
      )
    : 'Sample Size (n) = 0  |  No raw values entered yet';
  const wrappedStats = doc.splitTextToSize(statsSummaryText, contentW) as string[];
  const statsLh = lineHeightMm(9, 1.3);

  doc.setFontSize(8.3);
  const rawText = hasRaw
    ? `Sorted Data: ${sortedRaw.map((v) => formatNum(v)).join(', ')}`
    : 'Sorted Data: (No raw values entered)';
  const wrappedRaw = doc.splitTextToSize(sanitizePdfText(rawText), contentW) as string[];
  const rawLh = lineHeightMm(8.3, 1.32);

  ensureSpace(10 + wrappedStats.length * statsLh);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Raw Dataset Summary', margin, y);
  y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  y = drawLines(doc, wrappedStats, margin, y, statsLh);
  y += 1.2;

  doc.setFontSize(8.3);
  doc.setTextColor(71, 85, 105);
  wrappedRaw.forEach((line) => {
    ensureSpace(rawLh + 1);
    doc.text(line, margin, y);
    y += rawLh;
  });
  y += 5.5;

  // ---------------------------------------------------------------------------
  // 2. Grouped Data, Mid-Value & Product (f x x) Table
  // ---------------------------------------------------------------------------
  const colWidths = [58, 26, 28, 32, 38]; // Total = 182mm = contentW
  const headers = [
    'Class Interval',
    'Width (w)',
    'Mid-value (x)',
    'Frequency (f)',
    'f x Mid-value (fx)',
  ];
  const cellPadX = 2.4;
  const tableLh = lineHeightMm(8, 1.26);

  const measureHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const wrappedHeaders = headers.map((h, idx) =>
      doc.splitTextToSize(h, colWidths[idx] - cellPadX * 2) as string[]
    );
    const maxLines = Math.max(1, ...wrappedHeaders.map((l) => l.length));
    const height = Math.max(8, maxLines * tableLh + 3.2);
    return { wrappedHeaders, height };
  };

  const drawTableHeader = (continued = false) => {
    if (continued) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      doc.text('2. Grouped Data Table (continued)', margin, y);
      y += 4.5;
    }

    const { wrappedHeaders, height } = measureHeader();
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentW, height, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);

    let cx = margin;
    wrappedHeaders.forEach((lines, idx) => {
      if (idx > 0) {
        doc.setDrawColor(203, 213, 225);
        doc.line(cx, y, cx, y + height);
      }
      drawLines(doc, lines, cx + cellPadX, y + 4.8, tableLh);
      cx += colWidths[idx];
    });
    y += height;
  };

  const headerMetrics = measureHeader();
  ensureSpace(10 + headerMetrics.height + 9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Grouped Data, Mid-Value & Product (f x x) Table', margin, y);
  y += 4.5;

  drawTableHeader(false);

  if (intervals.length === 0) {
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentW, 8.5, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text('No class intervals configured yet.', margin + cellPadX, y + 5.5);
    y += 13;
  } else {
    intervals.forEach((iv, idx) => {
      const rowInput = tableInputs[iv.id];
      const fb = tableFeedback[idx];
      const isLast = idx === intervals.length - 1;
      const cmpOp = isLast ? '<=' : '<';
      const expectedInterval = `${formatNum(iv.lower)} <= x ${cmpOp} ${formatNum(iv.upper)}`;
      const hasInterval = Boolean(rowInput?.lowerBound?.trim() || rowInput?.upperBound?.trim());
      const studentInterval = `${rowInput?.lowerBound?.trim() || '?'} <= x ${cmpOp} ${rowInput?.upperBound?.trim() || '?'}`;

      const rawCells = [
        hasInterval
          ? fb?.interval.status === 'correct'
            ? `${studentInterval} [OK]`
            : `${studentInterval} (Exp: ${expectedInterval})`
          : `- (Exp: ${expectedInterval})`,
        rowInput?.classWidth?.trim()
          ? fb?.classWidth.status === 'correct'
            ? `${rowInput.classWidth.trim()} [OK]`
            : `${rowInput.classWidth.trim()} (${formatNum(iv.trueWidth)})`
          : `- (${formatNum(iv.trueWidth)})`,
        rowInput?.midValue?.trim()
          ? fb?.midValue.status === 'correct'
            ? `${rowInput.midValue.trim()} [OK]`
            : `${rowInput.midValue.trim()} (${formatNum(iv.trueMidValue)})`
          : `- (${formatNum(iv.trueMidValue)})`,
        rowInput?.frequency?.trim()
          ? fb?.frequency.status === 'correct'
            ? `${rowInput.frequency.trim()} [OK]`
            : `${rowInput.frequency.trim()} (${iv.trueFrequency})`
          : `- (${iv.trueFrequency})`,
        rowInput?.fxProduct?.trim()
          ? fb?.fxProduct.status === 'correct' || fb?.fxProduct.status === 'close'
            ? `${rowInput.fxProduct.trim()} [OK]`
            : `${rowInput.fxProduct.trim()} (${formatNum(iv.trueFx)})`
          : `- (${formatNum(iv.trueFx)})`,
      ];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const wrappedCells = rawCells.map((val, cIdx) =>
        doc.splitTextToSize(sanitizePdfText(val), colWidths[cIdx] - cellPadX * 2) as string[]
      );
      const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
      const rowH = Math.max(7.6, maxLines * tableLh + 3.2);

      ensureSpace(rowH, () => drawTableHeader(true));

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentW, rowH, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentW, rowH, 'S');

      let cellX = margin;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      wrappedCells.forEach((lines, cIdx) => {
        if (cIdx > 0) {
          doc.setDrawColor(226, 232, 240);
          doc.line(cellX, y, cellX, y + rowH);
        }
        drawLines(doc, lines, cellX + cellPadX, y + 4.7, tableLh);
        cellX += colWidths[cIdx];
      });
      y += rowH;
    });

    // Totals Row
    const rawTotals = [
      'Total',
      '-',
      '-',
      summaryInputs.totalFrequency.trim()
        ? summaryFeedback.totalFrequency.status === 'correct'
          ? `${summaryInputs.totalFrequency.trim()} [OK]`
          : `${summaryInputs.totalFrequency.trim()} (${trueTotals.totalFrequency})`
        : `- (${trueTotals.totalFrequency})`,
      summaryInputs.totalFx.trim()
        ? summaryFeedback.totalFx.status === 'correct' ||
          summaryFeedback.totalFx.status === 'close'
          ? `${summaryInputs.totalFx.trim()} [OK]`
          : `${summaryInputs.totalFx.trim()} (${formatNum(trueTotals.totalFx, 2)})`
        : `- (${formatNum(trueTotals.totalFx, 2)})`,
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const wrappedTotals = rawTotals.map((val, cIdx) =>
      doc.splitTextToSize(sanitizePdfText(val), colWidths[cIdx] - cellPadX * 2) as string[]
    );
    const totalLines = Math.max(1, ...wrappedTotals.map((lines) => lines.length));
    const totalRowH = Math.max(8, totalLines * tableLh + 3.2);

    ensureSpace(totalRowH, () => drawTableHeader(true));

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentW, totalRowH, 'FD');

    let tx = margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    wrappedTotals.forEach((lines, cIdx) => {
      if (cIdx > 0) {
        doc.setDrawColor(203, 213, 225);
        doc.line(tx, y, tx, y + totalRowH);
      }
      drawLines(doc, lines, tx + cellPadX, y + 4.9, tableLh);
      tx += colWidths[cIdx];
    });
    y += totalRowH + 7;
  }

  // ---------------------------------------------------------------------------
  // 3. Estimated Mean & Modal Class Working Boxes (strict wrapped heights)
  // ---------------------------------------------------------------------------
  const boxGap = 6;
  const boxW = (contentW - boxGap) / 2; // 88mm each
  const calcInnerW = boxW - 7; // 81mm text width
  const calcTitleLh = lineHeightMm(9, 1.28);
  const calcBodyLh = lineHeightMm(8, 1.3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const meanTitleLines = doc.splitTextToSize(
    'Estimated Mean (Sum(fx) / Sum(f))',
    calcInnerW
  ) as string[];
  const modalTitleLines = doc.splitTextToSize(
    'Modal Class (Class Mode)',
    calcInnerW
  ) as string[];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const meanWorkLines = doc.splitTextToSize(
    sanitizePdfText(`Working: ${summaryInputs.meanWorking.trim() || '(No working written)'}`),
    calcInnerW
  ) as string[];
  const modalWorkLines = doc.splitTextToSize(
    sanitizePdfText(
      `Working: ${summaryInputs.modalClassWorking.trim() || '(No reasoning written)'}`
    ),
    calcInnerW
  ) as string[];

  const meanAnsVal = summaryInputs.meanAnswer.trim();
  const meanStatusStr =
    summaryFeedback.meanAnswer.status === 'correct' ||
    summaryFeedback.meanAnswer.status === 'close'
      ? '[OK]'
      : `(Exp: ${formatNum(trueTotals.estimatedMean, 2)})`;
  const meanAnswerText = sanitizePdfText(
    `Answer: ${meanAnsVal || '-'}${safeUnit ? ` ${safeUnit}` : ''} ${meanAnsVal ? meanStatusStr : `(Ans: ${formatNum(trueTotals.estimatedMean, 2)})`}`
  );

  const expectedModal = sanitizePdfText(
    summaryFeedback.modalClassAnswer.expectedLabels.join(' / ') || '-'
  );
  const modalAnsVal = summaryInputs.modalClassAnswer.trim();
  const modalStatusStr =
    summaryFeedback.modalClassAnswer.status === 'correct'
      ? '[OK]'
      : `(Exp: ${expectedModal})`;
  const modalAnswerText = sanitizePdfText(
    `Answer: ${modalAnsVal || '-'} ${modalAnsVal ? modalStatusStr : `(Ans: ${expectedModal})`}`
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const meanAnsLines = doc.splitTextToSize(meanAnswerText, calcInnerW) as string[];
  const modalAnsLines = doc.splitTextToSize(modalAnswerText, calcInnerW) as string[];

  const meanNeedH =
    6 +
    meanTitleLines.length * calcTitleLh +
    1.5 +
    meanWorkLines.length * calcBodyLh +
    2.5 +
    meanAnsLines.length * calcBodyLh +
    3.5;
  const modalNeedH =
    6 +
    modalTitleLines.length * calcTitleLh +
    1.5 +
    modalWorkLines.length * calcBodyLh +
    2.5 +
    modalAnsLines.length * calcBodyLh +
    3.5;
  const calcBoxH = Math.max(26, meanNeedH, modalNeedH);

  ensureSpace(6 + calcBoxH + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Estimated Mean & Modal Class Calculations', margin, y);
  y += 4.5;

  const drawCalcBox = (
    bx: number,
    titleLinesArg: string[],
    workLinesArg: string[],
    ansLinesArg: string[]
  ) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(bx, y, boxW, calcBoxH, 2, 2, 'FD');

    let cy = y + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    cy = drawLines(doc, titleLinesArg, bx + 3.5, cy, calcTitleLh);
    cy += 1.2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    cy = drawLines(doc, workLinesArg, bx + 3.5, cy, calcBodyLh);

    const ansStartY = Math.max(
      cy + 2.5,
      y + calcBoxH - 3.5 - (ansLinesArg.length - 1) * calcBodyLh
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    drawLines(doc, ansLinesArg, bx + 3.5, ansStartY, calcBodyLh);
  };

  drawCalcBox(margin, meanTitleLines, meanWorkLines, meanAnsLines);
  drawCalcBox(margin + boxW + boxGap, modalTitleLines, modalWorkLines, modalAnsLines);
  y += calcBoxH + 8;

  // ---------------------------------------------------------------------------
  // 4. Visual Histogram (auto-paginates cleanly if not enough space left)
  // ---------------------------------------------------------------------------
  const imgW = contentW;
  const imgH = (430 / 760) * imgW; // ~102.97mm
  ensureSpace(8 + imgH + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Histogram (Equal Class Widths - Frequency)', margin, y);
  y += 4.5;

  const histSvg = buildHistogramSvgString(
    intervals,
    histogramBars,
    histogramFeedback,
    sanitizePdfText(variableName || 'Variable'),
    safeUnit
  );
  const histPng = await svgToPngDataUrl(histSvg);
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, imgW, imgH);
  doc.addImage(histPng, 'PNG', margin, y, imgW, imgH);
  y += imgH + 8;

  // ---------------------------------------------------------------------------
  // 5. Accuracy & Step-by-Step Histogram Verification
  // ---------------------------------------------------------------------------
  const totalTableChecks = tableFeedback.length * 5 + 4;
  const rowCorrect = tableFeedback.reduce((acc, r) => {
    let c = 0;
    if (r.interval.status === 'correct') c++;
    if (r.classWidth.status === 'correct') c++;
    if (r.midValue.status === 'correct') c++;
    if (r.frequency.status === 'correct') c++;
    if (r.fxProduct.status === 'correct' || r.fxProduct.status === 'close') c++;
    return acc + c;
  }, 0);
  let sumCorrect = 0;
  if (summaryFeedback.totalFrequency.status === 'correct') sumCorrect++;
  if (
    summaryFeedback.totalFx.status === 'correct' ||
    summaryFeedback.totalFx.status === 'close'
  ) {
    sumCorrect++;
  }
  if (
    summaryFeedback.meanAnswer.status === 'correct' ||
    summaryFeedback.meanAnswer.status === 'close'
  ) {
    sumCorrect++;
  }
  if (summaryFeedback.modalClassAnswer.status === 'correct') sumCorrect++;

  const accurateBars = histogramFeedback.filter((b) => b.status === 'accurate').length;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const sumBullet1 = doc.splitTextToSize(
    `- Table, Totals, Mean & Modal Class: ${rowCorrect + sumCorrect} / ${totalTableChecks} items verified`,
    contentW - 2
  ) as string[];
  const sumBullet2 = doc.splitTextToSize(
    `- Manual Histogram Construction: ${accurateBars} / ${histogramFeedback.length} bars accurate`,
    contentW - 2
  ) as string[];
  const sumLh = lineHeightMm(9, 1.32);

  ensureSpace(10 + (sumBullet1.length + sumBullet2.length) * sumLh);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('5. Accuracy & Step-by-Step Histogram Verification', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  y = drawLines(doc, sumBullet1, margin + 2, y, sumLh);
  y += 1;
  y = drawLines(doc, sumBullet2, margin + 2, y, sumLh);
  y += 3;

  const fbLh = lineHeightMm(8.5, 1.32);
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  histogramFeedback.forEach((fb) => {
    const lines = doc.splitTextToSize(
      sanitizePdfText(`- ${fb.guidance}`),
      contentW - 2
    ) as string[];
    ensureSpace(lines.length * fbLh + 1.5);
    y = drawLines(doc, lines, margin + 2, y, fbLh);
    y += 1.2;
  });

  // ---------------------------------------------------------------------------
  // 6. Student Interpretation & Real-Condition Analysis
  // ---------------------------------------------------------------------------
  y += 5;
  const reflectionItems = [
    {
      title: 'Thoughts on the Mean of the Data',
      text: histogramReflection.meanThought.trim() || '(No response entered)',
    },
    {
      title: 'Thoughts on the Mode / Modal Class of the Data',
      text: histogramReflection.modeThought.trim() || '(No response entered)',
    },
    {
      title: 'General Meaning of the Real Condition Based on the Data',
      text: histogramReflection.realConditionMeaning.trim() || '(No response entered)',
    },
  ];

  const refTitleLh = lineHeightMm(9, 1.28);
  const refBodyLh = lineHeightMm(8.5, 1.32);

  ensureSpace(28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('6. Student Interpretation & Real-Condition Analysis', margin, y);
  y += 5.5;

  reflectionItems.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const titleLines = doc.splitTextToSize(sanitizePdfText(item.title), contentW - 8) as string[];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const bodyLines = doc.splitTextToSize(sanitizePdfText(item.text), contentW - 8) as string[];

    const fullBoxH = Math.max(
      17,
      5.5 + titleLines.length * refTitleLh + 1.5 + bodyLines.length * refBodyLh + 3.5
    );

    // Normal case: whole reflection card fits within one page
    if (fullBoxH <= bottomLimit - topMargin) {
      ensureSpace(fullBoxH + 3.5);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentW, fullBoxH, 2, 2, 'FD');

      let ry = y + 5.8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 58, 95);
      ry = drawLines(doc, titleLines, margin + 4, ry, refTitleLh);
      ry += 1.2;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      drawLines(doc, bodyLines, margin + 4, ry, refBodyLh);

      y += fullBoxH + 4;
    } else {
      // Very long reflection: split cleanly across pages without clipping
      let lineIdx = 0;
      let isFirstChunk = true;
      while (lineIdx < bodyLines.length) {
        if (y + 24 > bottomLimit) {
          doc.addPage();
          y = topMargin;
        }
        const availH = bottomLimit - y;
        const headerNeed = isFirstChunk ? 5.8 + titleLines.length * refTitleLh + 1.2 : 5.8;
        const maxChunkLines = Math.max(
          1,
          Math.floor((availH - headerNeed - 4) / refBodyLh)
        );
        const chunk = bodyLines.slice(lineIdx, lineIdx + maxChunkLines);
        const chunkBoxH = headerNeed + chunk.length * refBodyLh + 3.5;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, contentW, chunkBoxH, 2, 2, 'FD');

        let ry = y + 5.8;
        if (isFirstChunk) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(30, 58, 95);
          ry = drawLines(doc, titleLines, margin + 4, ry, refTitleLh);
          ry += 1.2;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        drawLines(doc, chunk, margin + 4, ry, refBodyLh);

        y += chunkBoxH + 3.5;
        lineIdx += chunk.length;
        isFirstChunk = false;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 7 & 8. Cumulative Frequency Raw Data, Table & Ogive Curve (when present)
  // ---------------------------------------------------------------------------
  if (cumRawValues.length > 0 || cumPoints.length > 0) {
    const safeCumUnit = sanitizePdfText(cumUnit);
    const sortedCumRaw = [...cumRawValues].sort((a, b) => a - b);
    const cumMin = sortedCumRaw.length > 0 ? sortedCumRaw[0] : 0;
    const cumMax = sortedCumRaw.length > 0 ? sortedCumRaw[sortedCumRaw.length - 1] : 0;

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const cumMetaText = sanitizePdfText(
      `Title: ${cumTitle.trim() || cumVariableName.trim() || 'Cumulative Frequency Dataset'}  |  Class Width Type: ${
        cumWidthType === 'unequal' ? 'Unequal' : 'Equal'
      }  |  n = ${cumRawValues.length}${
        sortedCumRaw.length > 0
          ? `  |  Min = ${formatNum(cumMin)}${safeCumUnit ? ` ${safeCumUnit}` : ''}  |  Max = ${formatNum(cumMax)}${safeCumUnit ? ` ${safeCumUnit}` : ''}`
          : ''
      }`
    );
    const wrappedCumMeta = doc.splitTextToSize(cumMetaText, contentW) as string[];
    const cumMetaLh = lineHeightMm(9, 1.3);

    const cumRawLineText =
      sortedCumRaw.length > 0
        ? `Sorted Data: ${sortedCumRaw.map((v) => formatNum(v)).join(', ')}`
        : 'Sorted Data: (No raw values entered)';
    doc.setFontSize(8.3);
    const wrappedCumRaw = doc.splitTextToSize(
      sanitizePdfText(cumRawLineText),
      contentW
    ) as string[];

    ensureSpace(14 + wrappedCumMeta.length * cumMetaLh);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('7. Cumulative Frequency Raw Data & Grouped Table', margin, y);
    y += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    y = drawLines(doc, wrappedCumMeta, margin, y, cumMetaLh);
    y += 1.2;

    doc.setFontSize(8.3);
    doc.setTextColor(71, 85, 105);
    wrappedCumRaw.forEach((line) => {
      ensureSpace(rawLh + 1);
      doc.text(line, margin, y);
      y += rawLh;
    });
    y += 4;

    // 3-Column Cumulative Frequency Table (total = 182mm)
    const cumColWidths = [78, 48, 56];
    const cumHeaders = ['Interval Group', 'Frequency (f)', 'Cumulative Frequency (cf)'];

    const drawCumTableHeader = (continued = false) => {
      if (continued) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        doc.text('7. Cumulative Frequency Table (continued)', margin, y);
        y += 4.5;
      }
      const headerH = 8.5;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin, y, contentW, headerH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(30, 41, 59);
      let cx = margin;
      cumHeaders.forEach((h, idx) => {
        if (idx > 0) {
          doc.setDrawColor(203, 213, 225);
          doc.line(cx, y, cx, y + headerH);
        }
        doc.text(h, cx + cellPadX, y + 5.5);
        cx += cumColWidths[idx];
      });
      y += headerH;
    };

    ensureSpace(16);
    drawCumTableHeader(false);

    if (cumIntervals.length === 0) {
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentW, 8.5, 'S');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(100, 116, 139);
      doc.text('No cumulative class intervals configured yet.', margin + cellPadX, y + 5.5);
      y += 12;
    } else {
      cumIntervals.forEach((iv, idx) => {
        const rowInput = cumTableInputs[iv.id];
        const fb = cumTableFeedback[idx];
        const isLast = idx === cumIntervals.length - 1;
        const cmpOp = isLast ? '<=' : '<';
        const expectedInterval = `${formatNum(iv.lower)} <= x ${cmpOp} ${formatNum(iv.upper)}`;
        const hasInterval = Boolean(
          rowInput?.lowerBound?.trim() || rowInput?.upperBound?.trim()
        );
        const studentInterval = `${rowInput?.lowerBound?.trim() || '?'} <= x ${cmpOp} ${
          rowInput?.upperBound?.trim() || '?'
        }`;

        const rawCells = [
          hasInterval
            ? fb?.interval.status === 'correct'
              ? `${studentInterval} [OK]`
              : `${studentInterval} (Exp: ${expectedInterval})`
            : `- (Exp: ${expectedInterval})`,
          rowInput?.frequency?.trim()
            ? fb?.frequency.status === 'correct'
              ? `${rowInput.frequency.trim()} [OK]`
              : `${rowInput.frequency.trim()} (${iv.trueFrequency})`
            : `- (${iv.trueFrequency})`,
          rowInput?.cumulativeFrequency?.trim()
            ? fb?.cumulativeFrequency.status === 'correct'
              ? `${rowInput.cumulativeFrequency.trim()} [OK]`
              : `${rowInput.cumulativeFrequency.trim()} (${iv.trueCumulativeFrequency})`
            : `- (${iv.trueCumulativeFrequency})`,
        ];

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const wrappedCells = rawCells.map((val, cIdx) =>
          doc.splitTextToSize(sanitizePdfText(val), cumColWidths[cIdx] - cellPadX * 2) as string[]
        );
        const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
        const rowH = Math.max(7.6, maxLines * tableLh + 3.2);

        ensureSpace(rowH, () => drawCumTableHeader(true));

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, contentW, rowH, 'F');
        }
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, contentW, rowH, 'S');

        let cellX = margin;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        wrappedCells.forEach((lines, cIdx) => {
          if (cIdx > 0) {
            doc.setDrawColor(226, 232, 240);
            doc.line(cellX, y, cellX, y + rowH);
          }
          drawLines(doc, lines, cellX + cellPadX, y + 4.7, tableLh);
          cellX += cumColWidths[cIdx];
        });
        y += rowH;
      });
      y += 7;
    }

    // Section 8: Cumulative Frequency Curve SVG -> PNG & Reflection
    ensureSpace(8 + imgH + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text('8. Cumulative Frequency Curve (Ogive)', margin, y);
    y += 4.5;

    const cumSvg = buildCumulativeCurveSvgString(
      cumIntervals,
      cumPoints,
      cumCurveConnected,
      cumCurveFeedback,
      sanitizePdfText(cumVariableName || 'Upper Boundary'),
      safeCumUnit
    );
    const cumPng = await svgToPngDataUrl(cumSvg);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, imgW, imgH);
    doc.addImage(cumPng, 'PNG', margin, y, imgW, imgH);
    y += imgH + 6;

    const accurateCumPts = cumCurveFeedback.filter(
      (f) => f.status === 'accurate' || f.status === 'close'
    ).length;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(51, 65, 85);
    const cumStatusLine = sanitizePdfText(
      `Plotted Points Verified: ${accurateCumPts} / ${cumCurveFeedback.length}  |  Curve Connected: ${
        cumCurveConnected ? 'Yes [OK]' : 'Not yet connected'
      }`
    );
    ensureSpace(14);
    doc.text(cumStatusLine, margin, y);
    y += 6;

    // Cumulative Frequency Quartiles (Q1, Q2, Q3), IQR & General Interpretation Boxes
    const cumAnalysisCards = [
      {
        title: '1. Quartile 1 (Q1 - Lower Quartile, 25% of n)',
        text: cumAnalysis.q1Thought?.trim() || '(No response entered)',
      },
      {
        title: '2. Quartile 2 (Q2 - Median, 50% of n)',
        text: cumAnalysis.q2Thought?.trim() || '(No response entered)',
      },
      {
        title: '3. Quartile 3 (Q3 - Upper Quartile, 75% of n)',
        text: cumAnalysis.q3Thought?.trim() || '(No response entered)',
      },
      {
        title: '4. Interquartile Range (IQR = Q3 - Q1)',
        text: cumAnalysis.iqrThought?.trim() || '(No response entered)',
      },
      {
        title: '5. General Meaning & Real-World Conclusion',
        text: cumReflection.trim() || '(No response entered)',
      },
    ];

    cumAnalysisCards.forEach((card) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const cardTitleLines = doc.splitTextToSize(
        sanitizePdfText(card.title),
        contentW - 8
      ) as string[];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const cardBodyLines = doc.splitTextToSize(
        sanitizePdfText(card.text),
        contentW - 8
      ) as string[];
      const cardBoxH = Math.max(
        16,
        5.5 +
          cardTitleLines.length * refTitleLh +
          1.5 +
          cardBodyLines.length * refBodyLh +
          3.5
      );
      if (cardBoxH <= bottomLimit - topMargin) {
        ensureSpace(cardBoxH + 3.5);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, contentW, cardBoxH, 2, 2, 'FD');

        let cry = y + 5.8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 58, 95);
        cry = drawLines(doc, cardTitleLines, margin + 4, cry, refTitleLh);
        cry += 1.2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        drawLines(doc, cardBodyLines, margin + 4, cry, refBodyLh);
        y += cardBoxH + 3.5;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Page Footer on Every Page
  // ---------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text('IGCSE Mathematics (0580) - Statistical Investigation', margin, pageH - 7.5);
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 7.5, { align: 'right' });
  }

  const safeName =
    identity.mode === 'individual'
      ? identity.individualName.trim() || 'Student'
      : identity.groupName.trim() || 'Group';
  const fileSlug = safeName.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'Report';
  doc.save(`IGCSE-0580-Stats-${fileSlug}.pdf`);
}
