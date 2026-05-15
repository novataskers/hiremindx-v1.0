"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { Check, Crown, Zap, Rocket, Star, Shield, AlertTriangle, XCircle, ArrowUpRight, ArrowDownRight, CreditCard, Wallet, CircleDollarSign, RefreshCw, Loader2 } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { HeroBackground } from "@/components/HeroBackground";
import { motion } from "framer-motion";

type CurrencyInfo = {
  countryName: string;
  countryCode: string;
  currencyCode: string;
  exchangeRate: number;
  locale: string;
  source: "ipapi" | "fallback";
};

type SubscriptionData = {
  subscription: {
    planId?: string | null;
    status?: string | null;
    currency?: string | null;
    amount?: number | string | null;
    interval?: string | null;
    cancelAtPeriodEnd?: boolean | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    createdAt?: string | null;
  } | null;
  plan: {
    id?: string | null;
    name?: string | null;
    price?: number | string | null;
    currency?: string | null;
    interval?: string | null;
  } | null;
  isActive: boolean;
};

type Plan = {
  id: string;
  name: string;
  description: string;
  basePriceGbp: number;
  period: string;
  icon: typeof Zap;
  features: string[];
  popular: boolean;
  tier: number; // 1=basic, 2=pro, 3=elite for upgrade/downgrade comparison
};

const BASE_CURRENCY = "GBP";

const plans: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    description: "Essential access for getting started with HireMindX.",
    basePriceGbp: 5.99,
    period: "/month",
    icon: Zap,
    tier: 1,
    features: [
      "Unlimited chat in HireMindX Assist",
      "5 images, documents and files upload daily",
      "7 times usage of email outreach, leads finding and email automations",
      "Get access to Community",
    ],
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Advanced AI tools and unlimited productivity for power users.",
    basePriceGbp: 9.99,
    period: "/month",
    icon: Rocket,
    tier: 2,
    features: [
      "Unlimited chat",
      "Unlimited image, document, file upload",
      "Unlimited usage of live market intelligence every month",
      "Unlimited usage of AI Smart Prediction every month",
      "Unlimited usage of Deep Research mode every month",
      "Unlimited usage of email outreach and email automations",
      "10 times usage of HireMindX Match (Bulk CV Analysis)",
    ],
    popular: true,
  },
  {
    id: "elite",
    name: "Elite",
    description: "Maximum access, priority ranking, and first access to premium opportunities.",
    basePriceGbp: 19.99,
    period: "/month",
    icon: Star,
    tier: 3,
    features: [
      "All Pro features",
      "Unlimited usage of HireMindX Match (Bulk CV Analysis)",
      "Unlimited usage of Live Coding and Deployment every month",
      "Get Recommendation and verified badge on Community (Priority match ranking, your profile is shown first to top clients & roles)",
      "First Access to Opportunities (You see high value jobs/clients before everyone else)",
      "Get 1 year of Premium Plan of IxraAI for free",
      "Early access to experimental features",
      "Priority Queue in AI Processing (Faster responses, faster outputs, faster execution)",
    ],
    popular: false,
  },
];

function safeCurrencyCode(code?: string | null) {
  const normalized = String(code || BASE_CURRENCY).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : BASE_CURRENCY;
}

function formatPriceForDisplay(basePriceGbp: number, currencyInfo: CurrencyInfo | null) {
  const currencyCode = safeCurrencyCode(currencyInfo?.currencyCode);
  const locale = currencyInfo?.locale || "en-GB";
  const exchangeRate =
    typeof currencyInfo?.exchangeRate === "number" && Number.isFinite(currencyInfo.exchangeRate) && currencyInfo.exchangeRate > 0
      ? currencyInfo.exchangeRate
      : 1;
  const amount = basePriceGbp * exchangeRate;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function PremiumPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen flex items-center justify-center">
          <HeroBackground />
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <PremiumPageContent />
    </Suspense>
  );
}

function PremiumPageContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [currencyInfo, setCurrencyInfo] = useState<CurrencyInfo | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [checkoutModalPlanId, setCheckoutModalPlanId] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);

  // Load subscription data
  const loadSubscription = useCallback(async () => {
    try {
      setSubLoading(true);
      setSubError(null);
      const response = await fetch("/api/billing/subscription", { cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        setSubError(`Unable to load subscription status. (${response.status})`);
        console.error("Subscription API error:", response.status, text);
        return;
      }
      const data = (await response.json()) as SubscriptionData;
      setSubscriptionData(data);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Network error";
      setSubError(`Unable to load subscription status. ${msg}`);
      console.error("Failed to load subscription:", error);
    } finally {
      setSubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    const plan = searchParams.get("plan");

    if (success === "1") {
      toast.success("Checkout completed!", {
        description: plan ? `Your ${plan} plan is now being activated.` : "Your subscription is being activated.",
      });
      setIsActivating(true);
      // Poll subscription status every 3 seconds for up to 60 seconds
      let attempts = 0;
      const maxAttempts = 20;
      const pollInterval = setInterval(async () => {
        attempts++;
        await loadSubscription();
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setIsActivating(false);
          toast.info("Activation may take a moment", {
            description: "Please refresh the page or click Refresh Status if your plan doesn't appear shortly.",
          });
        }
      }, 3000);
      // Also do an immediate refresh
      setTimeout(() => loadSubscription(), 1500);
      return () => clearInterval(pollInterval);
    }

    if (canceled === "1") {
      toast.info("Checkout canceled", {
        description: plan ? `You canceled the ${plan} plan checkout.` : "You canceled checkout.",
      });
    }
  }, [searchParams, loadSubscription]);

  // Load subscription on mount
  useEffect(() => {
    if (session?.user) {
      loadSubscription();
    }
  }, [session, loadSubscription]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    async function detectPricingCurrency() {
      try {
        const response = await fetch("/api/pricing/region", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load pricing region");
        }

        const data = (await response.json()) as Partial<CurrencyInfo>;
        const detectedCurrency = safeCurrencyCode(data.currencyCode);
        const detectedCountryCode = String(data.countryCode || "").trim().toUpperCase();
        const detectedCountryName = String(data.countryName || "").trim() || "your region";
        const detectedLocale =
          typeof data.locale === "string" && data.locale.trim()
            ? data.locale
            : detectedCountryCode
              ? `en-${detectedCountryCode}`
              : "en-GB";
        const detectedExchangeRate =
          typeof data.exchangeRate === "number" && Number.isFinite(data.exchangeRate) && data.exchangeRate > 0
            ? data.exchangeRate
            : 1;

        if (!isActive) return;

        setCurrencyInfo({
          countryCode: detectedCountryCode || "GB",
          countryName: detectedCountryName,
          currencyCode: detectedCurrency,
          exchangeRate: detectedExchangeRate,
          locale: detectedLocale,
          source: data.source === "ipapi" ? "ipapi" : "fallback",
        });
      } catch (error) {
        if (!isActive) return;

        console.error("Failed to detect local pricing currency:", error);
        setCurrencyInfo({
          countryCode: "GB",
          countryName: "United Kingdom",
          currencyCode: "GBP",
          exchangeRate: 1,
          locale: "en-GB",
          source: "fallback",
        });
      } finally {
        if (isActive) {
          setPricingLoading(false);
        }
      }
    }

    detectPricingCurrency();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  // Clear activating state once subscription is no longer pending
  useEffect(() => {
    if (isActivating && subscriptionData?.subscription?.status && subscriptionData.subscription.status !== "pending") {
      setIsActivating(false);
    }
  }, [subscriptionData, isActivating]);

  const pricingBanner = useMemo(() => {
    if (pricingLoading) {
      return "Loading local pricing...";
    }

    if (!currencyInfo) {
      return "Prices are shown in GBP when local currency detection is unavailable.";
    }

    const regionLabel = currencyInfo.source === "fallback" ? "GBP fallback pricing" : `live ${currencyInfo.currencyCode} pricing`;
    const localPreview = formatPriceForDisplay(1, currencyInfo).replace(/1(?:[.,]00)?/, "").trim();

    return `Showing ${regionLabel} for ${currencyInfo.countryName}${localPreview ? ` (${localPreview})` : ""}.`;
  }, [currencyInfo, pricingLoading]);

  // Derived subscription state
  const activePlanId = subscriptionData?.isActive ? subscriptionData?.subscription?.planId : null;
  const activePlan = activePlanId ? plans.find((p) => p.id === activePlanId) : null;
  const isCanceling = subscriptionData?.subscription?.cancelAtPeriodEnd === true;
  const hasActiveSubscription = Boolean(subscriptionData?.isActive && activePlanId);

  const handleCheckoutWithStripe = async (planId: string) => {
    setSelectedPlan(planId);
    setCheckoutModalPlanId(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      const data = (await readJsonResponse<{ url?: string; error?: string }>(response)) ?? {};

      if (!response.ok) {
        throw new Error(data.error || `Unable to start checkout. (${response.status})`);
      }

      if (!data.url) {
        throw new Error("Stripe checkout URL was not returned.");
      }

      window.location.assign(data.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start checkout.";
      toast.error("Checkout failed", { description: message });
      setSelectedPlan(null);
    }
  };

  const isEligibleForRefund = () => {
    if (!subscriptionData?.subscription?.createdAt) return false;
    const createdDate = new Date(subscriptionData.subscription.createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 14;
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = (await readJsonResponse<{ success?: boolean; error?: string; message?: string }>(response)) ?? {};

      if (!response.ok) {
        throw new Error(data.error || "Unable to cancel subscription.");
      }

      toast.success("Subscription canceled", {
        description: data.message || "Your subscription will end at the current billing period.",
      });

      setShowCancelConfirm(false);
      await loadSubscription();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to cancel subscription.";
      toast.error("Cancellation failed", { description: message });
    } finally {
      setCancelLoading(false);
    }
  };

  if (isPending) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <HeroBackground />
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!session?.user) return null;

  const getPlanAction = (plan: Plan) => {
    if (!hasActiveSubscription) {
      return { label: "Get Started", type: "checkout" as const };
    }

    if (plan.id === activePlanId) {
      if (isCanceling) {
        return { label: "Canceling...", type: "current-canceling" as const };
      }
      return { label: "Current Plan", type: "current" as const };
    }

    const currentTier = activePlan?.tier ?? 0;
    if (plan.tier > currentTier) {
      return { label: "Upgrade", type: "upgrade" as const };
    }
    return { label: "Downgrade", type: "downgrade" as const };
  };

  return (
    <div className="relative min-h-screen text-white selection:bg-white/10">
      <HeroBackground />
      <div className="relative z-10">
        <AppHeader />

        <main className="pt-24 sm:pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12 sm:mb-16"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-5">
                <Crown className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-400">
                  Premium Access
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-white leading-none mb-4">
                Premium Plans
              </h1>

              <p className="text-zinc-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
                Unlock the full potential of AI-powered job search. Choose the plan that fits your goals.
              </p>

              <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06]">
                <Shield className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-400">{pricingBanner}</span>
              </div>
            </motion.div>

            {/* Pending / Activating Banner */}
            {(isActivating || subscriptionData?.subscription?.status === "pending") && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Activating your plan</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Payment received. We are confirming your subscription with Stripe. This usually takes a few seconds.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Subscription Error Banner */}
            {subError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Unable to verify subscription</h3>
                        <p className="text-xs text-zinc-400 mt-0.5">{subError}</p>
                      </div>
                    </div>
                    <button
                      onClick={loadSubscription}
                      disabled={subLoading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.06] text-sm font-medium text-zinc-300 hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${subLoading ? "animate-spin" : ""}`} />
                      Refresh Status
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Active Subscription Banner */}
            {!subLoading && hasActiveSubscription && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className={`rounded-2xl border p-5 ${
                  isCanceling
                    ? "border-amber-500/20 bg-amber-500/[0.04]"
                    : "border-emerald-500/20 bg-emerald-500/[0.04]"
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isCanceling
                          ? "bg-amber-500/10 border border-amber-500/20"
                          : "bg-emerald-500/10 border border-emerald-500/20"
                      }`}>
                        {isCanceling ? (
                          <AlertTriangle className="w-5 h-5 text-amber-400" />
                        ) : (
                          <Check className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">
                            {activePlan?.name ?? "Active"} Plan
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isCanceling
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}>
                            {isCanceling ? "Canceling" : "Active"}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {isCanceling
                            ? `Your plan will end on ${formatDate(subscriptionData?.subscription?.currentPeriodEnd)}. You can still use all features until then.`
                            : `Renews on ${formatDate(subscriptionData?.subscription?.currentPeriodEnd)}`
                          }
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={loadSubscription}
                        disabled={subLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-sm font-medium text-zinc-400 hover:bg-white/[0.08] transition-all disabled:opacity-50"
                        title="Refresh subscription status"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${subLoading ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">Refresh</span>
                      </button>
                      {!isCanceling && (
                        <button
                          onClick={() => setShowCancelConfirm(true)}
                          disabled={cancelLoading}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel Plan
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {showCancelConfirm && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-5 pt-5 border-t border-red-500/20"
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                        <div>
                          <p className="mb-1 text-sm font-medium text-white">Cancel your subscription?</p>
                          <p className="text-xs text-zinc-400">
                            {isEligibleForRefund() ? (
                              "Since you subscribed within the last 14 days, you are eligible for a full refund. Your subscription will be canceled immediately, and the funds will be returned to your account in 48 hours."
                            ) : (
                              "Since 14 days have passed since your subscription started, you are no longer eligible for a refund. Your subscription will still be canceled at the end of your current billing period."
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 h-10 rounded-xl border border-white/[0.08] bg-white/[0.06] text-sm font-medium text-zinc-300 transition-all hover:bg-white/10"
                        >
                          Keep Subscription
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={cancelLoading}
                          className="flex-1 h-10 rounded-xl bg-red-600 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {cancelLoading ? "Canceling..." : "Confirm Cancel"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            <div className="grid md:grid-cols-3 gap-3 sm:gap-4">
              {plans.map((plan, i) => {
                const Icon = plan.icon;
                const priceLabel = formatPriceForDisplay(plan.basePriceGbp, currencyInfo);
                const action = getPlanAction(plan);
                const isCurrentPlan = action.type === "current" || action.type === "current-canceling";
                const isUpgrade = action.type === "upgrade";
                const isDowngrade = action.type === "downgrade";

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
                    className={`relative flex flex-col p-6 rounded-2xl border transition-all duration-300 ${
                      isCurrentPlan
                        ? "bg-white/[0.08] border-emerald-500/30 shadow-2xl ring-1 ring-emerald-500/10"
                        : plan.popular
                          ? "bg-white/[0.06] border-white/20 shadow-2xl"
                          : "bg-zinc-900/50 border-white/[0.08] hover:bg-zinc-900/80 hover:border-white/10"
                    }`}
                  >
                    {isCurrentPlan && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="text-[10px] font-bold tracking-widest uppercase bg-emerald-500 text-white px-3 py-1 rounded-full">
                          Your Plan
                        </span>
                      </div>
                    )}

                    {!isCurrentPlan && plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="text-[10px] font-bold tracking-widest uppercase bg-white text-black px-3 py-1 rounded-full">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-5">
                      <Icon className="w-4 h-4 text-zinc-300" />
                    </div>

                    <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                    <p className="text-xs text-zinc-500 mb-5 leading-relaxed">{plan.description}</p>

                    <div className="mb-6">
                      <span className="text-4xl font-black text-white tracking-tighter">{priceLabel}</span>
                      <span className="text-sm text-zinc-500 ml-1">{plan.period}</span>
                    </div>

                    <ul className="space-y-2.5 mb-6 flex-1">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <div className="mt-0.5 w-4 h-4 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                            <Check className="w-2.5 h-2.5 text-zinc-300" />
                          </div>
                          <span className="text-xs text-zinc-300 leading-relaxed">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => {
                        if (isCurrentPlan) return;
                        if (isDowngrade) {
                          toast.info("To downgrade, please cancel your current plan first. Once it expires, you can subscribe to a lower plan.");
                          return;
                        }
                        setCheckoutModalPlanId(plan.id);
                      }}
                      disabled={selectedPlan === plan.id || isCurrentPlan}
                      className={`w-full h-10 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-1.5 ${
                        isCurrentPlan
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-default"
                          : isUpgrade
                            ? "bg-white text-black hover:bg-zinc-200"
                            : isDowngrade
                              ? "bg-white/[0.06] border border-white/[0.08] text-zinc-400 hover:bg-white/10"
                              : plan.popular
                                ? "bg-white text-black hover:bg-zinc-200"
                                : "bg-white/[0.06] border border-white/[0.08] text-zinc-200 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {selectedPlan === plan.id ? (
                        "Processing..."
                      ) : isUpgrade ? (
                        <>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {action.label}
                        </>
                      ) : isDowngrade ? (
                        <>
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          {action.label}
                        </>
                      ) : isCurrentPlan ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          {action.label}
                        </>
                      ) : (
                        action.label
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-10 text-center"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06]">
                <Shield className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-xs text-zinc-500">
                  14-day money-back guarantee. Cancel anytime. Prices auto-convert by region with live exchange rates.
                </span>
              </div>
            </motion.div>
          </div>
        </main>

        {/* Payment Method Modal */}
        {checkoutModalPlanId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/[0.08] rounded-2xl p-6 w-full max-w-md relative shadow-2xl"
            >
              <button
                onClick={() => setCheckoutModalPlanId(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
              <h3 className="text-xl font-bold text-white mb-2">Select Payment Method</h3>
              <p className="text-sm text-zinc-400 mb-6">Choose how you'd like to pay for your plan.</p>

              <div className="space-y-3">
                <button
                  onClick={() => handleCheckoutWithStripe(checkoutModalPlanId)}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-zinc-300" />
                    <span className="font-medium text-white">Debit / Credit Card</span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-zinc-500" />
                </button>

                <button disabled className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] opacity-50 cursor-not-allowed">
                  <div className="flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-zinc-500" />
                    <span className="font-medium text-zinc-500">PayPal</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-600 bg-white/[0.05] px-2 py-1 rounded-full">Coming Soon</span>
                </button>

                <button disabled className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] opacity-50 cursor-not-allowed">
                  <div className="flex items-center gap-3">
                    <CircleDollarSign className="w-5 h-5 text-zinc-500" />
                    <span className="font-medium text-zinc-500">Cryptocurrency</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-600 bg-white/[0.05] px-2 py-1 rounded-full">Coming Soon</span>
                </button>

                <button disabled className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] opacity-50 cursor-not-allowed">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-zinc-500" />
                    <span className="font-medium text-zinc-500">Payoneer</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-600 bg-white/[0.05] px-2 py-1 rounded-full">Coming Soon</span>
                </button>

                <button disabled className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] opacity-50 cursor-not-allowed">
                  <div className="flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-zinc-500" />
                    <span className="font-medium text-zinc-500">Wise</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-600 bg-white/[0.05] px-2 py-1 rounded-full">Coming Soon</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
