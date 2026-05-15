import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";
import { db } from "@/db";
import { examQuestionSessions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) return session.user.id;

  const cookieStore = await cookies();
  const devSessionCookie = cookieStore.get("devSession");
  if (devSessionCookie) {
    try {
      const devSession = JSON.parse(decodeURIComponent(devSessionCookie.value));
      if (devSession?.user?.id) return devSession.user.id;
    } catch {
      // Invalid cookie
    }
  }
  return null;
}

// GET - Fetch all sessions for the user
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await db
      .select()
      .from(examQuestionSessions)
      .where(eq(examQuestionSessions.userId, userId))
      .orderBy(desc(examQuestionSessions.createdAt));

    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    console.error("Fetch exam history error:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}

// POST - Save a new session
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      subject,
      topic,
      questionTypes,
      difficulty,
      questionCount,
      instructions,
      bookName,
      mcqQuestions,
      cqQuestions,
    } = body;

    if (!subject || !topic || !questionTypes || !difficulty) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const [newSession] = await db
      .insert(examQuestionSessions)
      .values({
        userId,
        subject,
        topic,
        questionTypes,
        difficulty,
        questionCount: questionCount || 0,
        instructions: instructions || null,
        bookName: bookName || null,
        mcqQuestions: mcqQuestions || [],
        cqQuestions: cqQuestions || [],
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json({ success: true, session: newSession });
  } catch (error) {
    console.error("Save exam session error:", error);
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }
}

// DELETE - Delete a session
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    const [session] = await db
      .select()
      .from(examQuestionSessions)
      .where(eq(examQuestionSessions.id, parseInt(sessionId)));

    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 404 });
    }

    await db
      .delete(examQuestionSessions)
      .where(eq(examQuestionSessions.id, parseInt(sessionId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete exam session error:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
