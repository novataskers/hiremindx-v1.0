import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsageSummary } from "@/lib/usage-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/usage — Get usage summary for the current user
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await getUsageSummary(session.user.id);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[billing/usage] Error:", error);
    return NextResponse.json(
      { error: "Unable to load usage data." },
      { status: 500 }
    );
  }
}
