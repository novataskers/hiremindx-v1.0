const fs = require('fs');
const { createClient } = require('@libsql/client');

async function main() {
  const envContent = fs.readFileSync('.env.production', 'utf8');
  const env = {};
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_]+)="(.*)"$/);
    if (match) env[match[1]] = match[2];
  }

  // Create TWO clients to simulate the transaction + global db scenario
  const txClient = createClient({
    url: env.TURSO_CONNECTION_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  const globalClient = createClient({
    url: env.TURSO_CONNECTION_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  const testUserId = 'deadlock_test_' + Date.now();
  const testEmail = 'deadlock_test_' + Date.now() + '@example.com';

  console.log('=== SIMULATING better-auth createOAuthUser FLOW ===');
  console.log('This tests whether writing via a separate connection INSIDE a transaction causes a deadlock.\n');

  const startTime = Date.now();

  // Use the @libsql/client transaction API (not callback-based)
  let tx;
  try {
    console.log('[1] Starting interactive transaction...');
    tx = await txClient.transaction("write");
    console.log('[1] Transaction started (' + (Date.now() - startTime) + 'ms)');

    // Step 1: Insert user (inside transaction)
    console.log('[2] INSERT user inside transaction...');
    await tx.execute({
      sql: `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [testUserId, 'Deadlock Test', testEmail, 1, Date.now(), Date.now()]
    });
    console.log('[2] User inserted OK (' + (Date.now() - startTime) + 'ms)');

    // Step 2: Simulate the after hook writing via GLOBAL db (outside transaction)
    console.log('[3] Attempting WRITE via global client (simulating databaseHooks after hook)...');
    console.log('    This simulates linkBetaSignup() writing to beta_signups table...');
    try {
      const writeStart = Date.now();
      // Simulate a write that the after hook would do (e.g., UPDATE beta_signups SET user_id = ?)
      await globalClient.execute({
        sql: `UPDATE user SET last_seen = ? WHERE id = 'nonexistent_user_for_safe_test'`,
        args: [Date.now()]
      });
      console.log('[3] Global write SUCCEEDED (' + (Date.now() - writeStart) + 'ms) — NO DEADLOCK');
    } catch (e) {
      console.log('[3] Global write FAILED after ' + (Date.now() - startTime) + 'ms');
      console.log('    Error:', e.message);
      console.log('    THIS CONFIRMS DEADLOCK/LOCK CONTENTION!');
    }

    // Step 3: Insert account (inside transaction) — this would fail if transaction timed out
    console.log('[4] INSERT account inside transaction...');
    await tx.execute({
      sql: `INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['acct_deadlock_' + Date.now(), 'google_123', 'google', testUserId, Date.now(), Date.now()]
    });
    console.log('[4] Account inserted OK (' + (Date.now() - startTime) + 'ms)');

    // Commit
    await tx.commit();
    console.log('\n[RESULT] Transaction COMMITTED successfully in ' + (Date.now() - startTime) + 'ms');
    console.log('[RESULT] Deadlock theory: NOT confirmed (writes from outside succeeded during transaction)');

  } catch (e) {
    console.log('\n[RESULT] Transaction FAILED after ' + (Date.now() - startTime) + 'ms');
    console.log('[RESULT] Error:', e.message);
    console.log('[RESULT] Deadlock/timeout theory: CONFIRMED!');
    if (tx) {
      try { await tx.rollback(); } catch (_) {}
    }
  }

  // Cleanup
  console.log('\n=== CLEANUP ===');
  try {
    await txClient.execute({ sql: `DELETE FROM account WHERE user_id = ?`, args: [testUserId] });
    await txClient.execute({ sql: `DELETE FROM user WHERE id = ?`, args: [testUserId] });
    console.log('Cleanup: OK');
  } catch (e) {
    console.log('Cleanup (no rows to clean):', e.message);
  }

  await txClient.close();
  await globalClient.close();
}

main().catch(console.error);
