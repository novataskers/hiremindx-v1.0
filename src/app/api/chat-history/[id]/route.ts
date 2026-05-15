import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatSessions, chatMessages, user as userTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

async function resolveUser(headersList: Headers): Promise<{ id: string; email: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: headersList });
    if (session?.user) return { id: session.user.id, email: session.user.email || "" };
  } catch {}

  // Accept dev user ID passed directly as a header (most reliable in preview environments)
  const devUserId = headersList.get("x-dev-user-id");
  if (devUserId) {
    return { id: devUserId, email: headersList.get("x-dev-user-email") || "dev@example.com" };
  }

  // Fallback: parse devSession cookie
  const cookie = headersList.get("cookie") || "";
  const devCookie = cookie.split(";").find(c => c.trim().startsWith("devSession="));
  if (devCookie) {
    try {
      const raw = decodeURIComponent(devCookie.split("=").slice(1).join("="));
      const parsed = JSON.parse(raw);
      if (parsed?.user?.id) return { id: parsed.user.id, email: parsed.user.email || "" };
    } catch {}
    return { id: "dev-user", email: "dev@example.com" };
  }
  return null;
}

async function ensureUserExists(userId: string, email: string): Promise<void> {
  try {
    const existing = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, userId)).limit(1);
    if (existing.length === 0) {
      await db.insert(userTable).values({
        id: userId,
        name: "Developer User",
        email: email || "developer@hiremindx.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  } catch { /* ignore */ }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers();
    const currentUser = await resolveUser(headersList);
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const sessionId = parseInt(id);

    const [chatSession] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, currentUser.id)));

    if (!chatSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);

    return NextResponse.json({ session: chatSession, messages });
  } catch (error) {
    console.error("Error fetching chat session:", error);
    return NextResponse.json({ error: "Failed to fetch chat session" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers();
    const currentUser = await resolveUser(headersList);
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await ensureUserExists(currentUser.id, currentUser.email);

    const { id } = await params;
    const sessionId = parseInt(id);
    const body = await request.json();
    const { messages, title } = body;

    const [chatSession] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, currentUser.id)));

    if (!chatSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const now = new Date().toISOString();

    await db.update(chatSessions)
      .set({ ...(title ? { title } : {}), lastMessageAt: now })
      .where(eq(chatSessions.id, sessionId));

    if (messages && messages.length > 0) {
      await db.insert(chatMessages).values(
        messages.map((msg: { role: string; content: string; timestamp?: string }) => ({
          sessionId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.timestamp || now,
        }))
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating chat session:", error);
    return NextResponse.json({ error: "Failed to update chat session" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headersList = await headers();
    const currentUser = await resolveUser(headersList);
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const sessionId = parseInt(id);

    const [chatSession] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, currentUser.id)));

    if (!chatSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting chat session:", error);
    return NextResponse.json({ error: "Failed to delete chat session" }, { status: 500 });
  }
}
