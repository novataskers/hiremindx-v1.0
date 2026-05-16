"use client";

import { useState, useEffect } from "react";
import { Loader2, Layers3, X, Sparkles, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface BetaSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillName?: string;
  prefillEmail?: string;
}

export default function BetaSignupModal({
  isOpen,
  onClose,
  prefillName = "",
  prefillEmail = "",
}: BetaSignupModalProps) {
  const [name, setName] = useState(prefillName);
  const [email, setEmail] = useState(prefillEmail);
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Sync prefill values when session loads asynchronously
  useEffect(() => {
    if (prefillName && !name) setName(prefillName);
  }, [prefillName]);

  useEffect(() => {
    if (prefillEmail && !email) setEmail(prefillEmail);
  }, [prefillEmail]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      toast.error("Please enter your full name.");
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/beta/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail, marketingConsent }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.full) {
          toast.error("Beta access is full", {
            description: "All 100 founding member spots have been claimed.",
          });
          onClose();
          return;
        }
        throw new Error(data.error || "Unable to process beta signup.");
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.assign(data.url);
      } else {
        toast.error("Unable to create checkout session.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      toast.error("Signup failed", { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[440px] p-0 overflow-hidden border-none bg-transparent shadow-none"
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
          <div className="w-[400px] h-[400px] rounded-full blur-[120px] bg-amber-500/[0.04]" />
        </div>

        <div className="relative w-full rounded-3xl border border-amber-500/[0.12] bg-black shadow-[0_0_80px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(245,208,96,0.06)]">

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-white/[0.07] transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <form onSubmit={handleSubmit} className="flex flex-col items-center px-8 py-10">

            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-8">
              <Layers3 className="w-5 h-5 text-white" />
              <span className="text-xs font-bold tracking-[0.25em] uppercase text-white/90">
                HireMindX
              </span>
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/[0.06] border border-amber-500/15 mb-6">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span className="text-[9px] font-bold tracking-[0.3em] uppercase text-amber-400">
                Founding Member
              </span>
            </div>

            {/* Heading */}
            <div className="text-center mb-6">
              <h1
                className="text-2xl font-black tracking-tighter text-white mb-2"
                style={{ filter: "drop-shadow(0 0 20px rgba(245,208,96,0.15))" }}
              >
                Join the First 100
              </h1>
              <p className="text-sm text-zinc-500 font-light tracking-wide">
                14 days free, then £9.99/month for life
              </p>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent mb-6" />

            {/* Form fields */}
            <div className="w-full space-y-3 mb-6">
              <div>
                <label htmlFor="beta-name" className="block text-[10px] font-bold tracking-widest uppercase text-zinc-500 mb-1.5 ml-1">
                  Full Name
                </label>
                <input
                  id="beta-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                  disabled={isLoading}
                  className="w-full h-11 px-4 rounded-xl text-sm text-white placeholder-zinc-600 bg-white/[0.04] border border-white/[0.09] hover:border-white/[0.15] focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/20 focus:outline-none transition-all disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="beta-email" className="block text-[10px] font-bold tracking-widest uppercase text-zinc-500 mb-1.5 ml-1">
                  Email Address
                </label>
                <input
                  id="beta-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isLoading}
                  className="w-full h-11 px-4 rounded-xl text-sm text-white placeholder-zinc-600 bg-white/[0.04] border border-white/[0.09] hover:border-white/[0.15] focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/20 focus:outline-none transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-2xl text-sm font-bold tracking-wide transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, #c8960c, #f5d060)",
                color: "#000",
                boxShadow: "0 0 24px rgba(245,208,96,0.15)",
              }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isLoading ? "Processing..." : "Continue to Payment"}
            </button>

            {/* Marketing consent */}
            <div className="mt-4 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/[0.03] border border-amber-500/10 w-full">
              <input
                id="marketing-consent"
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 rounded border-zinc-600 bg-black text-amber-500 focus:ring-amber-500/30 cursor-pointer"
              />
              <label htmlFor="marketing-consent" className="text-[10px] leading-relaxed text-zinc-500 cursor-pointer select-none">
                By continuing to payment and signing up as a founding member, you agree to receive promotional emails, founder updates, platform updates, event announcements, and future HireMindX communications related to your founder membership and the future of HireMindX.
              </label>
            </div>

            {/* Info */}
            <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] w-full">
              <Shield className="w-3.5 h-3.5 flex-shrink-0 text-zinc-600" />
              <p className="text-[10px] leading-relaxed text-zinc-600">
                You&apos;ll be redirected to Stripe to securely enter your card details. No charge for 14 days.
              </p>
            </div>

            {/* Footer */}
            <p className="text-center text-[9px] uppercase tracking-[0.2em] leading-relaxed mt-5 text-zinc-700">
              By continuing, you agree to our Terms & Privacy Policy
            </p>

          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
