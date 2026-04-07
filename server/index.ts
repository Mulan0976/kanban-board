import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { initDb, type Database } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File upload storage - saves to ./uploads/{boardId}/
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JwtPayload {
  userId: string;
  email: string;
}

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser | null;
      sessionToken: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || 'nexus-board-secret-dev';
const PORT = parseInt(process.env.PORT || '3001', 10);

const db: Database = await initDb();

const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// Session token middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  let sessionToken = req.cookies?.session_token;
  if (!sessionToken) {
    sessionToken = uuidv4();
    res.cookie('session_token', sessionToken, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
    });
  }
  req.sessionToken = sessionToken;
  next();
});

// Auth middleware – optional JWT extraction
app.use((req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(decoded.userId) as any;
      if (user) {
        req.user = { id: user.id, email: user.email, displayName: user.display_name };
      } else {
        req.user = null;
      }
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
});

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

function getBoardPermission(
  boardId: string,
  userId: string | undefined,
  sessionToken: string,
): 'owner' | 'edit' | 'view' | null {
  const board = db.prepare('SELECT owner_id, owner_session FROM boards WHERE id = ?').get(boardId) as any;
  if (!board) return null;

  // Owner check
  if (userId && board.owner_id === userId) return 'owner';
  if (board.owner_session && board.owner_session === sessionToken) return 'owner';

  // Check board_members
  let member: any = null;
  if (userId) {
    member = db.prepare('SELECT permission FROM board_members WHERE board_id = ? AND user_id = ?').get(boardId, userId);
  }
  if (!member) {
    member = db.prepare('SELECT permission FROM board_members WHERE board_id = ? AND session_token = ?').get(boardId, sessionToken);
  }

  if (member) {
    return member.permission as 'edit' | 'view';
  }

  return null;
}

function requirePermission(level: 'view' | 'edit' | 'owner'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const boardId = req.params.boardId || req.params.id;
    if (!boardId) {
      res.status(400).json({ error: 'Board ID required' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const hierarchy: Record<string, number> = { view: 1, edit: 2, owner: 3 };
    if (hierarchy[perm] < hierarchy[level]) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

// Helper to find the board a column belongs to
function getBoardIdForColumn(columnId: string): string | null {
  const col = db.prepare('SELECT board_id FROM columns WHERE id = ?').get(columnId) as any;
  return col ? col.board_id : null;
}

// Helper to find the board a task belongs to
function getBoardIdForTask(taskId: string): string | null {
  const task = db.prepare(`
    SELECT c.board_id FROM tasks t
    JOIN columns c ON t.column_id = c.id
    WHERE t.id = ?
  `).get(taskId) as any;
  return task ? task.board_id : null;
}

// Helper to find the board a checkpoint belongs to
function getBoardIdForCheckpoint(checkpointId: string): string | null {
  const row = db.prepare(`
    SELECT c.board_id FROM task_checkpoints cp
    JOIN tasks t ON cp.task_id = t.id
    JOIN columns c ON t.column_id = c.id
    WHERE cp.id = ?
  `).get(checkpointId) as any;
  return row ? row.board_id : null;
}

// Generate random invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

const boardRooms: Map<string, Set<WebSocket>> = new Map();

interface WsClient extends WebSocket {
  userId?: string;
  sessionToken?: string;
  boardIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Presence System
// ---------------------------------------------------------------------------

const PRESENCE_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
  '#ff5722', '#607d8b', '#673ab7', '#009688', '#ffc107',
];

let colorIndex = 0;
function getNextColor(): string {
  const color = PRESENCE_COLORS[colorIndex % PRESENCE_COLORS.length];
  colorIndex++;
  return color;
}

interface PresenceClient {
  ws: WebSocket;
  boardId: string;
  userId: string;
  displayName: string;
  color: string;
  action: string;
  taskId?: string;
}

// Map from WebSocket to Map<boardId, PresenceClient>
const presenceClients: Map<WebSocket, Map<string, PresenceClient>> = new Map();

function getPresenceListForBoard(boardId: string): Array<{ id: string; name: string; color: string; action: string; taskId?: string }> {
  const users: Array<{ id: string; name: string; color: string; action: string; taskId?: string }> = [];
  for (const [, boardMap] of presenceClients) {
    const presence = boardMap.get(boardId);
    if (presence) {
      users.push({
        id: presence.userId,
        name: presence.displayName,
        color: presence.color,
        action: presence.action,
        taskId: presence.taskId,
      });
    }
  }
  return users;
}

function broadcastPresence(boardId: string): void {
  const users = getPresenceListForBoard(boardId);
  broadcast(boardId, { type: 'presence:update', users });
}

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WsClient, req) => {
  // Parse cookies from upgrade request
  const cookieHeader = req.headers.cookie || '';
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((c) => {
    const [key, ...rest] = c.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  });

  ws.sessionToken = cookies.session_token;
  ws.boardIds = new Set();

  // Try to extract user from auth_token
  if (cookies.auth_token) {
    try {
      const decoded = jwt.verify(cookies.auth_token, JWT_SECRET) as JwtPayload;
      ws.userId = decoded.userId;
    } catch {
      // ignore invalid token
    }
  }

  // Resolve display name for presence
  let wsDisplayName = 'Anonymous';
  if (ws.userId) {
    const wsUser = db.prepare('SELECT display_name FROM users WHERE id = ?').get(ws.userId) as any;
    if (wsUser) wsDisplayName = wsUser.display_name;
  }
  const wsColor = getNextColor();

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'join' && msg.boardId) {
        const perm = getBoardPermission(msg.boardId, ws.userId, ws.sessionToken || '');
        if (!perm) {
          ws.send(JSON.stringify({ type: 'error', message: 'Access denied to board' }));
          return;
        }
        if (!boardRooms.has(msg.boardId)) {
          boardRooms.set(msg.boardId, new Set());
        }
        boardRooms.get(msg.boardId)!.add(ws);
        ws.boardIds!.add(msg.boardId);

        // Track presence
        if (!presenceClients.has(ws)) {
          presenceClients.set(ws, new Map());
        }
        presenceClients.get(ws)!.set(msg.boardId, {
          ws,
          boardId: msg.boardId,
          userId: ws.userId || ws.sessionToken || uuidv4(),
          displayName: wsDisplayName,
          color: wsColor,
          action: 'viewing',
        });

        ws.send(JSON.stringify({ type: 'joined', boardId: msg.boardId }));
        broadcastPresence(msg.boardId);
      }

      if (msg.type === 'leave' && msg.boardId) {
        const room = boardRooms.get(msg.boardId);
        if (room) {
          room.delete(ws);
          if (room.size === 0) boardRooms.delete(msg.boardId);
        }
        ws.boardIds!.delete(msg.boardId);

        // Remove presence for this board
        const boardMap = presenceClients.get(ws);
        if (boardMap) {
          boardMap.delete(msg.boardId);
          if (boardMap.size === 0) presenceClients.delete(ws);
        }
        broadcastPresence(msg.boardId);
      }

      if (msg.type === 'activity') {
        // Update user activity for the relevant board
        const boardMap = presenceClients.get(ws);
        if (boardMap) {
          // Find which board to update — use msg.boardId if provided, otherwise update all
          const targetBoards = msg.boardId ? [msg.boardId] : Array.from(boardMap.keys());
          for (const bid of targetBoards) {
            const presence = boardMap.get(bid);
            if (presence) {
              if (msg.action) presence.action = msg.action;
              if (msg.taskId !== undefined) presence.taskId = msg.taskId || undefined;
              broadcastPresence(bid);
            }
          }
        }
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    // Collect boardIds before cleaning up for presence broadcast
    const affectedBoards: string[] = [];
    if (ws.boardIds) {
      for (const boardId of ws.boardIds) {
        affectedBoards.push(boardId);
        const room = boardRooms.get(boardId);
        if (room) {
          room.delete(ws);
          if (room.size === 0) boardRooms.delete(boardId);
        }
      }
    }

    // Clean up presence
    presenceClients.delete(ws);

    // Broadcast updated presence to all affected boards
    for (const boardId of affectedBoards) {
      broadcastPresence(boardId);
    }
  });
});

