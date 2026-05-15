import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { deliverables } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

function buildAuthHeaders(req: NextRequest) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const authz = req.headers.get("authorization");
  if (authz) h.set("authorization", authz);
  return h;
}

// GET — fetch deliverables for a contract
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const contractId = searchParams.get("contractId");

  if (!contractId) {
    return NextResponse.json({ error: "Missing contractId" }, { status: 400 });
  }

  try {
    const rows = await db.select().from(deliverables)
      .where(eq(deliverables.contractId, contractId))
      .orderBy(desc(deliverables.createdAt));

    return NextResponse.json({ deliverables: rows });
  } catch (error: any) {
    console.error("Error fetching deliverables:", error);
    return NextResponse.json({ error: "Failed to fetch deliverables" }, { status: 500 });
  }
}

// POST — create a deliverable record
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { contractId, messageId, type = "deliverable", parentDeliverableId } = body;

    if (!contractId || !messageId) {
      return NextResponse.json({ error: "Missing contractId or messageId" }, { status: 400 });
    }

    const now = new Date();
    const submittedAt = now.toISOString();
    const reviewDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

    // Check for existing pending initial deliverable
    const existingDeliverable = await db.select()
      .from(deliverables)
      .where(and(
        eq(deliverables.contractId, contractId),
        eq(deliverables.type, "deliverable"),
        eq(deliverables.status, "pending_review"),
        eq(deliverables.isArchived, false)
      ))
      .limit(1);

    // Prevent multiple initial deliverables
    if (existingDeliverable.length > 0 && type === "deliverable") {
      return NextResponse.json({
        error: "You have a pending deliverable awaiting approval. Please wait for the client to review it before submitting another."
      }, { status: 400 });
    }

    let version = 1;
    let isLatest = true;

    // If resubmitting (existing deliverable exists and this is a revision or resubmission)
    if (existingDeliverable.length > 0) {
      // Archive old deliverable
      await db.update(deliverables)
        .set({
          isLatest: false,
          isArchived: true,
          status: "superseded"
        })
        .where(eq(deliverables.id, existingDeliverable[0].id));

      // Get next version number
      const maxVersion = await db.select({ version: deliverables.version })
        .from(deliverables)
        .where(eq(deliverables.contractId, contractId))
        .orderBy(desc(deliverables.version))
        .limit(1);

      version = (maxVersion[0]?.version || 0) + 1;
    }

    // For revisions, also increment version
    if (type === "revision" && parentDeliverableId) {
      const parentDeliverable = await db.select()
        .from(deliverables)
        .where(eq(deliverables.id, Number(parentDeliverableId)))
        .limit(1);

      if (parentDeliverable.length > 0) {
        version = (parentDeliverable[0]?.version || 0) + 1;

        // Archive parent if it's a revision
        if (parentDeliverable[0]?.type === "revision") {
          await db.update(deliverables)
            .set({ isLatest: false, isArchived: true })
            .where(eq(deliverables.id, Number(parentDeliverableId)));
        }
      }
    }

    const result = await db.insert(deliverables).values({
      contractId: String(contractId),
      messageId: Number(messageId),
      submittedBy: session.user.id,
      type: type === "revision" ? "revision" : "deliverable",
      status: "pending_review",
      submittedAt,
      reviewDeadline,
      parentDeliverableId: parentDeliverableId ? Number(parentDeliverableId) : null,
      version,
      isLatest,
      isArchived: false,
      createdAt: submittedAt,
    }).returning();
    const record = (result as any[])[0];

    return NextResponse.json({ success: true, deliverable: record });
  } catch (error: any) {
    console.error("Error creating deliverable:", error);
    return NextResponse.json({ error: "Failed to create deliverable" }, { status: 500 });
  }
}

// PATCH — update deliverable status (approve / revision_requested)
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { deliverableId, status } = body;

    if (!deliverableId || !status) {
      return NextResponse.json({ error: "Missing deliverableId or status" }, { status: 400 });
    }

    const now = new Date().toISOString();

    await db.update(deliverables)
      .set({ status, createdAt: now })
      .where(eq(deliverables.id, Number(deliverableId)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating deliverable:", error);
    return NextResponse.json({ error: "Failed to update deliverable" }, { status: 500 });
  }
}
