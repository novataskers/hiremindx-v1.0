import Stripe from "stripe";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, user, betaSignups, founderRewards, referrals } from "@/db/schema";
import { getBillingPlan } from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";
import { sendHireMindXEmailNotification } from "@/lib/email";
import { randomUUID } from "crypto";

const BETA_ELITE_AMOUNT_PENCE = 999; // £9.99/month

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

  console.log("[stripe-webhook] Webhook POST received");

  try {
    const stripe = getStripeClient();
    const signature = request.headers.get("stripe-signature");
    console.log("[stripe-webhook] Signature present:", !!signature);
    if (!signature) return jsonError("Missing Stripe signature.", 400);

    const secret = getWebhookSecret();
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
    console.log("[stripe-webhook] Event constructed, type:", event.type);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook payload.";
    console.error("[stripe-webhook] Event construction failed:", message);
    return jsonError(message, 400);
  }

  try {
    const stripe = getStripeClient();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[stripe-webhook] checkout.session.completed, mode:", session.mode, "metadata:", session.metadata);

        if (session.mode !== "subscription") break;

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

        // ── Beta signup checkout ──
        if (session.metadata?.betaSignup === "true" && session.metadata?.betaEmail) {
          console.log("[stripe-webhook] Beta signup detected, email:", session.metadata.betaEmail);
          const betaEmail = session.metadata.betaEmail.trim().toLowerCase();
          const stripeSubscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
          const betaStatus = stripeSubscription?.status === "trialing" ? "trialing" : stripeSubscription?.status === "active" ? "active" : "active";
          console.log("[stripe-webhook] Stripe subscription status:", stripeSubscription?.status, "=> betaStatus:", betaStatus);

          // Fetch current beta signup to check existing referral code & email status
          const betaRows = await db
            .select({
              id: betaSignups.id,
              name: betaSignups.name,
              signupOrder: betaSignups.signupOrder,
              referralCode: betaSignups.referralCode,
              welcomeEmailSent: betaSignups.welcomeEmailSent,
              userId: betaSignups.userId,
            })
            .from(betaSignups)
            .where(eq(betaSignups.email, betaEmail))
            .limit(1);

          console.log("[stripe-webhook] Beta row found:", !!betaRows[0], "current status:", betaRows[0]?.status);

          const betaRow = betaRows[0];
          let referralCode = betaRow?.referralCode ?? null;

          // Generate referral code if not already set
          if (!referralCode) {
            referralCode = randomUUID().replace(/-/g, "").slice(0, 12);
            console.log("[stripe-webhook] Generating referral code:", referralCode);
            await db
              .update(betaSignups)
              .set({ referralCode })
              .where(eq(betaSignups.email, betaEmail));
          }

          console.log("[stripe-webhook] Updating beta_signups status to:", betaStatus, "subscriptionId:", subscriptionId);
          await db
            .update(betaSignups)
            .set({
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: typeof customerId === "string" ? customerId : undefined,
              status: betaStatus,
            })
            .where(eq(betaSignups.email, betaEmail));
          console.log("[stripe-webhook] beta_signups updated successfully");

          // Try to link to existing user account
          const { linkBetaSignup } = await import("@/lib/beta-link");
          const userRows = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, betaEmail))
            .limit(1);

          console.log("[stripe-webhook] User account found:", !!userRows[0]);
          if (userRows[0]) {
            await linkBetaSignup(userRows[0].id, betaEmail);
          }

          // Send welcome email once
          if (betaRow && !betaRow.welcomeEmailSent && betaRow.name) {
            try {
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "https://www.hiremindx.com";
              await sendHireMindXEmailNotification({
                to: betaEmail,
                subject: `Welcome to HireMindX — You're Founding Member #${betaRow.signupOrder}!`,
                title: "You're One of the First 100",
                summary: `Congratulations ${betaRow.name}, you've secured your place as Founding Member #${betaRow.signupOrder} of HireMindX. Your 14-day free Elite trial has started, and you're locked in at £9.99/month (50% off) for life.`,
                previewText: `Welcome to HireMindX — You're Founding Member #${betaRow.signupOrder}!`,
                ctaLabel: "Start Using HireMindX",
                ctaUrl: "/assist",
                recipientName: betaRow.name,
                metadata: [
                  { label: "Founder Number", value: `#${betaRow.signupOrder}` },
                  { label: "Plan", value: "Elite (Founding Member)" },
                  { label: "Price", value: "£9.99/month (50% off for life)" },
                  { label: "Free Trial", value: "14 days" },
                  { label: "Referral Link", value: `${siteUrl.replace(/\/$/, "")}/join-beta?ref=${referralCode}` },
                  { label: "Referral Rewards", value: "Refer 1 = 1 free month | 5 = 3 more | 10 = 6 more + Badge + VIP Access" },
                ],
              });

              await db
                .update(betaSignups)
                .set({ welcomeEmailSent: true })
                .where(eq(betaSignups.email, betaEmail));
            } catch (emailError) {
              console.error("[stripe-webhook] Welcome email failed:", emailError);
            }
          }

          // Ensure founderRewards row exists for linked user
          const linkedUserId = userRows[0]?.id ?? betaRow?.userId;
          if (linkedUserId) {
            await db
              .insert(founderRewards)
              .values({
                userId: linkedUserId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
              .onConflictDoNothing();
          }

          console.log(`[stripe-webhook] Beta checkout completed for ${betaEmail}`);
          break;
        }
        console.log("[stripe-webhook] Not a beta signup checkout");

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

        // ── Referral tracking for regular Elite checkout ──
        const referralCode = typeof session.metadata?.referralCode === "string" ? session.metadata.referralCode : undefined;
        const planId = typeof session.metadata?.planId === "string" ? session.metadata.planId : null;
        if (referralCode && planId === "elite" && customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          const referredEmail = typeof customer === "object" ? customer.email ?? null : null;
          if (referredEmail) {
            const normalizedEmail = referredEmail.trim().toLowerCase();
            // Look up referrer by code
            const referrerRows = await db
              .select({ userId: betaSignups.userId, email: betaSignups.email })
              .from(betaSignups)
              .where(eq(betaSignups.referralCode, referralCode))
              .limit(1);
            const referrer = referrerRows[0];
            if (referrer && referrer.userId && referrer.email !== normalizedEmail) {
              // Create or update referrals row
              const existingRef = await db
                .select({ id: referrals.id })
                .from(referrals)
                .where(and(eq(referrals.referralCode, referralCode), eq(referrals.referredEmail, normalizedEmail)))
                .limit(1);
              if (!existingRef[0]) {
                await db.insert(referrals).values({
                  referrerId: referrer.userId,
                  referralCode,
                  referredEmail: normalizedEmail,
                  referredUserId: userId,
                  stripeSubscriptionId: subscriptionId,
                  status: stripeSubscription.status === "trialing" ? "trialing" : "pending",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              } else {
                await db
                  .update(referrals)
                  .set({
                    referredUserId: userId,
                    stripeSubscriptionId: subscriptionId,
                    status: stripeSubscription.status === "trialing" ? "trialing" : "pending",
                    updatedAt: new Date().toISOString(),
                  })
                  .where(eq(referrals.id, existingRef[0].id));
              }
              console.log(`[stripe-webhook] Referral tracked: ${referralCode} → ${normalizedEmail}`);
            }
          }
        }

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

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
        if (!subscriptionId) break;

        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
        const referralCode = typeof stripeSubscription.metadata?.referralCode === "string" ? stripeSubscription.metadata.referralCode : undefined;
        if (!referralCode) break;

        const customerId = typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null;
        if (!customerId) break;

        const customer = await stripe.customers.retrieve(customerId);
        const referredEmail = typeof customer === "object" ? customer.email ?? null : null;
        if (!referredEmail) break;

        const normalizedEmail = referredEmail.trim().toLowerCase();

        // Update referral status to paid
        const refRows = await db
          .select({ id: referrals.id, referrerId: referrals.referrerId })
          .from(referrals)
          .where(and(eq(referrals.referralCode, referralCode), eq(referrals.referredEmail, normalizedEmail)))
          .limit(1);

        if (!refRows[0]) break;
        const ref = refRows[0];

        // Only process if transitioning to paid for first time
        if (ref.referrerId) {
          await db
            .update(referrals)
            .set({ status: "paid", updatedAt: new Date().toISOString() })
            .where(eq(referrals.id, ref.id));

          // Count paid referrals for this referrer
          const paidCountResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(referrals)
            .where(and(eq(referrals.referrerId, ref.referrerId), eq(referrals.status, "paid")));
          const paidCount = Number(paidCountResult[0]?.count ?? 0);

          // Determine milestone reward
          let newFreeMonths = 0;
          let grantBadge = false;
          let grantPrivateAccess = false;

          // Additive milestones: check which threshold was just crossed
          // We reward at exact counts: 1, 5, 10
          if (paidCount === 1) newFreeMonths = 1;
          else if (paidCount === 5) newFreeMonths = 3;
          else if (paidCount === 10) {
            newFreeMonths = 6;
            grantBadge = true;
            grantPrivateAccess = true;
          }

          if (newFreeMonths > 0 || grantBadge || grantPrivateAccess) {
            // Get or create founderRewards row
            const rewardRows = await db
              .select()
              .from(founderRewards)
              .where(eq(founderRewards.userId, ref.referrerId))
              .limit(1);
            let reward = rewardRows[0];
            if (!reward) {
              await db.insert(founderRewards).values({
                userId: ref.referrerId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              const newRows = await db
                .select()
                .from(founderRewards)
                .where(eq(founderRewards.userId, ref.referrerId))
                .limit(1);
              reward = newRows[0];
            }

            if (reward) {
              const updates: Partial<typeof founderRewards.$inferInsert> = {
                updatedAt: new Date().toISOString(),
              };
              if (newFreeMonths > 0) {
                updates.freeMonthsGranted = (reward.freeMonthsGranted ?? 0) + newFreeMonths;
                updates.freeMonthsPending = (reward.freeMonthsPending ?? 0) + newFreeMonths;
              }
              if (grantBadge) updates.badgeGranted = true;
              if (grantPrivateAccess) updates.privateAccessGranted = true;

              await db
                .update(founderRewards)
                .set(updates)
                .where(eq(founderRewards.userId, ref.referrerId));

              // Apply Stripe invoice credit for free months
              const referrerBetaRows = await db
                .select({ stripeCustomerId: betaSignups.stripeCustomerId })
                .from(betaSignups)
                .where(eq(betaSignups.userId, ref.referrerId))
                .limit(1);
              const referrerStripeCustomerId = referrerBetaRows[0]?.stripeCustomerId;
              if (referrerStripeCustomerId && newFreeMonths > 0) {
                try {
                  const creditAmountPence = newFreeMonths * BETA_ELITE_AMOUNT_PENCE; // £9.99 per month
                  await stripe.customers.createBalanceTransaction(referrerStripeCustomerId, {
                    amount: -creditAmountPence,
                    currency: "gbp",
                    description: `Referral reward — ${newFreeMonths} free month(s) for reaching ${paidCount} referrals`,
                  });
                  // Move pending → used
                  await db
                    .update(founderRewards)
                    .set({
                      freeMonthsPending: (reward.freeMonthsPending ?? 0),
                      freeMonthsUsed: (reward.freeMonthsUsed ?? 0) + newFreeMonths,
                      updatedAt: new Date().toISOString(),
                    })
                    .where(eq(founderRewards.userId, ref.referrerId));
                  console.log(`[stripe-webhook] Applied ${newFreeMonths} free month credit to referrer ${ref.referrerId}`);
                } catch (creditError) {
                  console.error("[stripe-webhook] Failed to apply referral credit:", creditError);
                }
              }
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const stripeSubscription = event.data.object as Stripe.Subscription;
        // Handle referral refunds — if a referred user's subscription is canceled/refunded,
        // mark the referral as refunded so future rewards are not granted from this user
        if (stripeSubscription.metadata?.referralCode && stripeSubscription.status === "canceled") {
          const customerId = typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null;
          if (customerId) {
            const customer = await stripe.customers.retrieve(customerId);
            const referredEmail = typeof customer === "object" ? customer.email ?? null : null;
            if (referredEmail) {
              const normalizedEmail = referredEmail.trim().toLowerCase();
              const refCode = stripeSubscription.metadata.referralCode;
              await db
                .update(referrals)
                .set({ status: "refunded", updatedAt: new Date().toISOString() })
                .where(and(eq(referrals.referralCode, refCode), eq(referrals.referredEmail, normalizedEmail)));
              console.log(`[stripe-webhook] Referral marked as refunded: ${refCode} → ${normalizedEmail}`);
            }
          }
        }
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
