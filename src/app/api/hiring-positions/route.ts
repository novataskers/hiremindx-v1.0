import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { hiringPositions, candidateCVs, cvAnalysisResults } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";
import { eq, desc, and, count, inArray } from "drizzle-orm";

// Helper to get user ID from either real session or dev session
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

// GET - List all hiring positions for the user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

      // Get all positions for user
      const positionsData = await db
        .select()
        .from(hiringPositions)
        .where(eq(hiringPositions.userId, userId))
        .orderBy(desc(hiringPositions.createdAt));

    // Get CV counts for each position
    const positionsWithCounts = await Promise.all(
      positionsData.map(async (position) => {
        const allCVs = await db
          .select({ count: count() })
          .from(candidateCVs)
          .where(eq(candidateCVs.positionId, position.id));

        const analyzedCVs = await db
          .select({ count: count() })
          .from(candidateCVs)
          .where(
            and(
              eq(candidateCVs.positionId, position.id),
              eq(candidateCVs.status, "analyzed")
            )
          );

        return {
          ...position,
          cvCount: allCVs[0]?.count ?? 0,
          analyzedCount: analyzedCVs[0]?.count ?? 0,
        };
      })
    );

    return NextResponse.json({ positions: positionsWithCounts });
  } catch (error) {
    console.error("Error fetching hiring positions:", error);
    return NextResponse.json(
      { error: "Failed to fetch hiring positions" },
      { status: 500 }
    );
  }
}

// POST - Create a new hiring position
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      department,
      organization,
      description,
      requirements,
      preferredSkills,
      experienceRequired,
      educationRequired,
    } = body;

    if (!title || !department || !organization) {
      return NextResponse.json(
        { error: "Title, department, and organization are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const [position] = await db
      .insert(hiringPositions)
      .values({
        userId: userId,
        title,
        department,
        organization,
        description: description || null,
        requirements: requirements || null,
        preferredSkills: preferredSkills || null,
        experienceRequired: experienceRequired || null,
        educationRequired: educationRequired || null,
        status: "open",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ position }, { status: 201 });
  } catch (error) {
    console.error("Error creating hiring position:", error);
    return NextResponse.json(
      { error: "Failed to create hiring position" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a hiring position and all associated data
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const positionId = parseInt(searchParams.get("id") || "");

    if (isNaN(positionId)) {
      return NextResponse.json({ error: "Invalid position ID" }, { status: 400 });
    }

    // Verify the position belongs to the user
    const [position] = await db
      .select()
      .from(hiringPositions)
      .where(
        and(
          eq(hiringPositions.id, positionId),
          eq(hiringPositions.userId, userId)
        )
      );

    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    // Get all CV IDs for this position
    const cvs = await db
      .select({ id: candidateCVs.id })
      .from(candidateCVs)
      .where(eq(candidateCVs.positionId, positionId));

    const cvIds = cvs.map(cv => cv.id);

    // Delete analysis results for these CVs
    if (cvIds.length > 0) {
      await db
        .delete(cvAnalysisResults)
        .where(inArray(cvAnalysisResults.cvId, cvIds));
    }

    // Delete all CVs for this position
    await db
      .delete(candidateCVs)
      .where(eq(candidateCVs.positionId, positionId));

    // Delete the position
    await db
      .delete(hiringPositions)
      .where(eq(hiringPositions.id, positionId));

    return NextResponse.json({ success: true, message: "Position deleted successfully" });
  } catch (error) {
    console.error("Error deleting hiring position:", error);
    return NextResponse.json(
      { error: "Failed to delete hiring position" },
      { status: 500 }
    );
  }
}
