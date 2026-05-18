# HireMindX (v1.0) — Codebase Overview & Fix Target for “Google/Microsoft sign-in does nothing”

## Summary
This Next.js project uses **better-auth** for authentication. The Google/Microsoft buttons are implemented in `src/components/SignInModal.tsx` and start OAuth via `authClient.signIn.social(...)` from `src/lib/auth-client.ts`, which talks to the better-auth handlers mounted at `src/app/api/auth/[...all]/route.ts`.

Given the current code, the most likely reason “clicking Google or Microsoft does nothing” is that the browser origin used by `authClient` is **not exactly allowed** by the server-side `trustedOrigins` list in `src/lib/auth.ts`, causing better-auth to reject the OAuth initiation request. A secondary common cause is missing OAuth credentials (clientId/clientSecret empty strings) leading to an immediate OAuth error response.

## Architecture
- **Primary pattern**: App Router + route-handler backend + client-side auth SDK.
- **Subsystems**:
  - `src/lib/auth.ts`: better-auth server configuration (baseURL, trustedOrigins, social provider config, DB adapter).
  - `src/app/api/auth/[...all]/route.ts`: bridges better-auth to Next.js by exporting `GET`/`POST` handlers from `toNextJsHandler(auth)`.
  - `src/lib/auth-client.ts`: browser auth client created with `createAuthClient`, using `window.location.origin` as `baseURL`.
  - `src/components/SignInModal.tsx`: UI click handlers that call `authClient.signIn.social` with scopes and callback URLs.
- **Execution start**:
  1. User clicks “Continue with Google/Microsoft” in `SignInModal`.
  2. `authClient.signIn.social(...)` makes an HTTP call to better-auth endpoints on the `baseURL`.
  3. better-auth validates origin/trust and social provider configuration, then starts OAuth and redirects/returns an error.

## Directory Structure (auth-relevant)
```text
src/
  components/
    SignInModal.tsx                — social sign-in click handlers
  lib/
    auth-client.ts                — better-auth client (browser)
    auth.ts                       — better-auth configuration (trustedOrigins, providers)
    google-auth.ts               — email-token helpers (not used for OAuth initiation UI)
  app/
    api/auth/
      [...all]/route.ts           — better-auth route handler bridge
```

## Key Abstractions

### better-auth server (`auth`)
- **File**: `src/lib/auth.ts`
- **Responsibility**: Owns runtime configuration:
  - `baseURL` (computed by `getBaseURL()`)
  - `trustedOrigins` allowlist
  - OAuth provider client IDs/secrets & scopes
  - DB adapter tables
- **Interface**: `export const auth = betterAuth({...})`
- **Lifecycle**: Created at module load; used by route handler bridge.
- **Used by**: `src/app/api/auth/[...all]/route.ts`, plus `middleware.ts` via `auth.api.getSession`.

### Auth client (`authClient`)
- **File**: `src/lib/auth-client.ts`
- **Responsibility**: Browser-side OAuth starter; defines what origin is used for requests.
- **Interface**:
  - `createAuthClient({ baseURL: window.location.origin | NEXT_PUBLIC_SITE_URL, fetchOptions: { onError } })`
  - exports `signIn`, `signOut`, `useSession`, `signUp`
- **Lifecycle**: Created on client bundle load.
- **Used by**: `src/components/SignInModal.tsx` for `signIn.social(...)`.

### Social sign-in UI
- **File**: `src/components/SignInModal.tsx`
- **Responsibility**: Initiates OAuth with correct provider, callback URL, error callback URL, and explicit scopes.
- **Interface**:
  - `handleGoogleSignIn()` → `authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL, scopes })`
  - `handleMicrosoftSignIn()` → `authClient.signIn.social({ provider: "microsoft", ... })`
- **Lifecycle**: Only exists while modal is mounted/open.
- **Used by**: Whatever page renders the modal (not inspected yet).

### Auth route handler bridge
- **File**: `src/app/api/auth/[...all]/route.ts`
- **Responsibility**: Registers better-auth endpoints into Next.js for all `/api/auth/*` subpaths.
- **Interface**:
  - `export const { POST, GET } = toNextJsHandler(auth);`
