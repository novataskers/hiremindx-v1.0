import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { communityProfiles, freelancerPortfolio, user } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const profiles = await db
      .select({
        id: communityProfiles.id,
        userId: communityProfiles.userId,
        displayName: communityProfiles.displayName,
        headline: communityProfiles.headline,
        bio: communityProfiles.bio,
        location: communityProfiles.location,
        skills: communityProfiles.skills,
        hourlyRate: communityProfiles.hourlyRate,
        pricingText: communityProfiles.pricingText,
        userImage: user.image,
      })
      .from(communityProfiles)
      .leftJoin(user, eq(communityProfiles.userId, user.id))
      .where(eq(communityProfiles.userType, "freelancer"))
      .all();

    // Fetch portfolio items for each freelancer
    const freelancersWithPortfolio = await Promise.all(
      profiles.map(async (profile) => {
        const portfolio = await db
          .select()
          .from(freelancerPortfolio)
          .where(eq(freelancerPortfolio.userId, profile.userId))
          .all();

        let parsedSkills: any = null;
        try {
          if (typeof profile.skills === "string" && profile.skills) {
            parsedSkills = JSON.parse(profile.skills);
          } else if (Array.isArray(profile.skills)) {
            parsedSkills = profile.skills;
          }
        } catch (e) {
          console.error(`Error parsing skills for user ${profile.userId}:`, e);
          parsedSkills = [];
        }

        return {
          ...profile,
          skills: parsedSkills || [],
          portfolio: portfolio.slice(0, 3), // Only first 3 items for preview
        };
      })
    );

    return NextResponse.json({ freelancers: freelancersWithPortfolio }, { status: 200 });
  } catch (error) {
    console.error("Error fetching freelancers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
