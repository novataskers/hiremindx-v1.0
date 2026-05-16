import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Admin secret check
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const providedSecret = searchParams.get("secret");
  if (providedSecret !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawUrl = process.env.TURSO_CONNECTION_URL || "";
  const url = rawUrl.replace(/^libsql:\/\//, "https://");
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || "",
  });

  const results: string[] = [];

  // Helper to execute and log
  async function run(sql: string, label: string) {
    try {
      await client.execute(sql);
      results.push(`OK: ${label}`);
    } catch (e: any) {
      results.push(`FAIL: ${label} — ${e.message}`);
    }
  }

  // 1. Drop beta tables (order doesn't matter — no FK between them)
  await run(`DROP TABLE IF EXISTS referrals;`, "Drop referrals");
  await run(`DROP TABLE IF EXISTS founder_rewards;`, "Drop founder_rewards");
  await run(`DROP TABLE IF EXISTS beta_signups;`, "Drop beta_signups");

  // 2. Delete beta_elite subscriptions (but NOT all subscriptions — only beta ones)
  await run(
    `DELETE FROM subscriptions WHERE plan_id = 'beta_elite';`,
    "Delete beta_elite subscriptions"
  );

  // 3. Re-create beta_signups with correct schema
  await run(
    `CREATE TABLE beta_signups (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      signup_order INTEGER NOT NULL,
      user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_checkout_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      referral_code TEXT UNIQUE,
      welcome_email_sent INTEGER NOT NULL DEFAULT 0,
      marketing_consent INTEGER NOT NULL DEFAULT 0,
      marketing_consent_at TEXT,
      created_at TEXT NOT NULL
    );`,
    "Create beta_signups"
  );

  // Unique index on email
  await run(
    `CREATE UNIQUE INDEX beta_signups_email_unique ON beta_signups (email);`,
    "Index beta_signups_email"
  );

  // 4. Re-create referrals
  await run(
    `CREATE TABLE referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      referrer_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      referral_code TEXT NOT NULL,
      referred_email TEXT NOT NULL,
      referred_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
      stripe_subscription_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    "Create referrals"
  );

  // 5. Re-create founder_rewards
  await run(
    `CREATE TABLE founder_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
      free_months_granted INTEGER NOT NULL DEFAULT 0,
      free_months_used INTEGER NOT NULL DEFAULT 0,
      free_months_pending INTEGER NOT NULL DEFAULT 0,
      badge_granted INTEGER NOT NULL DEFAULT 0,
      private_access_granted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    "Create founder_rewards"
  );

  // 6. Verify tables exist by counting
  const verifyTables = ["beta_signups", "referrals", "founder_rewards"];
  for (const table of verifyTables) {
    try {
      const result = await client.execute(`SELECT COUNT(*) as count FROM ${table};`);
      const count = (result.rows[0] as any)?.count ?? "?";
      results.push(`VERIFY: ${table} exists with ${count} rows`);
    } catch (e: any) {
      results.push(`VERIFY FAIL: ${table} — ${e.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    message: "Beta tables reset complete",
    results,
    timestamp: new Date().toISOString(),
  });
}
