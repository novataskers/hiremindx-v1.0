import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, clientProjects, communityProfiles } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

function buildAuthHeaders(req: NextRequest) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const authz = req.headers.get("authorization");
  if (authz) h.set("authorization", authz);
  return h;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: buildAuthHeaders(request),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const userId = searchParams.get("userId");

    let whereClause;
    if (projectId) {
      whereClause = eq(proposals.projectId, parseInt(projectId));
    } else if (userId) {
      whereClause = eq(proposals.userId, userId);
    } else {
      whereClause = eq(proposals.userId, session.user.id);
    }

    const results = await db
      .select()
      .from(proposals)
      .where(whereClause)
      .orderBy(desc(proposals.createdAt))
      .all();

    // Attach profile and project info
    const proposalsWithDetails = await Promise.all(
      results.map(async (proposal) => {
        const profile = await db
          .select({
            displayName: communityProfiles.displayName,
            headline: communityProfiles.headline,
            location: communityProfiles.location,
            skills: communityProfiles.skills,
          })
          .from(communityProfiles)
          .where(eq(communityProfiles.userId, proposal.userId))
          .get();

        const project = await db
          .select({
            title: clientProjects.title,
            budget: clientProjects.budget,
            category: clientProjects.category,
            status: clientProjects.status,
          })
          .from(clientProjects)
          .where(eq(clientProjects.id, proposal.projectId))
          .get();

        return { ...proposal, profile, project };
      })
    );

    return NextResponse.json({ proposals: proposalsWithDetails }, { status: 200 });
  } catch (error) {
    console.error("Error fetching proposals:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: buildAuthHeaders(request),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, coverLetter, bidAmount, deliveryDays } = body;

    if (!projectId || !coverLetter) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(proposals)
      .where(and(eq(proposals.projectId, projectId), eq(proposals.userId, session.user.id)))
      .get();

    if (existing) {
      return NextResponse.json({ error: "You have already submitted a proposal for this project" }, { status: 400 });
    }

    const newProposal = await db
      .insert(proposals)
      .values({
        projectId,
        userId: session.user.id,
        coverLetter,
        bidAmount: bidAmount || "",
        deliveryDays: (deliveryDays ? parseInt(String(deliveryDays)) : 7) as number,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json({ proposal: newProposal[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating proposal:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: buildAuthHeaders(request),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const proposalId = searchParams.get("id");

    if (!proposalId) {
      return NextResponse.json({ error: "Proposal ID required" }, { status: 400 });
    }

    // Get the proposal to find the project
    const proposal = await db
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.id, parseInt(proposalId)),
          eq(proposals.userId, session.user.id)
        )
      )
      .get();

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Delete the proposal
    await db
      .delete(proposals)
      .where(eq(proposals.id, parseInt(proposalId)));

    // Decrement proposals count on the project
    await db
      .update(clientProjects)
      .set({
        proposals: sql`MAX(${clientProjects.proposals} - 1, 0)`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(clientProjects.id, proposal.projectId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting proposal:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
