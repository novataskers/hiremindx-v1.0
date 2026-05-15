import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";
import { db } from "@/db";
import { interviewQuestionSessions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

async function getUserId(): Promise<string | null> {
  // First try better-auth session
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    return session.user.id;
  }
  
  // Fall back to dev session from cookie
  const cookieStore = await cookies();
  const devSessionCookie = cookieStore.get("devSession");
  if (devSessionCookie) {
    try {
      const devSession = JSON.parse(decodeURIComponent(devSessionCookie.value));
      if (devSession?.user?.id) {
        return devSession.user.id;
      }
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
      .select({
        id: interviewQuestionSessions.id,
        department: interviewQuestionSessions.department,
        position: interviewQuestionSessions.position,
        difficulty: interviewQuestionSessions.difficulty,
        questionCount: interviewQuestionSessions.questionCount,
        candidateName: interviewQuestionSessions.candidateName,
        candidateSummary: interviewQuestionSessions.candidateSummary,
        keyAreasToProbe: interviewQuestionSessions.keyAreasToProbe,
        questions: interviewQuestionSessions.questions,
        createdAt: interviewQuestionSessions.createdAt,
      })
      .from(interviewQuestionSessions)
      .where(eq(interviewQuestionSessions.userId, userId))
      .orderBy(desc(interviewQuestionSessions.createdAt));

    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    console.error("Fetch history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
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
      department,
      position,
      difficulty,
      questionCount,
      candidateSummary,
      keyAreasToProbe,
      questions,
    } = body;

    if (!department || !difficulty || !candidateSummary || !questions) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Extract candidate name from summary (first sentence often has the name)
    const candidateName = extractCandidateName(candidateSummary);

    const [newSession] = await db
      .insert(interviewQuestionSessions)
      .values({
        userId,
        department,
        position: position || null,
        difficulty,
        questionCount: questionCount || questions.length,
        candidateName,
        candidateSummary,
        keyAreasToProbe: keyAreasToProbe || [],
        questions,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json({ success: true, session: newSession });
  } catch (error) {
    console.error("Save session error:", error);
    return NextResponse.json(
      { error: "Failed to save session" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Verify ownership before delete
    const [session] = await db
      .select()
      .from(interviewQuestionSessions)
      .where(eq(interviewQuestionSessions.id, parseInt(sessionId)));

    if (!session || session.userId !== userId) {
      return NextResponse.json(
        { error: "Session not found or unauthorized" },
        { status: 404 }
      );
    }

    await db
      .delete(interviewQuestionSessions)
      .where(eq(interviewQuestionSessions.id, parseInt(sessionId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete session error:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}

function extractCandidateName(summary: string): string | null {
  // Try to extract a name from the summary
  // Common patterns: "John Doe is...", "The candidate, John Doe, ..."
  const patterns = [
    /^([A-Z][a-z]+ [A-Z][a-z]+) is/,
    /candidate,? ([A-Z][a-z]+ [A-Z][a-z]+)/i,
    /^([A-Z][a-z]+ [A-Z][a-z]+),/,
  ];

  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
