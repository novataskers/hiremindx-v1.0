import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_CONNECTION_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN || "fallback_token",
});

async function migrate() {
  console.log("[migrate] Starting migration...");

  try {
    // 1. Add columns to user table
    try {
      await client.execute(`ALTER TABLE user ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0`);
      console.log("[migrate] Added marketing_consent to user");
    } catch (e) {
      if (e.message?.includes("duplicate column")) console.log("[migrate] marketing_consent already exists on user");
      else console.error("[migrate] user marketing_consent:", e.message);
    }

    try {
      await client.execute(`ALTER TABLE user ADD COLUMN marketing_consent_at INTEGER`);
      console.log("[migrate] Added marketing_consent_at to user");
    } catch (e) {
      if (e.message?.includes("duplicate column")) console.log("[migrate] marketing_consent_at already exists on user");
      else console.error("[migrate] user marketing_consent_at:", e.message);
    }

    // 2. Add columns to beta_signups table
    try {
      await client.execute(`ALTER TABLE beta_signups ADD COLUMN referral_code TEXT`);
      console.log("[migrate] Added referral_code to beta_signups");
    } catch (e) {
      if (e.message?.includes("duplicate column")) console.log("[migrate] referral_code already exists on beta_signups");
      else console.error("[migrate] beta_signups referral_code:", e.message);
    }

    try {
      await client.execute(`ALTER TABLE beta_signups ADD COLUMN welcome_email_sent INTEGER NOT NULL DEFAULT 0`);
      console.log("[migrate] Added welcome_email_sent to beta_signups");
    } catch (e) {
      if (e.message?.includes("duplicate column")) console.log("[migrate] welcome_email_sent already exists on beta_signups");
      else console.error("[migrate] beta_signups welcome_email_sent:", e.message);
    }

    try {
      await client.execute(`ALTER TABLE beta_signups ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0`);
      console.log("[migrate] Added marketing_consent to beta_signups");
    } catch (e) {
      if (e.message?.includes("duplicate column")) console.log("[migrate] marketing_consent already exists on beta_signups");
      else console.error("[migrate] beta_signups marketing_consent:", e.message);
    }

    try {
      await client.execute(`ALTER TABLE beta_signups ADD COLUMN marketing_consent_at TEXT`);
      console.log("[migrate] Added marketing_consent_at to beta_signups");
    } catch (e) {
      if (e.message?.includes("duplicate column")) console.log("[migrate] marketing_consent_at already exists on beta_signups");
      else console.error("[migrate] beta_signups marketing_consent_at:", e.message);
    }

    // Create unique index for referral_code on beta_signups
    try {
      await client.execute(`CREATE UNIQUE INDEX idx_beta_signups_referral_code ON beta_signups(referral_code)`);
      console.log("[migrate] Created unique index for referral_code");
    } catch (e) {
      if (e.message?.includes("already exists")) console.log("[migrate] idx_beta_signups_referral_code already exists");
      else console.error("[migrate] referral_code index:", e.message);
    }

    // 3. Create referrals table
    try {
      await client.execute(`
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
      console.log("[migrate] Created referrals table");
    } catch (e) {
      if (e.message?.includes("already exists")) console.log("[migrate] referrals table already exists");
      else console.error("[migrate] referrals table:", e.message);
    }

    // Create index on referrals for faster lookups
    try {
      await client.execute(`CREATE INDEX idx_referrals_code_email ON referrals(referral_code, referred_email)`);
      console.log("[migrate] Created idx_referrals_code_email");
    } catch (e) {
      if (e.message?.includes("already exists")) console.log("[migrate] idx_referrals_code_email already exists");
      else console.error("[migrate] referrals code_email index:", e.message);
    }

    try {
      await client.execute(`CREATE INDEX idx_referrals_referrer_status ON referrals(referrer_id, status)`);
      console.log("[migrate] Created idx_referrals_referrer_status");
    } catch (e) {
      if (e.message?.includes("already exists")) console.log("[migrate] idx_referrals_referrer_status already exists");
      else console.error("[migrate] referrals referrer_status index:", e.message);
    }

    // 4. Create founder_rewards table
    try {
      await client.execute(`
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
      console.log("[migrate] Created founder_rewards table");
    } catch (e) {
      if (e.message?.includes("already exists")) console.log("[migrate] founder_rewards table already exists");
      else console.error("[migrate] founder_rewards table:", e.message);
    }

    console.log("[migrate] Migration completed successfully!");
  } catch (error) {
    console.error("[migrate] Fatal error:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrate();
