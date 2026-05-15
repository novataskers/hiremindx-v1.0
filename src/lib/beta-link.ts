import { eq } from "drizzle-orm";
import { db } from "@/db";
import { betaSignups, subscriptions } from "@/db/schema";
import { isActiveSubscriptionStatus } from "@/lib/billing";

/**
 * Link a beta signup to a platform user account by email.
 * If the user's email matches a beta signup, this will:
 * 1. Set userId on the beta_signups row
 * 2. Upsert a subscription row with planId "beta_elite"
 *
 * Called from:
 * - better-auth user.create.after hook (new signups)
 * - Stripe webhook when beta checkout completes
 */
export async function linkBetaSignup(userId: string, email: string): Promise<boolean> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const betaRows = await db
      .select()
      .from(betaSignups)
      .where(eq(betaSignups.email, normalizedEmail))
      .limit(1);

    const beta = betaRows[0];
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

    // Only upsert subscription if beta signup has an active/trialing Stripe subscription
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
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
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
