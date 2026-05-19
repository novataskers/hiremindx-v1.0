import { NextRequest } from "next/server";

/**
 * Build a Headers object suitable for passing to auth.api.getSession().
 * Ensures the cookie and authorization headers are explicitly forwarded
 * so that session cookies and bearer tokens are available in API routes.
 */
export function buildAuthHeaders(req: NextRequest): Headers {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const authz = req.headers.get("authorization");
  if (authz) h.set("authorization", authz);
  return h;
}
