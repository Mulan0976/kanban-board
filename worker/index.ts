import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { BoardRoom } from './board-room';

export { BoardRoom };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  BOARD_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
};

type Variables = {
  user: { id: string; email: string; displayName: string } | null;
  sessionToken: string;
};

type HonoEnv = { Bindings: Bindings; Variables: Variables };

interface JwtPayload {
  userId: string;
  email: string;
}

const app = new Hono<HonoEnv>();

// Global error handler - surfaces actual errors instead of generic 500
app.onError((err, c) => {
  console.error('Worker error:', err.message, err.stack);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use('/api/*', cors({
  origin: (origin) => origin || 'http://localhost:5173',
  credentials: true,
}));

// Cookie options helper - adapts secure flag based on protocol
function cookieOpts(c: any, extra: Record<string, any> = {}) {
  const isSecure = new URL(c.req.url).protocol === 'https:';
  return { path: '/', sameSite: 'Lax' as const, ...(isSecure ? { secure: true } : {}), ...extra };
}

// Session token middleware
app.use('/api/*', async (c, next) => {
  let sessionToken = getCookie(c, 'session_token');
  if (!sessionToken) {
    sessionToken = crypto.randomUUID();
    setCookie(c, 'session_token', sessionToken, cookieOpts(c, {
      maxAge: 365 * 24 * 60 * 60,
      httpOnly: false,
    }));
  }
  c.set('sessionToken', sessionToken);
  await next();
});

// Auth middleware - optional JWT extraction
app.use('/api/*', async (c, next) => {
  const token = getCookie(c, 'auth_token');
  if (token) {
    try {
      if (!c.env.JWT_SECRET) throw new Error('JWT_SECRET not configured');
      const secret = new TextEncoder().encode(c.env.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      const p = payload as unknown as JwtPayload;
      const user = await c.env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ?')
        .bind(p.userId).first<{ id: string; email: string; display_name: string }>();
      if (user) {
        c.set('user', { id: user.id, email: user.email, displayName: user.display_name });
      } else {
        c.set('user', null);
      }
    } catch {
      c.set('user', null);
    }
  } else {
    c.set('user', null);
  }
  await next();
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function getJwtSecret(env: Bindings): Uint8Array {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET not configured');
  return new TextEncoder().encode(env.JWT_SECRET);
}

async function getBoardPermission(
  db: D1Database,
  boardId: string,
  userId: string | undefined,
  sessionToken: string,
): Promise<'owner' | 'edit' | 'view' | null> {
  const board = await db.prepare('SELECT owner_id, owner_session FROM boards WHERE id = ?')
    .bind(boardId).first<{ owner_id: string | null; owner_session: string | null }>();
  if (!board) return null;

  if (userId && board.owner_id === userId) return 'owner';
  if (board.owner_session && board.owner_session === sessionToken) return 'owner';

  let member: { permission: string } | null = null;
  if (userId) {
    member = await db.prepare('SELECT permission FROM board_members WHERE board_id = ? AND user_id = ?')
      .bind(boardId, userId).first();
  }
  if (!member) {
    member = await db.prepare('SELECT permission FROM board_members WHERE board_id = ? AND session_token = ?')
      .bind(boardId, sessionToken).first();
  }

  if (member) return member.permission as 'edit' | 'view';
  return null;
}

async function getBoardIdForColumn(db: D1Database, columnId: string): Promise<string | null> {
  const col = await db.prepare('SELECT board_id FROM columns WHERE id = ?').bind(columnId).first<{ board_id: string }>();
  return col ? col.board_id : null;
}

async function getBoardIdForTask(db: D1Database, taskId: string): Promise<string | null> {
  const row = await db.prepare(
    'SELECT c.board_id FROM tasks t JOIN columns c ON t.column_id = c.id WHERE t.id = ?'
  ).bind(taskId).first<{ board_id: string }>();
  return row ? row.board_id : null;
}

async function getBoardIdForCheckpoint(db: D1Database, checkpointId: string): Promise<string | null> {
  const row = await db.prepare(
    'SELECT c.board_id FROM task_checkpoints cp JOIN tasks t ON cp.task_id = t.id JOIN columns c ON t.column_id = c.id WHERE cp.id = ?'
  ).bind(checkpointId).first<{ board_id: string }>();
  return row ? row.board_id : null;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const permHierarchy: Record<string, number> = { view: 1, edit: 2, owner: 3 };

async function requirePerm(
  db: D1Database, boardId: string, userId: string | undefined, sessionToken: string, level: 'view' | 'edit' | 'owner',
): Promise<string | null> {
  const perm = await getBoardPermission(db, boardId, userId, sessionToken);
  if (!perm) return 'Access denied';
  if (permHierarchy[perm] < permHierarchy[level]) return 'Insufficient permissions';
  return null;
}

async function broadcast(env: Bindings, boardId: string, message: object, excludeUserId?: string): Promise<void> {
  try {
    const id = env.BOARD_ROOM.idFromName(boardId);
    const stub = env.BOARD_ROOM.get(id);
    await stub.fetch('http://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, excludeUserId }),
    });
  } catch {
    // Don't let broadcast failures break API responses
  }
}

// Serialize a task row from D1 into the API response format
function serializeTask(task: any, assignees: any[], checkpoints: any[], timeLogs: any[], deps: any[]): any {
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
    assignees: assignees.map((a: any) => ({ id: a.id, name: a.name })),
    checkpoints: checkpoints.map((cp: any) => ({
      id: cp.id,
      title: cp.title,
      isCompleted: !!cp.is_completed,
      position: cp.position,
    })),
    timeLogs: timeLogs.map((tl: any) => ({
      id: tl.id,
      userName: tl.user_name,
      minutes: tl.minutes,
      loggedAt: tl.logged_at,
    })),
    dependencyIds: deps.map((d: any) => d.dependency_id),
  };
}

async function getFullTask(db: D1Database, taskId: string): Promise<any> {
  const [task, assigneesResult, checkpointsResult, timeLogsResult, depsResult] = await Promise.all([
    db.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first(),
    db.prepare('SELECT * FROM task_assignees WHERE task_id = ?').bind(taskId).all(),
    db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY position ASC').bind(taskId).all(),
    db.prepare('SELECT * FROM time_logs WHERE task_id = ? ORDER BY logged_at DESC').bind(taskId).all(),
    db.prepare('SELECT dependency_id FROM task_dependencies WHERE task_id = ?').bind(taskId).all(),
  ]);
  if (!task) return null;
  return serializeTask(task, assigneesResult.results, checkpointsResult.results, timeLogsResult.results, depsResult.results);
}

// Action history
const ACTION_SNAPSHOT_INTERVAL = 10;

async function createBoardSnapshot(db: D1Database, boardId: string): Promise<string> {
  const board = await db.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first();
  if (!board) return JSON.stringify(null);

  const { results: columns } = await db.prepare(
    'SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC'
  ).bind(boardId).all();

  const columnsWithTasks = await Promise.all(columns.map(async (col: any) => {
    const { results: tasks } = await db.prepare(
      'SELECT * FROM tasks WHERE column_id = ? ORDER BY position ASC'
    ).bind(col.id).all();

    const tasksWithDetails = await Promise.all(tasks.map(async (task: any) => {
      const [a, cp, tl, deps] = await Promise.all([
        db.prepare('SELECT * FROM task_assignees WHERE task_id = ?').bind(task.id).all(),
        db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY position ASC').bind(task.id).all(),
        db.prepare('SELECT * FROM time_logs WHERE task_id = ? ORDER BY logged_at DESC').bind(task.id).all(),
        db.prepare('SELECT dependency_id FROM task_dependencies WHERE task_id = ?').bind(task.id).all(),
      ]);
      return serializeTask(task, a.results, cp.results, tl.results, deps.results);
    }));

    return {
      id: col.id, boardId: col.board_id, title: col.title, position: col.position,
      x: col.x, y: col.y, width: col.width ?? 300, height: col.height ?? null,
      color: col.color, isDoneColumn: !!col.is_done_column, createdAt: col.created_at,
      tasks: tasksWithDetails,
    };
  }));

  return JSON.stringify({ id: (board as any).id, title: (board as any).title, columns: columnsWithTasks });
}

async function recordAction(db: D1Database, boardId: string, userName: string, actionType: string, actionSummary: string): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM action_history WHERE board_id = ?').bind(boardId).first<{ cnt: number }>();
    const count = countRow?.cnt ?? 0;
    const shouldSnapshot = (count % ACTION_SNAPSHOT_INTERVAL) === 0;
    const snapshot = shouldSnapshot ? await createBoardSnapshot(db, boardId) : null;

    await db.prepare(
      'INSERT INTO action_history (id, board_id, user_name, action_type, action_summary, snapshot) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, boardId, userName, actionType, actionSummary, snapshot).run();
  } catch {
    // Don't let action recording break the main operation
  }
}

// ---------------------------------------------------------------------------
// Auth Routes
// ---------------------------------------------------------------------------

app.post('/api/auth/register', async (c) => {
  const { email, password, displayName } = await c.req.json();
  if (!email || !password || !displayName) {
    return c.json({ error: 'Email, password, and displayName are required' }, 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normalizedEmail).first();
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  await c.env.DB.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)')
    .bind(id, normalizedEmail, passwordHash, displayName).run();

  const token = await new SignJWT({ userId: id, email: normalizedEmail } as JwtPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getJwtSecret(c.env));

  setCookie(c, 'auth_token', token, cookieOpts(c, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60,
  }));

  return c.json({ user: { id, email: normalizedEmail, displayName } });
});

app.post('/api/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await c.env.DB.prepare('SELECT id, email, password_hash, display_name FROM users WHERE email = ?')
    .bind(normalizedEmail).first<{ id: string; email: string; password_hash: string; display_name: string }>();
  if (!user) {
    return c.json({ error: 'No account found with this email. Please register first.' }, 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Incorrect password. Please try again.' }, 401);
  }

  const token = await new SignJWT({ userId: user.id, email: user.email } as JwtPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getJwtSecret(c.env));

  setCookie(c, 'auth_token', token, cookieOpts(c, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60,
  }));

  return c.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
});

app.get('/api/auth/me', async (c) => {
  return c.json({ user: c.get('user') });
});

app.post('/api/auth/logout', async (c) => {
  deleteCookie(c, 'auth_token', { path: '/' });
  return c.json({ success: true });
});

app.post('/api/auth/merge-anonymous', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const { boardIds } = await c.req.json();
  if (!Array.isArray(boardIds)) return c.json({ error: 'boardIds must be an array' }, 400);

  const sessionToken = c.get('sessionToken');
  const stmts = boardIds.flatMap((boardId: string) => [
    c.env.DB.prepare('UPDATE boards SET owner_id = ?, owner_session = NULL WHERE id = ? AND owner_session = ?')
      .bind(user.id, boardId, sessionToken),
    c.env.DB.prepare('UPDATE board_members SET user_id = ?, session_token = NULL WHERE board_id = ? AND session_token = ?')
      .bind(user.id, boardId, sessionToken),
  ]);

  if (stmts.length > 0) await c.env.DB.batch(stmts);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Board Routes
// ---------------------------------------------------------------------------

app.get('/api/boards', async (c) => {
  const userId = c.get('user')?.id;
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  let boards: any[] = [];

  if (userId) {
    const { results: ownedByUser } = await db.prepare(`
      SELECT b.id, b.title, b.updated_at, b.preview_image,
             COALESCE(u.display_name, 'Anonymous') as owner_name,
             'owner' as permission
      FROM boards b LEFT JOIN users u ON b.owner_id = u.id
      WHERE b.owner_id = ?
    `).bind(userId).all();
    boards.push(...ownedByUser);

    const { results: memberOfUser } = await db.prepare(`
      SELECT b.id, b.title, b.updated_at, b.preview_image,
             COALESCE(u.display_name, 'Anonymous') as owner_name,
             bm.permission
      FROM boards b JOIN board_members bm ON bm.board_id = b.id
      LEFT JOIN users u ON b.owner_id = u.id
      WHERE bm.user_id = ?
    `).bind(userId).all();
    boards.push(...memberOfUser);
  }

  const { results: ownedBySession } = await db.prepare(`
    SELECT b.id, b.title, b.updated_at, b.preview_image, 'Anonymous' as owner_name, 'owner' as permission
    FROM boards b WHERE b.owner_session = ?
  `).bind(sessionToken).all();
  boards.push(...ownedBySession);

  const { results: memberOfSession } = await db.prepare(`
    SELECT b.id, b.title, b.updated_at,
           COALESCE(u.display_name, 'Anonymous') as owner_name,
           bm.permission
    FROM boards b JOIN board_members bm ON bm.board_id = b.id
    LEFT JOIN users u ON b.owner_id = u.id
    WHERE bm.session_token = ?
  `).bind(sessionToken).all();
  boards.push(...memberOfSession);

  // Deduplicate
  const boardMap = new Map<string, any>();
  for (const b of boards) {
    const existing = boardMap.get(b.id);
    if (!existing || permHierarchy[b.permission] > permHierarchy[existing.permission]) {
      boardMap.set(b.id, b);
    }
  }

  const boardList = Array.from(boardMap.values());

  // Fetch open-task counts (not in a done column, not completed) and
  // count of those assigned to the current user by display name.
  const displayName = c.get('user')?.displayName || null;

  const counts = await Promise.all(
    boardList.map(async (b: any) => {
      const openRow = await db.prepare(`
        SELECT COUNT(*) as n
        FROM tasks t
        JOIN columns c ON c.id = t.column_id
        WHERE c.board_id = ? AND c.is_done_column = 0 AND t.completed_at IS NULL
      `).bind(b.id).first<{ n: number }>();

      let mine = 0;
      if (displayName) {
        const mineRow = await db.prepare(`
          SELECT COUNT(DISTINCT t.id) as n
          FROM tasks t
          JOIN columns c ON c.id = t.column_id
          JOIN task_assignees a ON a.task_id = t.id
          WHERE c.board_id = ? AND c.is_done_column = 0 AND t.completed_at IS NULL
            AND LOWER(a.name) = LOWER(?)
        `).bind(b.id, displayName).first<{ n: number }>();
        mine = mineRow?.n ?? 0;
      }

      return { id: b.id, openTaskCount: openRow?.n ?? 0, userOpenTaskCount: mine };
    })
  );
  const countById = new Map(counts.map((x) => [x.id, x]));

  const result = boardList.map((b: any) => {
    const ct = countById.get(b.id);
    return {
      id: b.id, title: b.title, ownerName: b.owner_name,
      permission: b.permission, updatedAt: b.updated_at,
      previewImage: b.preview_image ?? null,
      openTaskCount: ct?.openTaskCount ?? 0,
      userOpenTaskCount: ct?.userOpenTaskCount ?? 0,
    };
  });

  return c.json(result);
});

app.post('/api/boards', async (c) => {
  const { title } = await c.req.json();
  if (!title) return c.json({ error: 'Title is required' }, 400);

  const user = c.get('user');
  const id = crypto.randomUUID();
  const ownerId = user?.id || null;
  const ownerSession = user ? null : c.get('sessionToken');

  const col1Id = crypto.randomUUID();
  const col2Id = crypto.randomUUID();
  const col3Id = crypto.randomUUID();

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO boards (id, title, owner_id, owner_session) VALUES (?, ?, ?, ?)')
      .bind(id, title, ownerId, ownerSession),
    c.env.DB.prepare('INSERT INTO columns (id, board_id, title, position, x, y, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(col1Id, id, 'To Do', 0, 50, 50, '#eab308'),
    c.env.DB.prepare('INSERT INTO columns (id, board_id, title, position, x, y, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(col2Id, id, 'Doing', 1, 400, 50, '#3b82f6'),
    c.env.DB.prepare('INSERT INTO columns (id, board_id, title, position, x, y, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(col3Id, id, 'Pending Review', 2, 750, 50, '#22c55e'),
  ]);

  const board = await c.env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(id).first();
  return c.json(board, 201);
});

app.get('/api/boards/:id', async (c) => {
  const boardId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'view');
  if (err) return c.json({ error: err }, 403);

  const board = await db.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first<any>();
  if (!board) return c.json({ error: 'Board not found' }, 404);

  let ownerName = 'Anonymous';
  if (board.owner_id) {
    const owner = await db.prepare('SELECT display_name FROM users WHERE id = ?').bind(board.owner_id).first<{ display_name: string }>();
    if (owner) ownerName = owner.display_name;
  }

  const permission = await getBoardPermission(db, boardId, user?.id, sessionToken);

  const { results: columns } = await db.prepare(
    'SELECT * FROM columns WHERE board_id = ? ORDER BY position ASC'
  ).bind(boardId).all();

  const columnsWithTasks = await Promise.all(columns.map(async (col: any) => {
    const { results: tasks } = await db.prepare(
      'SELECT * FROM tasks WHERE column_id = ? ORDER BY position ASC'
    ).bind(col.id).all();

    const tasksWithDetails = await Promise.all(tasks.map(async (task: any) => {
      const [a, cp, tl, deps] = await Promise.all([
        db.prepare('SELECT * FROM task_assignees WHERE task_id = ?').bind(task.id).all(),
        db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY position ASC').bind(task.id).all(),
        db.prepare('SELECT * FROM time_logs WHERE task_id = ? ORDER BY logged_at DESC').bind(task.id).all(),
        db.prepare('SELECT dependency_id FROM task_dependencies WHERE task_id = ?').bind(task.id).all(),
      ]);
      return serializeTask(task, a.results, cp.results, tl.results, deps.results);
    }));

    return {
      id: col.id, boardId: col.board_id, title: col.title, position: col.position,
      x: col.x, y: col.y, width: col.width ?? 300, height: col.height ?? null,
      color: col.color, isDoneColumn: !!col.is_done_column, createdAt: col.created_at,
      tasks: tasksWithDetails,
    };
  }));

  return c.json({
    id: board.id, title: board.title, ownerId: board.owner_id,
    ownerName, permission, columns: columnsWithTasks,
    previewImage: board.preview_image ?? null,
    createdAt: board.created_at, updatedAt: board.updated_at,
  });
});

app.put('/api/boards/:id', async (c) => {
  const boardId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const err = await requirePerm(c.env.DB, boardId, user?.id, sessionToken, 'owner');
  if (err) return c.json({ error: err }, 403);

  const { title } = await c.req.json();
  if (!title) return c.json({ error: 'Title is required' }, 400);

  await c.env.DB.prepare("UPDATE boards SET title = ?, updated_at = datetime('now') WHERE id = ?").bind(title, boardId).run();
  const board = await c.env.DB.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first<any>();

  return c.json({ id: board.id, title: board.title, ownerId: board.owner_id, updatedAt: board.updated_at });
});

app.delete('/api/boards/:id', async (c) => {
  const boardId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const err = await requirePerm(c.env.DB, boardId, user?.id, sessionToken, 'owner');
  if (err) return c.json({ error: err }, 403);

  await c.env.DB.prepare('DELETE FROM boards WHERE id = ?').bind(boardId).run();
  return c.json({ success: true });
});

app.post('/api/boards/:id/preview-image', async (c) => {
  const boardId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const permErr = await requirePerm(c.env.DB, boardId, user?.id, sessionToken, 'owner');
  if (permErr) return c.json({ error: permErr }, 403);

  const formData = await c.req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return c.json({ error: 'No image file provided' }, 400);
  if (!file.type.startsWith('image/')) return c.json({ error: 'Only images allowed' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'File too large (max 10MB)' }, 400);

  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
  const key = `${crypto.randomUUID()}${ext}`;
  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const url = `/uploads/${key}`;
  await c.env.DB.prepare("UPDATE boards SET preview_image = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(url, boardId).run();

  return c.json({ url });
});

app.delete('/api/boards/:id/preview-image', async (c) => {
  const boardId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const permErr = await requirePerm(c.env.DB, boardId, user?.id, sessionToken, 'owner');
  if (permErr) return c.json({ error: permErr }, 403);

  const existing = await c.env.DB.prepare('SELECT preview_image FROM boards WHERE id = ?').bind(boardId).first<{ preview_image: string | null }>();
  if (existing?.preview_image) {
    const key = existing.preview_image.split('/').pop();
    if (key) {
      try { await c.env.IMAGES.delete(key); } catch {}
    }
  }

  await c.env.DB.prepare("UPDATE boards SET preview_image = NULL, updated_at = datetime('now') WHERE id = ?")
    .bind(boardId).run();

  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Sharing Routes
// ---------------------------------------------------------------------------

app.post('/api/boards/:id/invite', async (c) => {
  const boardId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const err = await requirePerm(c.env.DB, boardId, user?.id, sessionToken, 'owner');
  if (err) return c.json({ error: err }, 403);

  const { permission } = await c.req.json();
  if (!permission || !['view', 'edit'].includes(permission)) {
    return c.json({ error: 'Permission must be "view" or "edit"' }, 400);
  }

  const id = crypto.randomUUID();
  const code = generateInviteCode();

  await c.env.DB.prepare('INSERT INTO invite_links (id, board_id, code, permission) VALUES (?, ?, ?, ?)')
    .bind(id, boardId, code, permission).run();

  return c.json({ code, permission }, 201);
});

app.post('/api/boards/join/:code', async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const invite = await db.prepare('SELECT * FROM invite_links WHERE code = ?').bind(c.req.param('code')).first<any>();
  if (!invite) return c.json({ error: 'Invalid invite code' }, 404);

  const board = await db.prepare('SELECT * FROM boards WHERE id = ?').bind(invite.board_id).first<any>();
  if (!board) return c.json({ error: 'Board not found' }, 404);

  const existingPerm = await getBoardPermission(db, invite.board_id, user?.id, sessionToken);
  if (existingPerm === 'owner') {
    return c.json({ id: board.id, title: board.title, permission: 'owner' });
  }

  let existingMember: any = null;
  if (user) {
    existingMember = await db.prepare('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?')
      .bind(invite.board_id, user.id).first();
  }
  if (!existingMember) {
    existingMember = await db.prepare('SELECT id FROM board_members WHERE board_id = ? AND session_token = ?')
      .bind(invite.board_id, sessionToken).first();
  }

  if (!existingMember) {
    const body = await c.req.json().catch(() => ({}));
    const memberId = crypto.randomUUID();
    const memberUserId = user?.id || null;
    const memberSession = user ? null : sessionToken;
    const displayName = user?.displayName || body.displayName || 'Anonymous';

    await db.prepare(
      'INSERT INTO board_members (id, board_id, user_id, session_token, permission, display_name) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(memberId, invite.board_id, memberUserId, memberSession, invite.permission, displayName).run();
  }

  await db.prepare('DELETE FROM invite_links WHERE id = ?').bind(invite.id).run();

  return c.json({ id: board.id, title: board.title, permission: invite.permission });
});

app.get('/api/boards/:id/members', async (c) => {
  const boardId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'view');
  if (err) return c.json({ error: err }, 403);

  const board = await db.prepare('SELECT * FROM boards WHERE id = ?').bind(boardId).first<any>();
  const { results: members } = await db.prepare('SELECT * FROM board_members WHERE board_id = ?').bind(boardId).all();

  const result: any[] = [];

  if (board.owner_id) {
    const owner = await db.prepare('SELECT display_name FROM users WHERE id = ?').bind(board.owner_id).first<any>();
    result.push({
      id: 'owner-' + board.owner_id,
      displayName: owner?.display_name || 'Owner',
      permission: 'owner',
      isAnonymous: false,
    });
  }

  for (const m of members as any[]) {
    let displayName = m.display_name || 'Anonymous';
    let isAnonymous = true;

    if (m.user_id) {
      const u = await db.prepare('SELECT display_name FROM users WHERE id = ?').bind(m.user_id).first<any>();
      if (u) { displayName = u.display_name; isAnonymous = false; }
    }

    result.push({ id: m.id, displayName, permission: m.permission, isAnonymous });
  }

  return c.json(result);
});

app.put('/api/boards/:id/members/:memberId', async (c) => {
  const boardId = c.req.param('id');
  const memberId = c.req.param('memberId');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const err = await requirePerm(c.env.DB, boardId, user?.id, sessionToken, 'owner');
  if (err) return c.json({ error: err }, 403);

  const { permission } = await c.req.json();
  if (!permission || !['view', 'edit'].includes(permission)) {
    return c.json({ error: 'Permission must be "view" or "edit"' }, 400);
  }

  const member = await c.env.DB.prepare('SELECT * FROM board_members WHERE id = ? AND board_id = ?')
    .bind(memberId, boardId).first();
  if (!member) return c.json({ error: 'Member not found' }, 404);

  await c.env.DB.prepare('UPDATE board_members SET permission = ? WHERE id = ?').bind(permission, memberId).run();
  return c.json({ success: true });
});

app.delete('/api/boards/:id/members/:memberId', async (c) => {
  const boardId = c.req.param('id');
  const memberId = c.req.param('memberId');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const err = await requirePerm(c.env.DB, boardId, user?.id, sessionToken, 'owner');
  if (err) return c.json({ error: err }, 403);

  const member = await c.env.DB.prepare('SELECT * FROM board_members WHERE id = ? AND board_id = ?')
    .bind(memberId, boardId).first();
  if (!member) return c.json({ error: 'Member not found' }, 404);

  await c.env.DB.prepare('DELETE FROM board_members WHERE id = ?').bind(memberId).run();
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Column Routes
// ---------------------------------------------------------------------------

app.post('/api/boards/:boardId/columns', async (c) => {
  const boardId = c.req.param('boardId');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const { title, x, y, color, width, height } = await c.req.json();
  if (!title) return c.json({ error: 'Title is required' }, 400);

  const id = crypto.randomUUID();
  const maxPos = await db.prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM columns WHERE board_id = ?')
    .bind(boardId).first<{ maxPos: number }>();
  const position = (maxPos?.maxPos ?? -1) + 1;

  await db.prepare(
    'INSERT INTO columns (id, board_id, title, position, x, y, width, height, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, boardId, title, position, x ?? 0, y ?? 250, width ?? 300, height ?? null, color ?? null).run();

  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  const column = await db.prepare('SELECT * FROM columns WHERE id = ?').bind(id).first<any>();
  const result = {
    id: column.id, boardId: column.board_id, title: column.title, position: column.position,
    x: column.x, y: column.y, width: column.width ?? 300, height: column.height ?? null,
    color: column.color, isDoneColumn: !!column.is_done_column, createdAt: column.created_at,
    tasks: [],
  };

  await broadcast(c.env, boardId, { type: 'column:created', column: result }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'column:create', `Created column '${title}'`));
  return c.json(result, 201);
});

app.put('/api/columns/bulk-update', async (c) => {
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const { updates } = await c.req.json();
  if (!Array.isArray(updates) || updates.length === 0) {
    return c.json({ error: 'Updates array is required' }, 400);
  }

  const firstBoardId = await getBoardIdForColumn(db, updates[0].id);
  if (!firstBoardId) return c.json({ error: 'Column not found' }, 404);

  const err = await requirePerm(db, firstBoardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const stmts = updates.map((item: any) =>
    db.prepare('UPDATE columns SET x = ?, y = ?, position = ? WHERE id = ?')
      .bind(item.x ?? 0, item.y ?? 250, item.position ?? 0, item.id)
  );
  stmts.push(db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(firstBoardId));
  await db.batch(stmts);

  await broadcast(c.env, firstBoardId, { type: 'columns:bulk-updated', updates }, c.get('user')?.id || c.get('sessionToken'));
  return c.json({ success: true });
});

app.put('/api/columns/:id', async (c) => {
  const columnId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForColumn(db, columnId);
  if (!boardId) return c.json({ error: 'Column not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const col = await db.prepare('SELECT * FROM columns WHERE id = ?').bind(columnId).first<any>();
  if (!col) return c.json({ error: 'Column not found' }, 404);

  const body = await c.req.json();
  const newTitle = body.title !== undefined ? body.title : col.title;
  const newX = body.x !== undefined ? body.x : col.x;
  const newY = body.y !== undefined ? body.y : col.y;
  const newWidth = body.width !== undefined ? body.width : (col.width ?? 300);
  const newHeight = body.height !== undefined ? body.height : col.height;
  const newColor = body.color !== undefined ? body.color : col.color;
  const newIsDoneColumn = body.isDoneColumn !== undefined ? (body.isDoneColumn ? 1 : 0) : col.is_done_column;
  const newPosition = body.position !== undefined ? body.position : col.position;

  await db.prepare(
    'UPDATE columns SET title = ?, x = ?, y = ?, width = ?, height = ?, color = ?, is_done_column = ?, position = ? WHERE id = ?'
  ).bind(newTitle, newX, newY, newWidth, newHeight, newColor, newIsDoneColumn, newPosition, columnId).run();

  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  const updated = await db.prepare('SELECT * FROM columns WHERE id = ?').bind(columnId).first<any>();
  const result = {
    id: updated.id, boardId: updated.board_id, title: updated.title, position: updated.position,
    x: updated.x, y: updated.y, width: updated.width ?? 300, height: updated.height ?? null,
    color: updated.color, isDoneColumn: !!updated.is_done_column, createdAt: updated.created_at,
  };

  await broadcast(c.env, boardId, { type: 'column:updated', column: result }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'column:update', `Updated column '${result.title}'`));
  return c.json(result);
});

app.delete('/api/columns/:id', async (c) => {
  const columnId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForColumn(db, columnId);
  if (!boardId) return c.json({ error: 'Column not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const col = await db.prepare('SELECT title FROM columns WHERE id = ?').bind(columnId).first<any>();
  await db.prepare('DELETE FROM columns WHERE id = ?').bind(columnId).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  await broadcast(c.env, boardId, { type: 'column:deleted', columnId }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'column:delete', `Deleted column '${col?.title || columnId}'`));
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Task Routes
// ---------------------------------------------------------------------------

app.post('/api/columns/:columnId/tasks', async (c) => {
  const columnId = c.req.param('columnId');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForColumn(db, columnId);
  if (!boardId) return c.json({ error: 'Column not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const { title, content, color, position } = await c.req.json();
  const id = crypto.randomUUID();

  let taskPosition = position;
  if (taskPosition === undefined || taskPosition === null) {
    const maxPos = await db.prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM tasks WHERE column_id = ?')
      .bind(columnId).first<{ maxPos: number }>();
    taskPosition = (maxPos?.maxPos ?? -1) + 1;
  }

  await db.prepare(
    'INSERT INTO tasks (id, column_id, title, content, position, color) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, columnId, title || '', content || '', taskPosition, color ?? null).run();

  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  const result = await getFullTask(db, id);

  await broadcast(c.env, boardId, { type: 'task:created', task: result }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'task:create', `Created task '${title || 'Untitled'}'`));
  return c.json(result, 201);
});

app.put('/api/tasks/:id', async (c) => {
  const taskId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForTask(db, taskId);
  if (!boardId) return c.json({ error: 'Task not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first<any>();
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const body = await c.req.json();

  const newTitle = body.title !== undefined ? body.title : task.title;
  const newContent = body.content !== undefined ? body.content : task.content;
  const newColor = body.color !== undefined ? body.color : task.color;
  const newDurationMinutes = body.durationMinutes !== undefined ? body.durationMinutes : task.duration_minutes;
  const newPreviewImage = body.previewImage !== undefined ? body.previewImage : task.preview_image;
  const newPreviewSettings = body.previewSettings !== undefined
    ? (body.previewSettings ? JSON.stringify(body.previewSettings) : null)
    : task.preview_settings;
  const newPosition = body.position !== undefined ? body.position : task.position;
  const newColumnId = body.columnId !== undefined ? body.columnId : task.column_id;
  const newCompletedAt = body.completedAt !== undefined ? body.completedAt : task.completed_at;
  const newAttachments = body.attachments !== undefined ? JSON.stringify(body.attachments) : task.attachments;

  await db.prepare(`
    UPDATE tasks SET
      title = ?, content = ?, color = ?, duration_minutes = ?,
      preview_image = ?, preview_settings = ?, position = ?, column_id = ?, completed_at = ?,
      attachments = ?
    WHERE id = ?
  `).bind(
    newTitle, newContent, newColor, newDurationMinutes,
    newPreviewImage, newPreviewSettings, newPosition, newColumnId, newCompletedAt, newAttachments, taskId
  ).run();

  // Handle assignees full replace.
  // Always generate fresh UUIDs for inserted rows since the row id has no
  // semantic meaning outside this task and client-supplied ids can collide
  // with stale rows from older buggy client versions.
  if (body.assignees !== undefined && Array.isArray(body.assignees)) {
    const deleteStmt = db.prepare('DELETE FROM task_assignees WHERE task_id = ?').bind(taskId);
    const insertStmts = body.assignees.map((a: any) =>
      db.prepare('INSERT INTO task_assignees (id, task_id, name) VALUES (?, ?, ?)')
        .bind(crypto.randomUUID(), taskId, a.name)
    );
    await db.batch([deleteStmt, ...insertStmts]);
  }

  // Handle checkpoints full replace
  if (body.checkpoints !== undefined && Array.isArray(body.checkpoints)) {
    const deleteStmt = db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').bind(taskId);
    const insertStmts = body.checkpoints.map((cp: any, i: number) =>
      db.prepare('INSERT INTO task_checkpoints (id, task_id, title, is_completed, position) VALUES (?, ?, ?, ?, ?)')
        .bind(cp.id || crypto.randomUUID(), taskId, cp.title, cp.isCompleted ? 1 : 0, cp.position !== undefined ? cp.position : i)
    );
    await db.batch([deleteStmt, ...insertStmts]);
  }

  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  const result = await getFullTask(db, taskId);

  await broadcast(c.env, boardId, { type: 'task:updated', task: result }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'task:update', `Updated task '${result.title || 'Untitled'}'`));
  return c.json(result);
});

app.delete('/api/tasks/:id', async (c) => {
  const taskId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForTask(db, taskId);
  if (!boardId) return c.json({ error: 'Task not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const task = await db.prepare('SELECT title, column_id FROM tasks WHERE id = ?').bind(taskId).first<any>();
  await db.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  await broadcast(c.env, boardId, { type: 'task:deleted', taskId, columnId: task?.column_id }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'task:delete', `Deleted task '${task?.title || taskId}'`));
  return c.json({ success: true });
});

app.put('/api/tasks/:id/move', async (c) => {
  const taskId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForTask(db, taskId);
  if (!boardId) return c.json({ error: 'Task not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const { toColumnId, position } = await c.req.json();
  if (!toColumnId || position === undefined) {
    return c.json({ error: 'toColumnId and position are required' }, 400);
  }

  const targetBoardId = await getBoardIdForColumn(db, toColumnId);
  if (targetBoardId !== boardId) {
    return c.json({ error: 'Target column does not belong to the same board' }, 400);
  }

  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first<any>();
  const fromColumnId = task.column_id;

  const targetCol = await db.prepare('SELECT is_done_column FROM columns WHERE id = ?').bind(toColumnId).first<any>();
  const completedAt = targetCol && targetCol.is_done_column
    ? new Date().toISOString().replace('T', ' ').substring(0, 19)
    : null;

  await db.prepare('UPDATE tasks SET column_id = ?, position = ?, completed_at = ? WHERE id = ?')
    .bind(toColumnId, position, completedAt, taskId).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  const updatedTask = await getFullTask(db, taskId);

  await broadcast(c.env, boardId, {
    type: 'task:moved', taskId, fromColumnId, toColumnId, position, task: updatedTask,
  }, c.get('user')?.id || c.get('sessionToken'));

  const targetColName = await db.prepare('SELECT title FROM columns WHERE id = ?').bind(toColumnId).first<any>();
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'task:move', `Moved task '${task.title || 'Untitled'}' to '${targetColName?.title || toColumnId}'`));

  return c.json({ id: updatedTask.id, columnId: updatedTask.columnId, position: updatedTask.position, completedAt: updatedTask.completedAt });
});

app.post('/api/tasks/:id/time-logs', async (c) => {
  const taskId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForTask(db, taskId);
  if (!boardId) return c.json({ error: 'Task not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const { userName, minutes } = await c.req.json();
  if (!userName || minutes === undefined) {
    return c.json({ error: 'userName and minutes are required' }, 400);
  }

  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO time_logs (id, task_id, user_name, minutes) VALUES (?, ?, ?, ?)')
    .bind(id, taskId, userName, minutes).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  const timeLog = await db.prepare('SELECT * FROM time_logs WHERE id = ?').bind(id).first<any>();
  const result = { id: timeLog.id, userName: timeLog.user_name, minutes: timeLog.minutes, loggedAt: timeLog.logged_at };

  await broadcast(c.env, boardId, { type: 'timeLog:created', timeLog: result }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'timelog:create', `Logged ${minutes} minutes by '${userName}'`));
  return c.json(result, 201);
});

app.post('/api/tasks/:id/checkpoints', async (c) => {
  const taskId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForTask(db, taskId);
  if (!boardId) return c.json({ error: 'Task not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const { title } = await c.req.json();
  if (!title) return c.json({ error: 'Title is required' }, 400);

  const id = crypto.randomUUID();
  const maxPos = await db.prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM task_checkpoints WHERE task_id = ?')
    .bind(taskId).first<{ maxPos: number }>();
  const position = (maxPos?.maxPos ?? -1) + 1;

  await db.prepare('INSERT INTO task_checkpoints (id, task_id, title, position) VALUES (?, ?, ?, ?)')
    .bind(id, taskId, title, position).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  const checkpoint = await db.prepare('SELECT * FROM task_checkpoints WHERE id = ?').bind(id).first<any>();
  const result = { id: checkpoint.id, title: checkpoint.title, isCompleted: !!checkpoint.is_completed, position: checkpoint.position };

  await broadcast(c.env, boardId, { type: 'checkpoint:created', checkpoint: result }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'checkpoint:create', `Created checkpoint '${title}'`));
  return c.json(result, 201);
});

app.put('/api/checkpoints/:id', async (c) => {
  const checkpointId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForCheckpoint(db, checkpointId);
  if (!boardId) return c.json({ error: 'Checkpoint not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const cp = await db.prepare('SELECT * FROM task_checkpoints WHERE id = ?').bind(checkpointId).first<any>();
  if (!cp) return c.json({ error: 'Checkpoint not found' }, 404);

  const body = await c.req.json();
  const newTitle = body.title !== undefined ? body.title : cp.title;
  const newIsCompleted = body.isCompleted !== undefined ? (body.isCompleted ? 1 : 0) : cp.is_completed;

  await db.prepare('UPDATE task_checkpoints SET title = ?, is_completed = ? WHERE id = ?')
    .bind(newTitle, newIsCompleted, checkpointId).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  const updated = await db.prepare('SELECT * FROM task_checkpoints WHERE id = ?').bind(checkpointId).first<any>();
  const result = { id: updated.id, title: updated.title, isCompleted: !!updated.is_completed, position: updated.position };

  await broadcast(c.env, boardId, { type: 'checkpoint:updated', checkpoint: result }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'checkpoint:update', `Updated checkpoint '${result.title}'`));
  return c.json(result);
});

app.delete('/api/checkpoints/:id', async (c) => {
  const checkpointId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForCheckpoint(db, checkpointId);
  if (!boardId) return c.json({ error: 'Checkpoint not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const cp = await db.prepare('SELECT task_id, title FROM task_checkpoints WHERE id = ?').bind(checkpointId).first<any>();
  await db.prepare('DELETE FROM task_checkpoints WHERE id = ?').bind(checkpointId).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  await broadcast(c.env, boardId, { type: 'checkpoint:deleted', checkpointId, taskId: cp?.task_id }, c.get('user')?.id || c.get('sessionToken'));
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'checkpoint:delete', `Deleted checkpoint '${cp?.title || checkpointId}'`));
  return c.json({ success: true });
});

app.post('/api/tasks/:id/dependencies', async (c) => {
  const taskId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForTask(db, taskId);
  if (!boardId) return c.json({ error: 'Task not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  const { dependencyId } = await c.req.json();
  if (!dependencyId) return c.json({ error: 'dependencyId is required' }, 400);

  const depTask = await db.prepare('SELECT id FROM tasks WHERE id = ?').bind(dependencyId).first();
  if (!depTask) return c.json({ error: 'Dependency task not found' }, 404);

  const existing = await db.prepare('SELECT 1 as e FROM task_dependencies WHERE task_id = ? AND dependency_id = ?')
    .bind(taskId, dependencyId).first();
  if (existing) return c.json({ error: 'Dependency already exists' }, 409);

  await db.prepare('INSERT INTO task_dependencies (task_id, dependency_id) VALUES (?, ?)').bind(taskId, dependencyId).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  await broadcast(c.env, boardId, { type: 'dependency:created', taskId, dependencyId }, c.get('user')?.id || c.get('sessionToken'));
  return c.json({ taskId, dependencyId }, 201);
});

app.delete('/api/tasks/:id/dependencies/:depId', async (c) => {
  const taskId = c.req.param('id');
  const dependencyId = c.req.param('depId');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const boardId = await getBoardIdForTask(db, taskId);
  if (!boardId) return c.json({ error: 'Task not found' }, 404);

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'edit');
  if (err) return c.json({ error: err }, 403);

  await db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND dependency_id = ?').bind(taskId, dependencyId).run();
  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();

  await broadcast(c.env, boardId, { type: 'dependency:deleted', taskId, dependencyId }, c.get('user')?.id || c.get('sessionToken'));
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Image Upload Routes
// ---------------------------------------------------------------------------

app.post('/api/tasks/:id/images', async (c) => {
  const taskId = c.req.param('id');
  const db = c.env.DB;
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');

  const task = await db.prepare('SELECT column_id FROM tasks WHERE id = ?').bind(taskId).first<any>();
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const boardId = await getBoardIdForColumn(db, task.column_id);
  if (!boardId) return c.json({ error: 'Column not found' }, 404);

  const perm = await getBoardPermission(db, boardId, user?.id, sessionToken);
  if (!perm || perm === 'view') return c.json({ error: 'Edit permission required' }, 403);

  const formData = await c.req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return c.json({ error: 'No image file provided' }, 400);

  if (!file.type.startsWith('image/')) return c.json({ error: 'Only images allowed' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'File too large (max 10MB)' }, 400);

  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
  const key = `${crypto.randomUUID()}${ext}`;

  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return c.json({ url: `/uploads/${key}` });
});

app.delete('/api/images/:filename', async (c) => {
  const filename = c.req.param('filename');
  await c.env.IMAGES.delete(filename);
  return c.json({ success: true });
});

// Serve images from R2
app.get('/uploads/:key', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.IMAGES.get(key);
  if (!object) return c.notFound();

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});

// ---------------------------------------------------------------------------
// Action History Routes
// ---------------------------------------------------------------------------

app.get('/api/boards/:id/history', async (c) => {
  const boardId = c.req.param('id');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'owner');
  if (err) return c.json({ error: err }, 403);

  const { results: rows } = await db.prepare(
    'SELECT id, user_name, action_type, action_summary, snapshot, created_at FROM action_history WHERE board_id = ? ORDER BY created_at DESC LIMIT 200'
  ).bind(boardId).all();

  const result = rows.map((r: any) => ({
    id: r.id, userName: r.user_name, actionType: r.action_type,
    actionSummary: r.action_summary, hasSnapshot: r.snapshot !== null && r.snapshot !== undefined,
    createdAt: r.created_at,
  }));

  return c.json(result);
});

app.post('/api/boards/:id/restore/:historyId', async (c) => {
  const boardId = c.req.param('id');
  const historyId = c.req.param('historyId');
  const user = c.get('user');
  const sessionToken = c.get('sessionToken');
  const db = c.env.DB;

  const err = await requirePerm(db, boardId, user?.id, sessionToken, 'owner');
  if (err) return c.json({ error: err }, 403);

  const targetEntry = await db.prepare('SELECT created_at FROM action_history WHERE id = ? AND board_id = ?')
    .bind(historyId, boardId).first<any>();
  if (!targetEntry) return c.json({ error: 'History entry not found' }, 404);

  const snapshotEntry = await db.prepare(
    'SELECT id, snapshot FROM action_history WHERE board_id = ? AND snapshot IS NOT NULL AND created_at <= ? ORDER BY created_at DESC LIMIT 1'
  ).bind(boardId, targetEntry.created_at).first<any>();

  if (!snapshotEntry?.snapshot) {
    return c.json({ error: 'No snapshot found at or before this history point' }, 404);
  }

  const snapshot = JSON.parse(snapshotEntry.snapshot);
  if (!snapshot?.columns) return c.json({ error: 'Invalid snapshot data' }, 500);

  // Delete all current columns (cascade deletes tasks etc.)
  await db.prepare('DELETE FROM columns WHERE board_id = ?').bind(boardId).run();

  // Re-create from snapshot
  for (const col of snapshot.columns) {
    await db.prepare(
      'INSERT INTO columns (id, board_id, title, position, x, y, width, color, is_done_column, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(col.id, boardId, col.title, col.position, col.x, col.y, col.width ?? 300, col.color, col.isDoneColumn ? 1 : 0, col.createdAt).run();

    if (col.tasks) {
      for (const task of col.tasks) {
        await db.prepare(
          'INSERT INTO tasks (id, column_id, title, content, position, color, preview_image, duration_minutes, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(task.id, col.id, task.title, task.content, task.position, task.color, task.previewImage, task.durationMinutes, task.completedAt, task.createdAt).run();

        if (task.assignees) {
          for (const a of task.assignees) {
            await db.prepare('INSERT INTO task_assignees (id, task_id, name) VALUES (?, ?, ?)').bind(a.id, task.id, a.name).run();
          }
        }
        if (task.checkpoints) {
          for (const cp of task.checkpoints) {
            await db.prepare('INSERT INTO task_checkpoints (id, task_id, title, is_completed, position) VALUES (?, ?, ?, ?, ?)')
              .bind(cp.id, task.id, cp.title, cp.isCompleted ? 1 : 0, cp.position).run();
          }
        }
        if (task.timeLogs) {
          for (const tl of task.timeLogs) {
            await db.prepare('INSERT INTO time_logs (id, task_id, user_name, minutes, logged_at) VALUES (?, ?, ?, ?, ?)')
              .bind(tl.id, task.id, tl.userName, tl.minutes, tl.loggedAt).run();
          }
        }
        if (task.dependencyIds) {
          for (const depId of task.dependencyIds) {
            try {
              await db.prepare('INSERT INTO task_dependencies (task_id, dependency_id) VALUES (?, ?)').bind(task.id, depId).run();
            } catch { /* skip if dependency task doesn't exist */ }
          }
        }
      }
    }
  }

  await db.prepare("UPDATE boards SET updated_at = datetime('now') WHERE id = ?").bind(boardId).run();
  c.executionCtx.waitUntil(recordAction(db, boardId, user?.displayName || 'Anonymous', 'board:restore', `Restored board to snapshot from ${snapshotEntry.id}`));

  await broadcast(c.env, boardId, { type: 'board:refresh' }, c.get('user')?.id || c.get('sessionToken'));
  return c.json({ success: true, restoredFromHistoryId: snapshotEntry.id });
});

// ---------------------------------------------------------------------------
// WebSocket Upgrade
// ---------------------------------------------------------------------------

app.get('/ws/:boardId', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket', 426);
  }

  const boardId = c.req.param('boardId');

  // Extract auth from cookies (same logic as middleware but for WS)
  const sessionToken = getCookie(c, 'session_token') || 'anonymous';
  let userId = '';
  let displayName = 'Anonymous';

  const authToken = getCookie(c, 'auth_token');
  if (authToken) {
    try {
      const secret = getJwtSecret(c.env);
      const { payload } = await jwtVerify(authToken, secret);
      const p = payload as unknown as JwtPayload;
      const user = await c.env.DB.prepare('SELECT id, display_name FROM users WHERE id = ?')
        .bind(p.userId).first<{ id: string; display_name: string }>();
      if (user) {
        userId = user.id;
        displayName = user.display_name;
      }
    } catch {}
  }

  // For anonymous users, look up display name from board_members
  if (!userId && sessionToken !== 'anonymous') {
    const member = await c.env.DB.prepare(
      'SELECT display_name FROM board_members WHERE board_id = ? AND session_token = ?'
    ).bind(boardId, sessionToken).first<{ display_name: string }>();
    if (member?.display_name) {
      displayName = member.display_name;
    }
  }

  // Check permission
  const perm = await getBoardPermission(c.env.DB, boardId, userId || undefined, sessionToken);
  if (!perm) {
    return c.json({ error: 'Access denied to board' }, 403);
  }

  // Forward to Durable Object
  const id = c.env.BOARD_ROOM.idFromName(boardId);
  const stub = c.env.BOARD_ROOM.get(id);

  const url = new URL(c.req.url);
  url.pathname = '/websocket';
  url.searchParams.set('userId', userId || sessionToken);
  url.searchParams.set('displayName', displayName);

  return stub.fetch(url.toString(), c.req.raw);
});

// ---------------------------------------------------------------------------
// SPA Fallback - serve index.html for non-API/WS/upload routes.
// In production, [assets] not_found_handling handles this automatically.
// In wrangler dev, we need this catch-all to serve the SPA shell.
// ---------------------------------------------------------------------------

app.get('*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api') || path.startsWith('/ws') || path.startsWith('/uploads')) {
    return c.notFound();
  }

  // Try ASSETS binding (available in both prod and wrangler dev with [assets])
  try {
    const env = c.env as any;
    if (env.ASSETS) {
      const assetUrl = new URL(c.req.url);
      assetUrl.pathname = '/index.html';
      return env.ASSETS.fetch(assetUrl.toString());
    }
  } catch {}

  return c.notFound();
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default app;
