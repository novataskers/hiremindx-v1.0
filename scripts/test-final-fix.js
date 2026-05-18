const fs = require('fs');
const { createClient } = require('@libsql/client');

async function main() {
  const envContent = fs.readFileSync('.env.production', 'utf8');
  const env = {};
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_]+)="(.*)"$/);
    if (match) env[match[1]] = match[2];
  }

  const client = createClient({
    url: env.TURSO_CONNECTION_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  const testUserId = 'final_test_' + Date.now();
  const testEmail = 'final_' + Date.now() + '@example.com';

  console.log('=== Insert user ===');
  await client.execute({
    sql: `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [testUserId, 'Test User', testEmail, 1, Date.now(), Date.now()]
  });
  console.log('OK');

  console.log('\n=== Insert account WITH scopes and tokenType (simulates better-auth OAuth) ===');
  try {
    await client.execute({
      sql: `INSERT INTO account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, scope, scopes, token_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'acct_' + Date.now(),
        'google_123',
        'google',
        testUserId,
        'fake_access',
        'fake_refresh',
        'fake_id',
        'openid profile email',
        'openid,profile,email',
        'Bearer',
        Date.now(),
        Date.now()
      ]
    });
    console.log('OK - account with scopes+tokenType inserted successfully!');
  } catch (e) {
    console.log('FAIL:', e.message);
  }

  console.log('\n=== Cleanup ===');
  await client.execute({ sql: `DELETE FROM account WHERE user_id = ?`, args: [testUserId] });
  await client.execute({ sql: `DELETE FROM user WHERE id = ?`, args: [testUserId] });
  console.log('Done');

  await client.close();
}

main().catch(console.error);
