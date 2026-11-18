import {
  Check,
  Copy,
  KeyRound,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  User,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  SessionConnectionStatus,
  SessionTransportMode,
} from '../hooks/useGroupSession';
import { normalizeCodeInput } from '../hooks/useGroupSession';
import type {
  GroupParticipant,
  GroupRoomState,
  LabStage,
  StudentIdentity,
  WorkMode,
} from '../types/statistics';

interface GroupSessionControlProps {
  clientId: string;
  roomCode: string | null;
  status: SessionConnectionStatus;
  transportMode?: SessionTransportMode;
  error: string | null;
  participants: GroupParticipant[];
  lastEditedBy: GroupRoomState['lastEditedBy'];
  localUserName: string;
  onLocalUserNameChange: (name: string) => void;
  localUserRole: string;
  onLocalUserRoleChange: (role: string) => void;
  onCreateRoom: () => Promise<boolean>;
  onJoinRoom: (code: string) => Promise<boolean>;
  onLeaveRoom: () => void;
  initialJoinCode?: string;
}

interface StudentInfoBarProps {
  identity: StudentIdentity;
  onChange: (updated: StudentIdentity) => void;
  groupSession: GroupSessionControlProps;
}

const ROLE_OPTIONS = [
  'Data & Class Widths',
  'Frequency & Mid-Value Table',
  'Mean & Modal Class',
  'Histogram Builder',
  'Verification & PDF',
];

const STAGE_LABELS: Record<LabStage, string> = {
  data: '01. Raw Data',
  table: '02. Frequency Table',
  histogram: '03. Histogram',
};

