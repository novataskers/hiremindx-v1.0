import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userUsageLimits, subscriptions } from '@/db/schema';
import { isActiveSubscriptionStatus, getBillingPlan, syncPendingSubscription, isBillingPlanId, getPlanFeatureLimit, BillingPlanId } from '@/lib/billing';

// ── Per-feature configuration ──────────────────────────────────────────────
// Each feature maps to its own DB column so limits are tracked independently.
// `tsKey` is the TypeScript property name on the Drizzle schema — used to
// read values from select() results and to build typed update objects.
// `resetTsKey` is the same for the reset_at column (24h features only).

type FeatureConfig = {
  limit: number;
  isLifetime: boolean;
  tsKey: keyof typeof userUsageLimits.$inferSelect;  // e.g. 'deepResearchCount'
  resetTsKey?: keyof typeof userUsageLimits.$inferSelect;  // e.g. 'attachmentResetAt'
};

const FEATURE_CONFIG: Record<string, FeatureConfig> = {
  // ── Assist features — limit 2 each, lifetime, no reset ──
  deep_research:     { limit: 2, isLifetime: true,  tsKey: 'deepResearchCount' },
  market_analysis:   { limit: 2, isLifetime: true,  tsKey: 'marketAnalysisCount' },
  ai_prediction:     { limit: 2, isLifetime: true,  tsKey: 'aiPredictionCount' },
  live_coding:       { limit: 2, isLifetime: true,  tsKey: 'canvasCodingCount' },

  // ── Outreach features — limit 2 each, lifetime ──
  email_outreach:    { limit: 2, isLifetime: true,  tsKey: 'emailOutreachCount' },
  exam_questions:    { limit: 2, isLifetime: true,  tsKey: 'examQuestionsCount' },

  // ── HireMindX Match (Bulk CV + Interview Questions share 1 quota) ──
  bulk_cv_analysis:     { limit: 1, isLifetime: true, tsKey: 'matchCount' },
  interview_questions:  { limit: 1, isLifetime: true, tsKey: 'matchCount' },

  // ── Community AI Agent — limit 1, lifetime ──
  community_ai_agent: { limit: 1, isLifetime: true,  tsKey: 'communityAiCount' },

  // ── Premium-only community features — limit 0, always blocked for free ──
  community_messaging: { limit: 0, isLifetime: true, tsKey: null as any },
  community_contract: { limit: 0, isLifetime: true, tsKey: null as any },

  // ── Community job post — limit 1 for free users ──
  community_post:     { limit: 1, isLifetime: true, tsKey: 'communityPostCount' },

  // ── 24h reset features ──
  file_uploads:   { limit: 3,  isLifetime: false, tsKey: 'attachmentCount',   resetTsKey: 'attachmentResetAt' },
  chat_messages:   { limit: 30, isLifetime: false, tsKey: 'chatMessageCount',  resetTsKey: 'chatMessageResetAt' },
};

export type UsageResult = {
  allowed: boolean;
  upgradeMessage: string;
  currentUsage: number;
  limit: number;
  remaining: number;
  plan: string;
  resetAt: string | null;   // ISO date when 24h limit resets, null for lifetime
  isLifetime: boolean;
};

/** Build a Drizzle-compatible update object using plain TS property name keys */
function buildUpdate(tsKey: string, newCount: number, resetTsKey: string | undefined, newResetAt: string | null, updatedAt: string): Record<string, any> {
  // Drizzle's .set() accepts plain objects with TS property names as keys
  // e.g. { deepResearchCount: 5 } — NOT { [userUsageLimits.deepResearchCount]: 5 }
  const update: Record<string, any> = { updatedAt };
  update[tsKey] = newCount;
  if (resetTsKey) {
    update[resetTsKey] = newResetAt;
  }
  return update;
}

