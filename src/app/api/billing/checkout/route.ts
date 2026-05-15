import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth, getBaseURL } from "@/lib/auth";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import {
  buildCheckoutCancelUrl,
  buildCheckoutSuccessUrl,
  getBillingPlan,
  getPlanPriceGbp,
  isActiveSubscriptionStatus,
} from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutRequestBody = {
  planId?: unknown;
};

function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    // Don't leak raw database/SQL errors to the client
    const msg = error.message;
    if (
      msg.includes("Failed query") ||
      msg.includes("SQLITE") ||
      msg.includes("sqlite") ||
      msg.includes("no such table") ||
      msg.includes("SQL_")
    ) {
      return fallback;
    }
    return msg;
  }

  return fallback;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    let body: CheckoutRequestBody;
    try {
      body = (await request.json()) as CheckoutRequestBody;
    } catch {
      return jsonError("Invalid request body");
    }

    const plan = getBillingPlan(body.planId);

    if (!plan) {
      return jsonError("Invalid plan selected");
    }

    const currentSubscriptionRows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);

    const currentSubscription = currentSubscriptionRows[0] ?? null;

    if (
      currentSubscription &&
      isActiveSubscriptionStatus(currentSubscription.status) &&
      currentSubscription.planId === plan.id
    ) {
      return jsonError("This subscription is already active.", 409);
    }

    if (
      currentSubscription &&
      isActiveSubscriptionStatus(currentSubscription.status) &&
      currentSubscription.planId !== plan.id
    ) {
      return jsonError("Please cancel your current subscription before selecting a new plan.", 409);
    }

    const stripe = getStripeClient();
    const baseUrl = getBaseURL();
    const customerEmail = session.user.email?.trim() || undefined;
    const customerName = session.user.name?.trim() || undefined;

    let stripeCustomerId = currentSubscription?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
        metadata: {
          userId: session.user.id,
        },
      });

      stripeCustomerId = customer.id;

      if (currentSubscription) {
        await db
          .update(subscriptions)
          .set({
            stripeCustomerId,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.userId, session.user.id));
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: stripeCustomerId ?? undefined,
      customer_email: stripeCustomerId ? undefined : customerEmail,
      success_url: buildCheckoutSuccessUrl(baseUrl, plan.id),
      cancel_url: buildCheckoutCancelUrl(baseUrl, plan.id),
      client_reference_id: session.user.id,
      metadata: {
        userId: session.user.id,
        planId: plan.id,
      },
      subscription_data: {
        metadata: {
          userId: session.user.id,
          planId: plan.id,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: plan.currency.toLowerCase(),
            unit_amount: plan.amountPence,
            recurring: {
              interval: plan.interval,
            },
            product_data: {
              name: plan.stripeProductName,
              description: `${plan.name} monthly subscription`,
            },
          },
        },
      ],
    });

    if (!checkoutSession.url) {
      return jsonError("Unable to create checkout session.", 500);
    }

    await db
      .insert(subscriptions)
      .values({
        userId: session.user.id,
        planId: plan.id,
        status: "pending",
        currency: plan.currency,
        amount: plan.amountPence,
        interval: plan.interval,
        stripeCustomerId,
        stripeSubscriptionId: null,
        stripeCheckoutSessionId: checkoutSession.id,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        metadata: {
          planName: plan.name,
          checkoutSessionId: checkoutSession.id,
        },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          planId: plan.id,
          status: "pending",
          currency: plan.currency,
          amount: plan.amountPence,
          interval: plan.interval,
          stripeCustomerId,
          stripeSubscriptionId: null,
          stripeCheckoutSessionId: checkoutSession.id,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          metadata: {
            planName: plan.name,
            checkoutSessionId: checkoutSession.id,
          },
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({
      url: checkoutSession.url,
      plan: {
        id: plan.id,
        name: plan.name,
        price: getPlanPriceGbp(plan),
        currency: plan.currency,
        interval: plan.interval,
      },
    });
  } catch (error) {
    console.error("[stripe-checkout] request failed:", error);
    return jsonError(getErrorMessage(error, "Unable to start checkout."), 500);
  }
}
