import { sql, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe";
import { getBaseURL } from "@/lib/auth";
import { normalizeBaseUrl } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BETA_MAX_SLOTS = 100;
const BETA_TRIAL_DAYS = 14;
const BETA_ELITE_AMOUNT_PENCE = 999; // £9.99/month

function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: { name?: string; email?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid request body");
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!name || name.length < 2) {
      return jsonError("Please enter your full name.");
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError("Please enter a valid email address.");
    }

    // Check if email already signed up
    const existing = await db
      .select({ id: betaSignups.id })
      .from(betaSignups)
      .where(eq(betaSignups.email, email))
      .limit(1);

    if (existing.length > 0) {
      return jsonError("This email is already registered for beta access.", 409);
    }

    // Count active/trialing signups only (exclude pending and canceled)
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(betaSignups)
      .where(inArray(betaSignups.status, ["trialing", "active"]));

    const taken = Number(countResult[0]?.count ?? 0);

    if (taken >= BETA_MAX_SLOTS) {
      return NextResponse.json(
        { error: "Beta access is full.", full: true, remaining: 0 },
        { status: 409 },
      );
    }

    // Create Stripe customer
    const stripe = getStripeClient();
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { betaSignup: "true" },
    });

    // Create Stripe Checkout Session with 14-day trial
    const baseUrl = getBaseURL();
    const signupOrder = taken + 1;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: customer.id,
      success_url: `${normalizeBaseUrl(baseUrl)}/join-beta?success=1&order=${signupOrder}`,
      cancel_url: `${normalizeBaseUrl(baseUrl)}/join-beta?canceled=1`,
      metadata: {
        betaSignup: "true",
        betaEmail: email,
        planId: "beta_elite",
      },
      subscription_data: {
        trial_period_days: BETA_TRIAL_DAYS,
        metadata: {
          betaSignup: "true",
          betaEmail: email,
          planId: "beta_elite",
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: BETA_ELITE_AMOUNT_PENCE,
            recurring: { interval: "month" },
            product_data: {
              name: "HireMindX Founding Member Elite",
              description: "Elite plan at 50% off for life — 14-day free trial included",
            },
          },
        },
      ],
    });

    if (!checkoutSession.url) {
      return jsonError("Unable to create checkout session.", 500);
    }

    // Insert beta signup
    await db.insert(betaSignups).values({
      email,
      name,
      signupOrder,
      stripeCustomerId: customer.id,
      stripeCheckoutSessionId: checkoutSession.id,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      url: checkoutSession.url,
      signupOrder,
      remaining: BETA_MAX_SLOTS - signupOrder,
    });
  } catch (error) {
    console.error("[beta-signup] request failed:", error);
    const message = error instanceof Error ? error.message : "Unable to process beta signup.";
    return jsonError(message, 500);
  }
}