export async function useFeature(userId: string, feature: string, increment: number = 1): Promise<UsageResult> {
  const config = FEATURE_CONFIG[feature];

  // Fail closed: unknown feature
  if (!config) {
    return {
      allowed: false,
      upgradeMessage: "We couldn't verify this action. Please try again in a moment.",
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      plan: "Free",
      resetAt: null,
      isLifetime: true,
    };
  }

  const { limit, isLifetime, tsKey, resetTsKey } = config;

  const resultTemplate: UsageResult = {
    allowed: true,
    upgradeMessage: "",
    currentUsage: 0,
    limit: limit,
    remaining: limit,
    plan: "Free",
    resetAt: null,
    isLifetime,
  };

  try {
    const subscriptionRows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    let subscription = subscriptionRows[0];

    // Proactively sync pending subscriptions with Stripe
    if (subscription && subscription.status === "pending" && subscription.stripeCheckoutSessionId) {
      const result = await syncPendingSubscription(userId, subscription);
      if (result.activated) {
        const updatedRows = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .limit(1);
        subscription = updatedRows[0];
      }
    }

    const planId: BillingPlanId | null =
      subscription && isActiveSubscriptionStatus(subscription.status) && isBillingPlanId(subscription.planId)
        ? subscription.planId
        : null;

    const planInfo = planId ? getBillingPlan(planId) : null;
    const planName = planInfo?.name || "Free";

    // Determine effective limit: plan-specific > free config
    let effectiveLimit = limit;
    if (planId) {
      effectiveLimit = getPlanFeatureLimit(planId, feature);
    }

    // Feature blocked on this plan (or free user on a premium-only feature)
    if (effectiveLimit === 0) {
      const msg = planId
        ? `This feature is not included in your ${planName} plan. Upgrade to unlock it.`
        : "This feature is only available on Premium plans. Upgrade to unlock it.";
      return {
        allowed: false,
        upgradeMessage: msg,
        currentUsage: 0,
        limit: 0,
        remaining: 0,
        plan: planName,
        resetAt: null,
        isLifetime: true,
      };
    }

    // Unlimited on this plan — skip DB tracking
    if (effectiveLimit === Infinity) {
      return {
        ...resultTemplate,
        plan: planName,
        limit: Infinity,
        remaining: Infinity,
      };
    }

    const now = new Date();

    let usageRowRows = await db
      .select()
      .from(userUsageLimits)
      .where(eq(userUsageLimits.userId, userId))
      .limit(1);

    let usageRow: any = usageRowRows[0];

    if (!usageRow) {
      await db.insert(userUsageLimits).values({
        userId,
        updatedAt: now.toISOString()
      });

      usageRowRows = await db
        .select()
        .from(userUsageLimits)
        .where(eq(userUsageLimits.userId, userId))
        .limit(1);

      usageRow = usageRowRows[0];
    }

    // Read current count using the TS property name
    // Drizzle select() returns objects keyed by TS property names (e.g. deepResearchCount)
    let count: number = usageRow[tsKey] ?? 0;
    let resetAtStr: string | null = null;
    if (resetTsKey) {
      resetAtStr = usageRow[resetTsKey] ?? null;
    }

    let resetAt = resetAtStr ? new Date(resetAtStr) : null;
    let isReset = false;

    // Apply 24h reset for non-lifetime features
    if (!isLifetime && resetAt && now > resetAt) {
      isReset = true;
    }

    const effectiveCount = isReset ? 0 : count;
    const remaining = Math.max(0, effectiveLimit - effectiveCount);
    const allowed = remaining >= increment;

    if (!allowed) {
      const resetMessage = isLifetime
        ? "Upgrade to a higher plan to get more access."
        : "Upgrade to a higher plan to get more access, or wait for your limit to reset.";

      return {
        allowed: false,
        upgradeMessage: `You've reached your limit for this feature. ${resetMessage}`,
        currentUsage: effectiveCount,
        limit: effectiveLimit,
        remaining: 0,
        plan: planName,
        resetAt: isLifetime ? null : (resetAt ? resetAt.toISOString() : null),
        isLifetime,
      };
    }

    // If increment is 0, just check the limit without updating the DB
    if (increment === 0) {
      return {
        allowed: true,
        upgradeMessage: "",
        currentUsage: effectiveCount,
        limit: effectiveLimit,
        remaining,
        plan: planName,
        resetAt: isLifetime ? null : (resetAt ? resetAt.toISOString() : null),
        isLifetime,
      };
    }

    const newCount = effectiveCount + increment;
    let newResetAtStr = resetAtStr;

    if (!isLifetime) {
      if (effectiveCount === 0 || !resetAt || isReset) {
        newResetAtStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      }
    }

    // Build and execute the update with proper Drizzle column references
    const updateData = buildUpdate(tsKey as string, newCount, resetTsKey as string | undefined, newResetAtStr, now.toISOString());

    await db
      .update(userUsageLimits)
      .set(updateData as any)
      .where(eq(userUsageLimits.userId, userId));

    return {
      allowed: true,
      upgradeMessage: "",
      currentUsage: newCount,
      limit: effectiveLimit,
      remaining: effectiveLimit - newCount,
      plan: planName,
      resetAt: isLifetime ? null : (newResetAtStr ?? resetAtStr),
      isLifetime,
    };
  } catch (error: any) {
    console.error(`[useFeature] ERROR for feature="${feature}" userId="${userId}":`, error?.message || error);
    console.error(`[useFeature] Full error:`, error);
    console.error(`[useFeature] Config: limit=${limit} isLifetime=${isLifetime} tsKey="${tsKey}" resetTsKey="${resetTsKey}"`);
    // Fail CLOSED — if we can't verify limits, block the action
    return {
      allowed: false,
      upgradeMessage: "We couldn't verify your usage limits. Please try again.",
      currentUsage: 0,
      limit,
      remaining: 0,
      plan: "Free",
      resetAt: null,
      isLifetime: true,
    };
  }
}

