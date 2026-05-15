import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user, candidateCVs } from "@/db/schema";
import { eq } from "drizzle-orm";

async function seedUser(userId: string, name: string, email: string) {
  const existing = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Reset CVs action
    if (body.action === "reset-cvs") {
      await db.update(candidateCVs).set({ status: "pending", rawText: null });
      return NextResponse.json({ message: "All CVs reset to pending" });
    }

    // Parse the devSession cookie to get the actual user ID being used
    const cookieHeader = request.headers.get("cookie") || "";
    const devCookie = cookieHeader.split(";").find(c => c.trim().startsWith("devSession="));
    let devUserId = "dev-user";
    let devUserEmail = "developer@hiremindx.com";
    let devUserName = "Developer User";
    if (devCookie) {
      try {
        const raw = decodeURIComponent(devCookie.split("=").slice(1).join("="));
        const parsed = JSON.parse(raw);
        if (parsed?.user?.id) devUserId = parsed.user.id;
        if (parsed?.user?.email) devUserEmail = parsed.user.email;
        if (parsed?.user?.name) devUserName = parsed.user.name;
      } catch {}
    }

    // Seed the actual dev user ID (from cookie)
    const seeded = await seedUser(devUserId, devUserName, devUserEmail);
    // Also always seed the fallback "dev-user" for safety
    if (devUserId !== "dev-user") {
      await seedUser("dev-user", "Developer User", "developer@hiremindx.com").catch(() => {});
    }

    return NextResponse.json({ message: "Dev user seeded", user: seeded });
  } catch (error) {
    console.error("Error seeding dev user:", error);
    return NextResponse.json({ error: "Failed to seed dev user" }, { status: 500 });
  }
}
