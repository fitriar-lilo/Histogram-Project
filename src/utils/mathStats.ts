import {
  CellFeedback,
  ClassInterval,
  CumulativeInterval,
  CumulativePoint,
  CumulativePointFeedback,
  CumulativeRowFeedback,
  HistogramBarFeedback,
  IntervalFeedback,
  ModalClassFeedback,
  RowFeedback,
  StudentCumulativeTableInputs,
  StudentHistogramBar,
  StudentSummaryCalculations,
  StudentTableInputs,
  SummaryFeedback,
} from '../types/statistics';

export function parseNumberList(input: string): { values: number[]; invalidTokens: string[] } {
  const tokens = input
    .split(/[\s,;|\n\t]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const values: number[] = [];
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    const num = Number(token);
    if (Number.isFinite(num)) {
      values.push(num);
    } else {
      invalidTokens.push(token);
    }
  }

  return { values, invalidTokens };
}

export function roundTo(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatNum(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = roundTo(value, maxDecimals);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

export function buildEqualBoundaries(
  rawValues: number[],
  startBound: number,
  classWidth: number
): number[] {
  if (rawValues.length === 0 || !Number.isFinite(classWidth) || classWidth <= 0) return [];
  const start = Number.isFinite(startBound) ? startBound : 0;
  const maxVal = Math.max(...rawValues);

  const bounds: number[] = [roundTo(start, 4)];
  let cur = start;
  let guard = 0;
  // Build equal-width intervals until all data up to maxVal is covered (at least 1 interval)
  while ((cur <= maxVal || bounds.length < 2) && guard < 45) {
    cur = roundTo(cur + classWidth, 4);
    bounds.push(cur);
    guard++;
  }
  return bounds;
}

export function computeIntervals(rawValues: number[], boundaries: number[]): ClassInterval[] {
  const cleanBounds = Array.from(new Set(boundaries.filter((b) => Number.isFinite(b)))).sort((a, b) => a - b);
  if (cleanBounds.length < 2) return [];

  const intervals: ClassInterval[] = [];

  for (let i = 0; i < cleanBounds.length - 1; i++) {
    const lower = cleanBounds[i];
    const upper = cleanBounds[i + 1];
    const width = roundTo(upper - lower, 4);
    const mid = roundTo((lower + upper) / 2, 4);
    const isLast = i === cleanBounds.length - 2;

    // Standard IGCSE continuous grouping: lower <= x < upper (inclusive upper bound on final class)
    const freq = rawValues.filter((val) =>
      isLast ? val >= lower && val <= upper : val >= lower && val < upper
    ).length;

    const fx = roundTo(freq * mid, 4);

    intervals.push({
      id: `class-${lower}-${upper}`,
      lower,
      upper,
      trueWidth: width,
      trueMidValue: mid,
      trueFrequency: freq,
      trueFx: fx,
    });
  }

  return intervals;
}

export function checkCoverage(rawValues: number[], boundaries: number[]): {
  coveredCount: number;
  uncoveredValues: number[];
} {
  const cleanBounds = Array.from(new Set(boundaries.filter((b) => Number.isFinite(b)))).sort((a, b) => a - b);
  if (cleanBounds.length < 2) {
    return {
      coveredCount: 0,
      uncoveredValues: rawValues,
    };
  }
  const minB = cleanBounds[0];
  const maxB = cleanBounds[cleanBounds.length - 1];
  const uncoveredValues = rawValues.filter((v) => v < minB || v > maxB);
  return {
    coveredCount: rawValues.length - uncoveredValues.length,
    uncoveredValues,
  };
}

function evaluateCell(
  rawStr: string,
  expected: number,
  tolerance: number,
  hintCorrect: string,
  hintFormula: string
): CellFeedback {
  const trimmed = rawStr.trim();
  if (!trimmed) {
    return { status: 'empty', message: 'Not yet entered.', expected };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { status: 'incorrect', message: 'Enter a valid number.', expected };
  }
  const diff = Math.abs(parsed - expected);
  if (diff <= 0.005) {
    return { status: 'correct', message: hintCorrect, expected };
  }
  if (diff <= tolerance) {
    return {
      status: 'close',
      message: `Accepted! Exact value is ${formatNum(expected, 2)}.`,
      expected,
    };
  }
  return {
    status: 'incorrect',
    message: hintFormula,
    expected,
  };
}

function evaluateIntervalBounds(
  lowerStr: string,
  upperStr: string,
  expectedLower: number,
  expectedUpper: number,
  isLast: boolean
): IntervalFeedback {
  const lTrim = lowerStr.trim();
  const uTrim = upperStr.trim();
  const expectedNotation = `${formatNum(expectedLower)} ≤ x ${isLast ? '≤' : '<'} ${formatNum(expectedUpper)}`;

  if (!lTrim && !uTrim) {
    return {
      status: 'empty',
      message: 'Enter both lower and upper bounds for this class interval.',
      expectedLower,
      expectedUpper,
    };
  }

  if (!lTrim || !uTrim) {
    return {
      status: 'incorrect',
      message: `Complete both bounds (expected ${expectedNotation}).`,
      expectedLower,
      expectedUpper,
    };
  }

  const parsedLower = Number(lTrim);
  const parsedUpper = Number(uTrim);

  if (!Number.isFinite(parsedLower) || !Number.isFinite(parsedUpper)) {
    return {
      status: 'incorrect',
      message: `Enter valid numeric bounds (expected ${expectedNotation}).`,
      expectedLower,
      expectedUpper,
    };
  }

  if (
    Math.abs(parsedLower - expectedLower) <= 0.005 &&
    Math.abs(parsedUpper - expectedUpper) <= 0.005
  ) {
    return {
      status: 'correct',
      message: 'Interval bounds verified.',
      expectedLower,
      expectedUpper,
    };
  }

  return {
    status: 'incorrect',
    message: `Expected interval is ${expectedNotation}.`,
    expectedLower,
    expectedUpper,
  };
}

export function evaluateTable(
  intervals: ClassInterval[],
  inputs: StudentTableInputs
): RowFeedback[] {
  return intervals.map((interval, idx) => {
    const isLast = idx === intervals.length - 1;
    const row = inputs[interval.id] ?? {
      lowerBound: '',
      upperBound: '',
      classWidth: '',
      midValue: '',
      frequency: '',
      fxProduct: '',
    };

    return {
      intervalId: interval.id,
      interval: evaluateIntervalBounds(
        row.lowerBound,
        row.upperBound,
        interval.lower,
        interval.upper,
        isLast
      ),
      classWidth: evaluateCell(
        row.classWidth,
        interval.trueWidth,
        0.01,
        'Width verified.',
        `Class width = ${formatNum(interval.upper)} − ${formatNum(interval.lower)} = ${formatNum(interval.trueWidth)}.`
      ),
      midValue: evaluateCell(
        row.midValue,
        interval.trueMidValue,
        0.01,
        'Mid-value verified.',
        `Mid-value = (${formatNum(interval.lower)} + ${formatNum(interval.upper)}) ÷ 2 = ${formatNum(interval.trueMidValue)}.`
      ),
      frequency: evaluateCell(
        row.frequency,
        interval.trueFrequency,
        0,
        'Count verified.',
        `Count all raw values where ${formatNum(interval.lower)} ≤ x ${isLast ? '≤' : '<'} ${formatNum(interval.upper)} (expected ${interval.trueFrequency}).`
      ),
      fxProduct: evaluateCell(
        row.fxProduct,
        interval.trueFx,
        0.05,
        'Product verified.',
        `f × Mid-value = ${interval.trueFrequency} × ${formatNum(interval.trueMidValue)} = ${formatNum(interval.trueFx)}.`
      ),
    };
  });
}

export function getTrueTableTotals(intervals: ClassInterval[]): {
  totalFrequency: number;
  totalFx: number;
  estimatedMean: number;
  modalIntervals: ClassInterval[];
} {
  const totalFrequency = intervals.reduce((sum, iv) => sum + iv.trueFrequency, 0);
  const totalFx = roundTo(
    intervals.reduce((sum, iv) => sum + iv.trueFx, 0),
    4
  );
  const estimatedMean = totalFrequency > 0 ? roundTo(totalFx / totalFrequency, 4) : 0;

  const maxFreq = Math.max(0, ...intervals.map((iv) => iv.trueFrequency));
  const modalIntervals =
    maxFreq > 0 ? intervals.filter((iv) => iv.trueFrequency === maxFreq) : [];

  return { totalFrequency, totalFx, estimatedMean, modalIntervals };
}

function evaluateModalClassInput(
  rawStr: string,
  modalIntervals: ClassInterval[],
  intervals: ClassInterval[]
): ModalClassFeedback {
  const expectedLabels = modalIntervals.map((iv) => {
    const isLast = intervals[intervals.length - 1]?.id === iv.id;
    return `${formatNum(iv.lower)} ≤ x ${isLast ? '≤' : '<'} ${formatNum(iv.upper)}`;
  });

  const trimmed = rawStr.trim();
  if (!trimmed) {
    return {
      status: 'empty',
      message: 'Enter the modal class interval (the class with the highest frequency).',
      expectedLabels,
    };
  }

  const nums = (trimmed.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  if (nums.length >= 2) {
    const a = nums[0];
    const b = nums[1];
    const matched = modalIntervals.some(
      (iv) => Math.abs(iv.lower - a) < 0.01 && Math.abs(iv.upper - b) < 0.01
    );
    if (matched) {
      return {
        status: 'correct',
        message: 'Modal class verified (highest frequency class).',
        expectedLabels,
      };
    }
  }

  return {
    status: 'incorrect',
    message: `Look for the class interval with the highest frequency (${modalIntervals[0]?.trueFrequency ?? 0}): ${expectedLabels.join(' or ')}.`,
    expectedLabels,
  };
}

export function evaluateSummaryCalculations(
  intervals: ClassInterval[],
  summary: StudentSummaryCalculations
): SummaryFeedback {
  const { totalFrequency, totalFx, estimatedMean, modalIntervals } =
    getTrueTableTotals(intervals);

  return {
    totalFrequency: evaluateCell(
      summary.totalFrequency,
      totalFrequency,
      0,
      'Total frequency verified.',
      `Sum all frequencies in the column: Total f = ${totalFrequency}.`
    ),
    totalFx: evaluateCell(
      summary.totalFx,
      totalFx,
      0.1,
      'Total (f × Mid-value) verified.',
      `Sum all (f × Mid-value) entries: Σfx = ${formatNum(totalFx, 2)}.`
    ),
    meanAnswer: evaluateCell(
      summary.meanAnswer,
      estimatedMean,
      0.1,
      'Estimated mean verified.',
      `Estimated Mean = Σfx ÷ Σf = ${formatNum(totalFx, 2)} ÷ ${totalFrequency} = ${formatNum(estimatedMean, 2)}.`
    ),
    modalClassAnswer: evaluateModalClassInput(
      summary.modalClassAnswer,
      modalIntervals,
      intervals
    ),
  };
}

export function evaluateHistogram(
  intervals: ClassInterval[],
  bars: StudentHistogramBar[]
): HistogramBarFeedback[] {
  return intervals.map((interval, idx) => {
    const found = bars.find((b) => b.intervalId === interval.id);
    const plottedFrequency = found ? roundTo(found.plottedFrequency, 1) : 0;
    const expectedFrequency = interval.trueFrequency;
    const diff = roundTo(plottedFrequency - expectedFrequency, 1);
    const label = `${formatNum(interval.lower)} ≤ x < ${formatNum(interval.upper)}`;

    if (!found || plottedFrequency <= 0.001) {
      return {
        intervalId: interval.id,
        label,
        status: expectedFrequency === 0 ? 'accurate' : 'unplotted',
        plottedFrequency,
        expectedFrequency,
        difference: diff,
        guidance:
          expectedFrequency === 0
            ? `Class ${idx + 1} (${label}) has frequency 0, so bar height is 0.`
            : `Class ${idx + 1} (${label}): Drag this bar up to Frequency = ${expectedFrequency}.`,
      };
    }

    if (Math.abs(diff) <= 0.25) {
      return {
        intervalId: interval.id,
        label,
        status: 'accurate',
        plottedFrequency,
        expectedFrequency,
        difference: diff,
        guidance: `Class ${idx + 1} (${label}): Accurate! Plotted Frequency = ${expectedFrequency}.`,
      };
    }

    if (diff > 0) {
      return {
        intervalId: interval.id,
        label,
        status: 'too-high',
        plottedFrequency,
        expectedFrequency,
        difference: diff,
        guidance: `Class ${idx + 1} (${label}): Too high by ${formatNum(Math.abs(diff), 1)}. Lower from ${formatNum(plottedFrequency, 1)} to ${expectedFrequency}.`,
      };
    }

    return {
      intervalId: interval.id,
      label,
      status: 'too-low',
      plottedFrequency,
      expectedFrequency,
      difference: diff,
      guidance: `Class ${idx + 1} (${label}): Too low by ${formatNum(Math.abs(diff), 1)}. Raise from ${formatNum(plottedFrequency, 1)} to ${expectedFrequency}.`,
    };
  });
}

export function niceAxisMax(val: number, steps = 5): number {
  if (val <= 0) return 5;
  const roughStep = val / steps;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  let niceNormalized = 1;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 2.5) niceNormalized = 2.5;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;
  return niceNormalized * magnitude * steps;
}

// ---------------------------------------------------------------------------
// Stage 04 & 05: Cumulative Frequency Helpers & Monotone Ogive Curve Path
// ---------------------------------------------------------------------------

export function buildUnequalBoundaries(
  startBound: number,
  classWidths: number[]
): number[] {
  const start = Number.isFinite(startBound) ? startBound : 0;
  const bounds: number[] = [roundTo(start, 4)];
  let cur = start;
  for (const w of classWidths) {
    if (Number.isFinite(w) && w > 0) {
      cur = roundTo(cur + w, 4);
      bounds.push(cur);
    }
  }
  return bounds;
}

export function computeCumulativeIntervals(
  rawValues: number[],
  boundaries: number[]
): CumulativeInterval[] {
  const cleanBounds = Array.from(
    new Set(boundaries.filter((b) => Number.isFinite(b)))
  ).sort((a, b) => a - b);
  if (cleanBounds.length < 2) return [];

  const intervals: CumulativeInterval[] = [];
  let runningCf = 0;

  for (let i = 0; i < cleanBounds.length - 1; i++) {
    const lower = cleanBounds[i];
    const upper = cleanBounds[i + 1];
    const width = roundTo(upper - lower, 4);
    const isLast = i === cleanBounds.length - 2;

    const freq = rawValues.filter((val) =>
      isLast ? val >= lower && val <= upper : val >= lower && val < upper
    ).length;

    runningCf += freq;

    intervals.push({
      id: `cum-${i}-${lower}-${upper}`,
      lower,
      upper,
      trueWidth: width,
      trueFrequency: freq,
      trueCumulativeFrequency: runningCf,
    });
  }

  return intervals;
}

export function evaluateCumulativeTable(
  intervals: CumulativeInterval[],
  inputs: StudentCumulativeTableInputs
): CumulativeRowFeedback[] {
  return intervals.map((interval, idx) => {
    const isLast = idx === intervals.length - 1;
    const prevCf = idx > 0 ? intervals[idx - 1].trueCumulativeFrequency : 0;
    const row = inputs[interval.id] ?? {
      lowerBound: '',
      upperBound: '',
      frequency: '',
      cumulativeFrequency: '',
    };

    return {
      intervalId: interval.id,
      interval: evaluateIntervalBounds(
        row.lowerBound,
        row.upperBound,
        interval.lower,
        interval.upper,
        isLast
      ),
      frequency: evaluateCell(
        row.frequency,
        interval.trueFrequency,
        0,
        'Frequency verified.',
        `Count all raw values where ${formatNum(interval.lower)} ≤ x ${isLast ? '≤' : '<'} ${formatNum(interval.upper)} (expected ${interval.trueFrequency}).`
      ),
      cumulativeFrequency: evaluateCell(
        row.cumulativeFrequency,
        interval.trueCumulativeFrequency,
        0,
        'Cumulative frequency verified.',
        `Running total: ${prevCf} + ${interval.trueFrequency} = ${interval.trueCumulativeFrequency}.`
      ),
    };
  });
}

export function evaluateCumulativeCurve(
  intervals: CumulativeInterval[],
  points: CumulativePoint[]
): CumulativePointFeedback[] {
  if (intervals.length === 0) return [];

  const minX = intervals[0].lower;
  const maxX = intervals[intervals.length - 1].upper;
  const totalSpan = Math.max(1, maxX - minX);
  const totalN = Math.max(
    1,
    intervals[intervals.length - 1].trueCumulativeFrequency
  );

  const tolX = Math.max(0.4, totalSpan * 0.025);
  const tolY = Math.max(0.5, totalN * 0.035);

  const targets: { label: string; expectedX: number; expectedY: number }[] = [
    {
      label: `Start (${formatNum(minX)}, 0)`,
      expectedX: minX,
      expectedY: 0,
    },
    ...intervals.map((iv) => ({
      label: `Upper (${formatNum(iv.upper)}, ${iv.trueCumulativeFrequency})`,
      expectedX: iv.upper,
      expectedY: iv.trueCumulativeFrequency,
    })),
  ];

  const usedIds = new Set<string>();

  return targets.map((target, targetIndex) => {
    let bestPoint: CumulativePoint | null = null;
    let bestNormDist = Infinity;

    for (const pt of points) {
      if (usedIds.has(pt.id)) continue;
      const dx = Math.abs(pt.x - target.expectedX) / totalSpan;
      const dy = Math.abs(pt.y - target.expectedY) / totalN;
      const dist = Math.hypot(dx, dy);
      if (dist < bestNormDist) {
        bestNormDist = dist;
        bestPoint = pt;
      }
    }

    if (!bestPoint || Math.abs(bestPoint.x - target.expectedX) > totalSpan * 0.25) {
      return {
        targetIndex,
        label: target.label,
        expectedX: target.expectedX,
        expectedY: target.expectedY,
        matchedPointId: null,
        plottedX: null,
        plottedY: null,
        status: 'missing',
        guidance: `Plot a point at (${formatNum(target.expectedX)}, ${target.expectedY}).`,
      };
    }

    usedIds.add(bestPoint.id);
    const errX = Math.abs(bestPoint.x - target.expectedX);
    const errY = Math.abs(bestPoint.y - target.expectedY);

    if (errX <= 0.15 && errY <= 0.25) {
      return {
        targetIndex,
        label: target.label,
        expectedX: target.expectedX,
        expectedY: target.expectedY,
        matchedPointId: bestPoint.id,
        plottedX: bestPoint.x,
        plottedY: bestPoint.y,
        status: 'accurate',
        guidance: `Point (${formatNum(target.expectedX)}, ${target.expectedY}) plotted accurately.`,
      };
    }

    if (errX <= tolX && errY <= tolY) {
      return {
        targetIndex,
        label: target.label,
        expectedX: target.expectedX,
        expectedY: target.expectedY,
        matchedPointId: bestPoint.id,
        plottedX: bestPoint.x,
        plottedY: bestPoint.y,
        status: 'close',
        guidance: `Close! Plotted (${formatNum(bestPoint.x, 1)}, ${formatNum(bestPoint.y, 1)}); exact is (${formatNum(target.expectedX)}, ${target.expectedY}).`,
      };
    }

    return {
      targetIndex,
      label: target.label,
      expectedX: target.expectedX,
      expectedY: target.expectedY,
      matchedPointId: bestPoint.id,
      plottedX: bestPoint.x,
      plottedY: bestPoint.y,
      status: 'off',
      guidance: `Plotted (${formatNum(bestPoint.x, 1)}, ${formatNum(bestPoint.y, 1)}); adjust to (${formatNum(target.expectedX)}, ${target.expectedY}).`,
    };
  });
}

/**
 * Generates a C2-smooth natural cubic spline SVG path through sorted pixel points,
 * with monotonicity clamping so cumulative frequency curves flow smoothly without
 * kinks at knots or unnatural overshoots/dips.
 */
export function buildSmoothOgivePath(
  pointsPx: { x: number; y: number }[]
): string {
  if (pointsPx.length === 0) return '';
  const pts = [...pointsPx].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`;
  }

  const n = pts.length;
  const dx: number[] = [];
  const slopes: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    const h = Math.max(1e-2, pts[i + 1].x - pts[i].x);
    const d = pts[i + 1].y - pts[i].y;
    dx.push(h);
    slopes.push(d / h);
  }

  // Solve tridiagonal system for C2 natural cubic spline knot slopes (M_0 = M_{n-1} = 0)
  const a = new Array(n).fill(0);
  const b = new Array(n).fill(0);
  const c = new Array(n).fill(0);
  const rhs = new Array(n).fill(0);

  b[0] = 2;
  c[0] = 1;
  rhs[0] = 3 * slopes[0];

  for (let i = 1; i < n - 1; i++) {
    const invPrev = 1 / dx[i - 1];
    const invNext = 1 / dx[i];
    a[i] = invPrev;
    b[i] = 2 * (invPrev + invNext);
    c[i] = invNext;
    rhs[i] = 3 * (slopes[i - 1] * invPrev + slopes[i] * invNext);
  }

  a[n - 1] = 1;
  b[n - 1] = 2;
  rhs[n - 1] = 3 * slopes[n - 2];

  for (let i = 1; i < n; i++) {
    const factor = a[i] / b[i - 1];
    b[i] -= factor * c[i - 1];
    rhs[i] -= factor * rhs[i - 1];
  }

  const tangents: number[] = new Array(n).fill(0);
  tangents[n - 1] = rhs[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    tangents[i] = (rhs[i] - c[i] * tangents[i + 1]) / b[i];
  }

  // Preserve monotonicity when adjacent segments flatten or change direction
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0 || tangents[i] * slopes[i] <= 0) {
      tangents[i] = 0;
    }
  }
  if (tangents[0] * slopes[0] <= 0) tangents[0] = 0;
  if (tangents[n - 1] * slopes[n - 2] <= 0) tangents[n - 1] = 0;

  // Fritsch-Carlson radius-3 clamp prevents local overshoot on steep/flat transitions
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slopes[i]) < 1e-6) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / slopes[i];
      const beta = tangents[i + 1] / slopes[i];
      const mag = Math.hypot(alpha, beta);
      if (mag > 3) {
        const scale = 3 / mag;
        tangents[i] = scale * alpha * slopes[i];
        tangents[i + 1] = scale * beta * slopes[i];
      }
    }
  }

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1].x - pts[i].x;
    const cp1x = pts[i].x + h / 3;
    const cp1y = pts[i].y + (tangents[i] * h) / 3;
    const cp2x = pts[i + 1].x - h / 3;
    const cp2y = pts[i + 1].y - (tangents[i + 1] * h) / 3;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${pts[i + 1].x.toFixed(2)} ${pts[i + 1].y.toFixed(2)}`;
  }

  return d;
}

