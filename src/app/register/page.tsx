"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import { Brain, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/");
    }, 1500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <HeroBackground />
      
      <div className="w-full max-w-md relative z-10 text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-8 border border-primary/20 shadow-2xl shadow-primary/20 animate-pulse">
          <Brain className="w-10 h-10 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Joining HireMindX
          </h1>
          <p className="text-zinc-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Preparing your workspace...
          </p>
        </div>

        <div className="pt-8">
          <div className="h-1 w-32 bg-white/5 mx-auto rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-[loading_1.5s_ease-in-out_infinite]" style={{ width: '40%' }} />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
