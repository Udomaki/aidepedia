/**
 * Collaboration Durable Object
 * Manages WebSocket connections and state for collaborative editing
 */

import * as Y from 'yjs';
import { setupWSConnection } from 'y-websocket/bin/utils';

export class CollabSession {
  private state: DurableObjectState;
  private sessions: Map<WebSocket, { userId: string; userName: string }>;
  private doc: Y.Doc;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Map();
    this.doc = new Y.Doc();
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader && upgradeHeader === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Handle regular HTTP requests
    if (url.pathname === '/status') {
      return new Response(JSON.stringify({
        connections: this.sessions.size,
        users: Array.from(this.sessions.values()),
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket connection
   */
  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') || 'anonymous';
    const userName = url.searchParams.get('userName') || 'Anonymous User';

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket connection
    this.state.acceptWebSocket(server);

    // Store session info
    this.sessions.set(server, { userId, userName });

    // Set up Y.js WebSocket connection
    setupWSConnection(server, this.doc);

    // Handle WebSocket events
    server.addEventListener('message', (event) => {
      this.handleMessage(server, event);
    });

    server.addEventListener('close', (event) => {
      this.handleClose(server);
    });

    server.addEventListener('error', (event) => {
      this.handleError(server, event);
    });

    // Broadcast user joined
    this.broadcast({
      type: 'user-joined',
      userId,
      userName,
      timestamp: Date.now(),
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: WebSocket, event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data as string);
      
      // Handle custom messages (cursor, selection, etc.)
      if (data.type === 'cursor' || data.type === 'selection') {
        this.broadcast(data, ws);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (session) {
      // Broadcast user left
      this.broadcast({
        type: 'user-left',
        userId: session.userId,
        userName: session.userName,
        timestamp: Date.now(),
      });

      this.sessions.delete(ws);
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(ws: WebSocket, event: Event): void {
    console.error('WebSocket error:', event);
    this.sessions.delete(ws);
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: any, exclude?: WebSocket): void {
    const messageStr = JSON.stringify(message);
    
    this.sessions.forEach((_, ws) => {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }
}
