import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { founderRewards } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rewardRows = await db
      .select({ privateAccessGranted: founderRewards.privateAccessGranted })
      .from(founderRewards)
      .where(eq(founderRewards.userId, session.user.id))
      .limit(1);

    return NextResponse.json({
      hasAccess: rewardRows[0]?.privateAccessGranted ?? false,
    });
  } catch (error) {
    console.error("[founders-check-access] failed:", error);
    return NextResponse.json({ hasAccess: false }, { status: 500 });
  }
}
