import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user, betaSignups } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRows = await db
      .select({ marketingConsent: user.marketingConsent })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    return NextResponse.json({
      marketingConsent: userRows[0]?.marketingConsent ?? false,
    });
  } catch (error) {
    console.error("[marketing-consent] GET failed:", error);
    return NextResponse.json({ error: "Failed to load preference" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const consent = body.consent === true;

    await db
      .update(user)
      .set({
        marketingConsent: consent,
        marketingConsentAt: consent ? new Date() : null,
      })
      .where(eq(user.id, session.user.id));

    // Also sync to beta_signups row if exists
    if (session.user.email) {
      await db
        .update(betaSignups)
        .set({
          marketingConsent: consent,
          marketingConsentAt: consent ? new Date().toISOString() : null,
        })
        .where(eq(betaSignups.email, session.user.email.trim().toLowerCase()));
    }

    return NextResponse.json({ success: true, marketingConsent: consent });
  } catch (error) {
    console.error("[marketing-consent] failed:", error);
    return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
  }
}
