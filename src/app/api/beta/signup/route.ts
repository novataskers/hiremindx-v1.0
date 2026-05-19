import { sql, eq, inArray, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups, referrals } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe";
import { getBaseURL, auth } from "@/lib/auth";
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
    // Require authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.email) {
      return jsonError("Unauthorized. Please sign in first.", 401);
    }

    const sessionEmail = session.user.email.trim().toLowerCase();
    const sessionName = session.user.name?.trim() ?? "";

    let body: { name?: string; email?: string; referralCode?: string; marketingConsent?: boolean };
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid request body");
    }

    // Use session name/email, fallback to body for name only
    const name = sessionName || (typeof body.name === "string" ? body.name.trim() : "");
    const email = sessionEmail;
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim() : undefined;
    const marketingConsent = body.marketingConsent === true;

    if (!name || name.length < 2) {
      return jsonError("Please enter your full name.");
    }

    // Check if email already signed up
    const existing = await db
      .select({ id: betaSignups.id, status: betaSignups.status })
      .from(betaSignups)
      .where(eq(betaSignups.email, email))
      .limit(1);

    if (existing.length > 0) {
      // Allow retry if previous signup was abandoned (pending)
      if (existing[0].status === "pending") {
        await db.delete(betaSignups).where(eq(betaSignups.email, email));
        console.log("[beta-signup] Deleted abandoned pending signup for:", email);
      } else {
        return jsonError("This email is already registered for beta access.", 409);
      }
    }

    // ── Referral code validation ──
    let referrerStripeCustomerId: string | undefined;
    if (referralCode) {
      const referrerRows = await db
        .select({
          email: betaSignups.email,
          status: betaSignups.status,
          userId: betaSignups.userId,
          stripeCustomerId: betaSignups.stripeCustomerId,
        })
        .from(betaSignups)
        .where(eq(betaSignups.referralCode, referralCode))
        .limit(1);

      const referrer = referrerRows[0];
      if (!referrer) {
        console.warn("[beta-signup] Referral code not found, ignoring:", referralCode);
        // Proceed without referral rather than blocking signup for stale/invalid cookie codes
        referrerStripeCustomerId = undefined;
      } else {

      // Self-referral guard
      if (referrer.email === email) {
        return jsonError("Cannot refer yourself.", 409);
      }

      // Referrer must be active or trialing
      if (!["trialing", "active"].includes(referrer.status ?? "")) {
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

    // Use total row count (all statuses) for unique, monotonically increasing order numbers
    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(betaSignups);
    const signupOrder = Number(totalCountResult[0]?.count ?? 0) + 1;

    const checkoutMetadata: Record<string, string> = {
      betaSignup: "true",
      betaEmail: email,
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
          betaEmail: email,
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

    // Insert beta signup
    await db.insert(betaSignups).values({
      email,
      name,
      signupOrder,
      stripeCustomerId: customer.id,
      stripeCheckoutSessionId: checkoutSession.id,
      status: "pending",
      marketingConsent,
      marketingConsentAt: marketingConsent ? new Date().toISOString() : null,
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
