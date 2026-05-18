import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups, user } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { sendBetaWelcomeEmail } from "@/lib/email";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Require authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    // Only allow syncing the authenticated user's own email
    const sessionEmail = session.user.email.trim().toLowerCase();
    if (requestedEmail !== sessionEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const email = sessionEmail;
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

    // Send welcome email if not already sent and status is verified
    if (!beta.welcomeEmailSent && beta.name && (betaStatus === "trialing" || betaStatus === "active")) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://www.hiremindx.com";
        console.log(`[beta-sync] Sending welcome email to: ${email}, founder #${beta.signupOrder}`);
        const emailResult = await sendBetaWelcomeEmail({
          to: email,
          subject: `You're In! Welcome to HireMindX Founding Beta`,
          title: "You're One of the First 100",
          summary: `Congratulations ${beta.name}, you've been selected as Founding Member #${beta.signupOrder} of HireMindX! As one of only 100 founding beta members, you've secured exclusive lifetime benefits: 50% discount (£9.99/month vs £19.99), 14-day free trial of Elite features, and priority access to new features.`,
          previewText: `You're in! Welcome to HireMindX Founding Beta as Founding Member #${beta.signupOrder}`,
          ctaLabel: "Start Your Elite Trial",
          ctaUrl: "/assist",
          recipientName: beta.name,
          metadata: [
            { label: "Founder Number", value: `#${beta.signupOrder}` },
            { label: "Plan", value: "Elite (Founding Member)" },
            { label: "Price", value: "£9.99/month (50% off for life)" },
            { label: "Free Trial", value: "14 days" },
            { label: "Referral Link", value: `${siteUrl.replace(/\/$/, "")}/premium?ref=${referralCode}` },
            { label: "Referral Rewards", value: "Refer 1 = 1 free month | 5 = 3 more | 10 = 6 more + Badge + VIP Access" },
          ],
        });
        console.log(`[beta-sync] Welcome email result: success=${emailResult.success}, messageId=${emailResult.messageId}, error=${emailResult.error}`);
        if (emailResult.success) {
          await db.update(betaSignups).set({ welcomeEmailSent: true }).where(eq(betaSignups.email, email));
          console.log("[beta-sync] welcomeEmailSent set to true");
        }
      } catch (emailError) {
        console.error("[beta-sync] Welcome email failed:", emailError);
      }
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
