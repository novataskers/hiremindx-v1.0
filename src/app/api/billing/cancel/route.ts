import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { subscriptions, user } from "@/db/schema";
import { isActiveSubscriptionStatus, isBetaPlan } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";
import { sendHireMindXEmailNotification } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function sendCancellationEmail(userId: string) {
  try {
    const userRows = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
    const u = userRows[0];
    if (!u?.email) return;

    await sendHireMindXEmailNotification({
      to: u.email,
      recipientName: u.name || "there",
    });
  } catch (e) {
    console.error("[billing/cancel] Failed to send cancellation email:", e);
  }
}

// POST /api/billing/cancel — Cancel the user's active subscription
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return jsonError("Unauthorized", 401);
    }

    const subscriptionRows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);

    const subscription = subscriptionRows[0] ?? null;

    if (!subscription) {
      return jsonError("No subscription found.", 404);
    }

    if (!isActiveSubscriptionStatus(subscription.status)) {
      return jsonError("Your subscription is not currently active.", 400);
    }

    if (!subscription.stripeSubscriptionId) {
      return jsonError("No Stripe subscription found to cancel.", 400);
    }

    const stripe = getStripeClient();
    const isFounderBeta = isBetaPlan(subscription.planId);
    const isTrialing = subscription.status === "trialing";

    // ── Founder Beta: trial-period cancellation = full withdrawal ──
    if (isFounderBeta && isTrialing) {
      // Cancel Stripe subscription immediately (no charge since trialing)
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);

      // Delete the subscriptions row entirely (clean slate)
      await db
        .delete(subscriptions)
        .where(eq(subscriptions.userId, session.user.id));

      // Update user betaStatus to canceled
      await db
        .update(user)
        .set({ betaStatus: "canceled" })
        .where(eq(user.id, session.user.id));

      await sendCancellationEmail(session.user.id);

      console.log(`[billing/cancel] Founder beta trial cancellation — full cleanup for user ${session.user.id}`);

      return NextResponse.json({
        success: true,
        founderReset: true,
        message: "Your Founder Beta membership has been withdrawn. Your free trial has been canceled and your founder spot has been released.",
        cancelAtPeriodEnd: false,
        status: "canceled",
      });
    }

    // ── Founder Beta: post-trial = cancel at period end (keep founder pricing until end) ──
    if (isFounderBeta && !isTrialing) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, session.user.id));

      await sendCancellationEmail(session.user.id);

      return NextResponse.json({
        success: true,
        message: "Your Founder Elite subscription will be canceled at the end of the current billing period. You will keep founder access until then.",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    }

    // ── Regular plan cancellation ──
    const createdDate = new Date(subscription.createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isEligibleForRefund = diffDays <= 14;

    if (isEligibleForRefund) {
      // Cancel immediately
      const stripeSub = await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      
      // Issue refund for the latest invoice
      if (stripeSub.latest_invoice) {
        const latestInvoiceId = typeof stripeSub.latest_invoice === "string" ? stripeSub.latest_invoice : stripeSub.latest_invoice.id;
        const invoice = await stripe.invoices.retrieve(latestInvoiceId);
        
        const invAny = invoice as any;
        if (invAny.payment_intent) {
          const paymentIntentId = typeof invAny.payment_intent === "string" ? invAny.payment_intent : invAny.payment_intent.id;
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
          });
        }
      }

      // Update local DB
      await db
        .update(subscriptions)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, session.user.id));

      await sendCancellationEmail(session.user.id);

      return NextResponse.json({
        success: true,
        message: "Your subscription has been canceled and a refund has been issued. Funds will be returned to your account in 48 hours.",
        cancelAtPeriodEnd: false,
        status: "canceled",
      });
    } else {
      // Cancel at period end (graceful cancellation)
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      // Update local DB
      await db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, session.user.id));

      await sendCancellationEmail(session.user.id);

      return NextResponse.json({
        success: true,
        message: "Your subscription will be canceled at the end of the current billing period.",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    }
  } catch (error) {
    console.error("[billing/cancel] Error:", error);
    const message = error instanceof Error ? error.message : "Unable to cancel subscription.";
    return jsonError(message, 500);
  }
}
