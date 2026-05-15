import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatSessions, chatMessages, user as userTable } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
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

// Ensure a user row exists — required for FK constraint on chat_sessions
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
  } catch { /* ignore — may already exist */ }
}

export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const currentUser = await resolveUser(headersList);
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const chatType = searchParams.get("chatType") || "hiremind";

    const sessions = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.userId, currentUser.id), eq(chatSessions.chatType, chatType)))
      .orderBy(desc(chatSessions.lastMessageAt));

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const currentUser = await resolveUser(headersList);
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Auto-create user row if needed (dev/preview users don't exist in DB yet)
    await ensureUserExists(currentUser.id, currentUser.email);

    const body = await request.json();
    const { chatType, title, messages } = body;
    const now = new Date().toISOString();

    const [newSession] = await db.insert(chatSessions).values({
      userId: currentUser.id,
      chatType: chatType || "hiremind",
      title: title || "New Chat",
      lastMessageAt: now,
      createdAt: now,
    }).returning();

    if (messages && messages.length > 0) {
      await db.insert(chatMessages).values(
        messages.map((msg: { role: string; content: string; timestamp?: string }) => ({
          sessionId: newSession.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.timestamp || now,
        }))
      );
    }

    return NextResponse.json({ session: newSession });
  } catch (error) {
    console.error("Error creating chat session:", error);
    return NextResponse.json({ error: "Failed to create chat session" }, { status: 500 });
  }
}
