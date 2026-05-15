import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  const devSession = request.cookies.get("devSession");
  
    if (!session && !devSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  
  return NextResponse.next();
}

export const config = {
  matcher: ["/applications", "/job-feed", "/messages", "/settings", "/orchestrator", "/log"],
};