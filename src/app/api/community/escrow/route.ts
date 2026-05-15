import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { escrowTransactions, freelancerWallets, walletTransactions, cancellationRecords, notifications, communityProfiles, communityDMs, user } from "@/db/schema";
import { and, eq, desc, like, or } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";
import { sendHireMindXEmailNotification } from "@/lib/email";

function buildAuthHeaders(req: NextRequest) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const authz = req.headers.get("authorization");
  if (authz) h.set("authorization", authz);
  return h;
}

const GRACE_PERIOD_MS = 12 * 60 * 60 * 1000; // 12 hours

// GET — fetch escrow transactions for the current user
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const contractId = searchParams.get("contractId");

  try {
    let rows;
    if (contractId) {
      rows = await db.select().from(escrowTransactions)
        .where(eq(escrowTransactions.contractId, contractId))
        .orderBy(desc(escrowTransactions.createdAt));
    } else {
      rows = await db.select().from(escrowTransactions)
        .where(
          eq(escrowTransactions.clientId, session.user.id)
        )
        .orderBy(desc(escrowTransactions.createdAt));
      
      // Also get ones where user is freelancer
      const freelancerRows = await db.select().from(escrowTransactions)
        .where(eq(escrowTransactions.freelancerId, session.user.id))
        .orderBy(desc(escrowTransactions.createdAt));

      const idSet = new Set(rows.map(r => r.id));
      for (const row of freelancerRows) {
        if (!idSet.has(row.id)) {
          rows.push(row);
          idSet.add(row.id);
        }
      }
    }

    return NextResponse.json({ escrowTransactions: rows });
  } catch (error: any) {
    console.error("Error fetching escrow transactions:", error);
    return NextResponse.json({ error: "Failed to fetch escrow data" }, { status: 500 });
  }
}

