import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { paymentMethods } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — fetch saved Stripe payment methods
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
    }, { status: 500 });
  }
}

// POST — attach a new Stripe PaymentMethod
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePaymentMethodsTable();

    const body = await req.json();
    const { paymentMethodId } = body;

    if (!paymentMethodId) {
      return NextResponse.json({ error: "Missing paymentMethodId" }, { status: 400 });
    }

    const stripe = getStripeClient();

    // Retrieve the PaymentMethod from Stripe to verify it exists
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!pm || pm.object !== "payment_method") {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const card = pm.card;

    // Save to our DB
    const [method] = await db.insert(paymentMethods).values({
      userId: session.user.id,
      type: card ? "credit_card" : "other",
      label: card
        ? `${card.brand?.charAt(0).toUpperCase()}${card.brand?.slice(1)} ending ${card.last4}`
        : "Payment method",
      last4: card?.last4 || null,
      cardBrand: card?.brand || null,
      expiryMonth: card?.exp_month || null,
      expiryYear: card?.exp_year || null,
      accountId: paymentMethodId, // Store Stripe PaymentMethod ID here
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return NextResponse.json({ success: true, paymentMethod: method });
  } catch (error: any) {
    console.error("Error adding payment method:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add payment method" },
      { status: 500 }
    );
  }
}

// PUT — create a SetupIntent for securely saving card details
export async function PUT(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "setup_intent") {
      const stripe = getStripeClient();

      const setupIntent = await stripe.setupIntents.create({
        automatic_payment_methods: { enabled: true },
        metadata: { userId: session.user.id },
      });

      return NextResponse.json({
        clientSecret: setupIntent.client_secret,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error creating setup intent:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create setup intent" },
      { status: 500 }
    );
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
    return NextResponse.json({ error: error?.message || "Failed to delete payment method" }, { status: 500 });
  }
}
