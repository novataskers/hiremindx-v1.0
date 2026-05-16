import { sql, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user, subscriptions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isActiveSubscriptionStatus } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BETA_MAX_SLOTS = 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Count active/trialing beta subscriptions
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(inArray(subscriptions.status, ["trialing", "active"]));

    const taken = Number(countResult[0]?.count ?? 0);
    const remaining = Math.max(0, BETA_MAX_SLOTS - taken);

    // Check if current user is already a beta member
    let isMember = false;
    let memberOrder: number | null = null;
    let memberStatus: string | null = null;

    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);

    if (session?.user?.id) {
      const userRows = await db
        .select({ signupOrder: user.signupOrder, betaStatus: user.betaStatus })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);

      if (userRows[0]?.betaStatus && ["trialing", "active", "pending"].includes(userRows[0].betaStatus)) {
        isMember = true;
        memberOrder = userRows[0].signupOrder;
        memberStatus = userRows[0].betaStatus;
      }

      // Also check subscriptions table
      if (!isMember) {
        const subRows = await db
          .select({ planId: subscriptions.planId, status: subscriptions.status })
          .from(subscriptions)
          .where(eq(subscriptions.userId, session.user.id))
          .limit(1);

        if (subRows[0] && subRows[0].planId === "beta_elite" && isActiveSubscriptionStatus(subRows[0].status)) {
          isMember = true;
          memberStatus = subRows[0].status;
        }
      }
    }

    return NextResponse.json({
      total: BETA_MAX_SLOTS,
      taken,
      remaining,
      isFull: remaining === 0,
      isMember,
      memberOrder,
      memberStatus,
    });
  } catch (error) {
    console.error("[beta-status] failed:", error);
    return NextResponse.json(
      { total: BETA_MAX_SLOTS, taken: 0, remaining: BETA_MAX_SLOTS, isFull: false, isMember: false, memberOrder: null, memberStatus: null },
      { status: 500 },
    );
  }
}
