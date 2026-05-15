"use client"
import { createAuthClient } from "better-auth/react"
import { useEffect, useState } from "react"

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL,
  fetchOptions: {
    onError: (ctx) => {
      console.error("Auth Error:", ctx.error);
    }
  }
});

export const { useSession, signIn, signOut, signUp } = authClient;