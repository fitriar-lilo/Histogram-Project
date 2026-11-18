import Peer, { type DataConnection } from 'peerjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GroupParticipant,
  GroupProjectPatch,
  GroupProjectState,
  GroupRoomState,
  LabStage,
} from '../types/statistics';
import {
  applyProjectPatch,
  describePatchSection,
  ensureMemberInRoster,
  generateGroupCode,
} from '../utils/groupSync';

export type SessionConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type SessionTransportMode = 'server' | 'p2p' | null;

interface UseGroupSessionOptions {
  activeStage: LabStage;
  onFullSync: (room: GroupRoomState) => void;
  onRemotePatch: (
    patch: GroupProjectPatch,
    lastEditedBy: GroupRoomState['lastEditedBy']
  ) => void;
  onPresenceUpdated: (
    participants: GroupParticipant[],
    members?: GroupProjectState['members']
  ) => void;
}

interface P2pHostState {
  roomCode: string;
  version: number;
  updatedAt: number;
  lastEditedBy: GroupRoomState['lastEditedBy'];
  project: GroupProjectState;
  participants: Map<string, GroupParticipant>;
  connections: Set<DataConnection>;
  connToClientId: WeakMap<DataConnection, string>;
}

const PEER_PREFIX = 'igcse0580-stats-';
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const API_BASE = (() => {
  try {
    const raw = (import.meta as { env?: Record<string, string | undefined> }).env
      ?.VITE_API_BASE_URL;
    return raw ? raw.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
})();

function getOrCreateClientId(): string {
  try {
    const key = 'igcse_stats_client_id';
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function normalizeCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function saveP2pHostSnapshot(
  code: string,
  state: Pick<P2pHostState, 'roomCode' | 'version' | 'updatedAt' | 'lastEditedBy' | 'project'>
) {
  try {
    window.localStorage.setItem(
      `igcse_stats_p2p_room_${code}`,
      JSON.stringify(state)
    );
  } catch {
    // Ignore storage quota errors
  }
}

function loadP2pHostSnapshot(
  code: string
): Pick<P2pHostState, 'roomCode' | 'version' | 'updatedAt' | 'lastEditedBy' | 'project'> | null {
  try {
    const raw = window.localStorage.getItem(`igcse_stats_p2p_room_${code}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pick<
      P2pHostState,
      'roomCode' | 'version' | 'updatedAt' | 'lastEditedBy' | 'project'
    >;
    if (parsed && parsed.roomCode === code && parsed.project) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function checkServerBackendAvailable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useGroupSession({
  activeStage,
  onFullSync,
  onRemotePatch,
  onPresenceUpdated,
}: UseGroupSessionOptions) {
  const clientIdRef = useRef<string>(getOrCreateClientId());
  const wsRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const guestConnRef = useRef<DataConnection | null>(null);
  const p2pHostRef = useRef<P2pHostState | null>(null);

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const pendingPatchesRef = useRef<GroupProjectPatch[]>([]);
  const shouldStayConnectedRef = useRef<boolean>(false);
  const backendAvailableRef = useRef<boolean | null>(null);

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionConnectionStatus>('idle');
  const [transportMode, setTransportMode] = useState<SessionTransportMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [lastEditedBy, setLastEditedBy] =
    useState<GroupRoomState['lastEditedBy']>(null);

  const [localUserName, setLocalUserName] = useState<string>(() => {
    try {
      return window.localStorage.getItem('igcse_stats_user_name') ?? '';
    } catch {
      return '';
    }
  });

  const [localUserRole, setLocalUserRole] = useState<string>(() => {
    try {
      return (
        window.localStorage.getItem('igcse_stats_user_role') ??
        'Data & Class Widths'
      );
    } catch {
      return 'Data & Class Widths';
    }
  });

  const callbacksRef = useRef({
    onFullSync,
    onRemotePatch,
    onPresenceUpdated,
  });
  callbacksRef.current = { onFullSync, onRemotePatch, onPresenceUpdated };

  const activeStageRef = useRef(activeStage);
  activeStageRef.current = activeStage;
  const userNameRef = useRef(localUserName);
  userNameRef.current = localUserName;
  const userRoleRef = useRef(localUserRole);
  userRoleRef.current = localUserRole;
  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;
  const transportModeRef = useRef<SessionTransportMode>(transportMode);
  transportModeRef.current = transportMode;

  useEffect(() => {
    try {
      window.localStorage.setItem('igcse_stats_user_name', localUserName);
    } catch {
      // Ignore storage errors
    }
  }, [localUserName]);

  useEffect(() => {
    try {
      window.localStorage.setItem('igcse_stats_user_role', localUserRole);
    } catch {
      // Ignore storage errors
    }
  }, [localUserRole]);

  const cleanupTransport = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }
    if (guestConnRef.current) {
      try {
        guestConnRef.current.close();
      } catch {
        // Ignore close errors
      }
      guestConnRef.current = null;
    }
    if (p2pHostRef.current) {
      for (const conn of p2pHostRef.current.connections) {
        try {
          conn.close();
        } catch {
          // Ignore
        }
      }
      p2pHostRef.current = null;
    }
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {
        // Ignore destroy errors
      }
      peerRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Server WebSocket Connection (used when Express backend is running)
  // ---------------------------------------------------------------------------
  const connectServerSocket = useCallback(
    (code: string) => {
      cleanupTransport();
      shouldStayConnectedRef.current = true;
      setTransportMode('server');
      setStatus((prev) => (prev === 'connected' ? 'connected' : 'connecting'));

      let wsUrl = '';
      if (API_BASE) {
        const parsed = new URL(API_BASE, window.location.origin);
        const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProto}//${parsed.host}/ws`;
      } else {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${proto}//${window.location.host}/ws`;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus('connected');
        setError(null);

        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomCode: code,
            clientId: clientIdRef.current,
            userName: userNameRef.current.trim() || 'Teammate',
            role: userRoleRef.current,
            activeStage: activeStageRef.current,
          })
        );

        if (pendingPatchesRef.current.length > 0) {
          const queued = [...pendingPatchesRef.current];
          pendingPatchesRef.current = [];
          for (const patch of queued) {
            ws.send(
              JSON.stringify({
                type: 'project:patch',
                roomCode: code,
                clientId: clientIdRef.current,
                userName: userNameRef.current.trim() || 'Teammate',
                patch,
              })
            );
          }
        }

        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === 'room:sync') {
          const room = msg.room as GroupRoomState;
          setParticipants(room.participants ?? []);
          setLastEditedBy(room.lastEditedBy ?? null);
          callbacksRef.current.onFullSync(room);
          return;
        }

        if (msg.type === 'presence:updated') {
          const nextParticipants = (msg.participants as GroupParticipant[]) ?? [];
          const nextMembers = msg.members as GroupProjectState['members'] | undefined;
          setParticipants(nextParticipants);
          callbacksRef.current.onPresenceUpdated(nextParticipants, nextMembers);
          return;
        }

        if (msg.type === 'project:patched') {
          const originClientId = String(msg.originClientId ?? '');
          const nextEdited = (msg.lastEditedBy as GroupRoomState['lastEditedBy']) ?? null;
          setLastEditedBy(nextEdited);
          if (originClientId === clientIdRef.current) return;
          const patch = msg.patch as GroupProjectPatch;
          callbacksRef.current.onRemotePatch(patch, nextEdited);
          return;
        }

        if (msg.type === 'room:error') {
          shouldStayConnectedRef.current = false;
          setStatus('error');
          setError(String(msg.message ?? 'Unable to sync with group room.'));
        }
      };

      ws.onclose = () => {
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (!shouldStayConnectedRef.current || roomCodeRef.current !== code) {
          return;
        }
        setStatus('reconnecting');
        const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (shouldStayConnectedRef.current && roomCodeRef.current === code) {
            connectServerSocket(code);
          }
        }, delay);
      };

      ws.onerror = () => {
        // Error triggers onclose which handles reconnect
      };
    },
    [cleanupTransport]
  );

  // ---------------------------------------------------------------------------
  // P2P WebRTC Host Room (serverless fallback for Vercel / static hosting)
  // ---------------------------------------------------------------------------
  const startP2pHost = useCallback(
    async (
      desiredCode: string | undefined,
      initialProject: GroupProjectState,
      restoredMeta?: Pick<P2pHostState, 'version' | 'updatedAt' | 'lastEditedBy'>
    ): Promise<boolean> => {
      const maxAttempts = desiredCode ? 1 : 4;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidateCode = desiredCode
          ? normalizeCodeInput(desiredCode)
          : generateGroupCode(6);

        cleanupTransport();
        shouldStayConnectedRef.current = true;
        setTransportMode('p2p');
        setStatus('connecting');

        const result = await new Promise<'opened' | 'unavailable-id' | 'failed'>(
          (resolve) => {
            let settled = false;
            const peer = new Peer(`${PEER_PREFIX}${candidateCode}`, {
              debug: 0,
              config: { iceServers: ICE_SERVERS },
            });
            peerRef.current = peer;

            const timeout = setTimeout(() => {
              if (!settled) {
                settled = true;
                try {
                  peer.destroy();
                } catch {
                  // Ignore
                }
                resolve('failed');
              }
            }, 12000);

            peer.on('open', () => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);

              const selfName = userNameRef.current.trim() || 'Group Host';
              const selfRole = userRoleRef.current;
              const syncedProject = ensureMemberInRoster(
                initialProject,
                selfName,
                selfRole
              );
              const selfParticipant: GroupParticipant = {
                clientId: clientIdRef.current,
                userName: selfName,
                role: selfRole,
                activeStage: activeStageRef.current,
                joinedAt: Date.now(),
              };

              const hostState: P2pHostState = {
                roomCode: candidateCode,
                version: restoredMeta?.version ?? 1,
                updatedAt: restoredMeta?.updatedAt ?? Date.now(),
                lastEditedBy: restoredMeta?.lastEditedBy ?? null,
                project: syncedProject,
                participants: new Map([[clientIdRef.current, selfParticipant]]),
                connections: new Set<DataConnection>(),
                connToClientId: new WeakMap<DataConnection, string>(),
              };
              p2pHostRef.current = hostState;

              const broadcastP2p = (
                payload: unknown,
                excludeConn?: DataConnection
              ) => {
                for (const c of hostState.connections) {
                  if (c !== excludeConn && c.open) {
                    try {
                      c.send(payload);
                    } catch {
                      // Ignore individual connection send error
                    }
                  }
                }
              };

              const getHostSnapshot = (): GroupRoomState => ({
                roomCode: hostState.roomCode,
                version: hostState.version,
                updatedAt: hostState.updatedAt,
                lastEditedBy: hostState.lastEditedBy,
                project: hostState.project,
                participants: Array.from(hostState.participants.values()),
              });

              peer.on('connection', (conn) => {
                hostState.connections.add(conn);

                const detachGuest = () => {
                  hostState.connections.delete(conn);
                  const guestClientId = hostState.connToClientId.get(conn);
                  if (guestClientId) {
                    hostState.connToClientId.delete(conn);
                    hostState.participants.delete(guestClientId);
                    const nextParticipants = Array.from(
                      hostState.participants.values()
                    );
                    setParticipants(nextParticipants);
                    callbacksRef.current.onPresenceUpdated(
                      nextParticipants,
                      hostState.project.members
                    );
                    broadcastP2p({
                      type: 'presence:updated',
                      participants: nextParticipants,
                      members: hostState.project.members,
                    });
                  }
                };

                conn.on('data', (rawData) => {
                  if (!rawData || typeof rawData !== 'object') return;
                  const msg = rawData as Record<string, unknown>;
                  const type = msg.type;

                  if (type === 'ping') {
                    if (conn.open) conn.send({ type: 'pong' });
                    return;
                  }

                  if (type === 'room:join') {
                    const guestId =
                      String(msg.clientId ?? '').slice(0, 64) || conn.peer;
                    const guestName =
                      String(msg.userName ?? 'Teammate').trim().slice(0, 60) ||
                      'Teammate';
                    const guestRole =
                      String(msg.role ?? 'Collaborator').trim().slice(0, 60) ||
                      'Collaborator';
                    const guestStage = (['data', 'table', 'histogram'].includes(
                      String(msg.activeStage)
                    )
                      ? String(msg.activeStage)
                      : 'data') as LabStage;

                    hostState.connToClientId.set(conn, guestId);
                    hostState.participants.set(guestId, {
                      clientId: guestId,
                      userName: guestName,
                      role: guestRole,
                      activeStage: guestStage,
                      joinedAt: Date.now(),
                    });

                    const nextProject = ensureMemberInRoster(
                      hostState.project,
                      guestName,
                      guestRole
                    );
                    if (nextProject !== hostState.project) {
                      hostState.project = nextProject;
                      hostState.version += 1;
                      hostState.updatedAt = Date.now();
                      saveP2pHostSnapshot(candidateCode, {
                        roomCode: candidateCode,
                        version: hostState.version,
                        updatedAt: hostState.updatedAt,
                        lastEditedBy: hostState.lastEditedBy,
                        project: hostState.project,
                      });
                    }

                    const snapshot = getHostSnapshot();
                    if (conn.open) {
                      conn.send({ type: 'room:sync', room: snapshot });
                    }
                    setParticipants(snapshot.participants);
                    callbacksRef.current.onPresenceUpdated(
                      snapshot.participants,
                      hostState.project.members
                    );
                    broadcastP2p(
                      {
                        type: 'presence:updated',
                        participants: snapshot.participants,
                        members: hostState.project.members,
                      },
                      conn
                    );
                    return;
                  }

                  if (type === 'presence:stage') {
                    const guestId = hostState.connToClientId.get(conn);
                    if (!guestId) return;
                    const existing = hostState.participants.get(guestId);
                    if (!existing) return;

                    const nextStage = (['data', 'table', 'histogram'].includes(
                      String(msg.activeStage)
                    )
                      ? String(msg.activeStage)
                      : existing.activeStage) as LabStage;
                    const nextName =
                      typeof msg.userName === 'string' && msg.userName.trim()
                        ? msg.userName.trim().slice(0, 60)
                        : existing.userName;
                    const nextRole =
                      typeof msg.role === 'string' && msg.role.trim()
                        ? msg.role.trim().slice(0, 60)
                        : existing.role;

                    hostState.participants.set(guestId, {
                      ...existing,
                      userName: nextName,
                      role: nextRole,
                      activeStage: nextStage,
                    });
                    const nextProject = ensureMemberInRoster(
                      hostState.project,
                      nextName,
                      nextRole
                    );
                    if (nextProject !== hostState.project) {
                      hostState.project = nextProject;
                    }
                    const nextParticipants = Array.from(
                      hostState.participants.values()
                    );
                    setParticipants(nextParticipants);
                    callbacksRef.current.onPresenceUpdated(
                      nextParticipants,
                      hostState.project.members
                    );
                    broadcastP2p({
                      type: 'presence:updated',
                      participants: nextParticipants,
                      members: hostState.project.members,
                    });
                    return;
                  }

                  if (type === 'project:patch') {
                    const patch = msg.patch as GroupProjectPatch | undefined;
                    if (!patch || typeof patch !== 'object') return;
                    const guestId =
                      hostState.connToClientId.get(conn) ??
                      String(msg.clientId ?? '');
                    const editorName =
                      typeof msg.userName === 'string' && msg.userName.trim()
                        ? msg.userName.trim().slice(0, 60)
                        : 'Teammate';

                    hostState.project = applyProjectPatch(hostState.project, patch);
                    hostState.version += 1;
                    hostState.updatedAt = Date.now();
                    hostState.lastEditedBy = {
                      userName: editorName,
                      section: describePatchSection(patch),
                      timestamp: hostState.updatedAt,
                    };

                    saveP2pHostSnapshot(candidateCode, {
                      roomCode: candidateCode,
                      version: hostState.version,
                      updatedAt: hostState.updatedAt,
                      lastEditedBy: hostState.lastEditedBy,
                      project: hostState.project,
                    });

                    setLastEditedBy(hostState.lastEditedBy);
                    callbacksRef.current.onRemotePatch(
                      patch,
                      hostState.lastEditedBy
                    );

                    broadcastP2p(
                      {
                        type: 'project:patched',
                        patch,
                        version: hostState.version,
                        updatedAt: hostState.updatedAt,
                        lastEditedBy: hostState.lastEditedBy,
                        originClientId: guestId,
                      },
                      conn
                    );
                    return;
                  }

                  if (type === 'room:leave') {
                    detachGuest();
                  }
                });

                conn.on('close', detachGuest);
                conn.on('error', detachGuest);
              });

              peer.on('disconnected', () => {
                if (shouldStayConnectedRef.current && !peer.destroyed) {
                  try {
                    peer.reconnect();
                  } catch {
                    // Ignore reconnect errors
                  }
                }
              });

              saveP2pHostSnapshot(candidateCode, {
                roomCode: candidateCode,
                version: hostState.version,
                updatedAt: hostState.updatedAt,
                lastEditedBy: hostState.lastEditedBy,
                project: hostState.project,
              });

              try {
                window.sessionStorage.setItem('igcse_stats_room_code', candidateCode);
                window.sessionStorage.setItem(
                  `igcse_stats_p2p_host_${candidateCode}`,
                  '1'
                );
              } catch {
                // Ignore
              }

              setRoomCode(candidateCode);
              setStatus('connected');
              setError(null);
              const initialSnapshot = getHostSnapshot();
              setParticipants(initialSnapshot.participants);
              setLastEditedBy(initialSnapshot.lastEditedBy);
              callbacksRef.current.onFullSync(initialSnapshot);

              resolve('opened');
            });

            peer.on('error', (err) => {
              if (settled) return;
              const errType = (err as { type?: string })?.type;
              if (errType === 'unavailable-id') {
                settled = true;
                clearTimeout(timeout);
                try {
                  peer.destroy();
                } catch {
                  // Ignore
                }
                resolve('unavailable-id');
                return;
              }
              settled = true;
              clearTimeout(timeout);
              try {
                peer.destroy();
              } catch {
                // Ignore
              }
              resolve('failed');
            });
          }
        );

        if (result === 'opened') {
          return true;
        }
        if (result === 'unavailable-id' && desiredCode) {
          setStatus('error');
          setError(
            `Group code "${desiredCode}" is already active. Choose another code or click Join Code.`
          );
          return false;
        }
        if (result === 'failed') {
          setStatus('error');
          setError(
            'Unable to connect to the peer signaling service to create a group code. Please check your internet connection and try again.'
          );
          return false;
        }
      }

      setStatus('error');
      setError('Could not reserve a unique group code. Please try again.');
      return false;
    },
    [cleanupTransport]
  );

  // ---------------------------------------------------------------------------
  // P2P WebRTC Guest Join (serverless fallback for Vercel / static hosting)
  // ---------------------------------------------------------------------------
  const joinP2pGuest = useCallback(
    async (codeInput: string): Promise<boolean> => {
      const code = normalizeCodeInput(codeInput);

      // If this tab previously hosted this exact room, reclaim host on reload
      let wasHost = false;
      try {
        wasHost =
          window.sessionStorage.getItem(`igcse_stats_p2p_host_${code}`) === '1';
      } catch {
        wasHost = false;
      }
      if (wasHost) {
        const saved = loadP2pHostSnapshot(code);
        if (saved) {
          const reclaimed = await startP2pHost(code, saved.project, {
            version: saved.version,
            updatedAt: saved.updatedAt,
            lastEditedBy: saved.lastEditedBy,
          });
          if (reclaimed) return true;
        }
      }

      cleanupTransport();
      shouldStayConnectedRef.current = true;
      setTransportMode('p2p');
      setStatus('connecting');
      setError(null);

      return new Promise<boolean>((resolve) => {
        let settled = false;
        const peer = new Peer({
          debug: 0,
          config: { iceServers: ICE_SERVERS },
        });
        peerRef.current = peer;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            shouldStayConnectedRef.current = false;
            cleanupTransport();
            setStatus('error');
            setError(
              `Timed out connecting to group "${code}". Make sure the host's browser tab is open and online.`
            );
            resolve(false);
          }
        }, 12000);

        peer.on('open', () => {
          const conn = peer.connect(`${PEER_PREFIX}${code}`, { reliable: true });
          guestConnRef.current = conn;

          conn.on('open', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reconnectAttemptRef.current = 0;
            setRoomCode(code);
            setStatus('connected');
            setError(null);

            try {
              window.sessionStorage.setItem('igcse_stats_room_code', code);
            } catch {
              // Ignore
            }

            conn.send({
              type: 'room:join',
              roomCode: code,
              clientId: clientIdRef.current,
              userName: userNameRef.current.trim() || 'Teammate',
              role: userRoleRef.current,
              activeStage: activeStageRef.current,
            });

            if (pendingPatchesRef.current.length > 0) {
              const queued = [...pendingPatchesRef.current];
              pendingPatchesRef.current = [];
              for (const patch of queued) {
                conn.send({
                  type: 'project:patch',
                  roomCode: code,
                  clientId: clientIdRef.current,
                  userName: userNameRef.current.trim() || 'Teammate',
                  patch,
                });
              }
            }

            pingTimerRef.current = setInterval(() => {
              if (conn.open) {
                conn.send({ type: 'ping' });
              }
            }, 15000);

            resolve(true);
          });

          conn.on('data', (rawData) => {
            if (!rawData || typeof rawData !== 'object') return;
            const msg = rawData as Record<string, unknown>;

            if (msg.type === 'room:sync') {
              const room = msg.room as GroupRoomState;
              setParticipants(room.participants ?? []);
              setLastEditedBy(room.lastEditedBy ?? null);
              callbacksRef.current.onFullSync(room);
              return;
            }

            if (msg.type === 'presence:updated') {
              const nextParticipants =
                (msg.participants as GroupParticipant[]) ?? [];
              const nextMembers = msg.members as
                | GroupProjectState['members']
                | undefined;
              setParticipants(nextParticipants);
              callbacksRef.current.onPresenceUpdated(nextParticipants, nextMembers);
              return;
            }

            if (msg.type === 'project:patched') {
              const originClientId = String(msg.originClientId ?? '');
              const nextEdited =
                (msg.lastEditedBy as GroupRoomState['lastEditedBy']) ?? null;
              setLastEditedBy(nextEdited);
              if (originClientId === clientIdRef.current) return;
              const patch = msg.patch as GroupProjectPatch;
              callbacksRef.current.onRemotePatch(patch, nextEdited);
              return;
            }

            if (msg.type === 'room:error') {
              shouldStayConnectedRef.current = false;
              setStatus('error');
              setError(String(msg.message ?? 'Unable to sync with group room.'));
            }
          });

          conn.on('close', () => {
            if (pingTimerRef.current) {
              clearInterval(pingTimerRef.current);
              pingTimerRef.current = null;
            }
            if (!shouldStayConnectedRef.current || roomCodeRef.current !== code) {
              return;
            }
            setStatus('reconnecting');
            const delay = Math.min(
              10000,
              1500 * Math.pow(2, reconnectAttemptRef.current)
            );
            reconnectAttemptRef.current += 1;
            reconnectTimerRef.current = setTimeout(() => {
              if (shouldStayConnectedRef.current && roomCodeRef.current === code) {
                void joinP2pGuest(code);
              }
            }, delay);
          });
        });

        peer.on('error', async (err) => {
          const errType = (err as { type?: string })?.type;
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            cleanupTransport();

            if (errType === 'peer-unavailable') {
              const localBackup = loadP2pHostSnapshot(code);
              if (localBackup) {
                const restored = await startP2pHost(code, localBackup.project, {
                  version: localBackup.version,
                  updatedAt: localBackup.updatedAt,
                  lastEditedBy: localBackup.lastEditedBy,
                });
                resolve(restored);
                return;
              }
              shouldStayConnectedRef.current = false;
              setStatus('error');
              setError(
                `Group code "${code}" is not active right now. Ask your teammate who created the code to keep their browser tab open.`
              );
              resolve(false);
              return;
            }

            shouldStayConnectedRef.current = false;
            setStatus('error');
            setError(
              `Could not join group "${code}". Check your internet connection and verify the code.`
            );
            resolve(false);
          }
        });
      });
    },
    [cleanupTransport, startP2pHost]
  );

  // ---------------------------------------------------------------------------
  // Sync local stage / name / role changes across whichever transport is active
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!roomCode || status !== 'connected') return;
    const trimmedName = localUserName.trim() || 'Teammate';

    if (transportMode === 'server') {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'presence:stage',
            roomCode,
            clientId: clientIdRef.current,
            userName: trimmedName,
            role: localUserRole,
            activeStage,
          })
        );
      }
      return;
    }

    if (transportMode === 'p2p') {
      const host = p2pHostRef.current;
      if (host) {
        const existing = host.participants.get(clientIdRef.current);
        host.participants.set(clientIdRef.current, {
          clientId: clientIdRef.current,
          userName: trimmedName,
          role: localUserRole,
          activeStage,
          joinedAt: existing?.joinedAt ?? Date.now(),
        });
        host.project = ensureMemberInRoster(
          host.project,
          trimmedName,
          localUserRole
        );
        const nextParticipants = Array.from(host.participants.values());
        setParticipants(nextParticipants);
        callbacksRef.current.onPresenceUpdated(
          nextParticipants,
          host.project.members
        );
        for (const c of host.connections) {
          if (c.open) {
            c.send({
              type: 'presence:updated',
              participants: nextParticipants,
              members: host.project.members,
            });
          }
        }
        return;
      }

      const guestConn = guestConnRef.current;
      if (guestConn && guestConn.open) {
        guestConn.send({
          type: 'presence:stage',
          roomCode,
          clientId: clientIdRef.current,
          userName: trimmedName,
          role: localUserRole,
          activeStage,
        });
      }
    }
  }, [activeStage, localUserName, localUserRole, roomCode, status, transportMode]);

  useEffect(() => {
    return () => {
      shouldStayConnectedRef.current = false;
      cleanupTransport();
    };
  }, [cleanupTransport]);

  // ---------------------------------------------------------------------------
  // Public API: createRoom, joinRoom, leaveRoom, sendPatch
  // ---------------------------------------------------------------------------
  const ensureBackendDetected = useCallback(async (): Promise<boolean> => {
    if (backendAvailableRef.current !== null) {
      return backendAvailableRef.current;
    }
    const available = await checkServerBackendAvailable();
    backendAvailableRef.current = available;
    return available;
  }, []);

  const createRoom = useCallback(
    async (
      initialProject: GroupProjectState,
      desiredCode?: string
    ): Promise<boolean> => {
      setError(null);
      setStatus('connecting');

      const hasBackend = await ensureBackendDetected();
      if (hasBackend) {
        try {
          const res = await fetch(`${API_BASE}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              desiredCode: desiredCode ? normalizeCodeInput(desiredCode) : undefined,
              initialProject,
            }),
          });
          const contentType = res.headers.get('content-type') ?? '';
          if (contentType.includes('application/json')) {
            const data = (await res.json()) as {
              room?: GroupRoomState;
              error?: string;
            };
            if (!res.ok || !data.room) {
              setStatus('error');
              setError(data.error ?? 'Could not create group room.');
              return false;
            }
            const createdCode = data.room.roomCode;
            setRoomCode(createdCode);
            try {
              window.sessionStorage.setItem('igcse_stats_room_code', createdCode);
            } catch {
              // Ignore
            }
            connectServerSocket(createdCode);
            return true;
          }
          // Non-JSON response means static host without Node API: switch to P2P
          backendAvailableRef.current = false;
        } catch {
          backendAvailableRef.current = false;
        }
      }

      return startP2pHost(desiredCode, initialProject);
    },
    [connectServerSocket, ensureBackendDetected, startP2pHost]
  );

  const joinRoom = useCallback(
    async (codeInput: string): Promise<boolean> => {
      const code = normalizeCodeInput(codeInput);
      if (code.length < 4) {
        setStatus('error');
        setError('Please enter a valid group code (at least 4 characters).');
        return false;
      }

      setError(null);
      setStatus('connecting');

      const hasBackend = await ensureBackendDetected();
      if (hasBackend) {
        try {
          const res = await fetch(
            `${API_BASE}/api/rooms/${encodeURIComponent(code)}`
          );
          const contentType = res.headers.get('content-type') ?? '';
          if (contentType.includes('application/json')) {
            const data = (await res.json()) as {
              room?: GroupRoomState;
              error?: string;
            };
            if (!res.ok || !data.room) {
              setStatus('error');
              setError(data.error ?? 'Group room not found.');
              return false;
            }
            setRoomCode(data.room.roomCode);
            setParticipants(data.room.participants ?? []);
            setLastEditedBy(data.room.lastEditedBy ?? null);
            callbacksRef.current.onFullSync(data.room);
            try {
              window.sessionStorage.setItem(
                'igcse_stats_room_code',
                data.room.roomCode
              );
            } catch {
              // Ignore
            }
            connectServerSocket(data.room.roomCode);
            return true;
          }
          backendAvailableRef.current = false;
        } catch {
          backendAvailableRef.current = false;
        }
      }

      return joinP2pGuest(code);
    },
    [connectServerSocket, ensureBackendDetected, joinP2pGuest]
  );

  const leaveRoom = useCallback(() => {
    shouldStayConnectedRef.current = false;
    const activeCode = roomCodeRef.current;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:leave' }));
    }
    if (guestConnRef.current && guestConnRef.current.open) {
      guestConnRef.current.send({ type: 'room:leave' });
    }

    cleanupTransport();
    setRoomCode(null);
    setTransportMode(null);
    setStatus('idle');
    setError(null);
    setParticipants([]);
    setLastEditedBy(null);
    pendingPatchesRef.current = [];
    try {
      window.sessionStorage.removeItem('igcse_stats_room_code');
      if (activeCode) {
        window.sessionStorage.removeItem(`igcse_stats_p2p_host_${activeCode}`);
      }
    } catch {
      // Ignore
    }
  }, [cleanupTransport]);

  const sendPatch = useCallback((patch: GroupProjectPatch) => {
    const code = roomCodeRef.current;
    if (!code) return;
    const editorName = userNameRef.current.trim() || 'Teammate';

    if (transportModeRef.current === 'p2p') {
      const host = p2pHostRef.current;
      if (host) {
        host.project = applyProjectPatch(host.project, patch);
        host.version += 1;
        host.updatedAt = Date.now();
        host.lastEditedBy = {
          userName: editorName,
          section: describePatchSection(patch),
          timestamp: host.updatedAt,
        };
        setLastEditedBy(host.lastEditedBy);
        saveP2pHostSnapshot(code, {
          roomCode: code,
          version: host.version,
          updatedAt: host.updatedAt,
          lastEditedBy: host.lastEditedBy,
          project: host.project,
        });
        for (const c of host.connections) {
          if (c.open) {
            c.send({
              type: 'project:patched',
              patch,
              version: host.version,
              updatedAt: host.updatedAt,
              lastEditedBy: host.lastEditedBy,
              originClientId: clientIdRef.current,
            });
          }
        }
        return;
      }

      const guestConn = guestConnRef.current;
      if (guestConn && guestConn.open) {
        guestConn.send({
          type: 'project:patch',
          roomCode: code,
          clientId: clientIdRef.current,
          userName: editorName,
          patch,
        });
      } else {
        pendingPatchesRef.current.push(patch);
      }
      return;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'project:patch',
          roomCode: code,
          clientId: clientIdRef.current,
          userName: editorName,
          patch,
        })
      );
    } else {
      pendingPatchesRef.current.push(patch);
    }
  }, []);

  return {
    clientId: clientIdRef.current,
    roomCode,
    status,
    transportMode,
    error,
    setError,
    participants,
    lastEditedBy,
    localUserName,
    setLocalUserName,
    localUserRole,
    setLocalUserRole,
    createRoom,
    joinRoom,
    leaveRoom,
    sendPatch,
  };
}
