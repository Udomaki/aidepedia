import type { APIRoute } from 'astro';
import { collaborationService } from '../../../../../lib/collaboration-service';
import { getSession } from '../../../../../lib/auth';

// WebSocket server for real-time collaboration
// Note: This is a simplified version. In production, you'd use Durable Objects
// for proper WebSocket state management in Cloudflare Workers

const clients = new Map<string, Set<WebSocket>>();

export const GET: APIRoute = async ({ params, request }) => {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const { slug } = params;
  const articleId = slug || '0';

  // Create WebSocket pair
  const { server, client } = Object.freeze(new WebSocketPair());
  
  // Accept the connection
  server.accept();
  
  // Add to clients map
  if (!clients.has(articleId)) {
    clients.set(articleId, new Set());
  }
  clients.get(articleId)!.add(server);
  
  // Handle messages
  server.addEventListener('message', async (event) => {
    try {
      const data = JSON.parse(event.data as string);
      
      switch (data.type) {
        case 'presence_update':
          // Broadcast presence to all clients for this article
          broadcast(articleId, {
            type: 'presence_update',
            userId: data.userId,
            userName: data.userName,
            cursorPosition: data.cursorPosition,
            currentSection: data.currentSection,
          });
          break;
          
        case 'edit':
          // Broadcast edit to all clients
          broadcast(articleId, {
            type: 'edit',
            userId: data.userId,
            userName: data.userName,
            operation: data.operation,
          });
          break;
          
        case 'lock_acquired':
        case 'lock_released':
          // Broadcast lock changes
          broadcast(articleId, {
            type: data.type,
            sectionName: data.sectionName,
            userId: data.userId,
            userName: data.userName,
          });
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });
  
  // Handle close
  server.addEventListener('close', () => {
    const articleClients = clients.get(articleId);
    if (articleClients) {
      articleClients.delete(server);
      if (articleClients.size === 0) {
        clients.delete(articleId);
      }
    }
  });
  
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
};

function broadcast(articleId: string, message: any) {
  const articleClients = clients.get(articleId);
  if (articleClients) {
    const messageStr = JSON.stringify(message);
    articleClients.forEach(client => {
      try {
        client.send(messageStr);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
      }
    });
  }
}
