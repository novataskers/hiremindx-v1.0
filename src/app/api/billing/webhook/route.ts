import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, user, betaSignups } from "@/db/schema";
import { getBillingPlan } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";
import { sendHireMindXEmailNotification } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function toDate(unixSeconds: number | null | undefined): Date | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000);
}

/** Extract current_period_start from a Stripe Subscription (SDK v19+ moved these to items.data[0]) */
function getSubscriptionPeriodStart(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0];
  if (item && typeof (item as any).current_period_start === "number") return (item as any).current_period_start;
  if (typeof (sub as any).current_period_start === "number") return (sub as any).current_period_start;
  return null;
}

/** Extract current_period_end from a Stripe Subscription (SDK v19+ moved these to items.data[0]) */
function getSubscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0];
  if (item && typeof (item as any).current_period_end === "number") return (item as any).current_period_end;
  if (typeof (sub as any).current_period_end === "number") return (sub as any).current_period_end;
  return null;
}

async function sendSubscriptionActivatedEmail(userId: string) {
  try {
    const userRows = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const u = userRows[0];
    if (!u?.email) return;

    await sendHireMindXEmailNotification({
      to: u.email,
      recipientName: u.name || "there",
    });
  } catch (e) {
    console.error("[stripe-webhook] Failed to send activation email:", e);
  }
}

async function sendSubscriptionCanceledEmail(userId: string) {
  try {
    const userRows = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const u = userRows[0];
    if (!u?.email) return;

    await sendHireMindXEmailNotification({
      to: u.email,
      recipientName: u.name || "there",
    });
  } catch (e) {
    console.error("[stripe-webhook] Failed to send cancellation email:", e);
  }
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  return secret;
}

async function findUserIdFromStripeIdentifiers({
  userId,
  customerId,
  subscriptionId,
}: {
  userId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<string | null> {
  if (userId) return userId;

  if (subscriptionId) {
    const bySubscription = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);

    if (bySubscription[0]?.userId) return bySubscription[0].userId;
  }

  if (customerId) {
    const byCustomer = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, customerId))
      .limit(1);

    if (byCustomer[0]?.userId) return byCustomer[0].userId;
  }

  return null;
}

