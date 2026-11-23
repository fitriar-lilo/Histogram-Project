/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage1RawData } from './components/Stage1RawData';
import { Stage2FrequencyTable } from './components/Stage2FrequencyTable';
import { Stage3HistogramBuilder } from './components/Stage3HistogramBuilder';
import { Stage4CumulativeDataTable } from './components/Stage4CumulativeDataTable';
import { Stage5CumulativeCurve } from './components/Stage5CumulativeCurve';
import { StudentInfoBar } from './components/StudentInfoBar';
import { TopBar } from './components/TopBar';
import { normalizeCodeInput, useGroupSession } from './hooks/useGroupSession';
import type {
  CumulativePoint,
  GroupParticipant,
  GroupProjectPatch,
  GroupProjectState,
  GroupRoomState,
  LabStage,
  StudentHistogramReflection,
  StudentIdentity,
  StudentSummaryCalculations,
  WorkMode,
} from './types/statistics';
import { applyProjectPatch, createEmptyGroupProject } from './utils/groupSync';
import {
  buildEqualBoundaries,
  buildUnequalBoundaries,
  computeCumulativeIntervals,
  computeIntervals,
  evaluateCumulativeCurve,
  evaluateCumulativeTable,
  evaluateHistogram,
  evaluateSummaryCalculations,
  evaluateTable,
  parseNumberList,
} from './utils/mathStats';
import { exportStatisticsPdf } from './utils/pdfExport';

const STAGES: { id: LabStage; step: string; title: string }[] = [
  { id: 'data', step: '01.', title: 'Raw Data & Equal Width' },
  { id: 'table', step: '02.', title: 'Frequency Table, Mean & Mode' },
  { id: 'histogram', step: '03.', title: 'Manual Histogram & PDF' },
  { id: 'cum-data', step: '04.', title: 'Cumulative Data & Table' },
  { id: 'cum-curve', step: '05.', title: 'Cumulative Frequency Curve' },
];

