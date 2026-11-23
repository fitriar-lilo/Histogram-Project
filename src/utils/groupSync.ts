import type {
  GroupProjectPatch,
  GroupProjectState,
} from '../types/statistics.ts';

export function createEmptyGroupProject(): GroupProjectState {
  return {
    groupName: '',
    members: [
      { id: 'member-1', name: '', role: 'Data & Class Widths' },
      { id: 'member-2', name: '', role: 'Frequency & Mid-Value Table' },
      { id: 'member-3', name: '', role: 'Mean & Modal Class' },
      { id: 'member-4', name: '', role: 'Histogram Builder' },
    ],
    classSection: '',
    date: new Date().toISOString().slice(0, 10),
    topicTitle: '',
    rawInputText: '',
    variableName: '',
    unit: '',
    startBound: 0,
    classWidth: 5,
    tableInputs: {},
    summaryInputs: {
      totalFrequency: '',
      totalFx: '',
      meanWorking: '',
      meanAnswer: '',
      modalClassWorking: '',
      modalClassAnswer: '',
    },
    hasCheckedTable: false,
    histogramBars: [],
    histogramReflection: {
      meanThought: '',
      modeThought: '',
      realConditionMeaning: '',
    },
    hasCheckedHistogram: false,
    cumTitle: '',
    cumRawInputText: '',
    cumVariableName: '',
    cumUnit: '',
    cumWidthType: 'equal',
    cumStartBound: 0,
    cumEqualWidth: 10,
    cumUnequalWidths: [10, 5, 5, 10, 20],
    cumTableInputs: {},
    hasCheckedCumTable: false,
    cumPoints: [],
    cumCurveConnected: false,
    cumAnalysis: {
      q1Thought: '',
      q2Thought: '',
      q3Thought: '',
      iqrThought: '',
    },
    cumReflection: '',
    hasCheckedCumCurve: false,
  };
}

