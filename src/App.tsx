/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage1RawData } from './components/Stage1RawData';
import { Stage2FrequencyTable } from './components/Stage2FrequencyTable';
import { Stage3HistogramBuilder } from './components/Stage3HistogramBuilder';
import { StudentInfoBar } from './components/StudentInfoBar';
import { TopBar } from './components/TopBar';
import { normalizeCodeInput, useGroupSession } from './hooks/useGroupSession';
import type {
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
  computeIntervals,
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
];

export default function App() {
  const [activeStage, setActiveStage] = useState<LabStage>('data');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [mode, setMode] = useState<WorkMode>('individual');
  const [individualName, setIndividualName] = useState<string>('');
  const [project, setProject] = useState<GroupProjectState>(() =>
    createEmptyGroupProject()
  );

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

  // Auto-join if opened with ?code=XXXX or returning to an active session in this tab
  const didAutoJoinRef = useRef(false);
  useEffect(() => {
    if (didAutoJoinRef.current) return;
    didAutoJoinRef.current = true;
    if (initialJoinCode.length >= 4) {
      setMode('group');
      void groupSession.joinRoom(initialJoinCode);
    }
  }, [groupSession, initialJoinCode]);

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
          className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#162E54]/85 p-1.5 rounded-xl border border-[#3B629C]"
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
