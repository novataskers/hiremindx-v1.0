import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { communityProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildAuthHeaders(req: NextRequest) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const authz = req.headers.get("authorization");
  if (authz) h.set("authorization", authz);
  return h;
}

// POST /api/community/stripe/connect — Create a Stripe Connect account or generate onboarding link
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stripe = getStripeClient();
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      // Create a Stripe Connect Express account for the freelancer
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: session.user.email || undefined,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          userId: session.user.id,
        },
      });

      // Save the account ID to the community profile
      await db
        .update(communityProfiles)
        .set({
          stripeAccountId: account.id,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(communityProfiles.userId, session.user.id));

      // Generate onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.hiremindx.com"}/profile?stripe_connect=refresh`,
        return_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.hiremindx.com"}/profile?stripe_connect=success`,
        type: "account_onboarding",
      });

      return NextResponse.json({
        success: true,
        accountId: account.id,
        onboardingUrl: accountLink.url,
      });
    }

    if (action === "onboarding") {
      // Re-generate onboarding link for existing account
      const profileRows = await db
        .select({ stripeAccountId: communityProfiles.stripeAccountId })
        .from(communityProfiles)
        .where(eq(communityProfiles.userId, session.user.id))
        .limit(1);

      const stripeAccountId = profileRows[0]?.stripeAccountId;
      if (!stripeAccountId) {
        return NextResponse.json({ error: "No Stripe account found" }, { status: 404 });
      }

      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.hiremindx.com"}/profile?stripe_connect=refresh`,
        return_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.hiremindx.com"}/profile?stripe_connect=success`,
        type: "account_onboarding",
      });

      return NextResponse.json({
        success: true,
        onboardingUrl: accountLink.url,
      });
    }

    if (action === "status") {
      // Check Stripe Connect account status
      const profileRows = await db
        .select({ stripeAccountId: communityProfiles.stripeAccountId })
        .from(communityProfiles)
        .where(eq(communityProfiles.userId, session.user.id))
        .limit(1);

      const stripeAccountId = profileRows[0]?.stripeAccountId;
      if (!stripeAccountId) {
        return NextResponse.json({ connected: false });
      }

      const account = await stripe.accounts.retrieve(stripeAccountId);
      const isOnboarded =
        account.details_submitted &&
        account.charges_enabled &&
        account.payouts_enabled;

      return NextResponse.json({
        connected: true,
        isOnboarded,
        accountId: stripeAccountId,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("[stripe/connect] Error:", error);
    return NextResponse.json(
      { error: error.message || "Stripe Connect error" },
      { status: 500 }
    );
  }
}