export function applyProjectPatch(
  prev: GroupProjectState,
  patch: GroupProjectPatch
): GroupProjectState {
  let next: GroupProjectState = { ...prev };

  if (patch.clearAllData) {
    next = {
      ...next,
      topicTitle: '',
      rawInputText: '',
      variableName: '',
      unit: '',
      startBound: 0,
      classWidth: 5,
      tableInputs: {},
      summaryInputs: {
        totalFrequency: '',
        totalFx: '',
        meanWorking: '',
        meanAnswer: '',
        modalClassWorking: '',
        modalClassAnswer: '',
      },
      hasCheckedTable: false,
      histogramBars: [],
      histogramReflection: {
        meanThought: '',
        modeThought: '',
        realConditionMeaning: '',
      },
      hasCheckedHistogram: false,
    };
  }

  if (patch.meta) {
    next = {
      ...next,
      ...patch.meta,
    };
  }

  if (patch.raw) {
    const rawChanged =
      (patch.raw.rawInputText !== undefined &&
        patch.raw.rawInputText !== prev.rawInputText) ||
      (patch.raw.startBound !== undefined &&
        patch.raw.startBound !== prev.startBound) ||
      (patch.raw.classWidth !== undefined &&
        patch.raw.classWidth !== prev.classWidth);

    next = {
      ...next,
      ...patch.raw,
      ...(rawChanged
        ? { hasCheckedTable: false, hasCheckedHistogram: false }
        : {}),
    };
  }

  if (patch.tableReset) {
    next = {
      ...next,
      tableInputs: {},
      summaryInputs: {
        totalFrequency: '',
        totalFx: '',
        meanWorking: '',
        meanAnswer: '',
        modalClassWorking: '',
        modalClassAnswer: '',
      },
      hasCheckedTable: false,
    };
  }

  if (patch.tableCell) {
    const { intervalId, field, value } = patch.tableCell;
    const existingRow = next.tableInputs[intervalId] ?? {
      lowerBound: '',
      upperBound: '',
      classWidth: '',
      midValue: '',
      frequency: '',
      fxProduct: '',
    };
    next = {
      ...next,
      tableInputs: {
        ...next.tableInputs,
        [intervalId]: {
          ...existingRow,
          [field]: value,
        },
      },
    };
  }

  if (patch.summaryField) {
    const { field, value } = patch.summaryField;
    next = {
      ...next,
      summaryInputs: {
        ...next.summaryInputs,
        [field]: value,
      },
    };
  }

  if (typeof patch.hasCheckedTable === 'boolean') {
    next = {
      ...next,
      hasCheckedTable: patch.hasCheckedTable,
    };
  }

  if (patch.histogramReset) {
    next = {
      ...next,
      histogramBars: [],
      hasCheckedHistogram: false,
    };
  }

  if (patch.histogramBar) {
    const { intervalId, plottedFrequency } = patch.histogramBar;
    const exists = next.histogramBars.some((b) => b.intervalId === intervalId);
    next = {
      ...next,
      histogramBars: exists
        ? next.histogramBars.map((b) =>
            b.intervalId === intervalId ? { ...b, plottedFrequency } : b
          )
        : [...next.histogramBars, { intervalId, plottedFrequency }],
    };
  }

  if (typeof patch.hasCheckedHistogram === 'boolean') {
    next = {
      ...next,
      hasCheckedHistogram: patch.hasCheckedHistogram,
    };
  }

  if (patch.clearReflections) {
    next = {
      ...next,
      histogramReflection: {
        meanThought: '',
        modeThought: '',
        realConditionMeaning: '',
      },
    };
  }

  if (patch.reflectionField) {
    const { field, value } = patch.reflectionField;
    next = {
      ...next,
      histogramReflection: {
        ...next.histogramReflection,
        [field]: value,
      },
    };
  }

  // Stage 04 & 05: Cumulative Frequency Patches
  if (patch.clearAllCumData) {
    next = {
      ...next,
      cumTitle: '',
      cumRawInputText: '',
      cumVariableName: '',
      cumUnit: '',
      cumWidthType: 'equal',
      cumStartBound: 0,
      cumEqualWidth: 10,
      cumUnequalWidths: [10, 5, 5, 10, 20],
      cumTableInputs: {},
      hasCheckedCumTable: false,
      cumPoints: [],
      cumCurveConnected: false,
      cumAnalysis: {
        q1Thought: '',
        q2Thought: '',
        q3Thought: '',
        iqrThought: '',
      },
      cumReflection: '',
      hasCheckedCumCurve: false,
    };
  }

  if (patch.cumRaw) {
    const cumConfigChanged =
      (patch.cumRaw.cumRawInputText !== undefined &&
        patch.cumRaw.cumRawInputText !== prev.cumRawInputText) ||
      (patch.cumRaw.cumWidthType !== undefined &&
        patch.cumRaw.cumWidthType !== prev.cumWidthType) ||
      (patch.cumRaw.cumStartBound !== undefined &&
        patch.cumRaw.cumStartBound !== prev.cumStartBound) ||
      (patch.cumRaw.cumEqualWidth !== undefined &&
        patch.cumRaw.cumEqualWidth !== prev.cumEqualWidth) ||
      patch.cumRaw.cumUnequalWidths !== undefined;

    next = {
      ...next,
      ...patch.cumRaw,
      ...(cumConfigChanged
        ? { hasCheckedCumTable: false, hasCheckedCumCurve: false }
        : {}),
    };
  }

  if (patch.cumTableReset) {
    next = {
      ...next,
      cumTableInputs: {},
      hasCheckedCumTable: false,
    };
  }

  if (patch.cumTableCell) {
    const { intervalId, field, value } = patch.cumTableCell;
    const existingRow = next.cumTableInputs[intervalId] ?? {
      lowerBound: '',
      upperBound: '',
      frequency: '',
      cumulativeFrequency: '',
    };
    next = {
      ...next,
      cumTableInputs: {
        ...next.cumTableInputs,
        [intervalId]: {
          ...existingRow,
          [field]: value,
        },
      },
    };
  }

  if (typeof patch.hasCheckedCumTable === 'boolean') {
    next = {
      ...next,
      hasCheckedCumTable: patch.hasCheckedCumTable,
    };
  }

  if (patch.cumCurveReset) {
    next = {
      ...next,
      cumPoints: [],
      cumCurveConnected: false,
      hasCheckedCumCurve: false,
    };
  }

  if (Array.isArray(patch.cumPoints)) {
    next = {
      ...next,
      cumPoints: patch.cumPoints,
    };
  }

  if (typeof patch.cumCurveConnected === 'boolean') {
    next = {
      ...next,
      cumCurveConnected: patch.cumCurveConnected,
    };
  }

  if (patch.clearCumAnalysis) {
    next = {
      ...next,
      cumAnalysis: {
        q1Thought: '',
        q2Thought: '',
        q3Thought: '',
        iqrThought: '',
      },
      cumReflection: '',
    };
  }

  if (patch.cumAnalysisField) {
    const { field, value } = patch.cumAnalysisField;
    const prevAnalysis = next.cumAnalysis ?? {
      q1Thought: '',
      q2Thought: '',
      q3Thought: '',
      iqrThought: '',
    };
    next = {
      ...next,
      cumAnalysis: {
        ...prevAnalysis,
        [field]: value,
      },
    };
  }

  if (typeof patch.cumReflection === 'string') {
    next = {
      ...next,
      cumReflection: patch.cumReflection,
    };
  }

  if (typeof patch.hasCheckedCumCurve === 'boolean') {
    next = {
      ...next,
      hasCheckedCumCurve: patch.hasCheckedCumCurve,
    };
  }

  return next;
}

