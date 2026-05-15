import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { candidateCVs, hiringPositions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";

// DELETE - Delete a CV
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
    const cvId = parseInt(id);

    if (isNaN(cvId)) {
      return NextResponse.json({ error: "Invalid CV ID" }, { status: 400 });
    }

    // Get the CV to verify ownership
    const [cv] = await db
      .select()
      .from(candidateCVs)
      .where(eq(candidateCVs.id, cvId));

    if (!cv) {
      return NextResponse.json({ error: "CV not found" }, { status: 404 });
    }

    // Verify the position belongs to the user
    const [position] = await db
      .select()
      .from(hiringPositions)
      .where(
        and(
          eq(hiringPositions.id, cv.positionId),
          eq(hiringPositions.userId, session.user.id)
        )
      );

    if (!position) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db.delete(candidateCVs).where(eq(candidateCVs.id, cvId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CV:", error);
    return NextResponse.json(
      { error: "Failed to delete CV" },
      { status: 500 }
    );
  }
}