export async function getUsageSummary(userId: string) {
  try {
    const subscriptionRows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    const subscription = subscriptionRows[0];
    const isPremium = subscription && isActiveSubscriptionStatus(subscription.status) && !subscription.cancelAtPeriodEnd;
    const planId: BillingPlanId | null = isPremium && subscription && isBillingPlanId(subscription.planId) ? subscription.planId : null;
    const planName = planId ? (getBillingPlan(planId)?.name || "Premium") : "Free";

    let usageRowRows = await db
      .select()
      .from(userUsageLimits)
      .where(eq(userUsageLimits.userId, userId))
      .limit(1);

    let usageRow = usageRowRows[0];
    const now = new Date();

    const getFeatureData = (feature: string, count: number, resetAtStr: string | null) => {
      const config = FEATURE_CONFIG[feature];
      if (!config) return { count: 0, limit: 0, remaining: 0, resetAt: null, isLifetime: true };

      const resetAt = resetAtStr ? new Date(resetAtStr) : null;
      let effectiveCount = count;
      if (!config.isLifetime && resetAt && now > resetAt) {
        effectiveCount = 0;
      }

      // Determine effective limit based on plan
      let effectiveLimit = config.limit;
      if (planId) {
        effectiveLimit = getPlanFeatureLimit(planId, feature);
      }

      const isBlocked = effectiveLimit === 0;
      const isUnlimited = effectiveLimit === Infinity;

      return {
        count: isUnlimited ? 0 : effectiveCount,
        limit: effectiveLimit,
        remaining: isUnlimited ? Infinity : Math.max(0, effectiveLimit - effectiveCount),
        resetAt: config.isLifetime ? null : resetAt,
        isLifetime: config.isLifetime,
      };
    };

    if (!usageRow) {
      return {
        plan: planName,
        deepResearch: getFeatureData('deep_research', 0, null),
        marketAnalysis: getFeatureData('market_analysis', 0, null),
        aiPrediction: getFeatureData('ai_prediction', 0, null),
        canvasCoding: getFeatureData('live_coding', 0, null),
        emailOutreach: getFeatureData('email_outreach', 0, null),
        examQuestions: getFeatureData('exam_questions', 0, null),
        match: getFeatureData('bulk_cv_analysis', 0, null),
        communityAi: getFeatureData('community_ai_agent', 0, null),
        communityPost: getFeatureData('community_post', 0, null),
        attachment: getFeatureData('file_uploads', 0, null),
        chat: getFeatureData('chat_messages', 0, null),
      };
    }

    return {
      plan: planName,
      deepResearch: getFeatureData('deep_research', usageRow.deepResearchCount, null),
      marketAnalysis: getFeatureData('market_analysis', usageRow.marketAnalysisCount, null),
      aiPrediction: getFeatureData('ai_prediction', usageRow.aiPredictionCount, null),
      canvasCoding: getFeatureData('live_coding', usageRow.canvasCodingCount, null),
      emailOutreach: getFeatureData('email_outreach', usageRow.emailOutreachCount, null),
      examQuestions: getFeatureData('exam_questions', usageRow.examQuestionsCount, null),
      match: getFeatureData('bulk_cv_analysis', usageRow.matchCount, null),
      communityAi: getFeatureData('community_ai_agent', usageRow.communityAiCount, null),
      communityPost: getFeatureData('community_post', usageRow.communityPostCount, null),
      attachment: getFeatureData('file_uploads', usageRow.attachmentCount, usageRow.attachmentResetAt),
      chat: getFeatureData('chat_messages', usageRow.chatMessageCount, usageRow.chatMessageResetAt),
    };
  } catch (error) {
    console.error("Error in getUsageSummary:", error);
    return { plan: "Free", error: "Failed to load usage summary" };
  }
}
