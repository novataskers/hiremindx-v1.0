import { NextRequest, NextResponse } from "next/server";
import { client } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_SECRET = "hiremindx-migrate-2026";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = request.headers.get("x-migration-secret");
  if (secret !== MIGRATION_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];

  const run = async (label: string, query: string) => {
    try {
      await client.execute(query);
      results.push(`✅ ${label}`);
    } catch (e: any) {
      results.push(`❌ ${label}: ${e.message}`);
    }
  };

  try {
    // ── 1. Drop and recreate beta_signups ──
    await run("drop beta_signups", `DROP TABLE IF EXISTS beta_signups`);
    await run("drop idx_beta_email", `DROP INDEX IF EXISTS beta_signups_email_unique`);
    await run("drop idx_beta_refcode", `DROP INDEX IF EXISTS idx_beta_signups_referral_code`);

    await run("beta_signups table", `
      CREATE TABLE beta_signups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        signup_order INTEGER NOT NULL,
        user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        stripe_checkout_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        referral_code TEXT,
        welcome_email_sent INTEGER NOT NULL DEFAULT 0,
        marketing_consent INTEGER NOT NULL DEFAULT 0,
        marketing_consent_at TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await run("idx_beta_email", `CREATE UNIQUE INDEX beta_signups_email_unique ON beta_signups(email)`);
    await run("idx_beta_refcode", `CREATE UNIQUE INDEX idx_beta_signups_referral_code ON beta_signups(referral_code)`);

    // ── 2. Drop and recreate referrals ──
    await run("drop referrals", `DROP TABLE IF EXISTS referrals`);
    await run("drop idx_ref_code_email", `DROP INDEX IF EXISTS idx_referrals_code_email`);
    await run("drop idx_ref_referrer_status", `DROP INDEX IF EXISTS idx_referrals_referrer_status`);

    await run("referrals table", `
      CREATE TABLE referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        referral_code TEXT NOT NULL,
        referred_email TEXT NOT NULL,
        referred_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
        stripe_subscription_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await run("idx_ref_code_email", `CREATE INDEX idx_referrals_code_email ON referrals(referral_code, referred_email)`);
    await run("idx_ref_referrer_status", `CREATE INDEX idx_referrals_referrer_status ON referrals(referrer_id, status)`);

    // ── 3. Drop and recreate founder_rewards ──
    await run("drop founder_rewards", `DROP TABLE IF EXISTS founder_rewards`);
    await run("founder_rewards table", `
      CREATE TABLE founder_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
        free_months_granted INTEGER NOT NULL DEFAULT 0,
        free_months_used INTEGER NOT NULL DEFAULT 0,
        free_months_pending INTEGER NOT NULL DEFAULT 0,
        badge_granted INTEGER NOT NULL DEFAULT 0,
        private_access_granted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // ── 4. Ensure user columns exist (idempotent via ALTER IF NOT EXISTS pattern) ──
    // SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we try/catch
    await run("user.marketing_consent", `ALTER TABLE user ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0`);
    await run("user.marketing_consent_at", `ALTER TABLE user ADD COLUMN marketing_consent_at INTEGER`);

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("[run-migration] failed:", error);
    return NextResponse.json({ error: error.message, results }, { status: 500 });
  }
}
