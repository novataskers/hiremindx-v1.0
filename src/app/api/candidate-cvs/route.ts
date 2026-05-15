import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { candidateCVs, hiringPositions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";
import { eq, and } from "drizzle-orm";

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

// POST - Upload CVs for a position (bulk upload)
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const positionId = parseInt(formData.get("positionId") as string);
    const files = formData.getAll("files") as File[];

    if (isNaN(positionId)) {
      return NextResponse.json({ error: "Invalid position ID" }, { status: 400 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Verify the position exists and belongs to the user
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

    const uploadedCVs = [];
    const now = new Date().toISOString();

    for (const file of files) {
      // Only accept PDF files
      if (file.type !== "application/pdf") {
        continue;
      }

      // Read file content and convert to base64 for storage
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = buffer.toString("base64");
      const fileUrl = `data:application/pdf;base64,${base64}`;

      const [cv] = await db
        .insert(candidateCVs)
        .values({
          positionId,
          fileName: file.name,
          fileUrl,
          fileSize: file.size,
          status: "pending",
          uploadedAt: now,
        })
        .returning();

      uploadedCVs.push(cv);
    }

    if (uploadedCVs.length === 0) {
      return NextResponse.json(
        { error: "No valid PDF files were uploaded" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      uploaded: uploadedCVs.length,
      cvs: uploadedCVs,
    });
  } catch (error) {
    console.error("Error uploading CVs:", error);
    return NextResponse.json(
      { error: "Failed to upload CVs" },
      { status: 500 }
    );
  }
}

// GET - Get all CVs for a position
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const positionId = parseInt(searchParams.get("positionId") || "");

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

    const cvs = await db
      .select()
      .from(candidateCVs)
      .where(eq(candidateCVs.positionId, positionId));

    return NextResponse.json({ cvs });
  } catch (error) {
    console.error("Error fetching CVs:", error);
    return NextResponse.json(
      { error: "Failed to fetch CVs" },
      { status: 500 }
    );
  }
}
