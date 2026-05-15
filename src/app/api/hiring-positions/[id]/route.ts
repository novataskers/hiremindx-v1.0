import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { hiringPositions, candidateCVs, cvAnalysisResults } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";

// GET - Get a specific hiring position with its CVs and results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const positionId = parseInt(id);

    if (isNaN(positionId)) {
      return NextResponse.json({ error: "Invalid position ID" }, { status: 400 });
    }

    // Get the position
    const [position] = await db
      .select()
      .from(hiringPositions)
      .where(
        and(
          eq(hiringPositions.id, positionId),
          eq(hiringPositions.userId, session.user.id)
        )
      );

    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    // Get all CVs for this position
    const cvs = await db
      .select()
      .from(candidateCVs)
      .where(eq(candidateCVs.positionId, positionId))
      .orderBy(desc(candidateCVs.uploadedAt));

    // Get analysis results for all CVs
    const results = await db
      .select()
      .from(cvAnalysisResults)
      .where(eq(cvAnalysisResults.positionId, positionId))
      .orderBy(desc(cvAnalysisResults.overallScore));

    // Merge CVs with their analysis results
    const cvsWithResults = cvs.map((cv) => {
      const result = results.find((r) => r.cvId === cv.id);
      return {
        ...cv,
        analysisResult: result || null,
      };
    });

    return NextResponse.json({
      position,
      cvs: cvsWithResults,
      summary: {
        totalCVs: cvs.length,
        analyzed: cvs.filter((cv) => cv.status === "analyzed").length,
        pending: cvs.filter((cv) => cv.status === "pending").length,
        analyzing: cvs.filter((cv) => cv.status === "analyzing").length,
        highlyRecommended: results.filter((r) => r.recommendation === "highly_recommended").length,
        recommended: results.filter((r) => r.recommendation === "recommended").length,
        consider: results.filter((r) => r.recommendation === "consider").length,
        notRecommended: results.filter((r) => r.recommendation === "not_recommended").length,
      },
    });
  } catch (error) {
    console.error("Error fetching hiring position:", error);
    return NextResponse.json(
      { error: "Failed to fetch hiring position" },
      { status: 500 }
    );
  }
}

// PUT - Update a hiring position
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const positionId = parseInt(id);

    if (isNaN(positionId)) {
      return NextResponse.json({ error: "Invalid position ID" }, { status: 400 });
    }

    const body = await request.json();

    const [updated] = await db
      .update(hiringPositions)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(hiringPositions.id, positionId),
          eq(hiringPositions.userId, session.user.id)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    return NextResponse.json({ position: updated });
  } catch (error) {
    console.error("Error updating hiring position:", error);
    return NextResponse.json(
      { error: "Failed to update hiring position" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a hiring position
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const positionId = parseInt(id);

    if (isNaN(positionId)) {
      return NextResponse.json({ error: "Invalid position ID" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(hiringPositions)
      .where(
        and(
          eq(hiringPositions.id, positionId),
          eq(hiringPositions.userId, session.user.id)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting hiring position:", error);
    return NextResponse.json(
      { error: "Failed to delete hiring position" },
      { status: 500 }
    );
  }
}
