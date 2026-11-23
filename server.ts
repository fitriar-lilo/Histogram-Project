import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  GroupParticipant,
  GroupProjectPatch,
  GroupProjectState,
  GroupRoomState,
  LabStage,
} from './src/types/statistics.ts';
import {
  applyProjectPatch,
  createEmptyGroupProject,
  describePatchSection,
} from './src/utils/groupSync.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'group-rooms.json');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface StoredRoomRecord {
  roomCode: string;
  version: number;
  updatedAt: number;
  lastEditedBy: GroupRoomState['lastEditedBy'];
  project: GroupProjectState;
}

interface ClientSocketMeta {
  roomCode: string;
  clientId: string;
}

const rooms = new Map<string, StoredRoomRecord>();
const roomParticipants = new Map<string, Map<string, GroupParticipant>>();
const roomSockets = new Map<string, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, ClientSocketMeta>();

function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return `G${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

function loadRoomsFromDisk(): void {
  try {
    if (!fs.existsSync(ROOMS_FILE)) return;
    const raw = fs.readFileSync(ROOMS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredRoomRecord[];
    if (!Array.isArray(parsed)) return;
    for (const rec of parsed) {
      if (rec && typeof rec.roomCode === 'string' && rec.project) {
        rooms.set(normalizeRoomCode(rec.roomCode), {
          ...rec,
          roomCode: normalizeRoomCode(rec.roomCode),
        });
      }
    }
  } catch (err) {
    console.error('Failed to load persisted group rooms:', err);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSaveRooms(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const payload = JSON.stringify(Array.from(rooms.values()));
      fs.writeFile(ROOMS_FILE, payload, 'utf8', (err) => {
        if (err) {
          console.error('Failed to persist group rooms:', err);
        }
      });
    } catch (err) {
      console.error('Failed to prepare group rooms directory:', err);
    }
  }, 250);
}

function toPublicRoomState(rec: StoredRoomRecord): GroupRoomState {
  const activeMap = roomParticipants.get(rec.roomCode);
  return {
    roomCode: rec.roomCode,
    version: rec.version,
    updatedAt: rec.updatedAt,
    lastEditedBy: rec.lastEditedBy,
    project: rec.project,
    participants: activeMap ? Array.from(activeMap.values()) : [],
  };
}

function broadcastToRoom(
  roomCode: string,
  payload: unknown,
  excludeSocket?: WebSocket
): void {
  const sockets = roomSockets.get(roomCode);
  if (!sockets) return;
  const serialized = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws !== excludeSocket && ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

function ensureMemberInRoster(
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

function detachSocket(ws: WebSocket): void {
  const meta = socketMeta.get(ws);
  if (!meta) return;
  socketMeta.delete(ws);

  const sockets = roomSockets.get(meta.roomCode);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      roomSockets.delete(meta.roomCode);
    }
  }

  const participants = roomParticipants.get(meta.roomCode);
  if (participants) {
    participants.delete(meta.clientId);
    const rec = rooms.get(meta.roomCode);
    if (rec) {
      broadcastToRoom(meta.roomCode, {
        type: 'presence:updated',
        participants: Array.from(participants.values()),
        members: rec.project.members,
      });
    }
  }
}

async function startServer(): Promise<void> {
  loadRoomsFromDisk();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  app.post('/api/rooms', (req, res) => {
    const body = req.body as {
      desiredCode?: string;
      initialProject?: Partial<GroupProjectState>;
    };

    let roomCode = '';
    if (body?.desiredCode) {
      const normalized = normalizeRoomCode(body.desiredCode);
      if (normalized.length < 4) {
        res.status(400).json({
          error: 'Group code must be at least 4 letters or numbers.',
        });
        return;
      }
      if (rooms.has(normalized)) {
        res.status(409).json({
          error: `Group code "${normalized}" is already in use. Choose another code or join it.`,
        });
        return;
      }
      roomCode = normalized;
    } else {
      roomCode = generateRoomCode();
    }

    const baseProject = createEmptyGroupProject();
    const initial = body?.initialProject;
    const project: GroupProjectState = initial
      ? {
          ...baseProject,
          ...initial,
          members:
            Array.isArray(initial.members) && initial.members.length > 0
              ? initial.members
              : baseProject.members,
          tableInputs: initial.tableInputs ?? baseProject.tableInputs,
          summaryInputs: initial.summaryInputs ?? baseProject.summaryInputs,
          histogramBars: Array.isArray(initial.histogramBars)
            ? initial.histogramBars
            : baseProject.histogramBars,
          histogramReflection:
            initial.histogramReflection ?? baseProject.histogramReflection,
        }
      : baseProject;

    const record: StoredRoomRecord = {
      roomCode,
      version: 1,
      updatedAt: Date.now(),
      lastEditedBy: null,
      project,
    };

    rooms.set(roomCode, record);
    scheduleSaveRooms();
    res.status(201).json({ room: toPublicRoomState(record) });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = normalizeRoomCode(req.params.code || '');
    const record = rooms.get(code);
    if (!record) {
      res.status(404).json({
        error: `No group session found for code "${code || req.params.code}". Ask your teammate for the exact 6-character code or create a new room.`,
      });
      return;
    }
    res.json({ room: toPublicRoomState(record) });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let isAlive = true;
    ws.on('pong', () => {
      isAlive = true;
    });

    const heartbeat = setInterval(() => {
      if (!isAlive) {
        ws.terminate();
        return;
      }
      isAlive = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on('message', (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      if (type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      if (type === 'room:join') {
        const roomCode = normalizeRoomCode(String(msg.roomCode ?? ''));
        const clientId = String(msg.clientId ?? '').slice(0, 64);
        const userName = String(msg.userName ?? 'Teammate').trim().slice(0, 60) || 'Teammate';
        const role = String(msg.role ?? 'Collaborator').trim().slice(0, 60) || 'Collaborator';
        const activeStage = ([
          'data',
          'table',
          'histogram',
          'cum-data',
          'cum-curve',
        ].includes(String(msg.activeStage))
          ? String(msg.activeStage)
          : 'data') as LabStage;

        const rec = rooms.get(roomCode);
        if (!rec) {
          ws.send(
            JSON.stringify({
              type: 'room:error',
              message: `Group code "${roomCode}" no longer exists.`,
            })
          );
          return;
        }

        // Detach from any prior room on this socket first
        detachSocket(ws);

        socketMeta.set(ws, { roomCode, clientId });

        let sockets = roomSockets.get(roomCode);
        if (!sockets) {
          sockets = new Set<WebSocket>();
          roomSockets.set(roomCode, sockets);
        }
        sockets.add(ws);

        let participants = roomParticipants.get(roomCode);
        if (!participants) {
          participants = new Map<string, GroupParticipant>();
          roomParticipants.set(roomCode, participants);
        }
        participants.set(clientId, {
          clientId,
          userName,
          role,
          activeStage,
          joinedAt: Date.now(),
        });

        const updatedProject = ensureMemberInRoster(rec.project, userName, role);
        if (updatedProject !== rec.project) {
          rec.project = updatedProject;
          rec.version += 1;
          rec.updatedAt = Date.now();
          scheduleSaveRooms();
        }

        const roomSnapshot = toPublicRoomState(rec);
        ws.send(JSON.stringify({ type: 'room:sync', room: roomSnapshot }));

        broadcastToRoom(
          roomCode,
          {
            type: 'presence:updated',
            participants: roomSnapshot.participants,
            members: rec.project.members,
          },
          ws
        );
        return;
      }

      if (type === 'presence:stage') {
        const meta = socketMeta.get(ws);
        if (!meta) return;
        const participants = roomParticipants.get(meta.roomCode);
        const existing = participants?.get(meta.clientId);
        if (!participants || !existing) return;

        const nextStage = ([
          'data',
          'table',
          'histogram',
          'cum-data',
          'cum-curve',
        ].includes(String(msg.activeStage))
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

        participants.set(meta.clientId, {
          ...existing,
          userName: nextName,
          role: nextRole,
          activeStage: nextStage,
        });

        const rec = rooms.get(meta.roomCode);
        broadcastToRoom(meta.roomCode, {
          type: 'presence:updated',
          participants: Array.from(participants.values()),
          members: rec?.project.members,
        });
        return;
      }

      if (type === 'project:patch') {
        const meta = socketMeta.get(ws);
        if (!meta) return;
        const rec = rooms.get(meta.roomCode);
        if (!rec) return;

        const patch = msg.patch as GroupProjectPatch | undefined;
        if (!patch || typeof patch !== 'object') return;

        const userName =
          typeof msg.userName === 'string' && msg.userName.trim()
            ? msg.userName.trim().slice(0, 60)
            : 'Teammate';

        rec.project = applyProjectPatch(rec.project, patch);
        rec.version += 1;
        rec.updatedAt = Date.now();
        rec.lastEditedBy = {
          userName,
          section: describePatchSection(patch),
          timestamp: rec.updatedAt,
        };
        scheduleSaveRooms();

        broadcastToRoom(
          meta.roomCode,
          {
            type: 'project:patched',
            patch,
            version: rec.version,
            updatedAt: rec.updatedAt,
            lastEditedBy: rec.lastEditedBy,
            originClientId: meta.clientId,
          },
          ws
        );
        return;
      }

      if (type === 'room:leave') {
        detachSocket(ws);
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      detachSocket(ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' || req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/ws')) {
        next();
        return;
      }
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        const template = fs.readFileSync(indexPath, 'utf8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`IGCSE 0580 Stats Lab server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
