const fs = require('fs');
const path = require('path');

// Load env from .env.production
const envContent = fs.readFileSync('.env.production', 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Za-z0-9_]+)="(.*)"$/);
  if (match) process.env[match[1]] = match[2];
}

// Set up ts-node or use the compiled code
// We'll use the libsql client directly but structured like Drizzle would do it
const { createClient } = require('@libsql/client');

async function main() {
  const client = createClient({
    url: process.env.TURSO_CONNECTION_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const testUserId = 'drizzle_test_' + Date.now();
  const testEmail = 'drizzle_' + Date.now() + '@example.com';

  console.log('Testing inserts with data matching what better-auth provides...\n');

  // Test 1: Insert user with name (simulating OAuth with name)
  console.log('=== TEST 1: User with name ===');
  try {
    await client.execute({
      sql: `INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [testUserId, 'Test User', testEmail, 0, null, Date.now(), Date.now()]
    });
    console.log('  OK');
  } catch (e) {
    console.log('  FAIL:', e.message);
  }

  // Test 2: Insert account without explicit id (better-auth generates id internally)
  console.log('\n=== TEST 2: Account without id (this is what better-auth does) ===');
  try {
    // better-auth passes: accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, providerId, accountId, userId, createdAt, updatedAt
    // But it also generates an id internally via transformInput
    // So the actual insert DOES include id
    await client.execute({
      sql: `INSERT INTO account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['acct_' + Date.now(), 'google_123', 'google', testUserId, 'fake_token', 'fake_refresh', 'fake_id_token', null, null, 'openid profile email', Date.now(), Date.now()]
    });
    console.log('  OK (with id)');
  } catch (e) {
    console.log('  FAIL:', e.message);
  }

  // Test 3: Try inserting account WITHOUT id (raw SQLite behavior)
  console.log('\n=== TEST 3: Account WITHOUT id ===');
  try {
    await client.execute({
      sql: `INSERT INTO account (account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: ['google_456', 'google', testUserId, Date.now(), Date.now()]
    });
    console.log('  OK (no id)');
  } catch (e) {
    console.log('  FAIL:', e.message);
  }

  // Test 4: Insert session without id (better-auth generates id internally)
  console.log('\n=== TEST 4: Session WITHOUT id ===');
  try {
    await client.execute({
      sql: `INSERT INTO session (expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?)`,
      args: [Date.now() + 86400000, 'token_' + Date.now(), Date.now(), Date.now(), testUserId]
    });
    console.log('  OK (no id)');
  } catch (e) {
    console.log('  FAIL:', e.message);
  }

  // Test 5: Insert user with email that already exists
  console.log('\n=== TEST 5: Duplicate email ===');
  try {
    await client.execute({
      sql: `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['dup_' + Date.now(), 'Dup User', testEmail, 0, Date.now(), Date.now()]
    });
    console.log('  OK (unexpected)');
  } catch (e) {
    console.log('  FAIL (expected):', e.message);
  }

  // Cleanup
  console.log('\n=== CLEANUP ===');
  await client.execute({ sql: `DELETE FROM session WHERE user_id = ?`, args: [testUserId] }).catch(() => {});
  await client.execute({ sql: `DELETE FROM account WHERE user_id = ?`, args: [testUserId] }).catch(() => {});
  await client.execute({ sql: `DELETE FROM user WHERE id = ?`, args: [testUserId] }).catch(() => {});
  console.log('  Done');

  await client.close();
}

main().catch(console.error);
