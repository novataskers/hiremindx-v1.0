import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { freelancerWallets, walletTransactions, notifications, escrowTransactions } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";

function buildAuthHeaders(req: NextRequest) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const authz = req.headers.get("authorization");
  if (authz) h.set("authorization", authz);
  return h;
}

// GET — fetch wallet balance and transaction history
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get or create wallet
    let [wallet] = await db
      .select()
      .from(freelancerWallets)
      .where(eq(freelancerWallets.userId, session.user.id));

    if (!wallet) {
      [wallet] = await db
        .insert(freelancerWallets)
        .values({
          userId: session.user.id,
          availableBalance: 0,
          pendingBalance: 0,
          totalEarned: 0,
          totalWithdrawn: 0,
          updatedAt: new Date().toISOString(),
        })
        .returning();
    }

    // Auto-check settlement: find released escrows that haven't settled yet
    try {
      const releasedEscrows = await db
        .select()
        .from(escrowTransactions)
        .where(
          and(
            eq(escrowTransactions.freelancerId, session.user.id),
            eq(escrowTransactions.status, "released"),
          ),
        );

      const stripe = getStripeClient();
      const now = new Date().toISOString();
      let settledCount = 0;

      for (const escrow of releasedEscrows) {
        if (escrow.settlementStatus === "available") continue;

        let isSettled = false;
        try {
          if (escrow.stripeChargeId) {
            const charge = await stripe.charges.retrieve(escrow.stripeChargeId);
            if (charge.balance_transaction) {
              const bt = await stripe.balanceTransactions.retrieve(
                typeof charge.balance_transaction === "string"
                  ? charge.balance_transaction
                  : charge.balance_transaction.id,
              );
              isSettled = bt.status === "available";
            }
          } else if (escrow.stripePaymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(escrow.stripePaymentIntentId);
            const chargeId = pi.latest_charge as string | null;
            if (chargeId) {
              const charge = await stripe.charges.retrieve(chargeId);
              if (charge.balance_transaction) {
                const bt = await stripe.balanceTransactions.retrieve(
                  typeof charge.balance_transaction === "string"
                    ? charge.balance_transaction
                    : charge.balance_transaction.id,
                );
                isSettled = bt.status === "available";
              }
            }
          }
        } catch {
          continue; // Skip this one, try next time
        }

        if (!isSettled) continue;

        // Move funds from pending to available using net amount (contractAmount - platformFee)
        const [currentWallet] = await db
          .select()
          .from(freelancerWallets)
          .where(eq(freelancerWallets.userId, session.user.id));

        const netAmount = Math.max(0, escrow.contractAmount - escrow.platformFee);

        if (currentWallet && currentWallet.pendingBalance >= netAmount) {
          await db
            .update(freelancerWallets)
            .set({
              pendingBalance: currentWallet.pendingBalance - netAmount,
              availableBalance: currentWallet.availableBalance + netAmount,
              updatedAt: now,
            })
            .where(eq(freelancerWallets.userId, session.user.id));

          // Update escrow settlement status
          await db
            .update(escrowTransactions)
            .set({
              settlementStatus: "available",
              settledAt: now,
              status: "completed",
              completedAt: now,
              updatedAt: now,
            })
            .where(eq(escrowTransactions.id, escrow.id));

          // Update wallet transaction status
          await db
            .update(walletTransactions)
            .set({ status: "completed" })
            .where(
              and(
                eq(walletTransactions.contractId, escrow.contractId),
                eq(walletTransactions.userId, session.user.id),
                eq(walletTransactions.status, "pending"),
              ),
            );

          settledCount++;
        }
      }

      if (settledCount > 0) {
        const [updatedWallet] = await db
          .select()
          .from(freelancerWallets)
          .where(eq(freelancerWallets.userId, session.user.id));

        if (updatedWallet) wallet = updatedWallet;

        await db.insert(notifications).values({
          userId: session.user.id,
          type: "funds_available",
          title: "Funds Now Available",
          message: `${settledCount} payment${settledCount > 1 ? "s" : ""} settled and now available for withdrawal.`,
          isRead: false,
          createdAt: now,
        });
      }
    } catch (settlementErr) {
      console.error("[wallet/GET] Settlement check failed (non-fatal):", settlementErr);
    }

    // Get transaction history
    const transactions = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, session.user.id))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(50);

    return NextResponse.json({
      wallet: {
        availableBalance: wallet.availableBalance,
        pendingBalance: wallet.pendingBalance,
        totalEarned: wallet.totalEarned,
        totalWithdrawn: wallet.totalWithdrawn,
      },
      transactions,
    });
  } catch (error) {
    console.error("Error fetching wallet:", error);
    return NextResponse.json({ error: "Failed to fetch wallet data" }, { status: 500 });
  }
}