- **Used by**: Browser requests initiated by `authClient`.

## Data Flow (Google/Microsoft)
1. User clicks provider button in `src/components/SignInModal.tsx`.
2. Handler calls `authClient.signIn.social(...)` in `src/lib/auth-client.ts`.
3. The auth client sends the request to better-auth using `baseURL` derived from `window.location.origin`.
4. better-auth route handler at `src/app/api/auth/[...all]/route.ts` receives the request.
5. better-auth checks configuration:
   - whether the request origin is in `trustedOrigins` (`src/lib/auth.ts`)
   - whether social provider `clientId/clientSecret` are non-empty
6. If accepted: OAuth begins and the user is redirected to the provider.
7. If rejected/invalid: better-auth returns an error response. Because the UI primarily shows a toast on thrown errors, “does nothing” often indicates either (a) the browser isn’t reaching the endpoint, or (b) the client call fails silently without a visible console/network trace.

## Non-Obvious Behaviors & Design Decisions (the important part)

### Primary invariant: `trustedOrigins` must match the *exact* browser origin
- **What the code does**:
  - Client uses `window.location.origin` as better-auth `baseURL` (`auth-client.ts`).
  - Server only trusts these origins (`auth.ts`):
    - `http://localhost:3000`
    - `http://192.168.1.102:3000`
    - `https://hiremindx.com`
    - `https://www.hiremindx.com`
- **Why this can look like “click does nothing”**:
  - If you run the app on any other origin (common examples: another port, `localhost:3001`, staging domain, Vercel preview URL, custom local hostname, etc.), the OAuth initiation request can be rejected by better-auth due to origin trust.
  - The UI handlers do not log the *HTTP response body*—they only toast “Failed to sign in…” when an exception is thrown. Depending on better-auth’s client behavior, you may see no redirect and minimal visible UI feedback.

### Secondary failure mode: OAuth provider credentials may be empty at runtime
- **What the code does**:
  - `clientId: process.env.GOOGLE_CLIENT_ID || ""` and similarly for secrets.
- **Meaning**:
  - If the deployed environment doesn’t include these env vars, better-auth may reject the social flow or the OAuth provider may return `invalid_client`.
  - This frequently presents as “button click does nothing” unless you inspect console/network.

### Related observation: middleware does not affect OAuth initiation
- `middleware.ts` redirects unauthenticated users to `/`, but its matcher only includes:
  `/applications`, `/job-feed`, `/messages`, `/settings`, `/orchestrator`, `/log`.
- Therefore, the lack of redirect on OAuth click is unlikely to be caused by middleware.

## Module Reference
| File | Purpose |
|------|---------|
| `src/components/SignInModal.tsx` | Button click handlers that start social sign-in |
| `src/lib/auth-client.ts` | better-auth client configuration used in browser |
| `src/lib/auth.ts` | better-auth server config: baseURL, trustedOrigins, social providers |
| `src/app/api/auth/[...all]/route.ts` | Next.js route handler bridge for better-auth |
| `middleware.ts` | Protects a small set of routes; not directly tied to sign-in |

## Suggested Reading Order
1. `src/components/SignInModal.tsx` (see exactly what is called on click)
2. `src/lib/auth-client.ts` (see what baseURL the client uses)
3. `src/lib/auth.ts` (see what origins are trusted and provider env var requirements)
4. `src/app/api/auth/[...all]/route.ts` (confirm the endpoint wiring exists)

## “All at once” Root-Cause Conclusion
**Most likely root cause:** your deployment origin (where the user is clicking from) is not present in `trustedOrigins` in `src/lib/auth.ts`, so better-auth rejects the social sign-in initiation request.  
**How to confirm in 30 seconds:** after clicking Google/Microsoft, check DevTools → Network for an auth request (to `.../api/auth/...` or similar). If present, look for a 4xx response complaining about origin/trust; if no request happens, the call may be failing before network (less likely given the code).

Once you confirm the browser origin that fails, the fix is to add that exact origin to `trustedOrigins` (and ensure OAuth env vars are set in that environment).
