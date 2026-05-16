import { eq } from "drizzle-orm";
import { db } from "@/db";
import { betaSignups, subscriptions } from "@/db/schema";

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
    // 4. Create subscription record for beta_elite
    await db.insert(subscriptions).values({
      userId,
      planId: "beta_elite",
      status: beta.status === "trialing" || beta.status === "active" ? beta.status : "pending",
      amount: 999, // £9.99 in pence
      stripeCustomerId: beta.stripeCustomerId ?? undefined,
      stripeSubscriptionId: beta.stripeSubscriptionId ?? undefined,
      stripeCheckoutSessionId: beta.stripeCheckoutSessionId ?? undefined,
      metadata: { betaSignup: true, planId: "beta_elite" },
    });
    console.log("[beta-link] Created beta_elite subscription for user:", userId);
  }

  return true;
}
