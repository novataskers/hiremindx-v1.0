"use client"
import { createAuthClient } from "better-auth/react"
import { useEffect, useState } from "react"

export const authClient = createAuthClient({
  // Use a stable configured base URL when available.
  // This prevents better-auth rejecting requests when browser origin != server trustedOrigins.
  baseURL:
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : undefined),
  fetchOptions: {
    onError: (ctx) => {
      console.error("Auth Error:", ctx.error);
    },
  },
});

export const { useSession, signIn, signOut, signUp } = authClient;