// POST — create/fund escrow, release money, or cancel
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "fund": {
        // Client clicks "Proceed to Fund Escrow" — charge their card NOW and hold money in escrow.
        // Client pays contract amount + 10% platform fee. Money stays in our platform Stripe account.
        let { contractId, freelancerId, contractAmount, paymentMethodId, paymentIntentId: existingPI } = body;

        // 3D Secure redirect case: only paymentIntentId provided, get details from Stripe metadata
        if (existingPI && !contractId) {
          const stripe = getStripeClient();
          try {
            const pi = await stripe.paymentIntents.retrieve(existingPI);
            contractId = pi.metadata?.contractId || null;
            freelancerId = pi.metadata?.freelancerId || null;
            contractAmount = pi.metadata?.contractAmount ? Number(pi.metadata.contractAmount) : null;
          } catch {
            return NextResponse.json({ error: "Failed to retrieve payment details" }, { status: 400 });
          }
          if (!contractId || !freelancerId || !contractAmount) {
            return NextResponse.json({ error: "Missing contract details from payment metadata" }, { status: 400 });
          }
        }

        if (!contractId || !freelancerId || !contractAmount) {
          return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // DUPLICATE CHECK: If escrow already exists for this contract, return it — do NOT charge again
        const [existingEscrow] = await db.select().from(escrowTransactions)
          .where(eq(escrowTransactions.contractId, contractId));
        if (existingEscrow && existingEscrow.status !== "pending" && existingEscrow.status !== "cancelled") {
          return NextResponse.json({
            success: true,
            escrow: existingEscrow,
            paymentIntentId: existingEscrow.stripePaymentIntentId,
            alreadyFunded: true,
          });
        }

        const amountPence = Math.round(Number(contractAmount) * 100);
        const platformFee = Math.round(amountPence * 0.1);
        const totalCharged = amountPence + platformFee;
        const now = new Date().toISOString();

        const stripe = getStripeClient();

        let paymentIntent;

        // If paymentIntentId is provided, client completed 3D Secure — verify and record escrow
        if (existingPI) {
          try {
            paymentIntent = await stripe.paymentIntents.retrieve(existingPI);
          } catch (stripeError: any) {
            console.error("[escrow/fund] PaymentIntent retrieval failed:", stripeError);
            return NextResponse.json(
              { error: stripeError.message || "Failed to verify payment" },
              { status: 400 }
            );
          }

          if (paymentIntent.status !== "succeeded") {
            return NextResponse.json(
              { error: "Payment not completed", status: paymentIntent.status },
              { status: 400 }
            );
          }
        } else if (paymentMethodId) {
          // 1. Create and confirm PaymentIntent — charge client's card now
          try {
            paymentIntent = await stripe.paymentIntents.create({
              amount: totalCharged,
              currency: "gbp",
              payment_method: paymentMethodId,
              confirm: true,
              automatic_payment_methods: {
                enabled: true,
                allow_redirects: "never",
              },
              metadata: {
                contractId,
                clientId: session.user.id,
                freelancerId,
                contractAmount: String(amountPence),
                platformFee: String(platformFee),
                type: "escrow_fund",
              },
              description: `Escrow funding for contract ${contractId}`,
            });
          } catch (stripeError: any) {
            console.error("[escrow/fund] PaymentIntent creation failed:", stripeError);
            return NextResponse.json(
              { error: stripeError.message || "Failed to process payment" },
              { status: 400 }
            );
          }

          // Handle 3D Secure / requires_action
          if (paymentIntent.status === "requires_action") {
            return NextResponse.json({
              requiresAction: true,
              clientSecret: paymentIntent.client_secret,
              paymentIntentId: paymentIntent.id,
            });
          }

          if (paymentIntent.status !== "succeeded") {
            return NextResponse.json(
              { error: "Payment failed", status: paymentIntent.status },
              { status: 400 }
            );
          }
        } else {
          return NextResponse.json({ error: "Missing paymentMethodId or paymentIntentId" }, { status: 400 });
        }

        const chargeId = paymentIntent.latest_charge ? String(paymentIntent.latest_charge) : null;

        // 2. Record escrow as funded
        const [escrow] = await db.insert(escrowTransactions).values({
          contractId,
          clientId: session.user.id,
          freelancerId,
          contractAmount: amountPence,
          platformFee,
          totalCharged,
          status: "escrow_funded",
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: chargeId || null,
          settlementStatus: "pending",
          fundedAt: now,
          createdAt: now,
          updatedAt: now,
        }).returning();

        // 3. Notifications are handled by the chat message system (frontend sends [CONTRACT_RESPONSE] message
        // which triggers notification creation via the messages API). No duplicate notifications here.

        return NextResponse.json({
          success: true,
          escrow,
          paymentIntentId: paymentIntent.id,
        });
      }

      case "release": {
        // Client clicks "Release Money" — release funds from escrow to freelancer.
        // Idempotency: if already released/completed, do not double-credit.
        const { contractId: releaseContractId } = body;
        if (!releaseContractId) {
          return NextResponse.json({ error: "Missing contractId" }, { status: 400 });
        }

        const [escrow] = await db.select().from(escrowTransactions)
          .where(eq(escrowTransactions.contractId, releaseContractId));

        if (!escrow) {
          return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
        }

        if (escrow.clientId !== session.user.id) {
          return NextResponse.json({ error: "Only the client can release funds" }, { status: 403 });
        }

        // Idempotent behavior: if already released/completed, return success without changing balances.
        if (escrow.status === "released" || escrow.status === "completed") {
          return NextResponse.json({
            success: true,
            message: "Escrow already released (idempotent).",
            escrowStatus: escrow.status,
          });
        }

        if (escrow.status !== "escrow_funded") {
          return NextResponse.json({ error: "Escrow is not funded" }, { status: 400 });
        }

        const now = new Date().toISOString();

        // 1. Transition escrow -> released (only from escrow_funded to prevent race/double-release)
        await db.update(escrowTransactions)
          .set({
            status: "released",
            releasedAt: now,
            updatedAt: now,
          })
          .where(and(eq(escrowTransactions.id, escrow.id), eq(escrowTransactions.status, "escrow_funded")));

        // 1b. Verify the update with a separate SELECT (handles Turso/libSQL .returning() flakiness)
        const [verifiedEscrow] = await db.select().from(escrowTransactions)
          .where(eq(escrowTransactions.id, escrow.id));

        console.log("[escrow/release] pre-status:", escrow.status, "| post-status:", verifiedEscrow?.status, "| contractId:", releaseContractId);

        if (!verifiedEscrow || verifiedEscrow.status !== "released") {
          console.error("[escrow/release] Transition verification failed. Verified status:", verifiedEscrow?.status);
          return NextResponse.json({
            error: "Release transition failed (already processed or invalid state).",
            actualStatus: verifiedEscrow?.status || null,
          }, { status: 409 });
        }

        const amountToCreditPence = Math.max(0, escrow.contractAmount);

        // 2. Credit freelancer's PENDING balance, but only if we haven't already created the pending wallet transaction.
        const existingPendingTxn = await db.select().from(walletTransactions).where(and(
          eq(walletTransactions.contractId, releaseContractId),
          eq(walletTransactions.userId, escrow.freelancerId),
          eq(walletTransactions.status, "pending"),
          eq(walletTransactions.type, "credit"),
        )).limit(1);

        if (existingPendingTxn.length === 0) {
          const [wallet] = await db.select().from(freelancerWallets)
            .where(eq(freelancerWallets.userId, escrow.freelancerId));

          if (wallet) {
            await db.update(freelancerWallets)
              .set({
                pendingBalance: wallet.pendingBalance + amountToCreditPence,
                totalEarned: wallet.totalEarned + amountToCreditPence,
                updatedAt: now,
              })
              .where(eq(freelancerWallets.userId, escrow.freelancerId));
          } else {
            await db.insert(freelancerWallets).values({
              userId: escrow.freelancerId,
              availableBalance: 0,
              pendingBalance: amountToCreditPence,
              totalEarned: amountToCreditPence,
              totalWithdrawn: 0,
              updatedAt: now,
            });
          }

          await db.insert(walletTransactions).values({
            userId: escrow.freelancerId,
            type: "credit",
            amount: escrow.contractAmount,
            fee: escrow.platformFee,
            netAmount: amountToCreditPence,
            contractId: releaseContractId,
            description: `Payment for contract — pending Stripe settlement`,
            status: "pending",
            createdAt: now,
          });
        }

        // 4. Direct notification fallback: insert a notification for the freelancer even if the frontend chat message fails
        try {
          await db.insert(notifications).values({
            userId: escrow.freelancerId,
            type: "contract_response",
            title: "Payment Released!",
            message: `${session.user.name || "Client"} has released the payment from escrow for your contract. Funds will be available once settlement completes.`,
            actionUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.hiremindx.com"}/community`,
            isRead: false,
            createdAt: now,
          });
          console.log("[escrow/release] direct notification created for freelancer:", escrow.freelancerId);
        } catch (notifErr) {
          console.error("[escrow/release] failed to create direct notification:", notifErr);
        }

        // 5. Email fallback: notify freelancer by email
        try {
          const [freelancerUser] = await db.select({ email: user.email }).from(user).where(eq(user.id, escrow.freelancerId)).limit(1);
          const freelancerEmail = freelancerUser?.email;
          const isDemo = !freelancerEmail || freelancerEmail.includes("demo") || freelancerEmail.includes("@hiremindx.demo");
          if (freelancerEmail && !isDemo) {
            const emailResult = await sendHireMindXEmailNotification({
              to: freelancerEmail,
              recipientName: session.user.name || "Client",
              subject: "Payment Released — HireMindX",
              title: "Payment Released!",
              summary: `${session.user.name || "Client"} has released the payment from escrow for your contract. Funds will be available for withdrawal once Stripe settlement completes (up to 7 days).`,
              ctaLabel: "View Contract",
              ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.hiremindx.com"}/community`,
            });
            console.log("[escrow/release] email result:", { success: emailResult.success, skipped: emailResult.skipped, error: emailResult.error || null });
          } else {
            console.log("[escrow/release] skipped email — no email or demo user:", { freelancerEmail, isDemo });
          }
        } catch (emailErr) {
          console.error("[escrow/release] failed to send email notification:", emailErr);
        }

        return NextResponse.json({
          success: true,
          message: "Funds released to freelancer's pending balance. Settlement tracking started.",
        });
      }

      case "check_settlement": {
        // Check if escrow funds have settled in Stripe, move from pending to available
        const { contractId: checkContractId } = body;
        if (!checkContractId) {
          return NextResponse.json({ error: "Missing contractId" }, { status: 400 });
        }

        const [escrow] = await db.select().from(escrowTransactions)
          .where(eq(escrowTransactions.contractId, checkContractId));

        if (!escrow) {
          return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
        }

        if (escrow.status !== "released" || escrow.settlementStatus === "available") {
          return NextResponse.json({
            status: escrow.settlementStatus || "unknown",
            available: escrow.settlementStatus === "available",
          });
        }

        const stripe = getStripeClient();
        const now = new Date().toISOString();

        // Check if the charge has actually settled (funds available in Stripe account)
        // charge.status === "succeeded" just means the charge was captured, NOT that funds have settled.
        // We need to check the balance_transaction.status to know if funds are actually available.
        let isSettled = false;
        try {
          if (escrow.stripeChargeId) {
            const charge = await stripe.charges.retrieve(escrow.stripeChargeId);
            if (charge.balance_transaction) {
              const bt = await stripe.balanceTransactions.retrieve(typeof charge.balance_transaction === 'string' ? charge.balance_transaction : charge.balance_transaction.id);
              isSettled = bt.status === "available";
            } else {
              isSettled = false;
            }
          } else if (escrow.stripePaymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(escrow.stripePaymentIntentId);
            const chargeId = pi.latest_charge as string | null;
            if (chargeId) {
              const charge = await stripe.charges.retrieve(chargeId);
              if (charge.balance_transaction) {
                const bt = await stripe.balanceTransactions.retrieve(typeof charge.balance_transaction === 'string' ? charge.balance_transaction : charge.balance_transaction.id);
                isSettled = bt.status === "available";
              } else {
                isSettled = false;
              }
            } else {
              isSettled = false;
            }
          }
        } catch (stripeErr: any) {
          console.error("[escrow/check_settlement] Stripe check failed:", stripeErr);
          return NextResponse.json({
            status: "pending",
            available: false,
            error: "Could not verify settlement status",
          });
        }

        if (!isSettled) {
          return NextResponse.json({
            status: "pending",
            available: false,
            message: "Funds are still pending settlement in Stripe.",
          });
        }

        // Per workflow: freelancer moves the FULL contract amount from pending -> available.
        // Platform fee is not taken from freelancer balances.
        const amountToMakeAvailablePence = Math.max(0, escrow.contractAmount);

        const [wallet] = await db.select().from(freelancerWallets)
          .where(eq(freelancerWallets.userId, escrow.freelancerId));

        if (wallet && wallet.pendingBalance >= amountToMakeAvailablePence) {
          await db.update(freelancerWallets)
            .set({
              pendingBalance: wallet.pendingBalance - amountToMakeAvailablePence,
              availableBalance: wallet.availableBalance + amountToMakeAvailablePence,
              updatedAt: now,
            })
            .where(eq(freelancerWallets.userId, escrow.freelancerId));
        }

        // Update escrow settlement status
        await db.update(escrowTransactions)
          .set({
            settlementStatus: "available",
            settledAt: now,
            status: "completed",
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(escrowTransactions.id, escrow.id));

        // Update wallet transaction status
        await db.update(walletTransactions)
          .set({ status: "completed" })
          .where(and(
            eq(walletTransactions.contractId, checkContractId),
            eq(walletTransactions.userId, escrow.freelancerId),
            eq(walletTransactions.status, "pending"),
          ));

        // Notify freelancer
        await db.insert(notifications).values({
          userId: escrow.freelancerId,
          type: "funds_available",
          title: "Funds Available for Withdrawal!",
          message: `£${(amountToMakeAvailablePence / 100).toFixed(2)} from contract ${checkContractId} is now available in your balance. You can withdraw it anytime.`,
          isRead: false,
          createdAt: now,
        });

        return NextResponse.json({
          success: true,
          status: "available",
          available: true,
          message: "Funds are now available for withdrawal.",
        });
      }

      case "cancel": {
        const { contractId: cancelContractId } = body;
        if (!cancelContractId) {
          return NextResponse.json({ error: "Missing contractId" }, { status: 400 });
        }

        const now = new Date().toISOString();

        // Find any escrow record for this contract
        const [escrow] = await db.select().from(escrowTransactions)
          .where(eq(escrowTransactions.contractId, cancelContractId))
          .orderBy(desc(escrowTransactions.createdAt))
          .limit(1);

        // If escrow exists and is already released/completed, cannot cancel
        if (escrow && ["released", "completed"].includes(escrow.status || "")) {
          return NextResponse.json(
            { error: "Cannot cancel a contract that has already been released or completed" },
            { status: 400 }
          );
        }

        // Determine user type
        let isClient = escrow ? escrow.clientId === session.user.id : false;
        let isFreelancer = escrow ? escrow.freelancerId === session.user.id : false;

        // If no escrow record, check contract messages to verify the user is a party to this contract
        if (!escrow) {
          const contractMessages = await db.select().from(communityDMs)
            .where(or(
              like(communityDMs.message, `[CONTRACT_OFFER_JSON]%${cancelContractId}%`),
              like(communityDMs.message, `[CONTRACT_RESPONSE]%${cancelContractId}%`),
              like(communityDMs.message, `[CONTRACT_CANCEL]%${cancelContractId}%`)
            ))
            .limit(1);

          if (contractMessages.length > 0) {
            const msg = contractMessages[0];
            isClient = msg.senderId === session.user.id || msg.receiverId === session.user.id;
            isFreelancer = msg.senderId === session.user.id || msg.receiverId === session.user.id;
          }

          if (!isClient && !isFreelancer) {
            return NextResponse.json({ error: "Not authorized to cancel this contract" }, { status: 403 });
          }
        }

        if (!isClient && !isFreelancer) {
          return NextResponse.json({ error: "Not authorized" }, { status: 403 });
        }

        const userType = isClient ? "client" : "freelancer";
        let withinGracePeriod = true;
        let penaltyApplied = "none";
        let isBanned = false;

        // If escrow was funded, we need to refund and apply grace period penalties
        if (escrow && escrow.status === "escrow_funded" && escrow.stripePaymentIntentId) {
          const stripe = getStripeClient();

          // Refund the PaymentIntent
          try {
            await stripe.refunds.create({
              payment_intent: escrow.stripePaymentIntentId,
              metadata: { contractId: cancelContractId, reason: "contract_cancelled" },
            });
          } catch (refundErr: any) {
            console.error("[escrow/cancel] Refund failed:", refundErr);
            return NextResponse.json(
              { error: "Failed to process refund. Please contact support." },
              { status: 500 }
            );
          }

          // Grace period check from funding time
          const fundedAt = new Date(escrow.fundedAt || escrow.createdAt).getTime();
          const timeSinceFunded = Date.now() - fundedAt;
          withinGracePeriod = timeSinceFunded < GRACE_PERIOD_MS;

          // Count prior late cancellations
          const priorCancellations = await db.select().from(cancellationRecords)
            .where(and(
              eq(cancellationRecords.userId, session.user.id),
              eq(cancellationRecords.wasWithinGracePeriod, false),
            ));
          const priorLateCount = priorCancellations.length;

          if (!withinGracePeriod) {
            if (isClient) {
              if (priorLateCount === 0) {
                penaltyApplied = "platform_fee";
              } else {
                penaltyApplied = "double_fee";
                isBanned = true;
              }
            } else {
              if (priorLateCount === 0) {
                penaltyApplied = "platform_fee_next";
              } else {
                penaltyApplied = "ban";
                isBanned = true;
              }
            }
          }
        }

        // Record cancellation
        await db.insert(cancellationRecords).values({
          userId: session.user.id,
          userType,
          contractId: cancelContractId,
          cancelledAt: now,
          wasWithinGracePeriod: withinGracePeriod,
          penaltyApplied,
          isBanned,
          createdAt: now,
        });

        // Update or create escrow status as cancelled
        if (escrow) {
          await db.update(escrowTransactions)
            .set({
              status: "cancelled",
              cancelledAt: now,
              updatedAt: now,
            })
            .where(eq(escrowTransactions.id, escrow.id));
        }

        // Notification handled by chat message system (frontend sends [CONTRACT_CANCEL] message
        // which triggers notification creation via the messages API). No duplicate notification here.

        return NextResponse.json({
          success: true,
          withinGracePeriod,
          penaltyApplied,
          isBanned,
          refunded: escrow && escrow.status === "escrow_funded",
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Escrow API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
