"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { HeroBackground } from "@/components/HeroBackground";
import { motion } from "framer-motion";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch (error) {
      toast.error("Failed to sign in with Google. Please try again.");
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black text-white flex items-center justify-center p-6 overflow-hidden">
      <HeroBackground />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex justify-center mb-10"
        >
          <Link href="/">
            <Logo />
          </Link>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl p-8"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black tracking-tighter text-white mb-2">
              Welcome back
            </h1>
            <p className="text-sm text-zinc-500">
              Sign in to continue your AI-powered job search
            </p>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full h-12 rounded-xl bg-white text-black text-sm font-semibold flex items-center justify-center gap-3 hover:bg-zinc-100 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 mb-4"
          >
            {isGoogleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            {isGoogleLoading ? "Signing in..." : "Continue with Google"}
          </button>

          {/* Info note */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <Mail className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-500 leading-relaxed">
              Sign in with Google to let our AI agent send emails on your behalf using your Gmail account.
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-xs text-zinc-600 mt-6"
        >
          By continuing, you agree to our{" "}
          <Link href="/terms" className="text-zinc-400 hover:text-white transition-colors">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-zinc-400 hover:text-white transition-colors">
            Privacy Policy
          </Link>
        </motion.p>
      </div>
    </div>
  );
}
