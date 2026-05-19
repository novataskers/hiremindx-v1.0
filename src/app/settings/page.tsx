'use client';

import { useEffect, useState, type ReactNode, type JSX } from "react";
import Sidebar from "@/components/Sidebar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Bot,
  CreditCard,
  Trash2,
  AlertTriangle,
  Crown,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { resetOnboarding } from "@/lib/onboarding";
import { authClient } from "@/lib/auth-client";
import { motion } from "framer-motion";

type SubscriptionResponse = {
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
  isFounderBeta?: boolean;
  founderSignupOrder?: number | null;
};

type PlanMeta = {
  name: string;
  price: number;
  interval: string;
};

const PLAN_META: Record<string, PlanMeta> = {
  basic: {
    name: "Basic",
    price: 5.99,
    interval: "month",
  },
  pro: {
    name: "Pro",
    price: 9.99,
    interval: "month",
  },
  elite: {
    name: "Elite",
    price: 19.99,
    interval: "month",
  },
};

function formatCurrency(value: number | string | null | undefined, currency = "GBP"): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numericValue = typeof value === "string" ? Number(value) : value;

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  const displayValue = Number.isInteger(numericValue) && Math.abs(numericValue) >= 100 ? numericValue / 100 : numericValue;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(displayValue);
}

function toTitleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function getPlanMeta(planId?: string | null, plan?: SubscriptionResponse["plan"] | null): PlanMeta | null {
  if (plan?.id && PLAN_META[plan.id]) {
    return PLAN_META[plan.id];
  }

  if (planId && PLAN_META[planId]) {
    return PLAN_META[planId];
  }

  return null;
}

