import { createClient } from '@libsql/client';

const rawUrl = process.env.TURSO_CONNECTION_URL || "";
const url = rawUrl.replace(/^libsql:\/\//, "https://");

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || "",
});

async function main() {
  const statements = [
    `ALTER TABLE community_profiles ADD COLUMN stripe_account_id TEXT;`,
    `ALTER TABLE wallet_transactions ADD COLUMN stripe_transfer_id TEXT;`,
    `ALTER TABLE escrow_transactions ADD COLUMN stripe_transfer_id TEXT;`,
  ];

  for (const sql of statements) {
    try {
      await client.execute(sql);
      console.log(`✅ Applied: ${sql}`);
    } catch (e: any) {
      if (e.message.includes("duplicate column") || e.message.includes("already exists")) {
        console.log(`⏭️  Already exists: ${sql}`);
      } else {
        console.error(`❌ Failed: ${sql}`);
        console.error(e.message);
      }
    }
  }
}

main();
