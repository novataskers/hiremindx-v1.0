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

  const statements = [
    // Add missing columns to account table
    'ALTER TABLE account ADD COLUMN scopes text',
    'ALTER TABLE account ADD COLUMN token_type text',
    // Add unique index on user.email
    'CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user(email)',
  ];

  for (const stmt of statements) {
    try {
      await client.execute(stmt);
      console.log('OK:', stmt);
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('SKIP (already exists):', stmt);
      } else if (e.message.includes('already exists')) {
        console.log('SKIP (already exists):', stmt);
      } else {
        console.error('FAIL:', stmt, e.message);
      }
    }
  }

  // Verify
  console.log('\n=== Verification ===');
  const accountInfo = await client.execute('PRAGMA table_info(account)');
  const accountCols = accountInfo.rows.map(r => r.name);
  console.log('Account columns:', accountCols.join(', '));

  const userIndexes = await client.execute('PRAGMA index_list(user)');
  console.log('\nUser indexes:');
  for (const row of userIndexes.rows) {
    console.log(`  ${row.name} (${row.unique ? 'unique' : 'non-unique'})`);
  }

  await client.close();
  console.log('\nDone.');
}

main().catch(console.error);
