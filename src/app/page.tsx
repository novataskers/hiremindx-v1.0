"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Briefcase, Users, ChevronRight, LogOut, Crown, Layers3 } from "lucide-react";
import { useSession, authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { motion } from "framer-motion";
import SignInModal from "@/components/SignInModal";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { icon: Search,        label: "Assist",     href: "/assist",    width: 280 },
  { icon: Briefcase,     label: "Match",      href: "/match",     width: 360 },
  { icon: Users,         label: "Community",  href: "/community", width: 440 },
];

export default function Home() {
  const { data: session, isPending, refetch } = useSession();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [redirectTo, setRedirectTo] = useState("/");

  // Memoize static stars to prevent re-randomizing on every render
  const stars = useMemo(() => {
    return [...Array(60)].map((_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      opacity: 0.2 + Math.random() * 0.4,
    }));
  }, []);

  useEffect(() => {
    setMounted(true);
    setTheme("dark");
  }, [setTheme]);

  if (!mounted) return null;

  const handleSignOut = async () => {
    const { error } = await authClient.signOut();
    if (error?.code) {
      toast.error("Failed to sign out");
    } else {
      localStorage.removeItem("bearer_token");
      refetch();
      router.push("/");
      toast.success("Signed out successfully");
    }
  };

  const handleNavClick = (href: string) => {
    const isSignedIn = session?.user || localStorage.getItem("devSession");
    if (isSignedIn) {
      router.push(href);
    } else {
      setRedirectTo(href);
      setIsSignInModalOpen(true);
    }
  };

    return (
    <div className="relative h-[100dvh] bg-black text-white flex flex-col items-center selection:bg-white/10 overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* ── BACKGROUND ── */}
      <div
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
          style={{ animation: 'bgFadeInSubtle 2s ease forwards', opacity: 0 }}
      >
        {/* Stars (static) */}
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute w-[1px] h-[1px] bg-white rounded-full"
            style={{
              top: star.top,
              left: star.left,
              opacity: star.opacity,
              boxShadow: '0 0 2px 1px rgba(255,255,255,0.15)'
            }}
          />
        ))}

        {/* Shooting star trails — static SVG, fade-in via parent */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            {/* Soft glow filter — applied only to the lines, not the whole page */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
              <linearGradient id="sg1" gradientUnits="userSpaceOnUse" x1="5" y1="98" x2="90" y2="5">
                <stop offset="0%"   stopColor="#c8960c" stopOpacity="0" />
                <stop offset="25%"  stopColor="#c8960c" stopOpacity="0.2" />
                <stop offset="55%"  stopColor="#d4a017" stopOpacity="0.35" />
                <stop offset="75%"  stopColor="#f5d060" stopOpacity="0.45" />
                <stop offset="90%"  stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
              </linearGradient>
              <linearGradient id="sg2" gradientUnits="userSpaceOnUse" x1="-8" y1="85" x2="68" y2="-2">
                <stop offset="0%"   stopColor="#c8960c" stopOpacity="0" />
                <stop offset="30%"  stopColor="#c8960c" stopOpacity="0.15" />
                <stop offset="60%"  stopColor="#d4a017" stopOpacity="0.28" />
                <stop offset="85%"  stopColor="#f5d060" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
              </linearGradient>
              <linearGradient id="sg3" gradientUnits="userSpaceOnUse" x1="22" y1="102" x2="102" y2="22">
                <stop offset="0%"   stopColor="#c8960c" stopOpacity="0" />
                <stop offset="35%"  stopColor="#c8960c" stopOpacity="0.12" />
                <stop offset="70%"  stopColor="#d4a017" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#f5d060" stopOpacity="0.12" />
              </linearGradient>
              <linearGradient id="sg4" gradientUnits="userSpaceOnUse" x1="42" y1="100" x2="108" y2="32">
                <stop offset="0%"   stopColor="#c8960c" stopOpacity="0" />
                <stop offset="50%"  stopColor="#c8960c" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#d4a017" stopOpacity="0.08" />
              </linearGradient>
          </defs>
          <line x1="5"  y1="98"  x2="90"  y2="5"  stroke="url(#sg1)" strokeWidth="1.2" strokeLinecap="round" filter="url(#glow)" />
          <line x1="-8" y1="85"  x2="68"  y2="-2" stroke="url(#sg2)" strokeWidth="0.9" strokeLinecap="round" filter="url(#glow)" />
          <line x1="22" y1="102" x2="102" y2="22" stroke="url(#sg3)" strokeWidth="0.7" strokeLinecap="round" filter="url(#glow)" />
          <line x1="42" y1="100" x2="108" y2="32" stroke="url(#sg4)" strokeWidth="0.5" strokeLinecap="round" filter="url(#glow)" />
        </svg>
      </div>

      {/* ── HEADER ── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-black border-b border-white/[0.04]"
      >
        <div className="flex items-center gap-2.5">
          <Layers3 className="w-5 h-5 text-white" />
          <span className="text-xs font-bold tracking-[0.25em] uppercase text-white/90">
            HireMindX
          </span>
        </div>

        <div className="flex items-center gap-4">
            {isPending ? (
              <div className="w-8 h-8 rounded-full bg-zinc-900 animate-pulse" />
              ) : session?.user ? (
                  <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <button className="h-8 w-8 rounded-full ring-1 ring-white/60 transition-all focus:outline-none p-0 bg-zinc-900 overflow-hidden">
                          <Avatar className="h-full w-full rounded-full">
                          <AvatarFallback className="bg-zinc-900 text-white text-[10px] font-bold">
                            {session.user.name?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 bg-zinc-950 border border-white/[0.08] text-zinc-100 p-1.5 shadow-2xl"
              >
                <DropdownMenuLabel className="px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-white">{session.user.name}</p>
                    <p className="text-[10px] text-zinc-500 font-normal truncate">{session.user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/[0.06] my-1.5" />
                <DropdownMenuItem
                  onClick={() => router.push("/premium")}
                  className="cursor-pointer text-zinc-300 hover:text-white hover:bg-white/5 rounded-md px-3 py-2 transition-colors text-xs"
                >
                  <Crown className="w-3.5 h-3.5 mr-2.5 text-yellow-500" />
                  Premium
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/[0.06] my-1.5" />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="cursor-pointer text-zinc-400 hover:text-white hover:bg-white/5 rounded-md px-3 py-2 transition-colors text-xs"
                >
                  <LogOut className="w-3.5 h-3.5 mr-2.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              onClick={() => setIsSignInModalOpen(true)}
              className="h-8 px-4 rounded-lg text-[10px] font-bold bg-white text-black hover:bg-zinc-200 transition-colors tracking-widest uppercase"
            >
              Sign in
            </button>
          )}
        </div>
      </motion.header>

      {/* ── MAIN ── */}
      <main className="relative z-10 flex-1 w-full max-w-screen-xl flex flex-col items-center justify-center pt-16 px-4 sm:px-6 overflow-hidden">
        
        {/* Title Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 mb-6 sm:mb-12 text-center"
        >
          <h1
            className="font-black tracking-tighter text-white"
            style={{
              fontSize: "clamp(2rem, 10vw, 5.5rem)",
              filter: "drop-shadow(0 0 30px rgba(255,255,255,0.4))",
            }}
          >
            HireMindX
          </h1>
          <p className="mt-2 sm:mt-4 text-zinc-400 text-[9px] sm:text-[10px] tracking-[0.4em] uppercase font-semibold">
            Autonomous Intelligence for Professionals
          </p>
        </motion.div>

        {/* ── NAV FUNNEL (expanding down) ── */}
        <div className="flex flex-col items-center gap-2.5 sm:gap-3.5 w-full">
          {navItems.map((item, i) => (
            <motion.button
              key={item.href}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.2 + i * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
              onClick={() => handleNavClick(item.href)}
              style={{ width: `min(${item.width}px, 92vw)` }}
              className="group flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 rounded-2xl bg-zinc-900/50 border border-white/[0.08] hover:bg-zinc-900/80 hover:border-white/10 transition-all duration-300 shadow-xl"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400 group-hover:text-white transition-colors duration-300" />
                <span className="text-sm sm:text-[15px] font-semibold text-zinc-200 group-hover:text-white transition-colors duration-300 tracking-tight">
                  {item.label}
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-700 group-hover:text-white group-hover:translate-x-0.5 transition-all duration-300" />
            </motion.button>
          ))}
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 flex-shrink-0 w-full h-12 flex items-center justify-center gap-5 text-[9px] text-zinc-400 tracking-[0.35em] uppercase border-t border-white/[0.04]">
        <button onClick={() => router.push("/privacy")} className="hover:text-zinc-100 transition-colors">
          Privacy
        </button>
        <span className="text-zinc-700">/</span>
        <button onClick={() => router.push("/terms")} className="hover:text-zinc-100 transition-colors">
          Terms
        </button>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-400">© 2026 HireMindX</span>
      </footer>

      <SignInModal
        isOpen={isSignInModalOpen}
        onClose={() => setIsSignInModalOpen(false)}
        redirectTo={redirectTo}
      />
    </div>
  );
}