export function describePatchSection(patch: GroupProjectPatch): string {
  if (patch.clearAllData) return 'Cleared Project Data';
  if (patch.clearAllCumData) return 'Cleared Cumulative Data';
  if (patch.meta) return 'Group Details';
  if (patch.raw) return 'Stage 01 · Raw Data & Width';
  if (patch.tableCell || patch.tableReset || patch.hasCheckedTable !== undefined) {
    return 'Stage 02 · Frequency Table';
  }
  if (patch.summaryField) return 'Stage 02 · Totals, Mean & Mode';
  if (patch.histogramBar || patch.histogramReset || patch.hasCheckedHistogram !== undefined) {
    return 'Stage 03 · Histogram';
  }
  if (patch.reflectionField || patch.clearReflections) {
    return 'Stage 03 · Written Reflection';
  }
  if (
    patch.cumRaw ||
    patch.cumTableCell ||
    patch.cumTableReset ||
    patch.hasCheckedCumTable !== undefined
  ) {
    return 'Stage 04 · Cumulative Data & Table';
  }
  if (
    patch.cumPoints ||
    patch.cumCurveConnected !== undefined ||
    patch.cumCurveReset ||
    patch.cumAnalysisField ||
    patch.clearCumAnalysis ||
    patch.cumReflection !== undefined ||
    patch.hasCheckedCumCurve !== undefined
  ) {
    return 'Stage 05 · Cumulative Curve & Quartiles';
  }
  return 'Project Update';
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateGroupCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function ensureMemberInRoster(
  project: GroupProjectState,
  userName: string,
  role: string
): GroupProjectState {
  const trimmedName = userName.trim();
  if (!trimmedName) return project;

  const existingIdx = project.members.findIndex(
    (m) => m.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );

  if (existingIdx >= 0) {
    if (role && project.members[existingIdx].role !== role) {
      const updated = [...project.members];
      updated[existingIdx] = { ...updated[existingIdx], role };
      return { ...project, members: updated };
    }
    return project;
  }

  const emptySlotIdx = project.members.findIndex((m) => !m.name.trim());
  if (emptySlotIdx >= 0) {
    const updated = [...project.members];
    updated[emptySlotIdx] = {
      ...updated[emptySlotIdx],
      name: trimmedName,
      role: role || updated[emptySlotIdx].role,
    };
    return { ...project, members: updated };
  }

  return {
    ...project,
    members: [
      ...project.members,
      {
        id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmedName,
        role: role || 'Collaborator',
      },
    ],
  };
}

