import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { freelancerPortfolio } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { buildAuthHeaders } from "@/lib/auth-headers";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: buildAuthHeaders(request),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || session.user.id;

    const items = await db
      .select()
      .from(freelancerPortfolio)
      .where(eq(freelancerPortfolio.userId, userId))
      .all();

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error("Error fetching portfolio:", error);
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
    const now = new Date().toISOString();

    // Support bulk insert (from onboarding) or single insert
    const items = Array.isArray(body) ? body : [body];

    const inserted = [];
    for (const item of items) {
      const result = await db
        .insert(freelancerPortfolio)
        .values({
          userId: session.user.id,
          title: item.title,
          description: item.description || null,
          category: item.category,
          imageUrl: item.imageUrl || null,
          linkUrl: item.linkUrl || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      inserted.push(result[0]);
    }

    return NextResponse.json({ items: inserted }, { status: 201 });
  } catch (error) {
    console.error("Error saving portfolio item:", error);
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
    const itemId = searchParams.get("id");

    if (!itemId) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    await db
      .delete(freelancerPortfolio)
      .where(
        and(
          eq(freelancerPortfolio.id, parseInt(itemId)),
          eq(freelancerPortfolio.userId, session.user.id)
        )
      );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting portfolio item:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
