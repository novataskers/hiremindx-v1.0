import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { paymentMethods } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { buildAuthHeaders } from "@/lib/auth-headers";

async function ensurePaymentMethodsTable() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        last4 TEXT,
        card_brand TEXT,
        expiry_month INTEGER,
        expiry_year INTEGER,
        email TEXT,
        account_id TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  } catch (err) {
    console.error("[ensurePaymentMethodsTable] Error creating table:", err);
  }
}

// GET — fetch saved payment methods
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePaymentMethodsTable();
    const methods = await db.select().from(paymentMethods)
      .where(eq(paymentMethods.userId, session.user.id))
      .orderBy(desc(paymentMethods.createdAt));

    return NextResponse.json({ paymentMethods: methods });
  } catch (error: any) {
    console.error("Error fetching payment methods:", error);
    return NextResponse.json({
      error: error?.message || "Failed to fetch payment methods",
      detail: "Database table may be missing. Please try again.",
    }, { status: 500 });
  }
}

// POST — add a new payment method
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePaymentMethodsTable();

    const body = await req.json();
    const { type, label, last4, cardBrand, expiryMonth, expiryYear, email, accountId, isDefault } = body;

    if (!type || !label) {
      return NextResponse.json({ error: "Missing required fields (type, label)" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // If setting as default, unset all others
    if (isDefault) {
      await db.update(paymentMethods)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(paymentMethods.userId, session.user.id));
    }

    // Check if this is the first method — auto-set as default
    const existing = await db.select().from(paymentMethods)
      .where(eq(paymentMethods.userId, session.user.id));
    const shouldBeDefault = Boolean(isDefault) || existing.length === 0;

    const [method] = await db.insert(paymentMethods).values({
      userId: session.user.id,
      type,
      label,
      last4: last4 || null,
      cardBrand: cardBrand || null,
      expiryMonth: expiryMonth || null,
      expiryYear: expiryYear || null,
      email: email || null,
      accountId: accountId || null,
      isDefault: shouldBeDefault,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return NextResponse.json({ paymentMethod: method });
  } catch (error: any) {
    console.error("Error adding payment method:", error);
    return NextResponse.json({
      error: error?.message || "Failed to add payment method",
      detail: "Database error. Please try again or contact support.",
    }, { status: 500 });
  }
}

// DELETE — remove a payment method
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePaymentMethodsTable();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing payment method id" }, { status: 400 });
    }

    await db.delete(paymentMethods)
      .where(and(
        eq(paymentMethods.id, Number(id)),
        eq(paymentMethods.userId, session.user.id),
      ));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting payment method:", error);
    return NextResponse.json({
      error: error?.message || "Failed to delete payment method",
    }, { status: 500 });
  }
}
