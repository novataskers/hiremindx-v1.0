import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const hdrs = await headers();

    let userId: string | null = null;
    const session = await auth.api.getSession({ headers: hdrs });
    if (session?.user?.id) {
      userId = session.user.id;
    }

    if (!userId) {
      const cookieStore = await cookies();
      const devSessionCookie = cookieStore.get("devSession");
      if (devSessionCookie) {
        try {
          const devSession = JSON.parse(decodeURIComponent(devSessionCookie.value));
          if (devSession?.user?.id) userId = devSession.user.id;
        } catch {}
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { imageUrl } = await request.json();
    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }

    // Enforce 2MB limit on base64 string (~1.5MB actual)
    if (imageUrl.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 2MB)" }, { status: 400 });
    }

    await db.update(user).set({ image: imageUrl, updatedAt: new Date() }).where(eq(user.id, userId));

    return NextResponse.json({ success: true, imageUrl });
  } catch (error) {
    console.error("Error updating profile image:", error);
    return NextResponse.json({ error: "Failed to update image" }, { status: 500 });
  }
}
