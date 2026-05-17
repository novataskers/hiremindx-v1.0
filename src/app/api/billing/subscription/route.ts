import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getBillingPlan, getPlanPriceGbp, isActiveSubscriptionStatus, syncPendingSubscription } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function serializeTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return jsonError("Unauthorized", 401);
  }

  const subscriptionRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .limit(1);

  let subscription = subscriptionRows[0] ?? null;

  console.log("[subscription-api] user=", session.user.id, "sub=", subscription ? { status: subscription.status, checkoutId: subscription.stripeCheckoutSessionId, subId: subscription.stripeSubscriptionId } : "null");

  // If no subscription exists, try to link a beta signup (handles existing users who signed up for beta)
  // TODO: Implement beta signup linking if needed
  // if (!subscription || (!isActiveSubscriptionStatus(subscription.status) && subscription.planId !== "beta_elite")) {
  //   const linked = await linkBetaSignup(session.user.id, session.user.email);
  //   if (linked) {
  //     const recheck = await db.select().from(subscriptions).where(eq(subscriptions.userId, session.user.id)).limit(1);
  //     if (recheck[0]) subscription = recheck[0];
  //     console.log("[subscription-api] beta link result: linked=", linked, "sub=", subscription ? { status: subscription.status, planId: subscription.planId } : "null");
  //   }
  // }

  // Proactively check Stripe if the status is pending (e.g. just returned from checkout but webhook hasn't fired)
  if (subscription && subscription.status === "pending") {
    console.log("[subscription-api] status is pending, calling syncPendingSubscription");
    const result = await syncPendingSubscription(session.user.id, subscription);
    console.log("[subscription-api] syncPendingSubscription result:", result);
    if (result.activated) {
      const updatedRows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, session.user.id))
        .limit(1);
      subscription = updatedRows[0] ?? null;
      console.log("[subscription-api] subscription updated after sync:", subscription ? { status: subscription.status } : "null");
    }
  }

  // Proactively fetch missing period dates from Stripe (e.g. linkBetaSignup created row without dates)
  if (subscription && subscription.stripeSubscriptionId && (!subscription.currentPeriodStart || !subscription.currentPeriodEnd)) {
    try {
      const { getStripeClient } = await import("@/lib/stripe");
      const stripe = getStripeClient();
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const item = stripeSub.items?.data?.[0];
      const periodStart = (item as any)?.current_period_start ?? (stripeSub as any).current_period_start;
      const periodEnd = (item as any)?.current_period_end ?? (stripeSub as any).current_period_end;
      if (typeof periodStart === "number" || typeof periodEnd === "number") {
        await db
          .update(subscriptions)
          .set({
            currentPeriodStart: typeof periodStart === "number" ? new Date(periodStart * 1000) : subscription.currentPeriodStart,
            currentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000) : subscription.currentPeriodEnd,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.userId, session.user.id));
        console.log("[subscription-api] Updated missing period dates from Stripe");
        // Re-fetch updated row
        const updatedRows = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, session.user.id))
          .limit(1);
        subscription = updatedRows[0] ?? null;
      }
    } catch (e) {
      console.error("[subscription-api] Failed to fetch missing Stripe dates:", e);
    }
  }

  const plan = subscription ? getBillingPlan(subscription.planId) : null;

  // Derive founder metadata for frontend
  let isFounderBeta = subscription?.planId === "beta_elite";
  let founderSignupOrder: number | null = null;
  try {
    const meta = subscription?.metadata ? (typeof subscription.metadata === "string" ? JSON.parse(subscription.metadata) : subscription.metadata) : null;
    if (meta?.betaSignup || meta?.signupOrder) {
      isFounderBeta = true;
      founderSignupOrder = typeof meta.signupOrder === "number" ? meta.signupOrder : null;
    }
  } catch {
    // ignore metadata parse errors
  }

  return NextResponse.json({
    subscription: subscription
      ? {
          planId: subscription.planId,
          status: subscription.status,
          currency: subscription.currency,
          amount: subscription.amount,
          interval: subscription.interval,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodStart: serializeTimestamp(subscription.currentPeriodStart),
          currentPeriodEnd: serializeTimestamp(subscription.currentPeriodEnd),
          createdAt: serializeTimestamp(subscription.createdAt),
        }
      : null,
    plan: plan
      ? {
          id: plan.id,
          name: plan.name,
          price: getPlanPriceGbp(plan),
          currency: plan.currency,
          interval: plan.interval,
        }
      : null,
    isActive: subscription ? isActiveSubscriptionStatus(subscription.status) : false,
    isFounderBeta,
    founderSignupOrder,
    founderDiscountPercent: isFounderBeta ? 50 : null,
  });
}
