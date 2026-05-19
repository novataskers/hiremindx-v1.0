"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";

/**
 * Cleans up stale localStorage keys that are no longer maintained by the app.
 * Runs once on mount to avoid confusing auth state after deployments.
 */
export default function LocalStorageCleanup() {
  const { data: session } = useSession();

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // bearer_token is dead code — the app now uses cookie-based auth
      if (localStorage.getItem("bearer_token")) {
        localStorage.removeItem("bearer_token");
        console.log("[cleanup] Removed stale bearer_token");
      }

      // If the user is authenticated via real auth, devSession is redundant
      if (session?.user && localStorage.getItem("devSession")) {
        localStorage.removeItem("devSession");
        console.log("[cleanup] Removed stale devSession");
      }
    } catch {
      // localStorage access can fail in private mode / restricted contexts
    }
  }, [session]);

  return null;
}
