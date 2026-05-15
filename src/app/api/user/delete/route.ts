import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  user,
  session as sessionTable,
  account,
  verification,
  resumes,
  applications,
  jobSearches,
  cvAnalysis,
  leads,
  emailCampaigns,
  chatSessions,
  chatMessages,
  conversationParticipants,
  communityMessages,
  invitations,
  hiremindState,
  communityProfiles,
  hiringPositions,
  candidateCVs,
  cvAnalysisResults,
  examQuestionSessions,
  freelancerPortfolio,
  freelancerOffers,
  clientProjects,
  proposals,
  communityDMs,
  interviewQuestionSessions,
  researchSessions,
  predictions,
  notifications,
  subscriptions,
  userUsageLimits,
  canvasProjects,
  escrowTransactions,
  paymentMethods,
  freelancerWallets,
  walletTransactions,
  cancellationRecords,
} from "@/db/schema";
import { eq, inArray, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { getStripeClient } from "@/lib/stripe";
import { isActiveSubscriptionStatus } from "@/lib/billing";

export async function DELETE(request: NextRequest) {
  try {
    const hdrs = await headers();

    // Try better-auth session first
    let userId: string | null = null;
    const session = await auth.api.getSession({ headers: hdrs });
    if (session?.user?.id) {
      userId = session.user.id;
    }

    // Fall back to devSession cookie
    if (!userId) {
      const cookieStore = await cookies();
      const devSessionCookie = cookieStore.get("devSession");
      if (devSessionCookie) {
        try {
          const devSession = JSON.parse(decodeURIComponent(devSessionCookie.value));
          if (devSession?.user?.id) {
            userId = devSession.user.id;
          }
        } catch {}
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // ── Cancel Stripe subscription first ──
    try {
      const subRows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const sub = subRows[0] ?? null;
      if (sub?.stripeSubscriptionId && isActiveSubscriptionStatus(sub.status)) {
        const stripe = getStripeClient();
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId).catch(() => {});
      }
    } catch {
      // Stripe may not be configured (e.g. dev env) — continue deletion regardless
    }

    // ── Delete chat messages (depends on chatSessions) ──
    const userChatSessions = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId));
    const sessionIds = userChatSessions.map((s) => s.id);
    if (sessionIds.length > 0) {
      await db.delete(chatMessages).where(inArray(chatMessages.sessionId, sessionIds)).catch(() => {});
    }

    // ── Delete community messages and conversation participation ──
    await db.delete(communityMessages).where(eq(communityMessages.senderId, userId)).catch(() => {});
    await db.delete(conversationParticipants).where(eq(conversationParticipants.userId, userId)).catch(() => {});

    // ── Delete community DMs (sent or received) ──
    await db.delete(communityDMs).where(or(eq(communityDMs.senderId, userId), eq(communityDMs.receiverId, userId))).catch(() => {});

    // ── Delete CV analysis results and candidate CVs via hiring positions ──
    const userPositions = await db
      .select({ id: hiringPositions.id })
      .from(hiringPositions)
      .where(eq(hiringPositions.userId, userId));
    const positionIds = userPositions.map((p) => p.id);
    if (positionIds.length > 0) {
      const positionCVs = await db
        .select({ id: candidateCVs.id })
        .from(candidateCVs)
        .where(inArray(candidateCVs.positionId, positionIds));
      const cvIds = positionCVs.map((c) => c.id);
      if (cvIds.length > 0) {
        await db.delete(cvAnalysisResults).where(inArray(cvAnalysisResults.cvId, cvIds)).catch(() => {});
      }
      await db.delete(candidateCVs).where(inArray(candidateCVs.positionId, positionIds)).catch(() => {});
    }

    // ── Delete proposals by user ──
    await db.delete(proposals).where(eq(proposals.userId, userId)).catch(() => {});

    // ── Delete escrow transactions (user is client OR freelancer) ──
    await db.delete(escrowTransactions).where(or(eq(escrowTransactions.clientId, userId), eq(escrowTransactions.freelancerId, userId))).catch(() => {});

    // ── Delete all user-owned data (each wrapped in catch for missing tables) ──
    await db.delete(chatSessions).where(eq(chatSessions.userId, userId)).catch(() => {});
    await db.delete(interviewQuestionSessions).where(eq(interviewQuestionSessions.userId, userId)).catch(() => {});
    await db.delete(examQuestionSessions).where(eq(examQuestionSessions.userId, userId)).catch(() => {});
    await db.delete(researchSessions).where(eq(researchSessions.userId, userId)).catch(() => {});
    await db.delete(predictions).where(eq(predictions.userId, userId)).catch(() => {});
    await db.delete(canvasProjects).where(eq(canvasProjects.userId, userId)).catch(() => {});
    await db.delete(freelancerPortfolio).where(eq(freelancerPortfolio.userId, userId)).catch(() => {});
    await db.delete(freelancerOffers).where(eq(freelancerOffers.userId, userId)).catch(() => {});
    await db.delete(clientProjects).where(eq(clientProjects.userId, userId)).catch(() => {});
    await db.delete(hiringPositions).where(eq(hiringPositions.userId, userId)).catch(() => {});
    await db.delete(communityProfiles).where(eq(communityProfiles.userId, userId)).catch(() => {});
    await db.delete(hiremindState).where(eq(hiremindState.userId, userId)).catch(() => {});
    await db.delete(invitations).where(eq(invitations.inviterId, userId)).catch(() => {});
    await db.delete(notifications).where(eq(notifications.userId, userId)).catch(() => {});
    await db.delete(userUsageLimits).where(eq(userUsageLimits.userId, userId)).catch(() => {});
    await db.delete(walletTransactions).where(eq(walletTransactions.userId, userId)).catch(() => {});
    await db.delete(freelancerWallets).where(eq(freelancerWallets.userId, userId)).catch(() => {});
    await db.delete(paymentMethods).where(eq(paymentMethods.userId, userId)).catch(() => {});
    await db.delete(cancellationRecords).where(eq(cancellationRecords.userId, userId)).catch(() => {});
    await db.delete(subscriptions).where(eq(subscriptions.userId, userId)).catch(() => {});
    await db.delete(emailCampaigns).where(eq(emailCampaigns.userId, userId)).catch(() => {});
    await db.delete(leads).where(eq(leads.userId, userId)).catch(() => {});
    await db.delete(cvAnalysis).where(eq(cvAnalysis.userId, userId)).catch(() => {});
    await db.delete(jobSearches).where(eq(jobSearches.userId, userId)).catch(() => {});
    await db.delete(applications).where(eq(applications.userId, userId)).catch(() => {});
    await db.delete(resumes).where(eq(resumes.userId, userId)).catch(() => {});
    await db.delete(verification).where(eq(verification.identifier, userId)).catch(() => {});
    await db.delete(sessionTable).where(eq(sessionTable.userId, userId)).catch(() => {});
    await db.delete(account).where(eq(account.userId, userId)).catch(() => {});
    await db.delete(user).where(eq(user.id, userId)).catch(() => {});

    return NextResponse.json(
      { message: "Account deleted successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: `Failed to delete account. Please try again.` },
      { status: 500 }
    );
  }
}
