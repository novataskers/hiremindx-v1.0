import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { communityProfiles, freelancerPortfolio, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { buildAuthHeaders } from "@/lib/auth-headers";

function safeJsonParse(value: unknown) {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizePortfolioItems(items: any[]) {
  if (!Array.isArray(items)) return [];

  return items.map((item: any, index: number) => {
    if (typeof item === "string") {
      return {
        id: `portfolio-${index}`,
        title: item,
        description: "",
        imageUrl: null,
        linkUrl: item,
      };
    }

    return {
      id: item?.id || `portfolio-${index}`,
      title: item?.title || item?.name || item?.linkUrl || item?.url || `Portfolio Item ${index + 1}`,
      description: item?.description || "",
      imageUrl: item?.imageUrl || item?.image || null,
      linkUrl: item?.linkUrl || item?.url || null,
      category: item?.category || null,
    };
  });
}

function normalizeProfile(profile: any, account?: any, portfolioItems: any[] = []) {
  if (!profile) return null;

  const skills = safeJsonParse(profile.skills);
  const workExperience = safeJsonParse(profile.workExperience);
  const portfolioUrls = safeJsonParse(profile.portfolioUrls);
  const paymentMethods = safeJsonParse(profile.paymentMethods);

  const normalizedLegacyPortfolio = normalizePortfolioItems(Array.isArray(portfolioUrls) ? portfolioUrls : []);
  const normalizedTablePortfolio = normalizePortfolioItems(portfolioItems);
  const mergedPortfolio = normalizedTablePortfolio.length > 0 ? normalizedTablePortfolio : normalizedLegacyPortfolio;

  return {
    ...profile,
    userId: profile.userId || account?.id || null,
    id: profile.userId || account?.id || profile.id,
    name: profile.displayName || account?.name || "Unknown User",
    displayName: profile.displayName || account?.name || "Unknown User",
    image: account?.image || null,
    bio: profile.bio || profile.companyDescription || null,
    description: profile.companyDescription || profile.bio || null,
    headline:
      profile.headline ||
      (profile.userType === "client"
        ? profile.companyName || profile.industry || "Client"
        : "Community Member"),
    location: profile.location || null,
    companyName: profile.companyName || null,
    companyDescription: profile.companyDescription || null,
    companySize: profile.companySize || null,
    industry: profile.industry || null,
    website: profile.website || null,
    availability: profile.availability || null,
    hourlyRate: profile.hourlyRate || null,
    pricingText: profile.pricingText || null,
    skills: Array.isArray(skills) ? skills : [],
    workExperience: Array.isArray(workExperience) ? workExperience : [],
    portfolioUrls: mergedPortfolio,
    portfolio: mergedPortfolio,
    paymentMethods: Array.isArray(paymentMethods) ? paymentMethods : [],
  };
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
    const requestedUserId = searchParams.get("userId");
    const targetUserId = requestedUserId || session.user.id;

    const profile = await db
      .select()
      .from(communityProfiles)
      .where(eq(communityProfiles.userId, targetUserId))
      .get();

    const account = await db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
      })
      .from(user)
      .where(eq(user.id, targetUserId))
      .get();

    const portfolioItems = await db
      .select()
      .from(freelancerPortfolio)
      .where(eq(freelancerPortfolio.userId, targetUserId))
      .all();

    if (!profile) {
      if (!account) {
        return NextResponse.json({ profile: null }, { status: 200 });
      }

      return NextResponse.json({
        profile: {
          id: account.id,
          userId: account.id,
          name: account.name || "Unknown User",
          displayName: account.name || "Unknown User",
          image: account.image || null,
          userType: null,
          bio: null,
          description: null,
          headline: null,
          location: null,
          companyName: null,
          companyDescription: null,
          companySize: null,
          industry: null,
          website: null,
          availability: null,
          hourlyRate: null,
          pricingText: null,
          skills: [],
          workExperience: [],
          portfolioUrls: [],
          portfolio: [],
          paymentMethods: [],
          profileComplete: false,
        },
      }, { status: 200 });
    }

    return NextResponse.json({ profile: normalizeProfile(profile, account, portfolioItems) }, { status: 200 });
  } catch (error) {
    console.error("Error fetching community profile:", error);
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

    const existingProfile = await db
      .select()
      .from(communityProfiles)
      .where(eq(communityProfiles.userId, session.user.id))
      .get();

    if (existingProfile) {
      const updated = await db
        .update(communityProfiles)
        .set({
          ...body,
          userId: session.user.id,
          updatedAt: now,
          skills: body.skills ? JSON.stringify(body.skills) : null,
          workExperience: body.workExperience ? JSON.stringify(body.workExperience) : null,
          portfolioUrls: body.portfolioUrls ? JSON.stringify(body.portfolioUrls) : null,
          paymentMethods: body.paymentMethods ? JSON.stringify(body.paymentMethods) : null,
          pricingText: body.pricingText || null,
        })
        .where(eq(communityProfiles.userId, session.user.id))
        .returning();

      return NextResponse.json({ profile: updated[0] }, { status: 200 });
    }

    const newProfile = await db
      .insert(communityProfiles)
      .values({
        userId: session.user.id,
        userType: body.userType,
        displayName: body.displayName,
        bio: body.bio || null,
        headline: body.headline || null,
        location: body.location || null,
        website: body.website || null,
        skills: body.skills ? JSON.stringify(body.skills) : null,
        hourlyRate: body.hourlyRate || null,
        pricingText: body.pricingText || null,
        availability: body.availability || null,
        workExperience: body.workExperience ? JSON.stringify(body.workExperience) : null,
        cvUrl: body.cvUrl || null,
        portfolioUrls: body.portfolioUrls ? JSON.stringify(body.portfolioUrls) : null,
        companyName: body.companyName || null,
        companyDescription: body.companyDescription || null,
        companySize: body.companySize || null,
        industry: body.industry || null,
        paymentMethods: body.paymentMethods ? JSON.stringify(body.paymentMethods) : null,
        profileComplete: body.profileComplete || false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ profile: newProfile[0] }, { status: 201 });
  } catch (error: any) {
    console.error("[profile POST] Error saving community profile:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
