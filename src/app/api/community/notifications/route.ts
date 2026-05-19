import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { buildAuthHeaders } from "@/lib/auth-headers";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const list = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, session.user.id))
      .orderBy(desc(notifications.createdAt));
    return NextResponse.json({ notifications: list });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { userId, type, title, message, actionUrl } = await req.json();
    if (!userId || !title || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const [newNotification] = await db.insert(notifications).values({
      userId,
      type: type || "alert",
      title,
      message,
      actionUrl,
      isRead: false,
      createdAt: new Date().toISOString(),
    }).returning();

    return NextResponse.json({ notification: newNotification });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { notificationId } = await req.json();
    if (!notificationId) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.id, Number(notificationId)),
        eq(notifications.userId, session.user.id)
      ))
      .returning();

    return NextResponse.json({ notification: updated });
  } catch (error) {
    return NextResponse.json({ error: "Failed to read notification" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.delete(notifications).where(eq(notifications.userId, session.user.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
  }
}
