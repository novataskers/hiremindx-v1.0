"use client";
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Crown, AlertCircle, Clock } from "lucide-react";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function UsageLimitModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [isLifetime, setIsLifetime] = useState(true);
  const [countdown, setCountdown] = useState<string | null>(null);
  const router = useRouter();

  const updateCountdown = useCallback(() => {
    if (!resetAt) {
      setCountdown(null);
      return;
    }
    const remaining = new Date(resetAt).getTime() - Date.now();
    if (remaining <= 0) {
      setCountdown(null);
      setOpen(false);
      return;
    }
    setCountdown(formatCountdown(remaining));
  }, [resetAt]);

  useEffect(() => {
    if (!open || !resetAt || isLifetime) {
      return;
    }
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [open, resetAt, isLifetime, updateCountdown]);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      
      if (response.status === 429) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          if (data && data.limitReached) {
            const usage = data.usage || {};
            window.dispatchEvent(
              new CustomEvent("usage-limit-reached", { 
                detail: { 
                  message: data.error || "You have reached your usage limit for this feature.",
                  resetAt: usage.resetAt || null,
                  isLifetime: usage.isLifetime !== undefined ? usage.isLifetime : true,
                }
              })
            );
          }
        } catch (e) {
          // Ignore json parse errors for non-json responses
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    const handleLimitReached = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail || {};
      setMessage(detail.message || "You have reached your usage limit for this feature.");
      setResetAt(detail.resetAt || null);
      setIsLifetime(detail.isLifetime !== undefined ? detail.isLifetime : true);
      setOpen(true);
    };

    window.addEventListener("usage-limit-reached", handleLimitReached);
    return () => window.removeEventListener("usage-limit-reached", handleLimitReached);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md border-white/10 bg-zinc-950/95 backdrop-blur-xl text-white">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <DialogTitle className="text-center text-xl font-semibold">Usage Limit Reached</DialogTitle>
          <DialogDescription className="text-center text-zinc-400 mt-2">
            {message}
          </DialogDescription>
          {!isLifetime && countdown && (
            <div className="flex items-center justify-center gap-2 mt-4 px-4 py-3 rounded-lg bg-zinc-900/80 border border-zinc-800">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-zinc-300">Limit resets in</span>
              <span className="text-lg font-mono font-bold text-amber-400">{countdown}</span>
            </div>
          )}
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col gap-3 mt-6">
          <Button 
            className="w-full bg-white text-black hover:bg-zinc-200" 
            onClick={() => {
              setOpen(false);
              router.push("/premium");
            }}
          >
            <Crown className="w-4 h-4 mr-2" />
            Upgrade to Premium
          </Button>
          <Button 
            variant="ghost" 
            className="w-full text-zinc-400 hover:text-white"
            onClick={() => setOpen(false)}
          >
            {!isLifetime && countdown ? "Wait for Reset" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
