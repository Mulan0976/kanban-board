import { DurableObject } from 'cloudflare:workers';

const PRESENCE_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
  '#ff5722', '#607d8b', '#673ab7', '#009688', '#ffc107',
];

interface SessionData {
  userId: string;
  displayName: string;
  color: string;
  action: string;
  taskId?: string;
}

export class BoardRoom extends DurableObject {
  private colorIndex = 0;

  private getNextColor(): string {
    const color = PRESENCE_COLORS[this.colorIndex % PRESENCE_COLORS.length];
    this.colorIndex++;
    return color;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal broadcast from Worker API routes
    if (url.pathname === '/broadcast') {
      const body = await request.json() as { message: object; excludeUserId?: string };
      const payload = JSON.stringify(body.message);
      const excludeId = body.excludeUserId || '';

      for (const ws of this.ctx.getWebSockets()) {
        try {
          // Skip the sender so they don't get their own mutation echoed back
          if (excludeId) {
            const data = ws.deserializeAttachment() as SessionData | null;
            if (data && data.userId === excludeId) continue;
          }
          ws.send(payload);
        } catch {}
      }
      return new Response('OK');
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const userId = url.searchParams.get('userId') || '';
    const displayName = url.searchParams.get('displayName') || 'Anonymous';

    const sessionData: SessionData = {
      userId,
      displayName,
      color: this.getNextColor(),
      action: 'viewing',
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(sessionData);

    // Send joined confirmation
    server.send(JSON.stringify({ type: 'joined' }));

    // Broadcast updated presence after a tick so the new socket is registered
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const msg = JSON.parse(message as string);

      if (msg.type === 'activity') {
        const data = ws.deserializeAttachment() as SessionData;
        if (msg.action) data.action = msg.action;
        data.taskId = msg.taskId || undefined;
        ws.serializeAttachment(data);
        this.broadcastPresence();
      }
    } catch {
      // ignore malformed messages
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close();
    this.broadcastPresence();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close();
    this.broadcastPresence();
  }

  private broadcastPresence(): void {
    const sockets = this.ctx.getWebSockets();

    // Deduplicate by userId — keep the most recent socket per user
    const userMap = new Map<string, { id: string; name: string; color: string; action: string; taskId?: string }>();
    for (const ws of sockets) {
      try {
        const data = ws.deserializeAttachment() as SessionData | null;
        if (data) {
          userMap.set(data.userId, {
            id: data.userId,
            name: data.displayName,
            color: data.color,
            action: data.action,
            taskId: data.taskId,
          });
        }
      } catch {}
    }

    const payload = JSON.stringify({ type: 'presence:update', users: Array.from(userMap.values()) });
    for (const ws of sockets) {
      try { ws.send(payload); } catch {}
    }
  }
}
