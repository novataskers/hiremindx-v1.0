import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups, referrals } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const code = request.nextUrl.searchParams.get("code")?.trim();
    if (!code) {
      return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
    }

    // Look up referral code in betaSignups
    const referrerRows = await db
      .select({
        email: betaSignups.email,
        status: betaSignups.status,
      })
      .from(betaSignups)
      .where(eq(betaSignups.referralCode, code))
      .limit(1);

    if (!referrerRows[0]) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
    }

    const referrer = referrerRows[0];

    // Referrer must be active or trialing
    if (!["trialing", "active"].includes(referrer.status ?? "")) {
      return NextResponse.json({ error: "Referral link is no longer active" }, { status: 409 });
    }

    // Count paid referrals for this code
    const paidCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(referrals)
      .where(and(eq(referrals.referralCode, code), eq(referrals.status, "paid")));

    const paidCount = Number(paidCountResult[0]?.count ?? 0);

    if (paidCount >= 10) {
      return NextResponse.json(
        { error: "Referral link has reached its 10-person limit", expired: true },
        { status: 409 },
      );
    }

    return NextResponse.json({
      valid: true,
      paidCount,
      remaining: 10 - paidCount,
    });
  } catch (error) {
    console.error("[referral-status] failed:", error);
    return NextResponse.json({ error: "Failed to check referral status" }, { status: 500 });
  }
}
