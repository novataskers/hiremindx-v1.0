import { NextRequest, NextResponse } from "next/server";
import { client } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_SECRET = "hiremindx-migrate-2026";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const secret = request.headers.get("x-migration-secret");
    if (secret !== MIGRATION_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results: string[] = [];

    // Helper to run SQL and track results
    const run = async (label: string, query: string) => {
      try {
        await client.execute(query);
        results.push(`✅ ${label}`);
      } catch (e: any) {
        if (e.message?.includes("duplicate column") || e.message?.includes("already exists")) {
          results.push(`⏭️ ${label} (already applied)`);
        } else {
          results.push(`❌ ${label}: ${e.message}`);
        }
      }
    };

    // 1. user table
    await run("user.marketing_consent", `ALTER TABLE user ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0`);
    await run("user.marketing_consent_at", `ALTER TABLE user ADD COLUMN marketing_consent_at INTEGER`);

    // 2. beta_signups table
    await run("beta_signups.referral_code", `ALTER TABLE beta_signups ADD COLUMN referral_code TEXT`);
    await run("beta_signups.welcome_email_sent", `ALTER TABLE beta_signups ADD COLUMN welcome_email_sent INTEGER NOT NULL DEFAULT 0`);
    await run("beta_signups.marketing_consent", `ALTER TABLE beta_signups ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0`);
    await run("beta_signups.marketing_consent_at", `ALTER TABLE beta_signups ADD COLUMN marketing_consent_at TEXT`);
    await run("idx_beta_signups_referral_code", `CREATE UNIQUE INDEX idx_beta_signups_referral_code ON beta_signups(referral_code)`);

    // 3. referrals table
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
    await run("idx_referrals_code_email", `CREATE INDEX idx_referrals_code_email ON referrals(referral_code, referred_email)`);
    await run("idx_referrals_referrer_status", `CREATE INDEX idx_referrals_referrer_status ON referrals(referrer_id, status)`);

    // 4. founder_rewards table
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

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("[run-migration] failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
