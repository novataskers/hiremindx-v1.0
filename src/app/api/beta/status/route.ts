import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BETA_MAX_SLOTS = 100;

export async function GET(): Promise<NextResponse> {
  try {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(betaSignups);

    const taken = Number(countResult[0]?.count ?? 0);
    const remaining = Math.max(0, BETA_MAX_SLOTS - taken);

    return NextResponse.json({
      total: BETA_MAX_SLOTS,
      taken,
      remaining,
      isFull: remaining === 0,
    });
  } catch (error) {
    console.error("[beta-status] failed:", error);
    return NextResponse.json(
      { total: BETA_MAX_SLOTS, taken: 0, remaining: BETA_MAX_SLOTS, isFull: false },
      { status: 500 },
    );
  }
}