export default function App() {
  const [activeStage, setActiveStage] = useState<LabStage>('data');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [initialJoinCode] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('code');
      if (fromUrl) return normalizeCodeInput(fromUrl);
      const fromSession = window.sessionStorage.getItem('igcse_stats_room_code');
      return fromSession ? normalizeCodeInput(fromSession) : '';
    } catch {
      return '';
    }
  });

  const [mode, setMode] = useState<WorkMode>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('code');
      return fromUrl && normalizeCodeInput(fromUrl).length >= 4 ? 'group' : 'individual';
    } catch {
      return 'individual';
    }
  });
  const [individualName, setIndividualName] = useState<string>('');
  const [project, setProject] = useState<GroupProjectState>(() =>
    createEmptyGroupProject()
  );

  const handleFullSync = useCallback((room: GroupRoomState) => {
    setProject(room.project);
  }, []);

  const handleRemotePatch = useCallback((patch: GroupProjectPatch) => {
    setProject((prev) => applyProjectPatch(prev, patch));
  }, []);

  const handlePresenceUpdated = useCallback(
    (_participants: GroupParticipant[], members?: GroupProjectState['members']) => {
      if (Array.isArray(members)) {
        setProject((prev) => ({ ...prev, members }));
      }
    },
    []
  );

  const groupSession = useGroupSession({
    activeStage,
    onFullSync: handleFullSync,
    onRemotePatch: handleRemotePatch,
    onPresenceUpdated: handlePresenceUpdated,
  });

  const { joinRoom: joinGroupSessionRoom, roomCode: activeRoomCode } = groupSession;

  // Auto-join if opened with ?code=XXXX or returning to an active session in this tab
  const didAutoJoinRef = useRef(false);
  useEffect(() => {
    if (didAutoJoinRef.current) return;
    didAutoJoinRef.current = true;
    if (initialJoinCode.length >= 4) {
      setMode('group');
      void joinGroupSessionRoom(initialJoinCode);
    }
  }, [joinGroupSessionRoom, initialJoinCode]);

  // Keep ?code= in the address bar synced while connected so sharing URL or refreshing works seamlessly
  useEffect(() => {
    if (!activeRoomCode) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('code') !== activeRoomCode) {
        url.searchParams.set('code', activeRoomCode);
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // Ignore history errors
    }
  }, [activeRoomCode]);

  // Throttle continuous histogram bar drag patches while keeping local UI instant
  const barThrottleRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    latestPatch: GroupProjectPatch | null;
  }>({ timer: null, latestPatch: null });

  const applyLocalPatch = useCallback(
    (patch: GroupProjectPatch, throttleBar = false) => {
      setProject((prev) => applyProjectPatch(prev, patch));

      if (mode !== 'group' || !groupSession.roomCode) return;

      if (throttleBar && patch.histogramBar) {
        barThrottleRef.current.latestPatch = patch;
        if (!barThrottleRef.current.timer) {
          groupSession.sendPatch(patch);
          barThrottleRef.current.latestPatch = null;
          barThrottleRef.current.timer = setTimeout(() => {
            barThrottleRef.current.timer = null;
            if (barThrottleRef.current.latestPatch) {
              groupSession.sendPatch(barThrottleRef.current.latestPatch);
              barThrottleRef.current.latestPatch = null;
            }
          }, 70);
        }
        return;
      }

      groupSession.sendPatch(patch);
    },
    [groupSession, mode]
  );

  const identity: StudentIdentity = useMemo(
    () => ({
      mode,
      individualName,
      groupName: project.groupName,
      members: project.members,
      classSection: project.classSection,
      date: project.date,
      topicTitle: project.topicTitle,
    }),
    [mode, individualName, project]
  );

  const handleIdentityChange = (updated: StudentIdentity) => {
    if (updated.mode !== mode) {
      if (updated.mode === 'individual' && groupSession.roomCode) {
        groupSession.leaveRoom();
      }
      setMode(updated.mode);
    }
    if (updated.individualName !== individualName) {
      setIndividualName(updated.individualName);
    }

    const metaPatch: GroupProjectPatch['meta'] = {};
    if (updated.groupName !== project.groupName) metaPatch.groupName = updated.groupName;
    if (updated.members !== project.members) metaPatch.members = updated.members;
    if (updated.classSection !== project.classSection)
      metaPatch.classSection = updated.classSection;
    if (updated.date !== project.date) metaPatch.date = updated.date;
    if (updated.topicTitle !== project.topicTitle) metaPatch.topicTitle = updated.topicTitle;

    if (Object.keys(metaPatch).length > 0) {
      applyLocalPatch({ meta: metaPatch });
    }
  };

  const rawValues = useMemo(
    () => parseNumberList(project.rawInputText).values,
    [project.rawInputText]
  );

  const boundaries = useMemo(
    () => buildEqualBoundaries(rawValues, project.startBound, project.classWidth),
    [rawValues, project.startBound, project.classWidth]
  );

  const intervals = useMemo(
    () => computeIntervals(rawValues, boundaries),
    [rawValues, boundaries]
  );

  const tableFeedback = useMemo(
    () => evaluateTable(intervals, project.tableInputs),
    [intervals, project.tableInputs]
  );

  const summaryFeedback = useMemo(
    () => evaluateSummaryCalculations(intervals, project.summaryInputs),
    [intervals, project.summaryInputs]
  );

  const histogramFeedback = useMemo(
    () => evaluateHistogram(intervals, project.histogramBars),
    [intervals, project.histogramBars]
  );

  // Stage 04 & 05: Cumulative Frequency computations (with defensive defaults for older rooms)
  const cumWidthType = project.cumWidthType ?? 'equal';
  const cumStartBound = project.cumStartBound ?? 0;
  const cumEqualWidth = project.cumEqualWidth ?? 10;
  const cumUnequalWidths = useMemo(
    () => project.cumUnequalWidths ?? [10, 5, 5, 10, 20],
    [project.cumUnequalWidths]
  );
  const cumTableInputs = useMemo(
    () => project.cumTableInputs ?? {},
    [project.cumTableInputs]
  );
  const cumPoints = useMemo(() => project.cumPoints ?? [], [project.cumPoints]);
  const cumCurveConnected = project.cumCurveConnected ?? false;

  const cumRawValues = useMemo(
    () => parseNumberList(project.cumRawInputText ?? '').values,
    [project.cumRawInputText]
  );

  const cumBoundaries = useMemo(() => {
    if (cumWidthType === 'unequal') {
      return buildUnequalBoundaries(cumStartBound, cumUnequalWidths);
    }
    return buildEqualBoundaries(cumRawValues, cumStartBound, cumEqualWidth);
  }, [cumWidthType, cumStartBound, cumEqualWidth, cumUnequalWidths, cumRawValues]);

  const cumIntervals = useMemo(
    () => computeCumulativeIntervals(cumRawValues, cumBoundaries),
    [cumRawValues, cumBoundaries]
  );

  const cumTableFeedback = useMemo(
    () => evaluateCumulativeTable(cumIntervals, cumTableInputs),
    [cumIntervals, cumTableInputs]
  );

  const cumCurveFeedback = useMemo(
    () => evaluateCumulativeCurve(cumIntervals, cumPoints),
    [cumIntervals, cumPoints]
  );

  const handleUpdateTableCell = (
    intervalId: string,
    field: 'lowerBound' | 'upperBound' | 'classWidth' | 'midValue' | 'frequency' | 'fxProduct',
    value: string
  ) => {
    applyLocalPatch({ tableCell: { intervalId, field, value } });
  };

  const handleUpdateSummary = (
    field: keyof StudentSummaryCalculations,
    value: string
  ) => {
    applyLocalPatch({ summaryField: { field, value } });
  };

  const handleUpdateBar = (intervalId: string, frequency: number) => {
    applyLocalPatch(
      { histogramBar: { intervalId, plottedFrequency: frequency } },
      true
    );
  };

  const handleUpdateReflection = (
    field: keyof StudentHistogramReflection,
    value: string
  ) => {
    applyLocalPatch({ reflectionField: { field, value } });
  };

  const handleUpdateCumTableCell = (
    intervalId: string,
    field: 'lowerBound' | 'upperBound' | 'frequency' | 'cumulativeFrequency',
    value: string
  ) => {
    applyLocalPatch({ cumTableCell: { intervalId, field, value } });
  };

  const handleUpdateCumPoints = (points: CumulativePoint[]) => {
    applyLocalPatch({ cumPoints: points });
  };

  const handleCopyFromStage1ToCum = () => {
    applyLocalPatch({
      cumRaw: {
        cumTitle: project.topicTitle || '',
        cumRawInputText: project.rawInputText || '',
        cumVariableName: project.variableName || '',
        cumUnit: project.unit || '',
        cumStartBound: project.startBound ?? 0,
        cumEqualWidth: project.classWidth ?? 10,
      },
    });
  };

  const handleCreateGroupRoom = async (): Promise<boolean> => {
    return groupSession.createRoom(project);
  };

  const handleJoinGroupRoom = async (code: string): Promise<boolean> => {
    return groupSession.joinRoom(code);
  };

  const handleDownloadPdf = async () => {
    setExportError(null);
    setIsExporting(true);
    try {
      await exportStatisticsPdf({
        identity,
        variableName: project.variableName,
        unit: project.unit,
        rawValues,
        intervals,
        tableInputs: project.tableInputs,
        summaryInputs: project.summaryInputs,
        tableFeedback,
        summaryFeedback,
        histogramBars: project.histogramBars,
        histogramFeedback,
        histogramReflection: project.histogramReflection,
        cumTitle: project.cumTitle ?? '',
        cumVariableName: project.cumVariableName ?? '',
        cumUnit: project.cumUnit ?? '',
        cumWidthType,
        cumRawValues,
        cumIntervals,
        cumTableInputs,
        cumTableFeedback,
        cumPoints,
        cumCurveConnected,
        cumCurveFeedback,
        cumReflection: project.cumReflection ?? '',
      });
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Unable to generate PDF report. Please try again.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-lab-atmosphere text-[#0F172A]">
      <TopBar
        activeStage={activeStage}
        onSelectStage={setActiveStage}
        onDownloadPdf={handleDownloadPdf}
        isExporting={isExporting}
      />

      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-6 space-y-5">
        {exportError && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between"
          >
            <span>{exportError}</span>
            <button
              type="button"
              onClick={() => setExportError(null)}
              className="font-semibold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <StudentInfoBar
          identity={identity}
          onChange={handleIdentityChange}
          groupSession={{
            clientId: groupSession.clientId,
            roomCode: groupSession.roomCode,
            status: groupSession.status,
            transportMode: groupSession.transportMode,
            error: groupSession.error,
            participants: groupSession.participants,
            lastEditedBy: groupSession.lastEditedBy,
            localUserName: groupSession.localUserName,
            onLocalUserNameChange: groupSession.setLocalUserName,
            localUserRole: groupSession.localUserRole,
            onLocalUserRoleChange: groupSession.setLocalUserRole,
            onCreateRoom: handleCreateGroupRoom,
            onJoinRoom: handleJoinGroupRoom,
            onLeaveRoom: groupSession.leaveRoom,
            initialJoinCode,
          }}
        />

        {/* Stage Switcher Bar */}
        <div
          role="tablist"
          aria-label="Investigation stages"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 bg-[#162E54]/85 p-1.5 rounded-xl border border-[#3B629C]"
        >
          {STAGES.map((stage) => {
            const isActive = activeStage === stage.id;
            return (
              <button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveStage(stage.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#173056] font-semibold shadow-md'
                    : 'text-blue-100/90 hover:text-white hover:bg-[#23457A]'
                }`}
              >
                <span
                  className={`font-mono-tabular font-semibold ${
                    isActive ? 'text-[#2563EB]' : 'text-blue-200/80'
                  }`}
                >
                  {stage.step}
                </span>
                <span className="truncate">{stage.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Stage Workspace */}
        {activeStage === 'data' && (
          <Stage1RawData
            topicTitle={project.topicTitle}
            onTopicTitleChange={(title) =>
              applyLocalPatch({ meta: { topicTitle: title } })
            }
            rawInputText={project.rawInputText}
            onRawInputTextChange={(txt) =>
              applyLocalPatch({ raw: { rawInputText: txt } })
            }
            rawValues={rawValues}
            variableName={project.variableName}
            unit={project.unit}
            onVariableChange={(name, u) =>
              applyLocalPatch({ raw: { variableName: name, unit: u } })
            }
            startBound={project.startBound}
            classWidth={project.classWidth}
            onEqualClassConfigChange={(s, w) =>
              applyLocalPatch({ raw: { startBound: s, classWidth: w } })
            }
            boundaries={boundaries}
            intervals={intervals}
            onClearData={() => applyLocalPatch({ clearAllData: true })}
            onNextStage={() => setActiveStage('table')}
          />
        )}

        {activeStage === 'table' && (
          <Stage2FrequencyTable
            rawValues={rawValues}
            variableName={project.variableName}
            unit={project.unit}
            intervals={intervals}
            tableInputs={project.tableInputs}
            summaryInputs={project.summaryInputs}
            onUpdateCell={handleUpdateTableCell}
            onUpdateSummary={handleUpdateSummary}
            tableFeedback={tableFeedback}
            summaryFeedback={summaryFeedback}
            hasChecked={project.hasCheckedTable}
            onCheckTable={() => applyLocalPatch({ hasCheckedTable: true })}
            onClearTable={() => applyLocalPatch({ tableReset: true })}
            onNextStage={() => setActiveStage('histogram')}
          />
        )}

        {activeStage === 'histogram' && (
          <Stage3HistogramBuilder
            topicTitle={project.topicTitle}
            variableName={project.variableName}
            unit={project.unit}
            intervals={intervals}
            tableInputs={project.tableInputs}
            summaryInputs={project.summaryInputs}
            bars={project.histogramBars}
            onUpdateBar={handleUpdateBar}
            onResetBars={() => applyLocalPatch({ histogramReset: true })}
            feedback={histogramFeedback}
            hasChecked={project.hasCheckedHistogram}
            onCheckHistogram={() => applyLocalPatch({ hasCheckedHistogram: true })}
            reflection={project.histogramReflection}
            onUpdateReflection={handleUpdateReflection}
            onClearReflections={() => applyLocalPatch({ clearReflections: true })}
            onDownloadPdf={handleDownloadPdf}
            isExporting={isExporting}
          />
        )}

        {activeStage === 'cum-data' && (
          <Stage4CumulativeDataTable
            cumTitle={project.cumTitle ?? ''}
            cumRawInputText={project.cumRawInputText ?? ''}
            cumVariableName={project.cumVariableName ?? ''}
            cumUnit={project.cumUnit ?? ''}
            cumWidthType={cumWidthType}
            cumStartBound={cumStartBound}
            cumEqualWidth={cumEqualWidth}
            cumUnequalWidths={cumUnequalWidths}
            cumRawValues={cumRawValues}
            cumBoundaries={cumBoundaries}
            cumIntervals={cumIntervals}
            cumTableInputs={cumTableInputs}
            cumTableFeedback={cumTableFeedback}
            hasCheckedCumTable={project.hasCheckedCumTable ?? false}
            hasStage1Data={rawValues.length > 0}
            onCopyFromStage1={handleCopyFromStage1ToCum}
            onUpdateCumConfig={(cumPatch) => applyLocalPatch({ cumRaw: cumPatch })}
            onUpdateCumTableCell={handleUpdateCumTableCell}
            onResetCumTable={() => applyLocalPatch({ cumTableReset: true })}
            onCheckCumTable={() => applyLocalPatch({ hasCheckedCumTable: true })}
            onClearAllCumData={() => applyLocalPatch({ clearAllCumData: true })}
            onNextStage={() => setActiveStage('cum-curve')}
          />
        )}

        {activeStage === 'cum-curve' && (
          <Stage5CumulativeCurve
            cumTitle={project.cumTitle ?? ''}
            cumVariableName={project.cumVariableName ?? ''}
            cumUnit={project.cumUnit ?? ''}
            cumWidthType={cumWidthType}
            cumIntervals={cumIntervals}
            cumTableInputs={cumTableInputs}
            points={cumPoints}
            curveConnected={cumCurveConnected}
            feedback={cumCurveFeedback}
            hasChecked={project.hasCheckedCumCurve ?? false}
            reflection={project.cumReflection ?? ''}
            onUpdatePoints={handleUpdateCumPoints}
            onToggleCurveConnected={(connected) =>
              applyLocalPatch({ cumCurveConnected: connected })
            }
            onResetCurve={() => applyLocalPatch({ cumCurveReset: true })}
            onCheckCurve={() => applyLocalPatch({ hasCheckedCumCurve: true })}
            onUpdateReflection={(text) => applyLocalPatch({ cumReflection: text })}
            onDownloadPdf={handleDownloadPdf}
            isExporting={isExporting}
          />
        )}
      </main>

      <footer className="border-t border-[#34598F] bg-[#132645]/90 mt-8">
        <div className="max-w-[1360px] mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-blue-100/80">
          <span>Cambridge IGCSE Mathematics (0580) · Statistical Diagrams Lab</span>
          <span>Supports Individual &amp; Live Group Collaboration · Direct A4 PDF Export</span>
        </div>
      </footer>
    </div>
  );
}
