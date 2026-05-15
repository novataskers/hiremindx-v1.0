"use client";

import { Layers3, LogOut, Crown } from "lucide-react";
import { useSession, authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import SignInModal from "./SignInModal";
import { useState } from "react";

export default function AppHeader() {
  const { data: session, isPending, refetch } = useSession();
  const router = useRouter();
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);

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

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-black/80 backdrop-blur-xl border-b border-white/[0.04]"
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

        <div className="flex items-center gap-4">
          {isPending ? (
            <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
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
              className="h-8 px-4 rounded-full bg-white text-black text-xs font-semibold hover:bg-white/90 transition-all"
            >
              Get started
            </button>
          )}
        </div>
      </motion.header>

      <SignInModal
        isOpen={isSignInModalOpen}
        onClose={() => setIsSignInModalOpen(false)}
      />
    </>
  );
}
