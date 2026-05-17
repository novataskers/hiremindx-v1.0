import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups, user } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    console.log("[beta-sync] Sync requested for:", email);

    // Look up beta signup
    const betaRows = await db
      .select()
      .from(betaSignups)
      .where(eq(betaSignups.email, email))
      .limit(1);

    const beta = betaRows[0];
    if (!beta) {
      console.log("[beta-sync] No beta signup found for:", email);
      return NextResponse.json({ synced: false, reason: "not_found" });
    }

    console.log("[beta-sync] Found beta signup, status:", beta.status, "checkoutSessionId:", beta.stripeCheckoutSessionId);

    // If already active/trialing, nothing to do
    if (beta.status === "active" || beta.status === "trialing") {
      console.log("[beta-sync] Already active/trialing, no sync needed");
      return NextResponse.json({
        synced: false,
        reason: "already_active",
        status: beta.status,
        signupOrder: beta.signupOrder,
        referralCode: beta.referralCode,
      });
    }

    // If no checkout session ID, can't sync
    if (!beta.stripeCheckoutSessionId) {
      console.log("[beta-sync] No checkout session ID, can't sync");
      return NextResponse.json({ synced: false, reason: "no_checkout_session" });
    }

    // Check Stripe for subscription status
    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.retrieve(beta.stripeCheckoutSessionId);
    console.log("[beta-sync] Checkout session status:", checkoutSession.status, "subscription:", checkoutSession.subscription ? "present" : "missing");

    if (checkoutSession.status !== "complete") {
      return NextResponse.json({ synced: false, reason: "checkout_not_complete", checkoutStatus: checkoutSession.status });
    }

    if (!checkoutSession.subscription) {
      return NextResponse.json({ synced: false, reason: "no_subscription" });
    }

    const subscriptionId = typeof checkoutSession.subscription === "string"
      ? checkoutSession.subscription
      : checkoutSession.subscription.id;

    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const betaStatus = stripeSubscription.status === "trialing" ? "trialing" : stripeSubscription.status === "active" ? "active" : stripeSubscription.status;
    console.log("[beta-sync] Stripe subscription status:", stripeSubscription.status, "=> betaStatus:", betaStatus);

    // Generate referral code if missing
    let referralCode = beta.referralCode;
    if (!referralCode) {
      referralCode = randomUUID().replace(/-/g, "").slice(0, 12);
      await db
        .update(betaSignups)
        .set({ referralCode })
        .where(eq(betaSignups.email, email));
      console.log("[beta-sync] Generated referral code:", referralCode);
    }

    // Update beta signup status
    await db
      .update(betaSignups)
      .set({
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: typeof checkoutSession.customer === "string" ? checkoutSession.customer : beta.stripeCustomerId,
        status: betaStatus,
      })
      .where(eq(betaSignups.email, email));
    console.log("[beta-sync] Updated beta_signups status to:", betaStatus);

    // Link to user account if exists
    const { linkBetaSignup } = await import("@/lib/beta-link");
    const userRows = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (userRows[0]) {
      await linkBetaSignup(userRows[0].id, email);
      console.log("[beta-sync] Linked to user:", userRows[0].id);
    }

    return NextResponse.json({
      synced: true,
      status: betaStatus,
      signupOrder: beta.signupOrder,
      referralCode,
    });
  } catch (error) {
    console.error("[beta-sync] Error:", error);
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message, synced: false }, { status: 500 });
  }
}
