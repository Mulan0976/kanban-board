import type { WSMessage } from './types';

type MessageHandler = (message: WSMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentBoardId: string | null = null;
  private isIntentionalClose = false;

  private getUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    return `${protocol}//${host}:3001/ws`;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionalClose = false;

    try {
      this.ws = new WebSocket(this.getUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Re-join board if we were in one before reconnecting
      if (this.currentBoardId) {
        this.send({ type: 'join', boardId: this.currentBoardId });
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        this.handlers.forEach((handler) => {
          try {
            handler(message);
          } catch (err) {
            console.error('[ws] Handler error:', err);
          }
        });
      } catch {
        console.warn('[ws] Failed to parse message:', event.data);
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    };
  }

  disconnect(): void {
    this.isIntentionalClose = true;
    this.currentBoardId = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }

  joinBoard(boardId: string): void {
    // Leave previous board if any
    if (this.currentBoardId && this.currentBoardId !== boardId) {
      this.send({ type: 'leave', boardId: this.currentBoardId });
    }

    this.currentBoardId = boardId;
    this.send({ type: 'join', boardId });
  }

  leaveBoard(boardId: string): void {
    this.send({ type: 'leave', boardId });
    if (this.currentBoardId === boardId) {
      this.currentBoardId = null;
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.add(handler);
  }

  offMessage(handler: MessageHandler): void {
    this.handlers.delete(handler);
  }

  send(message: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[ws] Max reconnect attempts reached, giving up.');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Exponential backoff: 500ms, 1s, 2s, 4s, 8s, ... capped at 30s
    const baseDelay = 500;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const wsClient = new WebSocketClient();
