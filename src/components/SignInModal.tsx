"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, Layers3, X, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  redirectTo?: string;
}

export default function SignInModal({ isOpen, onClose, redirectTo = "/" }: SignInModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isMsLoading, setIsMsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: redirectTo,
        errorCallbackURL: redirectTo,
        scopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.send",
        ],
      });
    } catch (error) {
      toast.error("Failed to sign in with Google. Please try again.");
      console.error("Social sign in error details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    setIsMsLoading(true);
    try {
      await authClient.signIn.social({
        provider: "microsoft",
        callbackURL: redirectTo,
        errorCallbackURL: redirectTo,
        scopes: [
          "openid",
          "profile",
          "email",
          "offline_access",
          "https://graph.microsoft.com/Mail.Send",
        ],
      });
    } catch (error) {
      toast.error("Failed to sign in with Microsoft. Please try again.");
      console.error("Microsoft sign in error:", error);
    } finally {
      setIsMsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[420px] p-0 overflow-hidden border-none bg-transparent shadow-none"
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
          <div className="w-[360px] h-[360px] rounded-full blur-[120px] bg-white/[0.06]" />
        </div>

        <div className="relative w-full rounded-3xl border border-white/[0.08] bg-black shadow-[0_0_80px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)]">

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-white/[0.07] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center px-8 py-10">

            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-10">
              <Layers3 className="w-5 h-5 text-white" />
              <span className="text-xs font-bold tracking-[0.25em] uppercase text-white/90">
                HireMindX
              </span>
            </div>

            {/* Heading */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-black tracking-tighter text-white mb-2"
                style={{ filter: "drop-shadow(0 0 20px rgba(255,255,255,0.25))" }}
              >
                Welcome back
              </h1>
              <p className="text-sm text-zinc-500 font-light tracking-wide">
                Sign in to continue to HireMindX
              </p>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-white/[0.06] mb-8" />

            {/* Buttons */}
            <div className="w-full space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 text-sm font-medium rounded-2xl transition-all group bg-white/[0.04] border-white/[0.09] hover:bg-white/[0.09] hover:border-white/[0.18] text-white"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-3 h-4 w-4 group-hover:scale-110 transition-transform flex-shrink-0" aria-hidden="true" viewBox="0 0 488 512" xmlns="http://www.w3.org/2000/svg">
                    <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
                  </svg>
                )}
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-12 text-sm font-medium rounded-2xl transition-all group bg-white/[0.04] border-white/[0.09] hover:bg-white/[0.09] hover:border-white/[0.18] text-white"
                onClick={handleMicrosoftSignIn}
                disabled={isMsLoading}
              >
                {isMsLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-3 h-4 w-4 group-hover:scale-110 transition-transform flex-shrink-0" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="0" width="10.5" height="10.5" fill="currentColor" />
                    <rect x="12.5" y="0" width="10.5" height="10.5" fill="currentColor" />
                    <rect x="0" y="12.5" width="10.5" height="10.5" fill="currentColor" />
                    <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="currentColor" />
                  </svg>
                )}
                Continue with Microsoft
              </Button>

              {/* Info notice */}
              <div className="mt-1 p-3 rounded-xl border bg-white/[0.02] border-white/[0.06]">
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-zinc-500" />
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    Allow <strong className="text-zinc-400">&quot;Send email on your behalf&quot;</strong> to enable outreach features.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-[10px] uppercase tracking-[0.18em] leading-relaxed mt-8 text-zinc-700">
              By continuing, you agree to our{" "}
              <Link href="/terms" className="text-zinc-600 hover:text-zinc-400 transition-colors">Terms</Link>
              {" & "}
              <Link href="/privacy" className="text-zinc-600 hover:text-zinc-400 transition-colors">Privacy</Link>
            </p>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
