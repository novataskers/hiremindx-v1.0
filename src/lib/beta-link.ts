import { eq } from "drizzle-orm";
import { db } from "@/db";
import { betaSignups, subscriptions } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe";

/**
 * Links a beta signup to a user account by email.
 * Updates beta_signups.userId and creates a subscription record if needed.
 * Returns true if linked, false if no beta signup found.
 */
export async function linkBetaSignup(userId: string, email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Find beta signup by email
  const betaRows = await db
    .select()
    .from(betaSignups)
    .where(eq(betaSignups.email, normalizedEmail))
    .limit(1);

  const beta = betaRows[0];
  if (!beta) {
    console.log("[beta-link] No beta signup found for:", normalizedEmail);
    return false;
  }

  // 2. Update userId if not already set
  if (!beta.userId) {
    await db
      .update(betaSignups)
      .set({ userId })
      .where(eq(betaSignups.email, normalizedEmail));
    console.log("[beta-link] Linked beta signup to user:", userId);
  }

  // 3. Check if subscription already exists for this user
  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!subRows[0]) {
    // 4. Try to fetch period dates from Stripe if subscription ID exists
    let currentPeriodStart: Date | null = null;
    let currentPeriodEnd: Date | null = null;

    if (beta.stripeSubscriptionId) {
      try {
        const stripe = getStripeClient();
        const stripeSub = await stripe.subscriptions.retrieve(beta.stripeSubscriptionId);
        const item = stripeSub.items?.data?.[0];
        const periodStart = (item as any)?.current_period_start ?? (stripeSub as any).current_period_start;
        const periodEnd = (item as any)?.current_period_end ?? (stripeSub as any).current_period_end;
        if (typeof periodStart === "number") currentPeriodStart = new Date(periodStart * 1000);
        if (typeof periodEnd === "number") currentPeriodEnd = new Date(periodEnd * 1000);
        console.log("[beta-link] Fetched Stripe dates:", { currentPeriodStart, currentPeriodEnd });
      } catch (e) {
        console.error("[beta-link] Failed to fetch Stripe subscription dates:", e);
      }
    }

    // 5. Create subscription record for beta_elite
    await db.insert(subscriptions).values({
      userId,
      planId: "beta_elite",
      status: beta.status === "trialing" || beta.status === "active" ? beta.status : "pending",
      amount: 999, // £9.99 in pence
      stripeCustomerId: beta.stripeCustomerId ?? undefined,
      stripeSubscriptionId: beta.stripeSubscriptionId ?? undefined,
      stripeCheckoutSessionId: beta.stripeCheckoutSessionId ?? undefined,
      currentPeriodStart: currentPeriodStart ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
      metadata: { betaSignup: true, planId: "beta_elite" },
    });
    console.log("[beta-link] Created beta_elite subscription for user:", userId);
  }

  return true;
}
