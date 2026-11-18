import {
  CellFeedback,
  ClassInterval,
  HistogramBarFeedback,
  IntervalFeedback,
  ModalClassFeedback,
  RowFeedback,
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
