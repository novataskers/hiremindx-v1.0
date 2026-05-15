"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError("No invitation token found.");
      return;
    }

    const processJoin = async () => {
      try {
        // First check if user is logged in
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) {
          // Redirect to login if not authenticated
          const currentPath = window.location.pathname + window.location.search;
            router.push("/");
          return;
        }

        const res = await fetch("/api/chat/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });

        const data = await res.json();

        if (res.ok) {
          setStatus('success');
          toast.success("Joined conversation successfully!");
          setTimeout(() => {
            router.push("/community");
          }, 2000);
        } else {
          setStatus('error');
          setError(data.error || "Failed to join conversation.");
        }
      } catch (err) {
        console.error("Join error:", err);
        setStatus('error');
        setError("An unexpected error occurred.");
      }
    };

    processJoin();
  }, [token, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
      {status === 'loading' && (
        <div className="space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <h2 className="text-xl font-bold">Joining Conversation...</h2>
          <p className="text-muted-foreground">Please wait while we process your invitation.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold">Success!</h2>
          <p className="text-muted-foreground">You've successfully joined the chat. Redirecting you to the community page...</p>
          <Button onClick={() => router.push("/community")}>Go to Community</Button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">Unable to Join</h2>
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-muted-foreground text-sm">This link might be invalid, expired, or you may have already used it.</p>
          <div className="pt-4 space-x-2">
            <Button variant="outline" onClick={() => router.push("/")}>Home</Button>
            <Button onClick={() => router.push("/community")}>Go to Community</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JoinChatPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center pt-20">
        <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin" />}>
          <JoinContent />
        </Suspense>
      </div>
    </div>
  );
}
