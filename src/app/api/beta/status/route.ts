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
        isMember = true;
        memberOrder = betaRows[0].signupOrder;
        memberStatus = betaRows[0].status;

        // Proactive sync: if pending, trigger background sync with Stripe
        if (betaRows[0].status === "pending") {
          try {
            const syncRes = await fetch(new URL("/api/beta/sync", request.url), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });
            const syncData = await syncRes.json();
            if (syncData.synced) {
              memberStatus = syncData.status;
            }
          } catch {
            // Ignore sync errors, return current status
          }
        }
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
