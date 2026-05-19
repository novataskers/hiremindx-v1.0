import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { freelancerOffers, communityProfiles } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
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
    const userId = searchParams.get("userId");

    const whereClause = userId
      ? and(eq(freelancerOffers.userId, userId), eq(freelancerOffers.status, "active"))
      : eq(freelancerOffers.status, "active");

    const offers = await db
      .select()
      .from(freelancerOffers)
      .where(whereClause)
      .orderBy(desc(freelancerOffers.createdAt))
      .all();

    // Attach profile info for each offer
    const offersWithProfiles = await Promise.all(
      offers.map(async (offer) => {
        const profile = await db
          .select({ displayName: communityProfiles.displayName, headline: communityProfiles.headline })
          .from(communityProfiles)
          .where(eq(communityProfiles.userId, offer.userId))
          .get();
        
        let parsedTags: any = null;
        try {
          if (typeof offer.tags === "string" && offer.tags) {
            parsedTags = JSON.parse(offer.tags);
          } else if (Array.isArray(offer.tags)) {
            parsedTags = offer.tags;
          }
        } catch (e) {
          console.error(`Error parsing tags for offer ${offer.id}:`, e);
          parsedTags = [];
        }

        return { ...offer, tags: parsedTags || [], profile };
      })
    );

    return NextResponse.json({ offers: offersWithProfiles }, { status: 200 });
  } catch (error) {
    console.error("Error fetching offers:", error);
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

    const result = await db
      .insert(freelancerOffers)
      .values({
        userId: session.user.id,
        title: body.title,
        description: body.description || null,
        category: body.category,
        price: body.price,
        deliveryDays: body.deliveryDays,
        imageUrl: body.imageUrl || null,
        tags: body.tags ? JSON.stringify(body.tags) : null,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ offer: result[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating offer:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: buildAuthHeaders(request),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const result = await db
      .update(freelancerOffers)
      .set({
        title: body.title,
        description: body.description || null,
        category: body.category,
        price: body.price,
        deliveryDays: body.deliveryDays,
        imageUrl: body.imageUrl || null,
        tags: body.tags ? JSON.stringify(body.tags) : null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(freelancerOffers.id, body.id),
          eq(freelancerOffers.userId, session.user.id)
        )
      )
      .returning();

    return NextResponse.json({ offer: result[0] }, { status: 200 });
  } catch (error) {
    console.error("Error updating offer:", error);
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
    const offerId = searchParams.get("id");

    if (!offerId) {
      return NextResponse.json({ error: "Offer ID required" }, { status: 400 });
    }

    await db
      .update(freelancerOffers)
      .set({ status: "deleted", updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(freelancerOffers.id, parseInt(offerId)),
          eq(freelancerOffers.userId, session.user.id)
        )
      );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting offer:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