// POST — withdraw funds from freelancer's available balance
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { amount, withdrawalMethod } = body;

    if (!amount) {
      return NextResponse.json({ error: "Missing amount" }, { status: 400 });
    }

    const amountPence = Math.round(Number(amount) * 100);
    if (amountPence <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Verify wallet balance
    const [wallet] = await db
      .select()
      .from(freelancerWallets)
      .where(eq(freelancerWallets.userId, session.user.id));

    if (!wallet || wallet.availableBalance < amountPence) {
      return NextResponse.json({ error: "Insufficient available balance" }, { status: 400 });
    }

    // Process withdrawal via Stripe Payout from platform account
    let payout: any = null;
    let payoutMethod: "instant" | "standard" = "standard";

    try {
      const stripe = getStripeClient();

      try {
        payout = await stripe.payouts.create({
          amount: amountPence,
          currency: "gbp",
          method: "instant",
          metadata: { userId: session.user.id, type: "freelancer_withdrawal" },
        });
        payoutMethod = "instant";
      } catch (instantErr: any) {
        console.warn("[wallet/withdraw] Instant payout failed, trying standard:", instantErr.message);
        payout = await stripe.payouts.create({
          amount: amountPence,
          currency: "gbp",
          method: "standard",
          metadata: { userId: session.user.id, type: "freelancer_withdrawal" },
        });
        payoutMethod = "standard";
      }
    } catch (stripeErr: any) {
      console.error("[wallet/withdraw] Stripe error:", stripeErr);
      return NextResponse.json(
        { error: "Payment processing is temporarily unavailable. Please try again later." },
        { status: 400 },
      );
    }

    // Deduct from wallet
    await db
      .update(freelancerWallets)
      .set({
        availableBalance: wallet.availableBalance - amountPence,
        totalWithdrawn: wallet.totalWithdrawn + amountPence,
        updatedAt: now,
      })
      .where(eq(freelancerWallets.userId, session.user.id));

    // Record withdrawal transaction
    const [transaction] = await db
      .insert(walletTransactions)
      .values({
        userId: session.user.id,
        type: "withdrawal",
        amount: amountPence,
        fee: 0,
        netAmount: amountPence,
        stripePayoutId: payout?.id || null,
        description: payoutMethod === "instant" ? "Instant withdrawal to debit card" : "Withdrawal to bank account",
        withdrawalMethod: withdrawalMethod || "card",
        status: payout?.status === "paid" ? "completed" : "pending",
        createdAt: now,
      })
      .returning();

    // Notify
    const arrivalText =
      payoutMethod === "instant" ? "It should arrive within minutes." : "It typically takes 2-7 business days to arrive.";

    await db.insert(notifications).values({
      userId: session.user.id,
      type: "withdrawal_completed",
      title: "Withdrawal Initiated",
      message: `Your withdrawal of £${(amountPence / 100).toFixed(2)} has been initiated. ${arrivalText}`,
      isRead: false,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      transaction,
      payoutId: payout?.id || null,
      payoutMethod,
    });
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    return NextResponse.json({ error: "Failed to process withdrawal" }, { status: 500 });
  }
}
