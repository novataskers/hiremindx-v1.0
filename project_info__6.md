# HireMindX (v1.0) — Codebase Overview & Fix Target for “Google/Microsoft sign-in does nothing”

## Summary
This Next.js project uses **better-auth** for authentication. The Google/Microsoft buttons are implemented in `src/components/SignInModal.tsx` and start OAuth via `authClient.signIn.social(...)` from `src/lib/auth-client.ts`, which calls the better-auth handlers mounted at `src/app/api/auth/[...all]/route.ts`.

## The most likely root cause
### better-auth **trustedOrigins** does not include your real browser origin
- Client base URL is derived dynamically from the browser:
  - `src/lib/auth-client.ts`: `baseURL: window.location.origin`
- Server only trusts a hardcoded allowlist:
  - `src/lib/auth.ts` `trustedOrigins`:
    - `http://localhost:3000`
    - `http://192.168.1.102:3000`
    - `https://hiremindx.com`
    - `https://www.hiremindx.com`

If you’re running the app from any other origin (different port, Vercel preview domain, different local hostname, etc.), better-auth can reject the social-sign-in initiation request. Because the UI just shows a generic toast (and you may not be checking network/console), it can feel like the click “does nothing”.

## Secondary common cause
### OAuth credentials are empty at runtime
In `src/lib/auth.ts`, provider creds are set as:
- `clientId: process.env.GOOGLE_CLIENT_ID || ""`
- `clientSecret: process.env.GOOGLE_CLIENT_SECRET || ""`
(and similarly for Microsoft)

If those env vars aren’t present where the app is running, OAuth initiation will fail (often with `invalid_client`), again potentially without a clear UI symptom beyond the generic error.

## What to do next (fastest confirmation)
1. Click **Continue with Google/Microsoft**
2. Open **DevTools → Network**
3. Look for any request hitting the auth route (`/api/auth/...`-style paths under the better-auth handler)
4. If it exists, check the HTTP status/response body:
   - origin/trust errors → `trustedOrigins` mismatch
   - invalid_client / OAuth error → missing/empty env vars

## Single actionable fix direction
Add the exact origin you’re using in the browser (the value of `window.location.origin`) to `trustedOrigins` in `src/lib/auth.ts`, and ensure the corresponding `GOOGLE_*` / `MICROSOFT_*` env vars are set in the same runtime environment.