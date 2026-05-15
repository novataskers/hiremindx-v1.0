import Stripe from "stripe";

export type BillingPlanId = "basic" | "pro" | "elite" | "beta_elite";

export type BillingInterval = "month";

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  description: string;
  amountPence: number;
  currency: "GBP";
  interval: BillingInterval;
  stripeProductName: string;
};

export const BILLING_PLANS: Record<BillingPlanId, BillingPlan> = {
  basic: {
    id: "basic",
    name: "Basic",
    description: "Essential access for getting started with HireMindX.",
    amountPence: 599,
    currency: "GBP",
    interval: "month",
    stripeProductName: "HireMindX Basic",
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Advanced AI tools and unlimited productivity for power users.",
    amountPence: 999,
    currency: "GBP",
    interval: "month",
    stripeProductName: "HireMindX Pro",
  },
  elite: {
    id: "elite",
    name: "Elite",
    description: "Maximum access, priority ranking, and first access to premium opportunities.",
    amountPence: 1999,
    currency: "GBP",
    interval: "month",
    stripeProductName: "HireMindX Elite",
  },
  beta_elite: {
    id: "beta_elite",
    name: "Founding Member Elite",
    description: "Exclusive founding member access — Elite plan at 50% off for life.",
    amountPence: 999,
    currency: "GBP",
    interval: "month",
    stripeProductName: "HireMindX Founding Member Elite",
  },
};

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return value === "basic" || value === "pro" || value === "elite" || value === "beta_elite";
}

export function isBetaPlan(planId: unknown): boolean {
  return planId === "beta_elite";
}

export function getBillingPlan(planId: unknown): BillingPlan | null {
  if (!isBillingPlanId(planId)) {
    return null;
  }

  return BILLING_PLANS[planId];
}

export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/** Per-plan feature limits. `Infinity` means unlimited. `0` means blocked on that plan. */
export const PLAN_FEATURE_LIMITS: Record<BillingPlanId, Record<string, number>> = {
  basic: {
    chat_messages: 999,
    file_uploads: 5,
    email_outreach: 7,
    community_messaging: Infinity,
    community_contract: Infinity,
    community_post: 3,
    deep_research: 0,
    market_analysis: 0,
    ai_prediction: 0,
    live_coding: 0,
    bulk_cv_analysis: 0,
    interview_questions: 0,
    exam_questions: 0,
    community_ai_agent: 0,
  },
  pro: {
    chat_messages: Infinity,
    file_uploads: Infinity,
    email_outreach: Infinity,
    deep_research: Infinity,
    market_analysis: Infinity,
    ai_prediction: Infinity,
    community_messaging: Infinity,
    community_contract: Infinity,
    community_post: Infinity,
    bulk_cv_analysis: 10,
    interview_questions: 10,
    exam_questions: 5,
    community_ai_agent: 5,
    live_coding: 0,
  },
  elite: {
    chat_messages: Infinity,
    file_uploads: Infinity,
    email_outreach: Infinity,
    deep_research: Infinity,
    market_analysis: Infinity,
    ai_prediction: Infinity,
    live_coding: Infinity,
    bulk_cv_analysis: Infinity,
    interview_questions: Infinity,
    exam_questions: Infinity,
    community_ai_agent: Infinity,
    community_messaging: Infinity,
    community_contract: Infinity,
    community_post: Infinity,
  },
  beta_elite: {
    chat_messages: Infinity,
    file_uploads: Infinity,
    email_outreach: Infinity,
    deep_research: Infinity,
    market_analysis: Infinity,
    ai_prediction: Infinity,
    live_coding: Infinity,
    bulk_cv_analysis: Infinity,
    interview_questions: Infinity,
    exam_questions: Infinity,
    community_ai_agent: Infinity,
    community_messaging: Infinity,
    community_contract: Infinity,
    community_post: Infinity,
  },
};

export function getPlanFeatureLimit(planId: BillingPlanId, feature: string): number {
  const planLimits = PLAN_FEATURE_LIMITS[planId];
  if (!planLimits) return 0;
  return planLimits[feature] ?? 0;
}

export function getPlanPriceGbp(plan: BillingPlan): number {
  return plan.amountPence / 100;
}

export function buildCheckoutSuccessUrl(baseUrl: string, planId: BillingPlanId): string {
  return `${normalizeBaseUrl(baseUrl)}/premium?success=1&plan=${encodeURIComponent(planId)}`;
}

export function buildCheckoutCancelUrl(baseUrl: string, planId: BillingPlanId): string {
  return `${normalizeBaseUrl(baseUrl)}/premium?canceled=1&plan=${encodeURIComponent(planId)}`;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * Proactively sync a pending subscription with Stripe.
 * If the checkout session is complete and a subscription exists,
 * update the DB with the active status.
 */
export async function syncPendingSubscription(
  userId: string,
  subscription: { stripeCheckoutSessionId: string | null; status: string; stripeSubscriptionId: string | null },
): Promise<{ activated: boolean; newStatus?: string }> {
  if (subscription.status !== "pending") {
    return { activated: false };
  }

  try {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { subscriptions } = await import("@/db/schema");
    const { getStripeClient } = await import("@/lib/stripe");
    const stripe = getStripeClient();

    let stripeSub: Stripe.Subscription | null = null;

    // Path 1: check via checkout session (primary)
    if (subscription.stripeCheckoutSessionId) {
      console.log("[syncPending] Path 1: retrieving checkout session", subscription.stripeCheckoutSessionId);
      const checkoutSession = await stripe.checkout.sessions.retrieve(subscription.stripeCheckoutSessionId);
      console.log("[syncPending] checkout session status=", checkoutSession.status, "subscription=", checkoutSession.subscription ? "present" : "missing");

      if (checkoutSession.status === "complete" && checkoutSession.subscription) {
        const stripeSubscriptionId =
          typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription.id;
        console.log("[syncPending] retrieving subscription", stripeSubscriptionId);
        stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        console.log("[syncPending] subscription status=", stripeSub.status);
      }
    } else {
      console.log("[syncPending] Path 1 skipped: no checkout session ID");
    }

    // Path 2: fallback — check subscription directly if webhook already set the ID but status is still pending
    if (!stripeSub && subscription.stripeSubscriptionId) {
      console.log("[syncPending] Path 2: retrieving subscription by ID", subscription.stripeSubscriptionId);
      stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      console.log("[syncPending] fallback subscription status=", stripeSub.status);
    }

    if (!stripeSub) {
      console.log("[syncPending] No subscription found via either path");
      return { activated: false };
    }

    // Only activate if Stripe considers it active or trialing
    if (!isActiveSubscriptionStatus(stripeSub.status)) {
      console.log("[syncPending] Subscription status not active:", stripeSub.status);
      return { activated: false };
    }

    console.log("[syncPending] Activating subscription with status:", stripeSub.status);
    const item = stripeSub.items?.data?.[0];
    const periodStart = (item as any)?.current_period_start ?? (stripeSub as any).current_period_start;
    const periodEnd = (item as any)?.current_period_end ?? (stripeSub as any).current_period_end;
    await db
      .update(subscriptions)
      .set({
        status: stripeSub.status,
        stripeSubscriptionId: stripeSub.id,
        currentPeriodStart: typeof periodStart === "number" ? new Date(periodStart * 1000) : null,
        currentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000) : null,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, userId));

    return { activated: true, newStatus: stripeSub.status };
  } catch (e) {
    console.error("[billing-sync] Proactive stripe fetch failed", e);
    return { activated: false };
  }
}
