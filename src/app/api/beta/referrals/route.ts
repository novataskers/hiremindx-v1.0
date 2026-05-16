import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user, referrals, founderRewards } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get beta info from user table
    const userRows = await db
      .select({
        referralCode: user.referralCode,
        signupOrder: user.signupOrder,
        betaStatus: user.betaStatus,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const beta = userRows[0];
    const referralCode = beta?.referralCode ?? null;

    // Get reward info
    const rewardRows = await db
      .select()
      .from(founderRewards)
      .where(eq(founderRewards.userId, userId))
      .limit(1);

    const reward = rewardRows[0] ?? null;

    // Count referrals by status
    const countsResult = await db
      .select({
        status: referrals.status,
        count: sql<number>`count(*)`,
      })
      .from(referrals)
      .where(eq(referrals.referrerId, userId))
      .groupBy(referrals.status);

    const counts: Record<string, number> = {};
    for (const row of countsResult) {
      counts[row.status] = row.count;
    }

    const paidCount = counts["paid"] ?? 0;
    const trialingCount = counts["trialing"] ?? 0;
    const pendingCount = counts["pending"] ?? 0;
    const totalCount = paidCount + trialingCount + pendingCount;
    const remainingQuota = Math.max(0, 10 - totalCount);

    // Milestone progress
    const milestones = [
      {
        tier: 1,
        label: "1 Referral",
        unlocked: paidCount >= 1,
        reward: "1 free month of Elite",
        freeMonths: 1,
      },
      {
        tier: 5,
        label: "5 Referrals",
        unlocked: paidCount >= 5,
        reward: "3 more free months of Elite",
        freeMonths: 3,
      },
      {
        tier: 10,
        label: "10 Referrals",
        unlocked: paidCount >= 10,
        reward: "6 more free months + Founder Badge + Private Access",
        freeMonths: 6,
        badge: true,
        privateAccess: true,
      },
    ];

    // Referral list (anonymized)
    const referralList = await db
      .select({
        status: referrals.status,
        createdAt: referrals.createdAt,
      })
      .from(referrals)
      .where(eq(referrals.referrerId, userId))
      .orderBy(sql`${referrals.createdAt} desc`)
      .limit(20);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://www.hiremindx.com";

    return NextResponse.json({
      referralCode,
      referralUrl: referralCode ? `${siteUrl.replace(/\/$/, "")}/join-beta?ref=${referralCode}` : null,
      founderNumber: beta?.signupOrder ?? null,
      founderStatus: beta?.betaStatus ?? null,
      stats: {
        paid: paidCount,
        trialing: trialingCount,
        pending: pendingCount,
        total: totalCount,
        remaining: remainingQuota,
      },
      rewards: reward
        ? {
            freeMonthsGranted: reward.freeMonthsGranted,
            freeMonthsUsed: reward.freeMonthsUsed,
            freeMonthsPending: reward.freeMonthsPending,
            badgeGranted: reward.badgeGranted,
            privateAccessGranted: reward.privateAccessGranted,
          }
        : {
            freeMonthsGranted: 0,
            freeMonthsUsed: 0,
            freeMonthsPending: 0,
            badgeGranted: false,
            privateAccessGranted: false,
          },
      milestones,
      referralsList: referralList.map((r, i) => ({
        id: i + 1,
        status: r.status,
        date: r.createdAt,
      })),
    });
  } catch (error) {
    console.error("[beta-referrals] failed:", error);
    return NextResponse.json({ error: "Failed to load referrals" }, { status: 500 });
  }
}
