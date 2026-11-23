export type WorkMode = 'individual' | 'group';

export type LabStage = 'data' | 'table' | 'histogram' | 'cum-data' | 'cum-curve';

export type ClassWidthType = 'equal' | 'unequal';

export interface GroupMember {
  id: string;
  name: string;
  role: string;
}

export interface StudentIdentity {
  mode: WorkMode;
  individualName: string;
  groupName: string;
  members: GroupMember[];
  classSection: string;
  date: string;
  topicTitle: string;
}

export interface ClassInterval {
  id: string;
  lower: number;
  upper: number;
  /** True mathematical values computed from raw data */
  trueWidth: number;
  trueMidValue: number;
  trueFrequency: number;
  trueFx: number;
}

export interface StudentTableInputs {
  /** Keyed by ClassInterval.id */
  [intervalId: string]: {
    lowerBound: string;
    upperBound: string;
    classWidth: string;
    midValue: string;
    frequency: string;
    fxProduct: string;
  };
}

export interface StudentSummaryCalculations {
  totalFrequency: string;
  totalFx: string;
  meanWorking: string;
  meanAnswer: string;
  modalClassWorking: string;
  modalClassAnswer: string;
}

export interface CellFeedback {
  status: 'empty' | 'correct' | 'close' | 'incorrect';
  message: string;
  expected: number;
}

export interface IntervalFeedback {
  status: 'empty' | 'correct' | 'incorrect';
  message: string;
  expectedLower: number;
  expectedUpper: number;
}

export interface ModalClassFeedback {
  status: 'empty' | 'correct' | 'incorrect';
  message: string;
  expectedLabels: string[];
}

export interface RowFeedback {
  intervalId: string;
  interval: IntervalFeedback;
  classWidth: CellFeedback;
  midValue: CellFeedback;
  frequency: CellFeedback;
  fxProduct: CellFeedback;
}

export interface SummaryFeedback {
  totalFrequency: CellFeedback;
  totalFx: CellFeedback;
  meanAnswer: CellFeedback;
  modalClassAnswer: ModalClassFeedback;
}

export interface StudentHistogramBar {
  intervalId: string;
  /** Student-plotted frequency height (equal class width histogram) */
  plottedFrequency: number;
}

export interface HistogramBarFeedback {
  intervalId: string;
  label: string;
  status: 'unplotted' | 'accurate' | 'too-high' | 'too-low';
  plottedFrequency: number;
  expectedFrequency: number;
  difference: number;
  guidance: string;
}

export interface StudentHistogramReflection {
  meanThought: string;
  modeThought: string;
  realConditionMeaning: string;
}

// ---------------------------------------------------------------------------
// Stage 04 & 05: Cumulative Frequency Data, Table & Ogive Curve
// ---------------------------------------------------------------------------

export interface CumulativeInterval {
  id: string;
  lower: number;
  upper: number;
  trueWidth: number;
  trueFrequency: number;
  trueCumulativeFrequency: number;
}

export interface StudentCumulativeTableInputs {
  /** Keyed by CumulativeInterval.id */
  [intervalId: string]: {
    lowerBound: string;
    upperBound: string;
    frequency: string;
    cumulativeFrequency: string;
  };
}

export interface CumulativeRowFeedback {
  intervalId: string;
  interval: IntervalFeedback;
  frequency: CellFeedback;
  cumulativeFrequency: CellFeedback;
}

export interface CumulativePoint {
  id: string;
  x: number;
  y: number;
}

export interface CumulativePointFeedback {
  targetIndex: number;
  label: string;
  expectedX: number;
  expectedY: number;
  matchedPointId: string | null;
  plottedX: number | null;
  plottedY: number | null;
  status: 'accurate' | 'close' | 'off' | 'missing';
  guidance: string;
}

export interface StudentCumulativeAnalysis {
  q1Thought: string;
  q2Thought: string;
  q3Thought: string;
  iqrThought: string;
}

export interface GroupProjectState {
  groupName: string;
  members: GroupMember[];
  classSection: string;
  date: string;
  topicTitle: string;
  rawInputText: string;
  variableName: string;
  unit: string;
  startBound: number;
  classWidth: number;
  tableInputs: StudentTableInputs;
  summaryInputs: StudentSummaryCalculations;
  hasCheckedTable: boolean;
  histogramBars: StudentHistogramBar[];
  histogramReflection: StudentHistogramReflection;
  hasCheckedHistogram: boolean;
  // Stage 04 & 05: Cumulative Frequency
  cumTitle: string;
  cumRawInputText: string;
  cumVariableName: string;
  cumUnit: string;
  cumWidthType: ClassWidthType;
  cumStartBound: number;
  cumEqualWidth: number;
  cumUnequalWidths: number[];
  cumTableInputs: StudentCumulativeTableInputs;
  hasCheckedCumTable: boolean;
  cumPoints: CumulativePoint[];
  cumCurveConnected: boolean;
  cumAnalysis: StudentCumulativeAnalysis;
  cumReflection: string;
  hasCheckedCumCurve: boolean;
}

export interface GroupParticipant {
  clientId: string;
  userName: string;
  role: string;
  activeStage: LabStage;
  joinedAt: number;
}

export interface GroupProjectPatch {
  meta?: Partial<
    Pick<
      GroupProjectState,
      'groupName' | 'members' | 'classSection' | 'date' | 'topicTitle'
    >
  >;
  raw?: Partial<
    Pick<
      GroupProjectState,
      'rawInputText' | 'variableName' | 'unit' | 'startBound' | 'classWidth'
    >
  >;
  tableCell?: {
    intervalId: string;
    field:
      | 'lowerBound'
      | 'upperBound'
      | 'classWidth'
      | 'midValue'
      | 'frequency'
      | 'fxProduct';
    value: string;
  };
  tableReset?: boolean;
  summaryField?: {
    field: keyof StudentSummaryCalculations;
    value: string;
  };
  hasCheckedTable?: boolean;
  histogramBar?: {
    intervalId: string;
    plottedFrequency: number;
  };
  histogramReset?: boolean;
  reflectionField?: {
    field: keyof StudentHistogramReflection;
    value: string;
  };
  clearReflections?: boolean;
  hasCheckedHistogram?: boolean;
  clearAllData?: boolean;
  // Stage 04 & 05 patches
  cumRaw?: Partial<
    Pick<
      GroupProjectState,
      | 'cumTitle'
      | 'cumRawInputText'
      | 'cumVariableName'
      | 'cumUnit'
      | 'cumWidthType'
      | 'cumStartBound'
      | 'cumEqualWidth'
      | 'cumUnequalWidths'
    >
  >;
  cumTableCell?: {
    intervalId: string;
    field: 'lowerBound' | 'upperBound' | 'frequency' | 'cumulativeFrequency';
    value: string;
  };
  cumTableReset?: boolean;
  hasCheckedCumTable?: boolean;
  cumPoints?: CumulativePoint[];
  cumCurveConnected?: boolean;
  cumCurveReset?: boolean;
  cumAnalysisField?: {
    field: keyof StudentCumulativeAnalysis;
    value: string;
  };
  clearCumAnalysis?: boolean;
  cumReflection?: string;
  hasCheckedCumCurve?: boolean;
  clearAllCumData?: boolean;
}

export interface GroupRoomState {
  roomCode: string;
  version: number;
  updatedAt: number;
  lastEditedBy: {
    userName: string;
    section: string;
    timestamp: number;
  } | null;
  project: GroupProjectState;
  participants: GroupParticipant[];
}
