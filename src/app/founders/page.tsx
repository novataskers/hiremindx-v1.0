"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { Layers3, Lock, Crown, MessageCircle, Users, Shield } from "lucide-react";
import { toast } from "sonner";

export default function FoundersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) {
      router.push("/login");
      return;
    }

    fetch("/api/founders/check-access")
      .then((res) => res.json())
      .then((data) => {
        setHasAccess(data.hasAccess ?? false);
        setLoading(false);
        if (!data.hasAccess) {
          toast.error("Access denied", {
            description: "Private Founder Access is unlocked after 10 successful referrals.",
          });
        }
      })
      .catch(() => {
        setHasAccess(false);
        setLoading(false);
      });
  }, [session, router]);

  if (loading) {
    return (
      <div className="relative min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="relative min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <Lock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h1 className="text-2xl font-black tracking-tight text-white mb-2">Private Founder Access</h1>
          <p className="text-sm text-zinc-400 mb-6">
            This area is exclusive to founders who have unlocked Private Access through 10 successful referrals.
          </p>
          <button
            onClick={() => router.push("/join-beta")}
            className="h-11 px-6 rounded-xl text-sm font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors"
          >
            View Your Referral Progress
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-black/80 backdrop-blur-md border-b border-white/[0.04]">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <Layers3 className="w-5 h-5 text-white" />
          <span className="text-xs font-bold tracking-[0.25em] uppercase text-white/90">HireMindX</span>
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/[0.08] border border-amber-500/20">
          <Crown className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] font-bold tracking-wider uppercase text-amber-400">Founder Circle</span>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto pt-28 pb-20 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1
            className="font-black tracking-tighter text-white mb-3"
            style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", filter: "drop-shadow(0 0 40px rgba(245,208,96,0.2))" }}
          >
            <span className="bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
              Founder Circle
            </span>
          </h1>
          <p className="text-zinc-400 text-sm max-w-lg mx-auto">
            Welcome to the exclusive Founder Circle. Connect with fellow founders, CEOs, and the HireMindX team.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.03] p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <MessageCircle className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Direct Communication</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Private messaging channel with HireMindX founders, CEOs, and key team members. Share ideas, give feedback, and shape the future of the platform.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-bold text-white">Founder Network</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Connect with other founding members. Build relationships, collaborate on projects, and grow your professional network.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 md:col-span-2"
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Priority Support & Early Access</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Get first access to new features, beta tools, and exclusive events. Your feedback directly shapes the product roadmap.
            </p>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