function broadcast(boardId: string, message: object, excludeWs?: WebSocket): void {
  const room = boardRooms.get(boardId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ---------------------------------------------------------------------------
// Action History Helpers
// ---------------------------------------------------------------------------

const ACTION_SNAPSHOT_INTERVAL = 10; // Store a snapshot every N actions

function createBoardSnapshot(boardId: string): string {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as any;
  if (!board) return JSON.stringify(null);

  const columns = db.prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC').all(boardId) as any[];

  const columnsWithTasks = columns.map((col) => {
    const tasks = db.prepare('SELECT * FROM tasks WHERE column_id = ? ORDER BY position ASC').all(col.id) as any[];

    const tasksWithDetails = tasks.map((task) => {
      const assignees = db.prepare('SELECT * FROM task_assignees WHERE task_id = ?').all(task.id) as any[];
      const checkpoints = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY position ASC').all(task.id) as any[];
      const timeLogs = db.prepare('SELECT * FROM time_logs WHERE task_id = ? ORDER BY logged_at DESC').all(task.id) as any[];
      const dependencies = db.prepare('SELECT dependency_id FROM task_dependencies WHERE task_id = ?').all(task.id) as any[];

      return {
        id: task.id,
        columnId: task.column_id,
        title: task.title,
        content: task.content,
        position: task.position,
        color: task.color,
        previewImage: task.preview_image,
        previewSettings: task.preview_settings ? JSON.parse(task.preview_settings) : null,
        attachments: task.attachments ? JSON.parse(task.attachments) : [],
        durationMinutes: task.duration_minutes,
        completedAt: task.completed_at,
        createdAt: task.created_at,
        assignees: assignees.map((a) => ({ id: a.id, taskId: a.task_id, name: a.name })),
        checkpoints: checkpoints.map((cp) => ({
          id: cp.id,
          taskId: cp.task_id,
          title: cp.title,
          isCompleted: !!cp.is_completed,
          position: cp.position,
        })),
        timeLogs: timeLogs.map((tl) => ({
          id: tl.id,
          taskId: tl.task_id,
          userName: tl.user_name,
          minutes: tl.minutes,
          loggedAt: tl.logged_at,
        })),
        dependencyIds: dependencies.map((d: any) => d.dependency_id),
      };
    });

    return {
      id: col.id,
      boardId: col.board_id,
      title: col.title,
      position: col.position,
      x: col.x,
      y: col.y,
      width: col.width ?? 300,
      height: col.height ?? null,
      color: col.color,
      isDoneColumn: !!col.is_done_column,
      createdAt: col.created_at,
      tasks: tasksWithDetails,
    };
  });

  return JSON.stringify({
    id: board.id,
    title: board.title,
    columns: columnsWithTasks,
  });
}

function recordAction(boardId: string, userName: string, actionType: string, actionSummary: string): void {
  try {
    const id = uuidv4();

    // Check if we should store a snapshot (every Nth action)
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM action_history WHERE board_id = ?').get(boardId) as any;
    const count = countRow?.cnt ?? 0;
    const shouldSnapshot = (count % ACTION_SNAPSHOT_INTERVAL) === 0;

    const snapshot = shouldSnapshot ? createBoardSnapshot(boardId) : null;

    db.prepare(
      'INSERT INTO action_history (id, board_id, user_name, action_type, action_summary, snapshot) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, boardId, userName, actionType, actionSummary, snapshot);
  } catch (err) {
    // Don't let action recording break the main operation
    console.error('Failed to record action:', err);
  }
}

// ---------------------------------------------------------------------------
// Auth Routes
// ---------------------------------------------------------------------------

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      res.status(400).json({ error: 'Email, password, and displayName are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)').run(
      id, normalizedEmail, passwordHash, displayName
    );
    db.saveNow(); // Ensure user data persists immediately

    const token = jwt.sign({ userId: id, email: normalizedEmail } as JwtPayload, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('auth_token', token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/',
    });

    res.json({ user: { id, email: normalizedEmail, displayName } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = db.prepare('SELECT id, email, password_hash, display_name FROM users WHERE email = ?').get(normalizedEmail) as any;
    if (!user) {
      res.status(401).json({ error: 'No account found with this email. Please register first.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect password. Please try again.' });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email } as JwtPayload, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('auth_token', token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/',
    });

    res.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  if (req.user) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ success: true });
});

app.post('/api/auth/merge-anonymous', (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { boardIds } = req.body;
    if (!Array.isArray(boardIds)) {
      res.status(400).json({ error: 'boardIds must be an array' });
      return;
    }

    const updateBoard = db.prepare(
      'UPDATE boards SET owner_id = ?, owner_session = NULL WHERE id = ? AND owner_session = ?'
    );
    const updateMembers = db.prepare(
      'UPDATE board_members SET user_id = ?, session_token = NULL WHERE board_id = ? AND session_token = ?'
    );

    const mergeTransaction = db.transaction((ids: string[]) => {
      for (const boardId of ids) {
        updateBoard.run(req.user!.id, boardId, req.sessionToken);
        updateMembers.run(req.user!.id, boardId, req.sessionToken);
      }
    });

    mergeTransaction(boardIds);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Board Routes
// ---------------------------------------------------------------------------

app.get('/api/boards', (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const sessionToken = req.sessionToken;

    let boards: any[] = [];

    if (userId) {
      // Boards owned by authenticated user
      const ownedByUser = db.prepare(`
        SELECT b.id, b.title, b.updated_at,
               COALESCE(u.display_name, 'Anonymous') as owner_name,
               'owner' as permission
        FROM boards b
        LEFT JOIN users u ON b.owner_id = u.id
        WHERE b.owner_id = ?
      `).all(userId);
      boards.push(...ownedByUser);

      // Boards where user is a member
      const memberOfUser = db.prepare(`
        SELECT b.id, b.title, b.updated_at,
               COALESCE(u.display_name, 'Anonymous') as owner_name,
               bm.permission
        FROM boards b
        JOIN board_members bm ON bm.board_id = b.id
        LEFT JOIN users u ON b.owner_id = u.id
        WHERE bm.user_id = ?
      `).all(userId);
      boards.push(...memberOfUser);
    }

    // Boards owned by session
    const ownedBySession = db.prepare(`
      SELECT b.id, b.title, b.updated_at,
             'Anonymous' as owner_name,
             'owner' as permission
      FROM boards b
      WHERE b.owner_session = ?
    `).all(sessionToken);
    boards.push(...ownedBySession);

    // Boards where session is a member
    const memberOfSession = db.prepare(`
      SELECT b.id, b.title, b.updated_at,
             COALESCE(u.display_name, 'Anonymous') as owner_name,
             bm.permission
      FROM boards b
      JOIN board_members bm ON bm.board_id = b.id
      LEFT JOIN users u ON b.owner_id = u.id
      WHERE bm.session_token = ?
    `).all(sessionToken);
    boards.push(...memberOfSession);

    // Deduplicate by id, keeping highest permission
    const hierarchy: Record<string, number> = { view: 1, edit: 2, owner: 3 };
    const boardMap = new Map<string, any>();
    for (const b of boards) {
      const existing = boardMap.get(b.id);
      if (!existing || hierarchy[b.permission] > hierarchy[existing.permission]) {
        boardMap.set(b.id, b);
      }
    }

    const result = Array.from(boardMap.values()).map((b) => ({
      id: b.id,
      title: b.title,
      ownerName: b.owner_name,
      permission: b.permission,
      updatedAt: b.updated_at,
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/boards', (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const id = uuidv4();
    const ownerId = req.user?.id || null;
    const ownerSession = req.user ? null : req.sessionToken;

    db.prepare('INSERT INTO boards (id, title, owner_id, owner_session) VALUES (?, ?, ?, ?)').run(
      id, title, ownerId, ownerSession
    );

    // Create default columns
    const col1Id = uuidv4();
    const col2Id = uuidv4();
    const col3Id = uuidv4();
    db.prepare('INSERT INTO columns (id, board_id, title, position, x, y, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(col1Id, id, 'To Do', 0, 50, 50, '#eab308');
    db.prepare('INSERT INTO columns (id, board_id, title, position, x, y, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(col2Id, id, 'Doing', 1, 400, 50, '#3b82f6');
    db.prepare('INSERT INTO columns (id, board_id, title, position, x, y, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(col3Id, id, 'Pending Review', 2, 750, 50, '#22c55e');

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as any;
    res.status(201).json({
      id: board.id,
      title: board.title,
      ownerId: board.owner_id,
      ownerSession: board.owner_session,
      createdAt: board.created_at,
      updatedAt: board.updated_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/api/boards/:id', requirePermission('view'), (req: Request, res: Response) => {
  try {
    const boardId = req.params.id;
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as any;
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    let ownerName = 'Anonymous';
    if (board.owner_id) {
      const owner = db.prepare('SELECT display_name FROM users WHERE id = ?').get(board.owner_id) as any;
      if (owner) ownerName = owner.display_name;
    }

    const permission = getBoardPermission(boardId, req.user?.id, req.sessionToken);

    // Get columns
    const columns = db.prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC').all(boardId) as any[];

    const columnsWithTasks = columns.map((col) => {
      const tasks = db.prepare('SELECT * FROM tasks WHERE column_id = ? ORDER BY position ASC').all(col.id) as any[];

      const tasksWithDetails = tasks.map((task) => {
        const assignees = db.prepare('SELECT * FROM task_assignees WHERE task_id = ?').all(task.id) as any[];
        const checkpoints = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY position ASC').all(task.id) as any[];
        const timeLogs = db.prepare('SELECT * FROM time_logs WHERE task_id = ? ORDER BY logged_at DESC').all(task.id) as any[];
        const dependencies = db.prepare('SELECT dependency_id FROM task_dependencies WHERE task_id = ?').all(task.id) as any[];

        return {
          id: task.id,
          columnId: task.column_id,
          title: task.title,
          content: task.content,
          position: task.position,
          color: task.color,
          previewImage: task.preview_image,
          previewSettings: task.preview_settings ? JSON.parse(task.preview_settings) : null,
          attachments: task.attachments ? JSON.parse(task.attachments) : [],
          durationMinutes: task.duration_minutes,
          completedAt: task.completed_at,
          createdAt: task.created_at,
          assignees: assignees.map((a) => ({ id: a.id, taskId: a.task_id, name: a.name })),
          checkpoints: checkpoints.map((cp) => ({
            id: cp.id,
            taskId: cp.task_id,
            title: cp.title,
            isCompleted: !!cp.is_completed,
            position: cp.position,
          })),
          timeLogs: timeLogs.map((tl) => ({
            id: tl.id,
            taskId: tl.task_id,
            userName: tl.user_name,
            minutes: tl.minutes,
            loggedAt: tl.logged_at,
          })),
          dependencyIds: dependencies.map((d: any) => d.dependency_id),
        };
      });

      return {
        id: col.id,
        boardId: col.board_id,
        title: col.title,
        position: col.position,
        x: col.x,
        y: col.y,
        width: col.width ?? 300,
        height: col.height ?? null,
        color: col.color,
        isDoneColumn: !!col.is_done_column,
        createdAt: col.created_at,
        tasks: tasksWithDetails,
      };
    });

    res.json({
      id: board.id,
      title: board.title,
      ownerId: board.owner_id,
      ownerName,
      permission,
      columns: columnsWithTasks,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.put('/api/boards/:id', requirePermission('owner'), (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    db.prepare("UPDATE boards SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, req.params.id);
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id) as any;

    res.json({
      id: board.id,
      title: board.title,
      ownerId: board.owner_id,
      updatedAt: board.updated_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.delete('/api/boards/:id', requirePermission('owner'), (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Sharing Routes
// ---------------------------------------------------------------------------

app.post('/api/boards/:id/invite', requirePermission('owner'), (req: Request, res: Response) => {
  try {
    const { permission } = req.body;
    if (!permission || !['view', 'edit'].includes(permission)) {
      res.status(400).json({ error: 'Permission must be "view" or "edit"' });
      return;
    }

    const id = uuidv4();
    const code = generateInviteCode();

    db.prepare('INSERT INTO invite_links (id, board_id, code, permission) VALUES (?, ?, ?, ?)').run(
      id, req.params.id, code, permission
    );

    res.status(201).json({ code, permission });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/boards/join/:code', (req: Request, res: Response) => {
  try {
    const invite = db.prepare('SELECT * FROM invite_links WHERE code = ?').get(req.params.code) as any;
    if (!invite) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(invite.board_id) as any;
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    // Check if already a member or owner
    const existingPerm = getBoardPermission(invite.board_id, req.user?.id, req.sessionToken);
    if (existingPerm === 'owner') {
      res.json({
        id: board.id,
        title: board.title,
        permission: 'owner',
      });
      return;
    }

    // Check if already a member
    let existingMember: any = null;
    if (req.user) {
      existingMember = db.prepare(
        'SELECT id FROM board_members WHERE board_id = ? AND user_id = ?'
      ).get(invite.board_id, req.user.id);
    }
    if (!existingMember) {
      existingMember = db.prepare(
        'SELECT id FROM board_members WHERE board_id = ? AND session_token = ?'
      ).get(invite.board_id, req.sessionToken);
    }

    if (!existingMember) {
      const memberId = uuidv4();
      const userId = req.user?.id || null;
      const sessionToken = req.user ? null : req.sessionToken;
      const displayName = req.user?.displayName || req.body?.displayName || 'Anonymous';

      db.prepare(
        'INSERT INTO board_members (id, board_id, user_id, session_token, permission, display_name) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(memberId, invite.board_id, userId, sessionToken, invite.permission, displayName);
    }

    // Delete invite link after use (single-use)
    db.prepare('DELETE FROM invite_links WHERE id = ?').run(invite.id);

    res.json({
      id: board.id,
      title: board.title,
      permission: invite.permission,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/api/boards/:id/members', requirePermission('view'), (req: Request, res: Response) => {
  try {
    const boardId = req.params.id;
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as any;
    const members = db.prepare('SELECT * FROM board_members WHERE board_id = ?').all(boardId) as any[];

    // Include the board owner as a member in the response
    const result: any[] = [];

    if (board.owner_id) {
      const owner = db.prepare('SELECT display_name FROM users WHERE id = ?').get(board.owner_id) as any;
      result.push({
        id: 'owner-' + board.owner_id,
        displayName: owner?.display_name || 'Owner',
        permission: 'owner',
        isAnonymous: false,
      });
    }

    for (const m of members) {
      let displayName = m.display_name || 'Anonymous';
      let isAnonymous = true;

      if (m.user_id) {
        const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(m.user_id) as any;
        if (user) {
          displayName = user.display_name;
          isAnonymous = false;
        }
      }

      result.push({
        id: m.id,
        displayName,
        permission: m.permission,
        isAnonymous,
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.put('/api/boards/:id/members/:memberId', requirePermission('owner'), (req: Request, res: Response) => {
  try {
    const { permission } = req.body;
    if (!permission || !['view', 'edit'].includes(permission)) {
      res.status(400).json({ error: 'Permission must be "view" or "edit"' });
      return;
    }

    const member = db.prepare('SELECT * FROM board_members WHERE id = ? AND board_id = ?').get(
      req.params.memberId, req.params.id
    ) as any;
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    db.prepare('UPDATE board_members SET permission = ? WHERE id = ?').run(permission, req.params.memberId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.delete('/api/boards/:id/members/:memberId', requirePermission('owner'), (req: Request, res: Response) => {
  try {
    const member = db.prepare('SELECT * FROM board_members WHERE id = ? AND board_id = ?').get(
      req.params.memberId, req.params.id
    ) as any;
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    db.prepare('DELETE FROM board_members WHERE id = ?').run(req.params.memberId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Column Routes
// ---------------------------------------------------------------------------

app.post('/api/boards/:boardId/columns', requirePermission('edit'), (req: Request, res: Response) => {
  try {
    const { title, x, y, color, width, height } = req.body;
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const boardId = req.params.boardId;
    const id = uuidv4();

    // Get next position
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM columns WHERE board_id = ?').get(boardId) as any;
    const position = maxPos.maxPos + 1;

    db.prepare(
      'INSERT INTO columns (id, board_id, title, position, x, y, width, height, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, boardId, title, position, x ?? 0, y ?? 250, width ?? 300, height ?? null, color ?? null);

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    const column = db.prepare('SELECT * FROM columns WHERE id = ?').get(id) as any;
    const result = {
      id: column.id,
      boardId: column.board_id,
      title: column.title,
      position: column.position,
      x: column.x,
      y: column.y,
      width: column.width ?? 300,
      height: column.height ?? null,
      color: column.color,
      isDoneColumn: !!column.is_done_column,
      createdAt: column.created_at,
      tasks: [],
    };

    broadcast(boardId, { type: 'column:created', column: result });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'column:create', `Created column '${title}'`);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Bulk update column positions - MUST be before /api/columns/:id to avoid param match
app.put('/api/columns/bulk-update', (req: Request, res: Response) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ error: 'Updates array is required' });
      return;
    }

    const firstBoardId = getBoardIdForColumn(updates[0].id);
    if (!firstBoardId) {
      res.status(404).json({ error: 'Column not found' });
      return;
    }

    const perm = getBoardPermission(firstBoardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    for (const item of updates) {
      db.prepare(
        'UPDATE columns SET x = ?, y = ?, position = ? WHERE id = ?'
      ).run(item.x ?? 0, item.y ?? 250, item.position ?? 0, item.id);
    }
    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(firstBoardId);

    broadcast(firstBoardId, { type: 'columns:bulk-updated', updates });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.put('/api/columns/:id', (req: Request, res: Response) => {
  try {
    const columnId = req.params.id;
    const boardId = getBoardIdForColumn(columnId);
    if (!boardId) {
      res.status(404).json({ error: 'Column not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const col = db.prepare('SELECT * FROM columns WHERE id = ?').get(columnId) as any;
    if (!col) {
      res.status(404).json({ error: 'Column not found' });
      return;
    }

    const { title, x, y, width, height, color, isDoneColumn, position } = req.body;

    const newTitle = title !== undefined ? title : col.title;
    const newX = x !== undefined ? x : col.x;
    const newY = y !== undefined ? y : col.y;
    const newWidth = width !== undefined ? width : (col.width ?? 300);
    const newHeight = height !== undefined ? height : col.height;
    const newColor = color !== undefined ? color : col.color;
    const newIsDoneColumn = isDoneColumn !== undefined ? (isDoneColumn ? 1 : 0) : col.is_done_column;
    const newPosition = position !== undefined ? position : col.position;

    db.prepare(
      'UPDATE columns SET title = ?, x = ?, y = ?, width = ?, height = ?, color = ?, is_done_column = ?, position = ? WHERE id = ?'
    ).run(newTitle, newX, newY, newWidth, newHeight, newColor, newIsDoneColumn, newPosition, columnId);

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    const updated = db.prepare('SELECT * FROM columns WHERE id = ?').get(columnId) as any;
    const result = {
      id: updated.id,
      boardId: updated.board_id,
      title: updated.title,
      position: updated.position,
      x: updated.x,
      y: updated.y,
      width: updated.width ?? 300,
      height: updated.height ?? null,
      color: updated.color,
      isDoneColumn: !!updated.is_done_column,
      createdAt: updated.created_at,
    };

    broadcast(boardId, { type: 'column:updated', column: result });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'column:update', `Updated column '${result.title}'`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.delete('/api/columns/:id', (req: Request, res: Response) => {
  try {
    const columnId = req.params.id;
    const boardId = getBoardIdForColumn(columnId);
    if (!boardId) {
      res.status(404).json({ error: 'Column not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const colForHistory = db.prepare('SELECT title FROM columns WHERE id = ?').get(columnId) as any;
    db.prepare('DELETE FROM columns WHERE id = ?').run(columnId);
    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    broadcast(boardId, { type: 'column:deleted', columnId });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'column:delete', `Deleted column '${colForHistory?.title || columnId}'`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Task Routes
// ---------------------------------------------------------------------------

app.post('/api/columns/:columnId/tasks', (req: Request, res: Response) => {
  try {
    const columnId = req.params.columnId;
    const boardId = getBoardIdForColumn(columnId);
    if (!boardId) {
      res.status(404).json({ error: 'Column not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const { title, content, color, position } = req.body;
    const id = uuidv4();

    let taskPosition = position;
    if (taskPosition === undefined || taskPosition === null) {
      const maxPos = db.prepare(
        'SELECT COALESCE(MAX(position), -1) as maxPos FROM tasks WHERE column_id = ?'
      ).get(columnId) as any;
      taskPosition = maxPos.maxPos + 1;
    }

    db.prepare(
      'INSERT INTO tasks (id, column_id, title, content, position, color) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, columnId, title || '', content || '', taskPosition, color ?? null);

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    const result = {
      id: task.id,
      columnId: task.column_id,
      title: task.title,
      content: task.content,
      position: task.position,
      color: task.color,
      previewImage: task.preview_image,
      previewSettings: task.preview_settings ? JSON.parse(task.preview_settings) : null,
      attachments: task.attachments ? JSON.parse(task.attachments) : [],
      durationMinutes: task.duration_minutes,
      completedAt: task.completed_at,
      createdAt: task.created_at,
      assignees: [],
      checkpoints: [],
      timeLogs: [],
      dependencyIds: [],
    };

    broadcast(boardId, { type: 'task:created', task: result });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'task:create', `Created task '${title || 'Untitled'}'`);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.put('/api/tasks/:id', (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const boardId = getBoardIdForTask(taskId);
    if (!boardId) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const {
      title, content, color, durationMinutes, previewImage, previewSettings,
      position, columnId, assignees, checkpoints, completedAt, attachments,
    } = req.body;

    const newTitle = title !== undefined ? title : task.title;
    const newContent = content !== undefined ? content : task.content;
    const newColor = color !== undefined ? color : task.color;
    const newDurationMinutes = durationMinutes !== undefined ? durationMinutes : task.duration_minutes;
    const newPreviewImage = previewImage !== undefined ? previewImage : task.preview_image;
    const newPreviewSettings = previewSettings !== undefined ? (previewSettings ? JSON.stringify(previewSettings) : null) : task.preview_settings;
    const newPosition = position !== undefined ? position : task.position;
    const newColumnId = columnId !== undefined ? columnId : task.column_id;
    const newCompletedAt = completedAt !== undefined ? completedAt : task.completed_at;
    const newAttachments = attachments !== undefined ? JSON.stringify(attachments) : task.attachments;

    db.prepare(`
      UPDATE tasks SET
        title = ?, content = ?, color = ?, duration_minutes = ?,
        preview_image = ?, preview_settings = ?, position = ?, column_id = ?, completed_at = ?,
        attachments = ?
      WHERE id = ?
    `).run(
      newTitle, newContent, newColor, newDurationMinutes,
      newPreviewImage, newPreviewSettings, newPosition, newColumnId, newCompletedAt, newAttachments, taskId
    );

    // Handle assignees full replace
    if (assignees !== undefined && Array.isArray(assignees)) {
      db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
      const insertAssignee = db.prepare(
        'INSERT INTO task_assignees (id, task_id, name) VALUES (?, ?, ?)'
      );
      for (const assignee of assignees) {
        insertAssignee.run(assignee.id || uuidv4(), taskId, assignee.name);
      }
    }

    // Handle checkpoints full replace
    if (checkpoints !== undefined && Array.isArray(checkpoints)) {
      db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(taskId);
      const insertCheckpoint = db.prepare(
        'INSERT INTO task_checkpoints (id, task_id, title, is_completed, position) VALUES (?, ?, ?, ?, ?)'
      );
      for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i];
        insertCheckpoint.run(
          cp.id || uuidv4(), taskId, cp.title,
          cp.isCompleted ? 1 : 0, cp.position !== undefined ? cp.position : i
        );
      }
    }

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    // Fetch the updated task with all details
    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    const updatedAssignees = db.prepare('SELECT * FROM task_assignees WHERE task_id = ?').all(taskId) as any[];
    const updatedCheckpoints = db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY position ASC').all(taskId) as any[];
    const updatedTimeLogs = db.prepare('SELECT * FROM time_logs WHERE task_id = ? ORDER BY logged_at DESC').all(taskId) as any[];
    const updatedDeps = db.prepare('SELECT dependency_id FROM task_dependencies WHERE task_id = ?').all(taskId) as any[];

    const result = {
      id: updatedTask.id,
      columnId: updatedTask.column_id,
      title: updatedTask.title,
      content: updatedTask.content,
      position: updatedTask.position,
      color: updatedTask.color,
      previewImage: updatedTask.preview_image,
      previewSettings: updatedTask.preview_settings ? JSON.parse(updatedTask.preview_settings) : null,
      attachments: updatedTask.attachments ? JSON.parse(updatedTask.attachments) : [],
      durationMinutes: updatedTask.duration_minutes,
      completedAt: updatedTask.completed_at,
      createdAt: updatedTask.created_at,
      assignees: updatedAssignees.map((a) => ({ id: a.id, taskId: a.task_id, name: a.name })),
      checkpoints: updatedCheckpoints.map((cp) => ({
        id: cp.id,
        taskId: cp.task_id,
        title: cp.title,
        isCompleted: !!cp.is_completed,
        position: cp.position,
      })),
      timeLogs: updatedTimeLogs.map((tl) => ({
        id: tl.id,
        taskId: tl.task_id,
        userName: tl.user_name,
        minutes: tl.minutes,
        loggedAt: tl.logged_at,
      })),
      dependencyIds: updatedDeps.map((d: any) => d.dependency_id),
    };

    broadcast(boardId, { type: 'task:updated', task: result });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'task:update', `Updated task '${result.title || 'Untitled'}'`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.delete('/api/tasks/:id', (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const boardId = getBoardIdForTask(taskId);
    if (!boardId) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const taskForHistory = db.prepare('SELECT title FROM tasks WHERE id = ?').get(taskId) as any;
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    broadcast(boardId, { type: 'task:deleted', taskId });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'task:delete', `Deleted task '${taskForHistory?.title || taskId}'`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.put('/api/tasks/:id/move', (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const boardId = getBoardIdForTask(taskId);
    if (!boardId) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const { toColumnId, position } = req.body;
    if (!toColumnId || position === undefined) {
      res.status(400).json({ error: 'toColumnId and position are required' });
      return;
    }

    // Check if the target column belongs to the same board
    const targetBoardId = getBoardIdForColumn(toColumnId);
    if (targetBoardId !== boardId) {
      res.status(400).json({ error: 'Target column does not belong to the same board' });
      return;
    }

    // Check if target column is a done column for auto-completion
    const targetCol = db.prepare('SELECT is_done_column FROM columns WHERE id = ?').get(toColumnId) as any;
    const completedAt = targetCol && targetCol.is_done_column
      ? new Date().toISOString().replace('T', ' ').substring(0, 19)
      : null;

    db.prepare(
      'UPDATE tasks SET column_id = ?, position = ?, completed_at = ? WHERE id = ?'
    ).run(toColumnId, position, completedAt, taskId);

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;

    broadcast(boardId, {
      type: 'task:moved',
      taskId,
      fromColumnId: updatedTask.column_id,
      toColumnId,
      position,
      completedAt,
    });

    const targetColForHistory = db.prepare('SELECT title FROM columns WHERE id = ?').get(toColumnId) as any;
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'task:move', `Moved task '${updatedTask.title || 'Untitled'}' to '${targetColForHistory?.title || toColumnId}'`);

    res.json({
      id: updatedTask.id,
      columnId: updatedTask.column_id,
      position: updatedTask.position,
      completedAt: updatedTask.completed_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/tasks/:id/time-logs', (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const boardId = getBoardIdForTask(taskId);
    if (!boardId) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const { userName, minutes } = req.body;
    if (!userName || minutes === undefined) {
      res.status(400).json({ error: 'userName and minutes are required' });
      return;
    }

    const id = uuidv4();
    db.prepare('INSERT INTO time_logs (id, task_id, user_name, minutes) VALUES (?, ?, ?, ?)').run(
      id, taskId, userName, minutes
    );

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    const timeLog = db.prepare('SELECT * FROM time_logs WHERE id = ?').get(id) as any;
    const result = {
      id: timeLog.id,
      taskId: timeLog.task_id,
      userName: timeLog.user_name,
      minutes: timeLog.minutes,
      loggedAt: timeLog.logged_at,
    };

    broadcast(boardId, { type: 'timeLog:created', timeLog: result });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'timelog:create', `Logged ${minutes} minutes by '${userName}'`);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/tasks/:id/checkpoints', (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const boardId = getBoardIdForTask(taskId);
    if (!boardId) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const { title } = req.body;
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const id = uuidv4();
    const maxPos = db.prepare(
      'SELECT COALESCE(MAX(position), -1) as maxPos FROM task_checkpoints WHERE task_id = ?'
    ).get(taskId) as any;
    const position = maxPos.maxPos + 1;

    db.prepare(
      'INSERT INTO task_checkpoints (id, task_id, title, position) VALUES (?, ?, ?, ?)'
    ).run(id, taskId, title, position);

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    const checkpoint = db.prepare('SELECT * FROM task_checkpoints WHERE id = ?').get(id) as any;
    const result = {
      id: checkpoint.id,
      taskId: checkpoint.task_id,
      title: checkpoint.title,
      isCompleted: !!checkpoint.is_completed,
      position: checkpoint.position,
    };

    broadcast(boardId, { type: 'checkpoint:created', checkpoint: result });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'checkpoint:create', `Created checkpoint '${title}'`);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.put('/api/checkpoints/:id', (req: Request, res: Response) => {
  try {
    const checkpointId = req.params.id;
    const boardId = getBoardIdForCheckpoint(checkpointId);
    if (!boardId) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const cp = db.prepare('SELECT * FROM task_checkpoints WHERE id = ?').get(checkpointId) as any;
    if (!cp) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    const { title, isCompleted } = req.body;
    const newTitle = title !== undefined ? title : cp.title;
    const newIsCompleted = isCompleted !== undefined ? (isCompleted ? 1 : 0) : cp.is_completed;

    db.prepare('UPDATE task_checkpoints SET title = ?, is_completed = ? WHERE id = ?').run(
      newTitle, newIsCompleted, checkpointId
    );

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    const updated = db.prepare('SELECT * FROM task_checkpoints WHERE id = ?').get(checkpointId) as any;
    const result = {
      id: updated.id,
      taskId: updated.task_id,
      title: updated.title,
      isCompleted: !!updated.is_completed,
      position: updated.position,
    };

    broadcast(boardId, { type: 'checkpoint:updated', checkpoint: result });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'checkpoint:update', `Updated checkpoint '${result.title}'`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.delete('/api/checkpoints/:id', (req: Request, res: Response) => {
  try {
    const checkpointId = req.params.id;
    const boardId = getBoardIdForCheckpoint(checkpointId);
    if (!boardId) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const cp = db.prepare('SELECT task_id, title FROM task_checkpoints WHERE id = ?').get(checkpointId) as any;
    db.prepare('DELETE FROM task_checkpoints WHERE id = ?').run(checkpointId);

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    broadcast(boardId, { type: 'checkpoint:deleted', checkpointId, taskId: cp?.task_id });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'checkpoint:delete', `Deleted checkpoint '${cp?.title || checkpointId}'`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/tasks/:id/dependencies', (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const boardId = getBoardIdForTask(taskId);
    if (!boardId) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    const { dependencyId } = req.body;
    if (!dependencyId) {
      res.status(400).json({ error: 'dependencyId is required' });
      return;
    }

    // Verify the dependency task exists
    const depTask = db.prepare('SELECT id FROM tasks WHERE id = ?').get(dependencyId);
    if (!depTask) {
      res.status(404).json({ error: 'Dependency task not found' });
      return;
    }

    // Check if dependency already exists
    const existing = db.prepare(
      'SELECT 1 FROM task_dependencies WHERE task_id = ? AND dependency_id = ?'
    ).get(taskId, dependencyId);
    if (existing) {
      res.status(409).json({ error: 'Dependency already exists' });
      return;
    }

    db.prepare('INSERT INTO task_dependencies (task_id, dependency_id) VALUES (?, ?)').run(taskId, dependencyId);

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    broadcast(boardId, { type: 'dependency:created', taskId, dependencyId });
    const taskForDep = db.prepare('SELECT title FROM tasks WHERE id = ?').get(taskId) as any;
    const depTaskForDep = db.prepare('SELECT title FROM tasks WHERE id = ?').get(dependencyId) as any;
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'dependency:create', `Added dependency: '${taskForDep?.title || taskId}' depends on '${depTaskForDep?.title || dependencyId}'`);
    res.status(201).json({ taskId, dependencyId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.delete('/api/tasks/:id/dependencies/:depId', (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const dependencyId = req.params.depId;
    const boardId = getBoardIdForTask(taskId);
    if (!boardId) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const perm = getBoardPermission(boardId, req.user?.id, req.sessionToken);
    if (!perm || (perm !== 'owner' && perm !== 'edit')) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND dependency_id = ?').run(taskId, dependencyId);

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    const taskForDepDel = db.prepare('SELECT title FROM tasks WHERE id = ?').get(taskId) as any;
    const depTaskForDepDel = db.prepare('SELECT title FROM tasks WHERE id = ?').get(dependencyId) as any;
    broadcast(boardId, { type: 'dependency:deleted', taskId, dependencyId });
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'dependency:delete', `Removed dependency: '${taskForDepDel?.title || taskId}' no longer depends on '${depTaskForDepDel?.title || dependencyId}'`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Image Upload Routes
// ---------------------------------------------------------------------------

// Upload image for a task
app.post('/api/tasks/:id/images', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const task = db.prepare('SELECT column_id FROM tasks WHERE id = ?').get(taskId) as any;
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

    const col = db.prepare('SELECT board_id FROM columns WHERE id = ?').get(task.column_id) as any;
    if (!col) { res.status(404).json({ error: 'Column not found' }); return; }

    const perm = getBoardPermission(col.board_id, req.user?.id, req.sessionToken);
    if (!perm || perm === 'view') { res.status(403).json({ error: 'Edit permission required' }); return; }

    if (!req.file) { res.status(400).json({ error: 'No image file provided' }); return; }

    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ url: imageUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Delete an uploaded image
app.delete('/api/images/:filename', (req: Request, res: Response) => {
  try {
    const filePath = path.join(__dirname, '..', 'uploads', req.params.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Action History Routes
// ---------------------------------------------------------------------------

app.get('/api/boards/:id/history', requirePermission('owner'), (req: Request, res: Response) => {
  try {
    const boardId = req.params.id;
    const rows = db.prepare(
      'SELECT id, user_name, action_type, action_summary, snapshot, created_at FROM action_history WHERE board_id = ? ORDER BY created_at DESC LIMIT 200'
    ).all(boardId) as any[];

    const result = rows.map((r) => ({
      id: r.id,
      userName: r.user_name,
      actionType: r.action_type,
      actionSummary: r.action_summary,
      hasSnapshot: r.snapshot !== null && r.snapshot !== undefined,
      createdAt: r.created_at,
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/boards/:id/restore/:historyId', requirePermission('owner'), (req: Request, res: Response) => {
  try {
    const boardId = req.params.id;
    const historyId = req.params.historyId;

    // Find the target history entry
    const targetEntry = db.prepare('SELECT created_at FROM action_history WHERE id = ? AND board_id = ?').get(historyId, boardId) as any;
    if (!targetEntry) {
      res.status(404).json({ error: 'History entry not found' });
      return;
    }

    // Find the nearest entry with a snapshot at or before the given historyId's timestamp
    const snapshotEntry = db.prepare(
      'SELECT id, snapshot FROM action_history WHERE board_id = ? AND snapshot IS NOT NULL AND created_at <= ? ORDER BY created_at DESC LIMIT 1'
    ).get(boardId, targetEntry.created_at) as any;

    if (!snapshotEntry || !snapshotEntry.snapshot) {
      res.status(404).json({ error: 'No snapshot found at or before this history point' });
      return;
    }

    const snapshot = JSON.parse(snapshotEntry.snapshot);
    if (!snapshot || !snapshot.columns) {
      res.status(500).json({ error: 'Invalid snapshot data' });
      return;
    }

    // Delete all current columns (cascade deletes tasks, checkpoints, assignees, etc.)
    db.prepare('DELETE FROM columns WHERE board_id = ?').run(boardId);

    // Re-create columns and tasks from the snapshot
    for (const col of snapshot.columns) {
      db.prepare(
        'INSERT INTO columns (id, board_id, title, position, x, y, width, color, is_done_column, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(col.id, boardId, col.title, col.position, col.x, col.y, col.width ?? 300, col.color, col.isDoneColumn ? 1 : 0, col.createdAt);

      if (col.tasks) {
        for (const task of col.tasks) {
          db.prepare(
            'INSERT INTO tasks (id, column_id, title, content, position, color, preview_image, duration_minutes, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(task.id, col.id, task.title, task.content, task.position, task.color, task.previewImage, task.durationMinutes, task.completedAt, task.createdAt);

          // Restore assignees
          if (task.assignees) {
            for (const a of task.assignees) {
              db.prepare('INSERT INTO task_assignees (id, task_id, name) VALUES (?, ?, ?)').run(a.id, task.id, a.name);
            }
          }

          // Restore checkpoints
          if (task.checkpoints) {
            for (const cp of task.checkpoints) {
              db.prepare(
                'INSERT INTO task_checkpoints (id, task_id, title, is_completed, position) VALUES (?, ?, ?, ?, ?)'
              ).run(cp.id, task.id, cp.title, cp.isCompleted ? 1 : 0, cp.position);
            }
          }

          // Restore time logs
          if (task.timeLogs) {
            for (const tl of task.timeLogs) {
              db.prepare(
                'INSERT INTO time_logs (id, task_id, user_name, minutes, logged_at) VALUES (?, ?, ?, ?, ?)'
              ).run(tl.id, task.id, tl.userName, tl.minutes, tl.loggedAt);
            }
          }

          // Restore dependencies
          if (task.dependencyIds) {
            for (const depId of task.dependencyIds) {
              // Only insert if the dependency task exists in the snapshot
              try {
                db.prepare('INSERT INTO task_dependencies (task_id, dependency_id) VALUES (?, ?)').run(task.id, depId);
              } catch {
                // Skip if dependency task doesn't exist yet (will be created later)
              }
            }
          }
        }
      }
    }

    db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").run(boardId);

    // Record the restore action
    recordAction(boardId, req.user?.displayName || 'Anonymous', 'board:restore', `Restored board to snapshot from ${snapshotEntry.id}`);

    // Broadcast a full board refresh via WebSocket
    broadcast(boardId, { type: 'board:refresh' });

    res.json({ success: true, restoredFromHistoryId: snapshotEntry.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Static file serving (production)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});

export { app, server };
