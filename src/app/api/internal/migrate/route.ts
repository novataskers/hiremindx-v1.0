import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export async function POST() {
  const rawUrl = process.env.TURSO_CONNECTION_URL || "";
  const url = rawUrl.replace(/^libsql:\/\//, "https://");
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || "",
  });

  const statements = [
    `CREATE TABLE IF NOT EXISTS freelancer_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      available_balance INTEGER NOT NULL DEFAULT 0,
      pending_balance INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      total_withdrawn INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL DEFAULT 0,
      net_amount INTEGER NOT NULL,
      contract_id TEXT,
      stripe_payout_id TEXT,
      stripe_transfer_id TEXT,
      description TEXT NOT NULL,
      withdrawal_method TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS escrow_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      freelancer_id TEXT NOT NULL,
      contract_amount INTEGER NOT NULL,
      platform_fee INTEGER NOT NULL DEFAULT 0,
      total_charged INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method_id INTEGER,
      stripe_payment_intent_id TEXT,
      stripe_transfer_id TEXT,
      funded_at TEXT,
      released_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS cancellation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_type TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      cancelled_at TEXT NOT NULL,
      was_within_grace_period INTEGER NOT NULL DEFAULT 0,
      penalty_applied TEXT,
      is_banned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );`,
    `ALTER TABLE community_profiles ADD COLUMN stripe_account_id TEXT;`,
    `ALTER TABLE escrow_transactions ADD COLUMN stripe_charge_id TEXT;`,
    `ALTER TABLE escrow_transactions ADD COLUMN settlement_status TEXT DEFAULT 'pending';`,
    `ALTER TABLE escrow_transactions ADD COLUMN settled_at TEXT;`,
    `ALTER TABLE community_dms ADD COLUMN hidden_for_users TEXT;`,
    `ALTER TABLE community_dms ADD COLUMN visible_to TEXT;`,
  ];

  const results: string[] = [];
  for (const sql of statements) {
    try {
      await client.execute(sql);
      results.push(`Applied: ${sql}`);
    } catch (e: any) {
      if (e.message?.includes("duplicate column") || e.message?.includes("already exists") || e.message?.includes("already has column")) {
        results.push(`Already exists: ${sql}`);
      } else {
        results.push(`Failed: ${sql} — ${e.message}`);
      }
    }
  }

  return NextResponse.json({ results });
}