async function persistSubscription({
  userId,
  planId,
  status,
  currency,
  amount,
  interval,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeCheckoutSessionId,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  metadata,
}: {
  userId: string;
  planId: string;
  status: string;
  currency: string;
  amount: number;
  interval: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId?: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const updateSet: Record<string, unknown> = {
    planId,
    status,
    currency,
    amount,
    interval,
    stripeCustomerId,
    stripeSubscriptionId,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    metadata,
    updatedAt: new Date(),
  };

  if (stripeCheckoutSessionId !== undefined && stripeCheckoutSessionId !== null) {
    updateSet.stripeCheckoutSessionId = stripeCheckoutSessionId;
  }

  await db
    .insert(subscriptions)
    .values({
      userId,
      planId,
      status,
      currency,
      amount,
      interval,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeCheckoutSessionId: stripeCheckoutSessionId ?? null,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      metadata,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: updateSet,
    });
}

async function syncStripeSubscription({
  userId,
  stripeSubscription,
  stripeCheckoutSessionId,
  checkoutPlanId,
}: {
  userId: string;
  stripeSubscription: Stripe.Subscription;
  stripeCheckoutSessionId?: string | null;
  checkoutPlanId?: string | null;
}): Promise<void> {
  const planIdFromSub = stripeSubscription.metadata?.planId ?? null;
  const planFromSub = getBillingPlan(planIdFromSub) ?? null;

  // Fallback: checkout session metadata is set by our checkout creation endpoint.
  const planIdFromCheckout = checkoutPlanId ?? null;
  const planFromCheckout = getBillingPlan(planIdFromCheckout) ?? null;

  const price = stripeSubscription.items.data[0]?.price ?? null;

  const effectivePlanId =
    planFromSub?.id ?? planFromCheckout?.id ?? planIdFromSub ?? planIdFromCheckout ?? "basic";
  const effectivePlan = getBillingPlan(effectivePlanId) ?? null;

  // Preserve existing founder metadata (betaSignup, signupOrder) if present
  let mergedMetadata: Record<string, unknown> = {
    stripeCustomerId: typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
    stripeSubscriptionId: stripeSubscription.id,
    stripeCheckoutSessionId: stripeCheckoutSessionId ?? null,
    planId: effectivePlan?.id ?? effectivePlanId,
    status: stripeSubscription.status,
  };

  try {
    const existingSub = await db
      .select({ metadata: subscriptions.metadata })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (existingSub[0]?.metadata) {
      const existingMeta =
        typeof existingSub[0].metadata === "string"
          ? JSON.parse(existingSub[0].metadata)
          : existingSub[0].metadata;
      if (existingMeta?.betaSignup) {
        mergedMetadata = {
          ...mergedMetadata,
          betaSignup: true,
          signupOrder: existingMeta.signupOrder,
        };
      }
    }
  } catch {
    // ignore metadata read errors — proceed with Stripe-only metadata
  }

  await persistSubscription({
    userId,
    planId: effectivePlan?.id ?? effectivePlanId,
    status: stripeSubscription.status,
    currency: (price?.currency ?? effectivePlan?.currency ?? "GBP").toUpperCase(),
    amount:
      typeof price?.unit_amount === "number" && Number.isFinite(price.unit_amount)
        ? price.unit_amount
        : effectivePlan?.amountPence ?? 0,
    interval: price?.recurring?.interval ?? effectivePlan?.interval ?? "month",
    stripeCustomerId: typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
    stripeSubscriptionId: stripeSubscription.id,
    stripeCheckoutSessionId: stripeCheckoutSessionId ?? null,
    currentPeriodStart: toDate(getSubscriptionPeriodStart(stripeSubscription)),
    currentPeriodEnd: toDate(getSubscriptionPeriodEnd(stripeSubscription)),
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    metadata: mergedMetadata,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let event: Stripe.Event;

  try {
    const stripe = getStripeClient();
    const signature = request.headers.get("stripe-signature");
    if (!signature) return jsonError("Missing Stripe signature.", 400);

    const secret = getWebhookSecret();
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook payload.";
    return jsonError(message, 400);
  }

  try {
    const stripe = getStripeClient();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode !== "subscription") break;

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

        // ── Beta signup checkout ──
        if (session.metadata?.betaSignup === "true" && session.metadata?.betaEmail) {
          const betaEmail = session.metadata.betaEmail.trim().toLowerCase();
          const stripeSubscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
          const betaStatus = stripeSubscription?.status === "trialing" ? "trialing" : stripeSubscription?.status === "active" ? "active" : "active";

          await db
            .update(betaSignups)
            .set({
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: typeof customerId === "string" ? customerId : undefined,
              status: betaStatus,
            })
            .where(eq(betaSignups.email, betaEmail));

          // Try to link to existing user account
          const { linkBetaSignup } = await import("@/lib/beta-link");
          const userRows = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, betaEmail))
            .limit(1);

          if (userRows[0]) {
            await linkBetaSignup(userRows[0].id, betaEmail);
          }

          console.log(`[stripe-webhook] Beta checkout completed for ${betaEmail}`);
          break;
        }

        // ── Regular checkout ──
        const userId = await findUserIdFromStripeIdentifiers({
          userId: session.client_reference_id ?? session.metadata?.userId ?? null,
          customerId,
          subscriptionId,
        });

        if (!userId || !subscriptionId) break;

        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);

        await syncStripeSubscription({
          userId,
          stripeSubscription,
          stripeCheckoutSessionId: session.id,
          checkoutPlanId: typeof session.metadata?.planId === "string" ? session.metadata.planId : null,
        });

        // Send activation email if subscription is active
        if (stripeSubscription.status === "active" || stripeSubscription.status === "trialing") {
          await sendSubscriptionActivatedEmail(userId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const stripeSubscription = event.data.object as Stripe.Subscription;

        // ── Beta subscription update ──
        if (stripeSubscription.metadata?.betaSignup === "true" && stripeSubscription.metadata?.betaEmail) {
          const betaEmail = stripeSubscription.metadata.betaEmail.trim().toLowerCase();
          const betaStatus = stripeSubscription.status === "trialing" ? "trialing" : stripeSubscription.status === "active" ? "active" : stripeSubscription.status;

          await db
            .update(betaSignups)
            .set({
              stripeSubscriptionId: stripeSubscription.id,
              status: betaStatus,
            })
            .where(eq(betaSignups.email, betaEmail));

          // Also sync to subscriptions table if user is linked
          const betaRows = await db
            .select({ userId: betaSignups.userId })
            .from(betaSignups)
            .where(eq(betaSignups.email, betaEmail))
            .limit(1);

          if (betaRows[0]?.userId) {
            await syncStripeSubscription({
              userId: betaRows[0].userId,
              stripeSubscription,
              stripeCheckoutSessionId: null,
              checkoutPlanId: "beta_elite",
            });
          }
          break;
        }

        // ── Regular subscription update ──
        const userId = await findUserIdFromStripeIdentifiers({
          userId: stripeSubscription.metadata?.userId ?? null,
          customerId: typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
          subscriptionId: stripeSubscription.id,
        });

        if (!userId) break;

        await syncStripeSubscription({
          userId,
          stripeSubscription,
          stripeCheckoutSessionId: (stripeSubscription.metadata as any)?.checkoutSessionId ?? null,
          checkoutPlanId: null,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSubscription = event.data.object as Stripe.Subscription;

        // ── Beta subscription deleted ──
        if (stripeSubscription.metadata?.betaSignup === "true" && stripeSubscription.metadata?.betaEmail) {
          const betaEmail = stripeSubscription.metadata.betaEmail.trim().toLowerCase();

          // Mark beta_signups row as canceled (safety net — cancel endpoint may have already deleted it)
          await db
            .update(betaSignups)
            .set({ status: "canceled" })
            .where(eq(betaSignups.email, betaEmail));

          // Check if subscription row still exists (cancel endpoint deletes it for trial cancellations)
          const betaRows = await db
            .select({ userId: betaSignups.userId })
            .from(betaSignups)
            .where(eq(betaSignups.email, betaEmail))
            .limit(1);

          const betaUserId = betaRows[0]?.userId;
          if (betaUserId) {
            const existingSub = await db
              .select({ id: subscriptions.id })
              .from(subscriptions)
              .where(eq(subscriptions.userId, betaUserId))
              .limit(1);

            // Only update if the row still exists — do NOT re-create it
            if (existingSub[0]) {
              await db
                .update(subscriptions)
                .set({
                  status: "canceled",
                  cancelAtPeriodEnd: false,
                  updatedAt: new Date(),
                })
                .where(eq(subscriptions.userId, betaUserId));
            }

            await sendSubscriptionCanceledEmail(betaUserId);
          }
          break;
        }

        // ── Regular subscription deleted ──
        const userId = await findUserIdFromStripeIdentifiers({
          userId: stripeSubscription.metadata?.userId ?? null,
          customerId: typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
          subscriptionId: stripeSubscription.id,
        });

        if (!userId) break;

        const planId = stripeSubscription.metadata?.planId;
        const plan = getBillingPlan(planId) ?? null;
        const price = stripeSubscription.items.data[0]?.price ?? null;

        await persistSubscription({
          userId,
          planId: plan?.id ?? planId ?? "basic",
          status: "canceled",
          currency: (price?.currency ?? plan?.currency ?? "GBP").toUpperCase(),
          amount:
            typeof price?.unit_amount === "number" && Number.isFinite(price.unit_amount)
              ? price.unit_amount
              : plan?.amountPence ?? 0,
          interval: price?.recurring?.interval ?? plan?.interval ?? "month",
          stripeCustomerId: typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
          stripeSubscriptionId: stripeSubscription.id,
          stripeCheckoutSessionId: (stripeSubscription.metadata as any)?.checkoutSessionId ?? null,
          currentPeriodStart: toDate(getSubscriptionPeriodStart(stripeSubscription)),
          currentPeriodEnd: toDate(getSubscriptionPeriodEnd(stripeSubscription) ?? (stripeSubscription as any).canceled_at),
          cancelAtPeriodEnd: false,
          metadata: {
            stripeCustomerId: typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
            stripeSubscriptionId: stripeSubscription.id,
            stripeCheckoutSessionId: (stripeSubscription.metadata as any)?.checkoutSessionId ?? null,
            planId: plan?.id ?? planId ?? null,
            status: "canceled",
          },
        });

        await sendSubscriptionCanceledEmail(userId);
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("[stripe-webhook] processing failed:", error);
    return jsonError("Webhook processing failed.", 500);
  }

  return NextResponse.json({ received: true });
}
