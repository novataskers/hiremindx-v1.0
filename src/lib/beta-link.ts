import { eq } from "drizzle-orm";
import { db } from "@/db";
import { betaSignups, subscriptions } from "@/db/schema";
import { isActiveSubscriptionStatus } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";

/**
 * Link a beta signup to a platform user account by email.
 * If the user's email matches a beta signup, this will:
 * 1. Set userId on the beta_signups row
 * 2. Upsert a subscription row with planId "beta_elite"
 *
 * Called from:
 * - better-auth user.create.after hook (new signups)
 * - Stripe webhook when beta checkout completes
 * - /api/billing/subscription on sign-in (catch existing users)
 */
export async function linkBetaSignup(userId: string, email: string): Promise<boolean> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const betaRows = await db
      .select()
      .from(betaSignups)
      .where(eq(betaSignups.email, normalizedEmail))
      .limit(1);

    let beta = betaRows[0];
    if (!beta) return false;

    // Already linked to a different user
    if (beta.userId && beta.userId !== userId) return false;

    // Link userId to beta signup if not already linked
    if (!beta.userId) {
      await db
        .update(betaSignups)
        .set({ userId })
        .where(eq(betaSignups.id, beta.id));
    }

    let stripePeriodStart: Date | null = null;
    let stripePeriodEnd: Date | null = null;
    let stripeCancelAtPeriodEnd = false;

    // If status is still "pending" but we have a Stripe subscription or checkout,
    // proactively fetch the real status from Stripe (handles webhook race condition)
    if (beta.status === "pending" && (beta.stripeSubscriptionId || beta.stripeCheckoutSessionId)) {
      try {
        const stripe = getStripeClient();
        let subId = beta.stripeSubscriptionId;

        // If no subscription ID yet, try to get it from the checkout session
        if (!subId && beta.stripeCheckoutSessionId) {
          const checkout = await stripe.checkout.sessions.retrieve(beta.stripeCheckoutSessionId);
          if (checkout.subscription) {
            subId = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription.id;
          }
        }

        if (subId) {
          const stripeSub = await stripe.subscriptions.retrieve(subId);
          const realStatus = stripeSub.status === "trialing" ? "trialing" : stripeSub.status === "active" ? "active" : stripeSub.status;

          // Extract period dates from Stripe subscription
          const item = stripeSub.items?.data?.[0];
          const cpStart = (item as any)?.current_period_start ?? (stripeSub as any).current_period_start;
          const cpEnd = (item as any)?.current_period_end ?? (stripeSub as any).current_period_end;
          const trialEnd = (stripeSub as any).trial_end;

          if (typeof cpStart === "number") stripePeriodStart = new Date(cpStart * 1000);
          if (typeof cpEnd === "number") stripePeriodEnd = new Date(cpEnd * 1000);
          stripeCancelAtPeriodEnd = stripeSub.cancel_at_period_end ?? false;

          // Update beta_signups with real status
          await db
            .update(betaSignups)
            .set({
              status: realStatus,
              stripeSubscriptionId: subId,
            })
            .where(eq(betaSignups.id, beta.id));

          // Re-read the updated row
          const updated = await db.select().from(betaSignups).where(eq(betaSignups.id, beta.id)).limit(1);
          if (updated[0]) beta = updated[0];
        }
      } catch (e) {
        console.error("[beta-link] Stripe proactive fetch failed:", e);
      }
    }

    // Upsert subscription if beta signup has an active/trialing Stripe subscription
    if (beta.stripeSubscriptionId && (beta.status === "trialing" || beta.status === "active")) {
      // Check if user already has an active subscription
      const existingSub = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const existing = existingSub[0];

      // Don't overwrite an already-active non-beta subscription
      if (existing && isActiveSubscriptionStatus(existing.status) && existing.planId !== "beta_elite") {
        return true;
      }

      // Fallback period: signup date + 14 days if Stripe data is missing
      if (!stripePeriodEnd && beta.createdAt) {
        const signupDate = new Date(beta.createdAt);
        stripePeriodEnd = new Date(signupDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      }

      await db
        .insert(subscriptions)
        .values({
          userId,
          planId: "beta_elite",
          status: beta.status,
          currency: "GBP",
          amount: 999,
          interval: "month",
          stripeCustomerId: beta.stripeCustomerId,
          stripeSubscriptionId: beta.stripeSubscriptionId,
          stripeCheckoutSessionId: beta.stripeCheckoutSessionId,
          currentPeriodStart: stripePeriodStart,
          currentPeriodEnd: stripePeriodEnd,
          cancelAtPeriodEnd: stripeCancelAtPeriodEnd,
          metadata: {
            betaSignup: true,
            signupOrder: beta.signupOrder,
            planId: "beta_elite",
          },
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            planId: "beta_elite",
            status: beta.status,
            stripeCustomerId: beta.stripeCustomerId,
            stripeSubscriptionId: beta.stripeSubscriptionId,
            stripeCheckoutSessionId: beta.stripeCheckoutSessionId,
            currentPeriodStart: stripePeriodStart,
            currentPeriodEnd: stripePeriodEnd,
            cancelAtPeriodEnd: stripeCancelAtPeriodEnd,
            metadata: {
              betaSignup: true,
              signupOrder: beta.signupOrder,
              planId: "beta_elite",
            },
            updatedAt: new Date(),
          },
        });
    }

    console.log(`[beta-link] Linked beta signup #${beta.signupOrder} to user ${userId}`);
    return true;
  } catch (error) {
    console.error("[beta-link] Failed to link beta signup:", error);
    return false;
  }
}
