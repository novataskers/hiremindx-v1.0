// ── In-memory SSE connection registry ──
// Maps userId → Set of controllers (one user can have multiple tabs)
const clients = new Map<string, Set<ReadableStreamDefaultController>>();

function getClients(userId: string): Set<ReadableStreamDefaultController> {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  return set;
}

// Send an SSE event to all connected clients for a given user
export function broadcastToUser(userId: string, event: string, data: any) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(payload);

  for (const controller of userClients) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Client disconnected, remove from set
      userClients.delete(controller);
    }
  }
}

// Broadcast a new message to both sender and receiver
export function broadcastNewMessage(message: any) {
  if (message.senderId) {
    broadcastToUser(message.senderId, "new_message", message);
  }
  if (message.receiverId && message.receiverId !== message.senderId) {
    broadcastToUser(message.receiverId, "new_message", message);
  }
}

// Broadcast conversation list update to a user
export function broadcastConversationUpdate(userId: string, data: any) {
  broadcastToUser(userId, "conversation_update", data);
}

// Export the clients map and getClients for use by the SSE route handler
export { clients, getClients };
