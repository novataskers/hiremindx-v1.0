"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { Layers3, Sparkles, Shield, Zap, Crown, Check, Users, Rocket, ChevronRight, Link2, Copy, Gift, Award, Star, Lock } from "lucide-react";
import { toast } from "sonner";
import BetaSignupModal from "@/components/BetaSignupModal";
import SignInModal from "@/components/SignInModal";

type BetaStatus = {
  total: number;
  taken: number;
  remaining: number;
  isFull: boolean;
  isMember: boolean;
  hasPending: boolean;
  memberOrder: number | null;
  memberStatus: string | null;
};

type ReferralData = {
  referralCode: string | null;
  referralUrl: string | null;
  founderNumber: number | null;
  founderStatus: string | null;
  stats: {
    paid: number;
    trialing: number;
    pending: number;
    total: number;
    remaining: number;
  };
  rewards: {
    freeMonthsGranted: number;
    freeMonthsUsed: number;
    freeMonthsPending: number;
    badgeGranted: boolean;
    privateAccessGranted: boolean;
  };
  milestones: {
    tier: number;
    label: string;
    unlocked: boolean;
    reward: string;
    freeMonths: number;
    badge?: boolean;
    privateAccess?: boolean;
  }[];
  referralsList: { id: number; status: string; date: string }[];
};

export default function JoinBetaPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-[100dvh] bg-black flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <JoinBetaContent />
    </Suspense>
  );
}

function JoinBetaContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [betaStatus, setBetaStatus] = useState<BetaStatus | null>(null);
  const [mounted, setMounted] = useState(false);
  const [postCheckout, setPostCheckout] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<string | null>(null);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [referralExpired, setReferralExpired] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Auth gate: require sign-in before opening beta signup
  const handleJoinBetaClick = () => {
    if (isFull) return;
    if (!session?.user) {
      setIsSignInModalOpen(true);
      return;
    }
    setIsModalOpen(true);
  };

  // Static stars
  const stars = useMemo(() => {
    return [...Array(80)].map((_, i) => ({
      id: i,
      top: `${(i * 37.3 + 11.7) % 100}%`,
      left: `${(i * 61.8 + 23.4) % 100}%`,
      opacity: 0.15 + ((i * 0.137) % 0.45),
      size: i % 5 === 0 ? 2 : 1,
    }));
  }, []);

  // Golden sparkle particles
  const sparkles = useMemo(() => {
    return [...Array(24)].map((_, i) => ({
      id: i,
      top: `${(i * 43.7 + 8.2) % 100}%`,
      left: `${(i * 57.3 + 14.9) % 100}%`,
      delay: `${(i * 0.4) % 6}s`,
      duration: `${3 + (i % 4)}s`,
      size: i % 3 === 0 ? 4 : i % 3 === 1 ? 3 : 2,
    }));
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/beta/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBetaStatus(data);
      }
    } catch {
      // Silently fail — will retry
    }
  }, []);

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await fetch("/api/beta/referrals", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setReferralData(data);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Fetch referral data when user is a member
  useEffect(() => {
    if (betaStatus?.isMember) {
      fetchReferrals();
    }
  }, [betaStatus?.isMember, fetchReferrals]);

  // Read referral code from URL first, then cookie fallback.
  // Persist to cookie so the code survives auth redirects.
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setReferralCode(ref);
      document.cookie = `hmx_ref=${encodeURIComponent(ref)}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    } else {
      const match = document.cookie.match(/(?:^|;\s*)hmx_ref=([^;]*)/);
      if (match?.[1]) {
        setReferralCode(decodeURIComponent(match[1]));
      }
    }
  }, [searchParams]);

  // Check for expired referral link from URL
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      fetch(`/api/beta/referral-status?code=${encodeURIComponent(ref)}`)
        .then((res) => {
          if (res.status === 409) {
            setReferralExpired(true);
            toast.error("Referral Link Expired", {
              description: "This referral link has reached its 10-person limit.",
            });
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  // Handle success/cancel from Stripe redirect
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    const order = searchParams.get("order");

    if (success === "1") {
      setPostCheckout(true);
      if (order) setCheckoutOrder(order);
      toast.success("Welcome to the Founding 100!", {
        description: order
          ? `You are member #${order}. Your 14-day free Elite trial has started.`
          : "Your 14-day free Elite trial has started.",
      });
      // Proactively sync beta signup status with Stripe
      const signupEmail = localStorage.getItem("betaSignupEmail");
      if (signupEmail) {
        fetch("/api/beta/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: signupEmail }),
        })
          .then((res) => res.json())
          .then((data) => {
            console.log("[join-beta] Sync result:", data);
            if (data.synced) {
              toast.success("Account activated!", {
                description: `You're now a Founding Member (#${data.signupOrder}).`,
              });
            }
            localStorage.removeItem("betaSignupEmail");
            fetchStatus();
          })
          .catch(() => {
            localStorage.removeItem("betaSignupEmail");
            fetchStatus();
          });
      } else {
        fetchStatus();
      }
      // If already signed in, trigger subscription linking
      if (session?.user) {
        fetch("/api/billing/subscription").catch(() => {});
      }
    }

    if (canceled === "1") {
      toast.info("Checkout canceled", {
        description: "No worries — your spot is still available.",
      });
    }
  }, [searchParams, fetchStatus]);

  if (!mounted) return null;

  const isFull = betaStatus?.isFull ?? false;
  const remaining = betaStatus?.remaining ?? 100;
  const taken = betaStatus?.taken ?? 0;
  const progressPercent = Math.min(100, (taken / 100) * 100);
  const isMember = betaStatus?.isMember ?? false;
  const hasPending = betaStatus?.hasPending ?? false;

  const features = [
    { icon: Zap, text: "Full Elite access — every feature, unlimited" },
    { icon: Shield, text: "14-day free trial — no charge until day 15" },
    { icon: Crown, text: "£9.99/month for life — 50% off forever" },
    { icon: Rocket, text: "Priority AI processing & early feature access" },
    { icon: Users, text: "Founding Member badge on Community" },
    { icon: Sparkles, text: "All future premium features included" },
  ];

  const referralMilestones = [
    { icon: Gift, count: "1", reward: "1 free month", desc: "Get your next Elite month completely free." },
    { icon: Star, count: "5", reward: "3 more free months", desc: "Stack up 4 total free months of Elite." },
    { icon: Award, count: "10", reward: "6 more + Badge + VIP", desc: "10 total free months, permanent Founder Badge, and private Founder Circle access." },
  ];

  return (
    <div
      className="relative min-h-[100dvh] bg-black text-white flex flex-col selection:bg-amber-500/20 overflow-hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* ── CINEMATIC BACKGROUND ── */}
      <div
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
        style={{ animation: "bgFadeInSubtle 2s ease forwards", opacity: 0 }}
      >
        {/* Starfield */}
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              top: star.top,
              left: star.left,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              boxShadow: "0 0 3px 1px rgba(255,255,255,0.15)",
            }}
          />
        ))}

        {/* Golden sparkle particles */}
        {sparkles.map((s) => (
          <div
            key={`sparkle-${s.id}`}
            className="absolute rounded-full"
            style={{
              top: s.top,
              left: s.left,
              width: `${s.size}px`,
              height: `${s.size}px`,
              background: "radial-gradient(circle, #f5d060 0%, #c8960c 60%, transparent 100%)",
              boxShadow: "0 0 6px 2px rgba(245,208,96,0.3)",
              animation: `sparkle-pulse ${s.duration} ${s.delay} ease-in-out infinite`,
            }}
          />
        ))}

        {/* Shooting star trails (golden) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <filter id="beta-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="beta-sg1" gradientUnits="userSpaceOnUse" x1="5" y1="98" x2="90" y2="5">
              <stop offset="0%" stopColor="#c8960c" stopOpacity="0" />
              <stop offset="25%" stopColor="#c8960c" stopOpacity="0.25" />
              <stop offset="55%" stopColor="#d4a017" stopOpacity="0.4" />
              <stop offset="75%" stopColor="#f5d060" stopOpacity="0.5" />
              <stop offset="90%" stopColor="#ffffff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="beta-sg2" gradientUnits="userSpaceOnUse" x1="-8" y1="85" x2="68" y2="-2">
              <stop offset="0%" stopColor="#c8960c" stopOpacity="0" />
              <stop offset="30%" stopColor="#c8960c" stopOpacity="0.18" />
              <stop offset="60%" stopColor="#d4a017" stopOpacity="0.32" />
              <stop offset="85%" stopColor="#f5d060" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="beta-sg3" gradientUnits="userSpaceOnUse" x1="22" y1="102" x2="102" y2="22">
              <stop offset="0%" stopColor="#c8960c" stopOpacity="0" />
              <stop offset="35%" stopColor="#c8960c" stopOpacity="0.15" />
              <stop offset="70%" stopColor="#d4a017" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f5d060" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <line x1="5" y1="98" x2="90" y2="5" stroke="url(#beta-sg1)" strokeWidth="1.2" strokeLinecap="round" filter="url(#beta-glow)" />
          <line x1="-8" y1="85" x2="68" y2="-2" stroke="url(#beta-sg2)" strokeWidth="0.9" strokeLinecap="round" filter="url(#beta-glow)" />
          <line x1="22" y1="102" x2="102" y2="22" stroke="url(#beta-sg3)" strokeWidth="0.7" strokeLinecap="round" filter="url(#beta-glow)" />
        </svg>

        {/* Ambient golden gradient orb */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(200,150,12,0.06) 0%, rgba(200,150,12,0.02) 40%, transparent 70%)",
          }}
        />
      </div>

      {/* ── HEADER ── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-black/80 backdrop-blur-md border-b border-white/[0.04]"
      >
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <Layers3 className="w-5 h-5 text-white" />
          <span className="text-xs font-bold tracking-[0.25em] uppercase text-white/90">
            HireMindX
          </span>
        </button>

        <div className="flex items-center gap-3">
          {!isFull && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/[0.08] border border-amber-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] font-bold tracking-wider uppercase text-amber-400">
                {remaining} spots left
              </span>
            </div>
          )}
        </div>
      </motion.header>

      {/* ── MAIN ── */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto flex flex-col items-center pt-28 sm:pt-36 pb-20 px-4 sm:px-6">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/[0.06] border border-amber-500/15 mb-6"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-amber-400">
            Founding Members Only
          </span>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-6"
        >
          <h1
            className="font-black tracking-tighter text-white leading-[0.95]"
            style={{
              fontSize: "clamp(2.2rem, 8vw, 4.5rem)",
              filter: "drop-shadow(0 0 40px rgba(245,208,96,0.2))",
            }}
          >
            Be One of the
            <br />
            <span className="bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
              First 100
            </span>
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center text-zinc-400 text-sm sm:text-base max-w-xl leading-relaxed mb-8"
        >
          Join the founding members of HireMindX. Get{" "}
          <span className="text-white font-semibold">14 days free</span>, then{" "}
          <span className="text-amber-400 font-semibold">Elite access at 50% off for life</span>.
        </motion.p>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="w-full max-w-md mb-10"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold tracking-wider uppercase text-zinc-500">
              {taken} of 100 claimed
            </span>
            <span className="text-[11px] font-bold tracking-wider uppercase text-amber-400">
              {isFull ? "Full" : `${remaining} remaining`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-900 border border-white/[0.06] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1.2, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #c8960c, #f5d060, #fbbf24)",
                boxShadow: "0 0 12px rgba(245,208,96,0.4)",
              }}
            />
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="flex flex-col items-center gap-3 mb-14 w-full max-w-md"
        >
          {isMember ? (
            /* ── Founder Dashboard ── */
            <div className="w-full max-w-lg">
              {/* Welcome banner */}
              <div className="w-full rounded-2xl border border-green-500/20 bg-green-500/[0.04] p-6 text-center mb-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-bold text-green-400 tracking-wide">
                    You&apos;re a Founding Member{betaStatus?.memberOrder ? ` #${betaStatus.memberOrder}` : ""}!
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Your Elite plan is {betaStatus?.memberStatus === "trialing" ? "in free trial" : "active"} at 50% off for life.
                </p>
              </div>

              {/* Referral link */}
              {referralData?.referralUrl && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5 mb-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold tracking-wider uppercase text-amber-400">Your Referral Link</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-xl bg-black/40 border border-white/[0.08] px-3 py-2 text-[11px] text-zinc-300 font-mono truncate">
                      {referralData.referralUrl}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(referralData.referralUrl!);
                        toast.success("Referral link copied!");
                      }}
                      className="h-8 px-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold tracking-wide hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Stats */}
              {referralData && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="grid grid-cols-3 gap-2 mb-4"
                >
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                    <div className="text-lg font-black text-white">{referralData.stats.paid}</div>
                    <div className="text-[9px] font-bold tracking-wider uppercase text-zinc-500">Paid</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                    <div className="text-lg font-black text-white">{referralData.stats.remaining}</div>
                    <div className="text-[9px] font-bold tracking-wider uppercase text-zinc-500">Left</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                    <div className="text-lg font-black text-amber-400">{referralData.rewards.freeMonthsGranted}</div>
                    <div className="text-[9px] font-bold tracking-wider uppercase text-zinc-500">Free Mo</div>
                  </div>
                </motion.div>
              )}

              {/* Milestones */}
              {referralData?.milestones && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 mb-4"
                >
                  <p className="text-[10px] font-bold tracking-wider uppercase text-zinc-500 mb-3">Referral Milestones</p>
                  <div className="space-y-2">
                    {referralData.milestones.map((m) => (
                      <div
                        key={m.tier}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${
                          m.unlocked
                            ? "border-green-500/20 bg-green-500/[0.04]"
                            : "border-white/[0.05] bg-white/[0.02]"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                            m.unlocked ? "bg-green-500/20 text-green-400" : "bg-white/[0.06] text-zinc-600"
                          }`}
                        >
                          {m.unlocked ? <Check className="w-3.5 h-3.5" /> : <span className="text-[10px] font-bold">{m.tier}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${m.unlocked ? "text-green-400" : "text-zinc-400"}`}>
                            {m.reward}
                          </p>
                          <p className="text-[10px] text-zinc-600">{m.label}</p>
                        </div>
                        {m.badge && m.unlocked && (
                          <Award className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        )}
                        {m.privateAccess && m.unlocked && (
                          <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Go to Premium */}
              <button
                onClick={() => router.push("/premium")}
                className="w-full h-11 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #c8960c, #f5d060)",
                  color: "#000",
                }}
              >
                <Crown className="w-4 h-4" />
                Go to premium page
              </button>
            </div>
          ) : hasPending ? (
            /* ── Pending: payment incomplete ── */
            <div className="w-full rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-orange-400" />
                <span className="text-sm font-bold text-orange-400 tracking-wide">
                  Payment Not Completed
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                Your checkout was started but not finished. Complete payment to secure your spot as a Founding Member.
              </p>
              <button
                onClick={handleJoinBetaClick}
                className="w-full h-11 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #c8960c, #f5d060)",
                  color: "#000",
                }}
              >
                <ChevronRight className="w-4 h-4" />
                Complete Payment
              </button>
            </div>
          ) : postCheckout ? (
            /* ── Post-checkout: prompt to sign in ── */
            <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Check className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-bold text-amber-400 tracking-wide">
                  Payment Successful{checkoutOrder ? ` — You're #${checkoutOrder}` : ""}!
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                {session?.user
                  ? "Your Elite plan is being activated. Head to the dashboard!"
                  : "Sign in with the same email to activate your Elite access."}
              </p>
              <button
                onClick={() => router.push(session?.user ? "/premium" : "/login")}
                className="w-full h-11 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #c8960c, #f5d060)",
                  color: "#000",
                }}
              >
                {session?.user ? (
                  <>
                    <Crown className="w-4 h-4" />
                    Go to premium page
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-4 h-4" />
                    Sign In to Activate
                  </>
                )}
              </button>
            </div>
          ) : (
            /* ── Default signup CTAs ── */
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
              <button
                onClick={handleJoinBetaClick}
                disabled={isFull}
                className="w-full sm:flex-1 h-12 rounded-2xl text-sm font-bold tracking-wide transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #c8960c, #f5d060)",
                  color: "#000",
                  boxShadow: "0 0 24px rgba(245,208,96,0.15)",
                }}
              >
                <Sparkles className="w-4 h-4" />
                {isFull ? "Beta is Full" : "Claim Your Spot"}
              </button>

              <button
                onClick={handleJoinBetaClick}
                disabled={isFull}
                className="w-full sm:flex-1 h-12 rounded-2xl text-sm font-semibold tracking-wide bg-white/[0.06] border border-white/[0.1] text-zinc-200 hover:bg-white/10 hover:text-white transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Crown className="w-4 h-4 text-amber-400" />
                Join the Founding 100
              </button>
            </div>
          )}
        </motion.div>

        {/* Features grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="w-full max-w-2xl"
        >
          <h2 className="text-center text-[11px] font-bold tracking-[0.35em] uppercase text-zinc-500 mb-6">
            What you get
          </h2>

          <div className="grid sm:grid-cols-2 gap-3">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.7 + i * 0.06 }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-zinc-900/50 border border-white/[0.06] hover:border-amber-500/15 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] border border-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <span className="text-xs text-zinc-300 leading-relaxed">{f.text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Referral Rewards pre-signup */}
        {!isMember && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="w-full max-w-2xl mt-14 mb-4"
          >
            <h2 className="text-center text-[11px] font-bold tracking-[0.35em] uppercase text-zinc-500 mb-6">
              Refer Friends & Earn Free Elite
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {referralMilestones.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.9 + i * 0.1 }}
                  className="flex flex-col items-center gap-3 px-5 py-5 rounded-xl bg-zinc-900/50 border border-white/[0.06] hover:border-amber-500/15 transition-colors text-center"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-500/[0.08] border border-amber-500/15 flex items-center justify-center">
                    <m.icon className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white mb-1">{m.count} Referral{m.count !== "1" ? "s" : ""}</p>
                    <p className="text-xs text-amber-400 font-semibold mb-1">{m.reward}</p>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">{m.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Pricing highlight */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.0 }}
          className="mt-14 w-full max-w-md"
        >
          <div className="relative rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-6 text-center">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="text-[10px] font-bold tracking-widest uppercase bg-gradient-to-r from-amber-500 to-yellow-500 text-black px-3 py-1 rounded-full">
                Founding Price
              </span>
            </div>

            <div className="mt-2 mb-3">
              <span className="text-zinc-500 line-through text-lg mr-2">£19.99</span>
              <span className="text-4xl font-black text-white tracking-tighter">£9.99</span>
              <span className="text-sm text-zinc-500 ml-1">/month</span>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              50% off Elite — locked in for life. Starts after 14-day free trial.
            </p>

            {isMember ? (
              <button
                onClick={() => router.push("/premium")}
                className="w-full h-10 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #c8960c, #f5d060)",
                  color: "#000",
                }}
              >
                <Crown className="w-4 h-4" />
                Go to premium page
              </button>
            ) : hasPending ? (
              <button
                onClick={handleJoinBetaClick}
                className="w-full h-10 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #c8960c, #f5d060)",
                  color: "#000",
                }}
              >
                <ChevronRight className="w-4 h-4" />
                Complete Payment
              </button>
            ) : (
              <button
                onClick={handleJoinBetaClick}
                disabled={isFull || postCheckout}
                className="w-full h-10 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: isFull || postCheckout ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #c8960c, #f5d060)",
                  color: isFull || postCheckout ? "#71717a" : "#000",
                }}
              >
                <ChevronRight className="w-4 h-4" />
                {isFull ? "No spots remaining" : postCheckout ? "Payment completed" : "Get Started with Beta Access"}
              </button>
            )}
          </div>
        </motion.div>

        {/* Trust badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06]"
        >
          <Shield className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[10px] text-zinc-500 tracking-wide">
            Secure payment via Stripe. Cancel anytime. No charge for 14 days.
          </span>
        </motion.div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 flex-shrink-0 w-full h-12 flex items-center justify-center gap-5 text-[9px] text-zinc-500 tracking-[0.35em] uppercase border-t border-white/[0.04]">
        <button onClick={() => router.push("/privacy")} className="hover:text-zinc-100 transition-colors">
          Privacy
        </button>
        <span className="text-zinc-700">/</span>
        <button onClick={() => router.push("/terms")} className="hover:text-zinc-100 transition-colors">
          Terms
        </button>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-500">&copy; 2026 HireMindX</span>
      </footer>

      {/* ── BETA SIGNUP MODAL ── */}
      <BetaSignupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        prefillName={session?.user?.name ?? ""}
        prefillEmail={session?.user?.email ?? ""}
        referralCode={referralCode ?? undefined}
      />

      {/* ── SIGN IN MODAL ── */}
      <SignInModal
        isOpen={isSignInModalOpen}
        onClose={() => setIsSignInModalOpen(false)}
        redirectTo="/join-beta"
      />

      {/* ── SPARKLE ANIMATION KEYFRAMES ── */}
      <style jsx global>{`
        @keyframes sparkle-pulse {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
