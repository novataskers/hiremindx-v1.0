"use client";

import { useState, useCallback } from "react";
import { Loader2, Link, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface StripeConnectButtonProps {
  accountStatus?: {
    connected: boolean;
    isOnboarded?: boolean;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
  } | null;
  onStatusChange?: () => void;
  variant?: "default" | "small";
}

export default function StripeConnectButton({
  accountStatus,
  onStatusChange,
  variant = "default",
}: StripeConnectButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    try {
      const action = accountStatus?.connected ? "onboarding" : "create";
      const res = await fetch("/api/community/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to connect Stripe");
      }

      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else {
        toast.success("Stripe account connected!");
        onStatusChange?.();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to connect Stripe");
    } finally {
      setLoading(false);
    }
  }, [accountStatus, onStatusChange]);

  const isFullyOnboarded =
    accountStatus?.connected &&
    accountStatus?.isOnboarded &&
    accountStatus?.chargesEnabled &&
    accountStatus?.payoutsEnabled;

  if (variant === "small") {
    return (
      <button
        onClick={handleConnect}
        disabled={loading || isFullyOnboarded}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
          isFullyOnboarded
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
            : "bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/20 hover:bg-[#f5c518]/20"
        }`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isFullyOnboarded ? (
          <>
            <CheckCircle className="w-3 h-3" /> Connected
          </>
        ) : accountStatus?.connected ? (
          <>
            <AlertCircle className="w-3 h-3" /> Complete Setup
          </>
        ) : (
          <>
            <Link className="w-3 h-3" /> Connect Stripe
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading || isFullyOnboarded}
      className={`flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-bold transition-all ${
        isFullyOnboarded
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
          : "bg-gradient-to-r from-[#f5c518]/20 to-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/30 hover:from-[#f5c518]/30 hover:to-[#f5c518]/20"
      }`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isFullyOnboarded ? (
        <>
          <CheckCircle className="w-4 h-4" /> Stripe Account Connected
        </>
      ) : accountStatus?.connected ? (
        <>
          <AlertCircle className="w-4 h-4" /> Complete Stripe Onboarding
        </>
      ) : (
        <>
          <Link className="w-4 h-4" /> Connect Stripe for Payouts
        </>
      )}
    </button>
  );
}
