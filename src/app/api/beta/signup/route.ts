import { sql, eq, inArray, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user, subscriptions, referrals } from "@/db/schema";
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
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id || !session.user.email) {
      return jsonError("You must be signed in to join the beta.", 401);
    }

    const userId = session.user.id;
    const email = session.user.email.trim().toLowerCase();

    let body: { name?: string; referralCode?: string; marketingConsent?: boolean };
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid request body");
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim() : undefined;
    const marketingConsent = body.marketingConsent === true;

    if (!name || name.length < 2) {
      return jsonError("Please enter your full name.");
    }

    // Check if user already has beta access
    const existingBeta = await db
      .select({ betaStatus: user.betaStatus })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (existingBeta[0]?.betaStatus && !["canceled", "expired"].includes(existingBeta[0].betaStatus)) {
      return jsonError("You are already registered for beta access.", 409);
    }

    // ── Referral code validation ──
    let referrerStripeCustomerId: string | undefined;
    if (referralCode) {
      const referrerRows = await db
        .select({
          id: user.id,
          email: user.email,
          betaStatus: user.betaStatus,
          stripeCustomerId: user.stripeCustomerId,
        })
        .from(user)
        .where(eq(user.referralCode, referralCode))
        .limit(1);

      const referrer = referrerRows[0];
      if (!referrer) {
        return jsonError("Invalid referral code.", 400);
      }

      // Self-referral guard
      if (referrer.id === userId) {
        return jsonError("Cannot refer yourself.", 409);
      }

      // Referrer must be active or trialing
      if (!["trialing", "active"].includes(referrer.betaStatus ?? "")) {
        return jsonError("Referral link is no longer active.", 409);
      }

      // Quota guard: max 10 paid referrals
      const paidCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(referrals)
        .where(and(eq(referrals.referralCode, referralCode), eq(referrals.status, "paid")));

      const paidCount = Number(paidCountResult[0]?.count ?? 0);
      if (paidCount >= 10) {
        return NextResponse.json(
          { error: "Referral Link Expired", expired: true },
          { status: 409 },
        );
      }

      // Duplicate referral guard
      const dupCheck = await db
        .select({ id: referrals.id })
        .from(referrals)
        .where(and(eq(referrals.referralCode, referralCode), eq(referrals.referredEmail, email)))
        .limit(1);

      if (dupCheck.length > 0) {
        return jsonError("Already referred with this link.", 409);
      }

      referrerStripeCustomerId = referrer.stripeCustomerId ?? undefined;
    }

    // Count active/trialing beta subscriptions (exclude pending and canceled)
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(inArray(subscriptions.status, ["trialing", "active"]));

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
      metadata: { betaSignup: "true", userId },
    });

    // Create Stripe Checkout Session with 14-day trial
    const baseUrl = getBaseURL();
    const signupOrder = taken + 1;

    const checkoutMetadata: Record<string, string> = {
      betaSignup: "true",
      userId,
      planId: "beta_elite",
    };
    if (referralCode) {
      checkoutMetadata.referralCode = referralCode;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: customer.id,
      success_url: `${normalizeBaseUrl(baseUrl)}/join-beta?success=1&order=${signupOrder}`,
      cancel_url: `${normalizeBaseUrl(baseUrl)}/join-beta?canceled=1`,
      metadata: checkoutMetadata,
      subscription_data: {
        trial_period_days: BETA_TRIAL_DAYS,
        metadata: {
          betaSignup: "true",
          userId,
          planId: "beta_elite",
          ...(referralCode ? { referralCode } : {}),
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

    // Update user row with beta signup data
    await db
      .update(user)
      .set({
        name,
        betaStatus: "pending",
        signupOrder,
        stripeCustomerId: customer.id,
        marketingConsent,
        marketingConsentAt: marketingConsent ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

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
