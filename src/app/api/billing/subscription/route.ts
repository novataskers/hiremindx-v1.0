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