async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function StudentInfoBar({
  identity,
  onChange,
  groupSession,
}: StudentInfoBarProps) {
  const [joinCodeInput, setJoinCodeInput] = useState(groupSession.initialJoinCode ?? '');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(null);

  useEffect(() => {
    if (groupSession.initialJoinCode) {
      setJoinCodeInput(groupSession.initialJoinCode);
    }
  }, [groupSession.initialJoinCode]);

  const inviteUrl = groupSession.roomCode
    ? `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(groupSession.roomCode)}`
    : '';

  const handleModeChange = (mode: WorkMode) => {
    onChange({ ...identity, mode });
  };

  const handleAddMember = () => {
    const nextIdx = identity.members.length;
    const newMember = {
      id: `member-${Date.now()}-${nextIdx}`,
      name: '',
      role: ROLE_OPTIONS[nextIdx % ROLE_OPTIONS.length],
    };
    onChange({ ...identity, members: [...identity.members, newMember] });
  };

  const handleUpdateMember = (id: string, field: 'name' | 'role', value: string) => {
    onChange({
      ...identity,
      members: identity.members.map((m) => (m.id === id ? { ...m, [field]: value } : m)),
    });
  };

  const handleRemoveMember = (id: string) => {
    if (identity.members.length <= 1) return;
    onChange({
      ...identity,
      members: identity.members.filter((m) => m.id !== id),
    });
  };

  const handleCreateClick = async () => {
    setPendingAction('create');
    await groupSession.onCreateRoom();
    setPendingAction(null);
  };

  const handleJoinClick = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeCodeInput(joinCodeInput);
    if (!normalized) return;
    setJoinCodeInput(normalized);
    setPendingAction('join');
    await groupSession.onJoinRoom(normalized);
    setPendingAction(null);
  };

  const handleCopyCode = async () => {
    if (!groupSession.roomCode) return;
    const ok = await copyTextWithFallback(groupSession.roomCode);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteUrl) return;
    const ok = await copyTextWithFallback(inviteUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    }
  };

  return (
    <section
      aria-label="Student or Group Identity"
      className="bg-white border border-[#3B629C]/35 rounded-xl p-5 shadow-xl shadow-[#0E203D]/25"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#EEF2F8]">
        <div>
          <h1 className="text-xl font-semibold text-[#1E3A5F] tracking-tight">
            Statistical Investigation Worksheet
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cambridge IGCSE Mathematics 0580 · Grouped Mean, Modal Class &amp; Equal Class Width Histograms
          </p>
        </div>

        <div
          role="group"
          aria-label="Work mode selection"
          className="inline-flex items-center gap-1 p-1 bg-[#EEF3FA] border border-[#DCE4F0] rounded-lg self-start lg:self-auto"
        >
          <button
            type="button"
            onClick={() => handleModeChange('individual')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              identity.mode === 'individual'
                ? 'bg-white text-[#1E3A5F] shadow-xs'
                : 'text-slate-600 hover:text-[#1E3A5F]'
            }`}
          >
            <User className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
            <span>Individual Work</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('group')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              identity.mode === 'group'
                ? 'bg-white text-[#1E3A5F] shadow-xs'
                : 'text-slate-600 hover:text-[#1E3A5F]'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#0D9488]" aria-hidden="true" />
            <span>Group Work</span>
          </button>
        </div>
      </div>

      {/* Live Cross-Device Group Collaboration Panel */}
      {identity.mode === 'group' && (
        <div className="mt-4 p-4 bg-[#F4F8FF] border border-[#CFE0FA] rounded-xl space-y-4">
          {!groupSession.roomCode ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#1E3A5F] flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
                    <span>Collaborate Across Devices with a Group Code</span>
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Create a new group code or enter your team&apos;s code so every member on different devices works on the same live project.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                <div className="lg:col-span-3">
                  <label
                    htmlFor="collab-user-name"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Your Name (This Device)
                  </label>
                  <input
                    id="collab-user-name"
                    type="text"
                    value={groupSession.localUserName}
                    onChange={(e) => groupSession.onLocalUserNameChange(e.target.value)}
                    placeholder="e.g., Aisyah"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label
                    htmlFor="collab-user-role"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Your Role
                  </label>
                  <select
                    id="collab-user-role"
                    value={groupSession.localUserRole}
                    onChange={(e) => groupSession.onLocalUserRoleChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <button
                    type="button"
                    disabled={pendingAction !== null || groupSession.status === 'connecting'}
                    onClick={handleCreateClick}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E3A5F] hover:bg-[#173056] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {pendingAction === 'create' ||
                    (groupSession.status === 'connecting' && pendingAction !== 'join' && !joinCodeInput) ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {pendingAction === 'create' ? 'Creating...' : 'Create Group Code'}
                    </span>
                  </button>
                </div>

                <form
                  onSubmit={handleJoinClick}
                  className="lg:col-span-4 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(normalizeCodeInput(e.target.value))}
                    placeholder="Paste code or invite link"
                    aria-label="Enter existing group code or invite link"
                    className="flex-1 min-w-0 px-3 py-2 text-sm font-mono-tabular uppercase bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <button
                    type="submit"
                    disabled={
                      pendingAction !== null ||
                      groupSession.status === 'connecting' ||
                      normalizeCodeInput(joinCodeInput).length < 4
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {pendingAction === 'join' ||
                    (groupSession.status === 'connecting' && pendingAction !== 'create') ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {pendingAction === 'join' ||
                      (groupSession.status === 'connecting' && pendingAction !== 'create')
                        ? 'Joining...'
                        : 'Join Code'}
                    </span>
                  </button>
                </form>
              </div>

              {groupSession.error && (
                <div
                  role="alert"
                  className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
                >
                  {groupSession.error}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-3 py-1.5 bg-white border border-[#93C5FD] rounded-lg flex items-center gap-2.5">
                    <span className="text-[11px] font-medium text-slate-500">
                      Group Code
                    </span>
                    <span className="text-base font-bold font-mono-tabular tracking-wider text-[#1E3A5F]">
                      {groupSession.roomCode}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1E3A5F] bg-white border border-[#DCE4F0] hover:bg-[#EEF4FF] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {copiedCode ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{copiedCode ? 'Code Copied' : 'Copy Code'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#1E3A5F] bg-white border border-[#DCE4F0] hover:bg-[#EEF4FF] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {copiedLink ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{copiedLink ? 'Invite Link Copied' : 'Copy Invite Link'}</span>
                  </button>

                  {groupSession.status === 'connected' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {groupSession.transportMode === 'p2p'
                          ? 'Live P2P Sync Active (keep host tab open)'
                          : 'Live Sync Active'}
                      </span>
                    </span>
                  )}
                  {(groupSession.status === 'connecting' ||
                    groupSession.status === 'reconnecting') && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>Syncing...</span>
                    </span>
                  )}
                  {groupSession.status === 'error' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Disconnected</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {groupSession.lastEditedBy && (
                    <span className="text-[11px] text-slate-600">
                      Last update by{' '}
                      <span className="font-semibold text-slate-800">
                        {groupSession.lastEditedBy.userName}
                      </span>{' '}
                      ({groupSession.lastEditedBy.section})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={groupSession.onLeaveRoom}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Leave Room</span>
                  </button>
                </div>
              </div>

              {inviteUrl && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-[#DCE8FA]">
                  <label
                    htmlFor="share-invite-url"
                    className="text-[11px] font-medium text-slate-600 shrink-0"
                  >
                    Shareable Invite Link:
                  </label>
                  <input
                    id="share-invite-url"
                    type="text"
                    readOnly
                    value={inviteUrl}
                    onClick={(e) => e.currentTarget.select()}
                    aria-label="Shareable group invite link"
                    className="flex-1 min-w-0 px-2.5 py-1 text-[11px] font-mono-tabular text-slate-700 bg-white border border-[#DCE4F0] rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              )}

              {/* Device Identity & Live Active Teammates */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2 border-t border-[#DCE8FA] items-center">
                <div className="lg:col-span-5 flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <label
                      htmlFor="active-device-name"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Your Name on This Device
                    </label>
                    <input
                      id="active-device-name"
                      type="text"
                      value={groupSession.localUserName}
                      onChange={(e) => groupSession.onLocalUserNameChange(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex-1">
                    <label
                      htmlFor="active-device-role"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      Your Role
                    </label>
                    <select
                      id="active-device-role"
                      value={groupSession.localUserRole}
                      onChange={(e) => groupSession.onLocalUserRoleChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="lg:col-span-7">
                  <div className="text-[11px] font-medium text-slate-600 mb-1">
                    Connected Devices ({groupSession.participants.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {groupSession.participants.map((p) => {
                      const isSelf = p.clientId === groupSession.clientId;
                      return (
                        <div
                          key={p.clientId}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${
                            isSelf
                              ? 'bg-white border-blue-300 text-[#1E3A5F]'
                              : 'bg-white/90 border-slate-200 text-slate-700'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="font-semibold">
                            {p.userName}
                            {isSelf ? ' (You)' : ''}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="text-[11px] text-slate-500">
                            {STAGE_LABELS[p.activeStage]}
                          </span>
                        </div>
                      );
                    })}
                    {groupSession.participants.length === 0 && (
                      <span className="text-xs text-slate-500 italic">
                        Connecting device presence...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="pt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
        {identity.mode === 'individual' ? (
          <div className="md:col-span-5">
            <label
              htmlFor="individual-name"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Student Full Name
            </label>
            <input
              id="individual-name"
              type="text"
              value={identity.individualName}
              onChange={(e) => onChange({ ...identity, individualName: e.target.value })}
              placeholder="Write your full name (included on PDF)"
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>
        ) : (
          <div className="md:col-span-5">
            <label
              htmlFor="group-name"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Group Name
            </label>
            <input
              id="group-name"
              type="text"
              value={identity.groupName}
              onChange={(e) => onChange({ ...identity, groupName: e.target.value })}
              placeholder="e.g., Team Euler / Group B"
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>
        )}

        <div className="md:col-span-3">
          <label
            htmlFor="topic-title"
            className="block text-xs font-medium text-slate-700 mb-1.5"
          >
            Investigation Title
          </label>
          <input
            id="topic-title"
            type="text"
            value={identity.topicTitle}
            onChange={(e) => onChange({ ...identity, topicTitle: e.target.value })}
            placeholder="e.g., Student Travel Time"
            className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="class-section"
            className="block text-xs font-medium text-slate-700 mb-1.5"
          >
            Class / Set
          </label>
          <input
            id="class-section"
            type="text"
            value={identity.classSection}
            onChange={(e) => onChange({ ...identity, classSection: e.target.value })}
            placeholder="Year 10 Set 1"
            className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="work-date"
            className="block text-xs font-medium text-slate-700 mb-1.5"
          >
            Date
          </label>
          <input
            id="work-date"
            type="date"
            value={identity.date}
            onChange={(e) => onChange({ ...identity, date: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-mono-tabular"
          />
        </div>
      </div>

      {identity.mode === 'group' && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between gap-4 mb-3">
            <span className="text-xs font-medium text-slate-700">
              Group Members ({identity.members.length})
            </span>
            <button
              type="button"
              onClick={handleAddMember}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Member</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {identity.members.map((member, index) => (
              <div
                key={member.id}
                className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
              >
                <span className="text-xs font-mono-tabular text-slate-400 w-5 shrink-0 text-center">
                  {index + 1}.
                </span>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    type="text"
                    value={member.name}
                    onChange={(e) => handleUpdateMember(member.id, 'name', e.target.value)}
                    placeholder={`Member ${index + 1} name`}
                    aria-label={`Member ${index + 1} name`}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <select
                    value={member.role}
                    onChange={(e) => handleUpdateMember(member.id, 'role', e.target.value)}
                    aria-label={`Member ${index + 1} role`}
                    className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                {identity.members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.id)}
                    title="Remove member"
                    aria-label={`Remove member ${index + 1}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
