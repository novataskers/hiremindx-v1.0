import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { communityDMs } from "@/db/schema";
import { eq, or, and, gt, desc } from "drizzle-orm";
import { getClients, clients } from "@/lib/sse-registry";

// Prevent Next.js from caching or statically optimizing this route
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const lastEventId = req.headers.get("Last-Event-ID");

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      const userClients = getClients(userId);
      userClients.add(controller);

      // Send initial connection event
      const connectEvent = `event: connected\ndata: ${JSON.stringify({ userId, timestamp: new Date().toISOString() })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectEvent));

      // If client is reconnecting, send missed messages since Last-Event-ID
      if (lastEventId) {
        (async () => {
          try {
            const missed = await db
              .select()
              .from(communityDMs)
              .where(
                and(
                  or(
                    eq(communityDMs.senderId, userId),
                    eq(communityDMs.receiverId, userId)
                  ),
                  gt(communityDMs.createdAt, lastEventId)
                )
              )
              .orderBy(desc(communityDMs.createdAt))
              .limit(50);

            for (const msg of missed.reverse()) {
              const payload = `event: new_message\ndata: ${JSON.stringify(msg)}\nid: ${msg.createdAt}\n\n`;
              controller.enqueue(new TextEncoder().encode(payload));
            }
          } catch (err) {
            console.error("SSE reconnect fetch failed:", err);
          }
        })();
      }

      // Heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          const hb = `:heartbeat\n\n`;
          controller.enqueue(new TextEncoder().encode(hb));
        } catch {
          clearInterval(heartbeat);
          userClients.delete(controller);
        }
      }, 30000);

      // Cleanup on close
      // Note: ReadableStream doesn't have a built-in "close" event,
      // so we rely on the heartbeat to detect dead connections.
      // The cancel handler is called when the client disconnects.
    },
    cancel(controller) {
      const userClients = getClients(userId);
      userClients.delete(controller);
      if (userClients.size === 0) {
        clients.delete(userId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
      "Access-Control-Allow-Origin": "*",
    },
  });
}
