import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getEmailToken } from "@/lib/google-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailToken = await getEmailToken(session.user.id);

    if (!emailToken) {
      return NextResponse.json({ 
        error: "Email connection expired or missing",
        hasEmailAccess: false,
        hasGmailAccess: false,
      }, { status: 404 });
    }

    return NextResponse.json({
      accessToken: emailToken.accessToken,
      provider: emailToken.provider,
      hasEmailAccess: true,
      hasGmailAccess: emailToken.provider === "google",
    });

  } catch (error) {
    console.error("Error fetching email token:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
