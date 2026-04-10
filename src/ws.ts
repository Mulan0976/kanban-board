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

  private getUrl(boardId: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/${boardId}`;
  }

  connect(): void {
    // No-op without a board ID; connection happens via joinBoard
    if (!this.currentBoardId) return;
    this.connectToBoard(this.currentBoardId);
  }

  private connectToBoard(boardId: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionalClose = false;

    try {
      this.ws = new WebSocket(this.getUrl(boardId));
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
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
    // If switching boards, close the old connection
    if (this.currentBoardId && this.currentBoardId !== boardId) {
      this.isIntentionalClose = true;
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.reconnectAttempts = 0;
    }

    this.currentBoardId = boardId;
    this.connectToBoard(boardId);
  }

  leaveBoard(boardId: string): void {
    if (this.currentBoardId === boardId) {
      this.disconnect();
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

    const baseDelay = 500;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.currentBoardId) {
        this.connectToBoard(this.currentBoardId);
      }
    }, delay);
  }
}

export const wsClient = new WebSocketClient();
