import { sql, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups, subscriptions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isActiveSubscriptionStatus } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BETA_MAX_SLOTS = 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Count active/trialing signups only (exclude pending and canceled)
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(betaSignups)
      .where(inArray(betaSignups.status, ["trialing", "active"]));

    const taken = Number(countResult[0]?.count ?? 0);
    const remaining = Math.max(0, BETA_MAX_SLOTS - taken);

    // Check if current user is already a beta member
    let isMember = false;
    let hasPending = false;
    let memberOrder: number | null = null;
    let memberStatus: string | null = null;

    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);

    if (session?.user?.email) {
      const email = session.user.email.trim().toLowerCase();
      const betaRows = await db
        .select({ signupOrder: betaSignups.signupOrder, status: betaSignups.status })
        .from(betaSignups)
        .where(eq(betaSignups.email, email))
        .limit(1);

      if (betaRows[0]) {
        memberOrder = betaRows[0].signupOrder;
        memberStatus = betaRows[0].status;

        // Only count active/trialing as actual members
        if (betaRows[0].status === "active" || betaRows[0].status === "trialing") {
          isMember = true;
        }

        // Track pending state separately so frontend can show "complete payment" UI
        if (betaRows[0].status === "pending") {
          hasPending = true;
        }
      }

      // Also check subscriptions table as fallback
      if (!isMember && !hasPending) {
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
      hasPending,
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