export default function Settings(): JSX.Element {
  const router = useRouter();
  const [active, setActive] = useState("profile");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionResponse | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadSubscription = async (): Promise<void> => {
      try {
        setIsLoadingSubscription(true);
        setSubscriptionError(null);

        const response = await fetch("/api/billing/subscription", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = (await response.json()) as SubscriptionResponse | { error?: string };

        if (!response.ok) {
          const message = "error" in data && typeof data.error === "string" ? data.error : "Unable to load your subscription.";
          throw new Error(message);
        }

        if (isMounted) {
          setSubscriptionData(data as SubscriptionResponse);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load your subscription.";
        if (isMounted) {
          setSubscriptionError(message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSubscription(false);
        }
      }
    };

    void loadSubscription();

    const interval = setInterval(() => {
      if (isMounted) void loadSubscription();
    }, 60000);

    const handleFocus = () => {
      if (isMounted) void loadSubscription();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const planId = subscriptionData?.subscription?.planId ?? subscriptionData?.plan?.id ?? null;
  const planMeta = getPlanMeta(planId, subscriptionData?.plan);
  const hasSubscription = Boolean(subscriptionData?.subscription);

  const planName = isLoadingSubscription
    ? "Loading subscription…"
    : !hasSubscription
      ? "Not subscribed"
      : subscriptionData?.plan?.name ?? planMeta?.name ?? (planId ? toTitleCase(planId) : "Current plan");

  const statusLabel = isLoadingSubscription
    ? "Loading…"
    : !hasSubscription
      ? "Not subscribed"
      : subscriptionData?.subscription?.cancelAtPeriodEnd
        ? "Cancels at period end"
        : subscriptionData?.subscription?.status
          ? toTitleCase(subscriptionData.subscription.status)
          : subscriptionData?.isActive
            ? "Active"
            : "Inactive";

  const statusTone = isLoadingSubscription
    ? "bg-zinc-500/10 text-zinc-400 border border-white/[0.08]"
    : !hasSubscription
      ? "bg-zinc-500/10 text-zinc-400 border border-white/[0.08]"
      : subscriptionData?.subscription?.cancelAtPeriodEnd
        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
        : subscriptionData?.isActive
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-red-500/10 text-red-400 border border-red-500/20";

  const planCurrency = subscriptionData?.plan?.currency ?? subscriptionData?.subscription?.currency ?? "GBP";
  const planInterval = subscriptionData?.plan?.interval ?? subscriptionData?.subscription?.interval ?? planMeta?.interval ?? "month";
  const planPrice = subscriptionData?.plan?.price ?? subscriptionData?.subscription?.amount ?? null;

  const planSummary = isLoadingSubscription
    ? "Fetching your current billing status."
    : !hasSubscription
      ? "You are currently on the free tier. Upgrade through the premium page to start a secure card checkout."
      : subscriptionData?.subscription?.cancelAtPeriodEnd
        ? "Your subscription is active until the end of the current billing period."
        : subscriptionData?.isActive
          ? "Your subscription is active and managed through Stripe billing."
          : "Your subscription is currently inactive. Upgrade through the premium page to reactivate.";

  const subscriptionChips = isLoadingSubscription
    ? ["Loading subscription…", "Checking billing status…"]
    : hasSubscription
      ? [
          `Plan: ${planName}`,
          `Status: ${statusLabel}`,
          planPrice !== null ? `Price: ${formatCurrency(planPrice, planCurrency)} / ${planInterval}` : "Price: —",
          subscriptionData?.subscription?.cancelAtPeriodEnd ? "Cancels at period end" : "Auto-renews",
        ]
      : [
          "Not subscribed",
          "Upgrade through the premium page",
          "Stripe card checkout",
          "Basic, Pro, or Elite",
        ];

  const handleDeleteAccount = async () => {
    if (deleteInput !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/user/delete", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete account");
      }

      toast.success("Account deleted successfully");
      resetOnboarding();
      await authClient.signOut();
      localStorage.removeItem("bearer_token");
      router.push("/");
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account. Please try again.");
    } finally {
      setIsDeleting(false);
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

  const isFounderBeta = subscriptionData?.isFounderBeta ?? false;
  const isFounderTrialing = isFounderBeta && subscriptionData?.subscription?.status === "trialing";

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel subscription");
      }

      if (data.founderReset) {
        toast.success("Founder Beta membership withdrawn");
      } else {
        toast.success("Subscription canceled successfully");
      }
      setShowCancelConfirm(false);
      // Reload subscription data to show updated status
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error("Error canceling subscription:", error);
      toast.error(error instanceof Error ? error.message : "Failed to cancel subscription");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-black text-white">
      <Sidebar />

      <main className="flex-1 p-4 lg:ml-64 lg:p-8 sm:p-6">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-16 mb-8 lg:mt-0"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
              <SettingsIcon className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">Account</span>
            </div>
            <h1 className="mb-2 text-3xl font-black leading-none tracking-tighter text-white sm:text-4xl">
              Settings
            </h1>
            <p className="text-sm text-zinc-500">Manage your account and preferences</p>
          </motion.div>

          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Side nav */}
            <motion.nav
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex-shrink-0 lg:w-52"
            >
              <div className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  const isDanger = s.id === "danger";
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActive(s.id)}
                      className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                        active === s.id
                          ? isDanger
                            ? "border border-red-500/20 bg-red-500/10 text-red-400"
                            : "border border-white/[0.1] bg-white/[0.08] text-white"
                          : isDanger
                            ? "text-red-500/60 hover:bg-red-500/5 hover:text-red-400"
                            : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </motion.nav>

            {/* Content */}
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="min-w-0 flex-1"
            >
              {/* Profile */}
              {active === "profile" && (
                <Section icon={<User className="h-4 w-4 text-zinc-400" />} title="Profile">
                  <div className="space-y-4">
                    <Field label="Full Name">
                      <Input
                        defaultValue="Sarmag"
                        className="h-11 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600 focus:border-white/20 focus:ring-0"
                      />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        defaultValue="sarmag@example.com"
                        className="h-11 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600 focus:border-white/20 focus:ring-0"
                      />
                    </Field>
                    <Field label="Current Title">
                      <Input
                        defaultValue="Marketing Manager"
                        className="h-11 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600 focus:border-white/20 focus:ring-0"
                      />
                    </Field>
                    <div className="pt-2">
                      <button
                        onClick={() => toast.success("Profile saved")}
                        className="h-10 rounded-xl bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                </Section>
              )}

              {/* Notifications */}
              {active === "notifications" && (
                <Section icon={<Bell className="h-4 w-4 text-zinc-400" />} title="Notifications">
                  <div className="space-y-1">
                    <ToggleRow
                      label="Email Notifications"
                      description="Receive email updates about your applications"
                      defaultChecked
                    />
                    <ToggleRow
                      label="New Job Matches"
                      description="Get notified when new jobs match your profile"
                      defaultChecked
                    />
                    <ToggleRow
                      label="Application Updates"
                      description="Alerts for application status changes"
                      defaultChecked
                    />
                    <ToggleRow
                      label="Weekly Digest"
                      description="A weekly summary of your job search activity"
                    />
                    <MarketingConsentToggle />
                  </div>
                </Section>
              )}

              {/* AI Settings */}
              {active === "ai" && (
                <Section icon={<Bot className="h-4 w-4 text-zinc-400" />} title="AI Settings">
                  <div className="mb-6 space-y-1">
                    <ToggleRow
                      label="Auto-apply to Jobs"
                      description="Let AI automatically apply to matching positions"
                      defaultChecked
                    />
                    <ToggleRow
                      label="AI Follow-ups"
                      description="Allow AI to send follow-up messages on your behalf"
                      defaultChecked
                    />
                    <ToggleRow
                      label="Smart Matching"
                      description="Use AI to find highly relevant job opportunities"
                      defaultChecked
                    />
                  </div>
                  <Field label="Max Applications per Week">
                    <Input
                      type="number"
                      defaultValue="50"
                      className="h-11 max-w-xs rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-zinc-600 focus:border-white/20 focus:ring-0"
                    />
                  </Field>
                  <div className="pt-4">
                    <button
                      onClick={() => toast.success("AI settings saved")}
                      className="h-10 rounded-xl bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
                    >
                      Save Changes
                    </button>
                  </div>
                </Section>
              )}

              {/* Subscription */}
              {active === "subscription" && (
                <Section icon={<CreditCard className="h-4 w-4 text-zinc-400" />} title="Subscription">
                  <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06]">
                          <Crown className="h-4 w-4 text-zinc-300" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{planName}</p>
                          <p className="text-xs text-zinc-500">{planSummary}</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${statusTone}`}>
                        {statusLabel}
                      </span>
                    </div>

                    <div className="mb-4 flex items-end gap-1">
                      <span className="text-3xl font-black tracking-tighter text-white">
                        {isLoadingSubscription ? "—" : planPrice !== null ? formatCurrency(planPrice, planCurrency) : "—"}
                      </span>
                      <span className="mb-1 text-sm text-zinc-500">
                        {isLoadingSubscription ? "" : planPrice !== null ? `/${planInterval}` : ""}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {subscriptionChips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-300"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => router.push("/premium")}
                      className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.06] px-5 text-sm font-medium text-zinc-200 transition-all hover:bg-white/10 hover:text-white"
                    >
                      <Zap className="mr-1.5 inline h-3.5 w-3.5" />
                      Upgrade Plan
                    </button>
                    {hasSubscription && !subscriptionData?.subscription?.cancelAtPeriodEnd && (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="h-10 rounded-xl px-5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-300"
                      >
                        Cancel Subscription
                      </button>
                    )}
                  </div>

                  {showCancelConfirm && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-4 rounded-xl border border-red-500/20 bg-red-950/20 p-5"
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                        <div>
                          <p className="mb-1 text-sm font-medium text-white">
                            {isFounderTrialing ? "Withdraw from Founder Beta?" : "Cancel your subscription?"}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {isFounderTrialing ? (
                              "This will permanently revoke your Founder Beta membership, release your founder spot, and remove all beta privileges. Your account will return to free-tier status. This action cannot be undone."
                            ) : isFounderBeta ? (
                              "Your Founder Elite subscription will be canceled at the end of the current billing period. You will keep founder access and pricing until then."
                            ) : isEligibleForRefund() ? (
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
                          {isFounderTrialing ? "Keep Membership" : "Keep Subscription"}
                        </button>
                        <button
                          onClick={handleCancelSubscription}
                          disabled={isCancelling}
                          className="flex-1 h-10 rounded-xl bg-red-600 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isCancelling ? "Canceling..." : isFounderTrialing ? "Withdraw & Release Spot" : "Confirm Cancel"}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4 text-sm text-zinc-400">
                    Upgrade and plan changes are handled on the premium page so the checkout flow stays secure.
                  </div>
                </Section>
              )}

              {/* Danger Zone */}
              {active === "danger" && (
                <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-6">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </div>
                    <h2 className="text-base font-semibold text-red-400">Danger Zone</h2>
                  </div>

                  <div className="mb-5">
                    <p className="mb-1 text-sm font-medium text-white">Delete Account</p>
                    <p className="text-xs text-zinc-500">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                  </div>

                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="h-10 rounded-xl border border-red-500/20 bg-red-500/10 px-5 text-sm font-medium text-red-400 transition-all hover:border-red-500/40 hover:bg-red-500/20"
                    >
                      <Trash2 className="mr-1.5 inline h-3.5 w-3.5" />
                      Delete My Account
                    </button>
                  ) : (
                    <div className="space-y-4 rounded-xl border border-red-500/20 bg-red-950/20 p-5">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                        <div>
                          <p className="mb-1 text-sm font-medium text-red-400">Are you absolutely sure?</p>
                          <p className="text-xs text-zinc-500">
                            This will permanently delete your account, all chat history, saved data, and preferences.
                            Type <span className="font-bold text-zinc-300">DELETE</span> below to confirm.
                          </p>
                        </div>
                      </div>
                      <Input
                        value={deleteInput}
                        onChange={(e) => setDeleteInput(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="h-11 rounded-xl border-red-500/30 bg-black/40 text-white placeholder:text-zinc-600 focus:border-red-500/60 focus:ring-0"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteInput("");
                          }}
                          className="flex-1 h-10 rounded-xl border border-white/[0.08] bg-white/[0.06] text-sm font-medium text-zinc-300 transition-all hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleteInput !== "DELETE" || isDeleting}
                          className="flex-1 h-10 rounded-xl bg-red-600 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isDeleting ? "Deleting..." : "Permanently Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isLoadingSubscription && subscriptionError && active === "subscription" ? (
                <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                  {subscriptionError}
                </div>
              ) : null}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06]">
          {icon}
        </div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-2 block text-xs font-medium text-zinc-500">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  defaultChecked = false,
  onChange,
}: {
  label: string;
  description: string;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="mt-0.5 text-xs text-zinc-600">{description}</p>
      </div>
      <Switch defaultChecked={defaultChecked} onCheckedChange={onChange} className="flex-shrink-0" />
    </div>
  );
}

function MarketingConsentToggle() {
  const [consent, setConsent] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load current consent from user session or API
    fetch("/api/user/marketing-consent")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.marketingConsent === "boolean") setConsent(d.marketingConsent);
      })
      .catch(() => {});
  }, []);

  const handleChange = async (checked: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/marketing-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: checked }),
      });
      if (res.ok) {
        setConsent(checked);
        toast.success(checked ? "Subscribed to founder updates" : "Unsubscribed from marketing emails");
      }
    } catch {
      toast.error("Failed to update preference");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-200">Founder & Marketing Emails</p>
        <p className="mt-0.5 text-xs text-zinc-600">
          Receive founder updates, platform announcements, promotional emails, and event invites.
        </p>
      </div>
      <Switch checked={consent} onCheckedChange={handleChange} disabled={saving} className="flex-shrink-0" />
    </div>
  );
}

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "ai", label: "AI Settings", icon: Bot },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "danger", label: "Danger Zone", icon: Trash2 },
];