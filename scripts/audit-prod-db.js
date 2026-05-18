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

  console.log('=== ALL TABLES ===');
  const tablesResult = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tables = tablesResult.rows.map(r => r.name);
  for (const t of tables) console.log('  ' + t);

  console.log('\n=== AUTH TABLE SCHEMAS ===');
  const authTables = ['user', 'account', 'session', 'verification'];
  for (const t of authTables) {
    console.log(`\n--- ${t} ---`);
    try {
      const info = await client.execute(`PRAGMA table_info(${t})`);
      for (const row of info.rows) {
        console.log(`  ${row.name} (${row.type})${row.notnull ? ' NOT NULL' : ''}${row.dflt_value ? ' DEFAULT ' + row.dflt_value : ''}${row.pk ? ' PK' : ''}`);
      }
    } catch (e) {
      console.log('  TABLE NOT FOUND: ' + e.message);
    }
  }

  console.log('\n=== INDEXES ON AUTH TABLES ===');
  for (const t of authTables) {
    try {
      const idx = await client.execute(`PRAGMA index_list(${t})`);
      if (idx.rows.length) {
        console.log(`\n${t} indexes:`);
        for (const row of idx.rows) {
          console.log(`  ${row.name} (${row.unique ? 'unique' : 'non-unique'})`);
        }
      }
    } catch {}
  }

  console.log('\n=== FOREIGN KEYS ===');
  for (const t of authTables) {
    try {
      const fk = await client.execute(`PRAGMA foreign_key_list(${t})`);
      if (fk.rows.length) {
        console.log(`\n${t} foreign keys:`);
        for (const row of fk.rows) {
          console.log(`  ${row.from} -> ${row.table}(${row.to})`);
        }
      }
    } catch {}
  }

  console.log('\n=== TEST INSERT USER ===');
  const testUserId = 'test_audit_' + Date.now();
  try {
    await client.execute({
      sql: `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [testUserId, 'Audit Test', 'audit_test_' + Date.now() + '@example.com', 1, Date.now(), Date.now()]
    });
    console.log('  User insert: OK');
  } catch (e) {
    console.log('  User insert FAILED:', e.message);
  }

  console.log('\n=== TEST INSERT ACCOUNT ===');
  try {
    await client.execute({
      sql: `INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['acct_' + Date.now(), '123', 'google', testUserId, Date.now(), Date.now()]
    });
    console.log('  Account insert: OK');
  } catch (e) {
    console.log('  Account insert FAILED:', e.message);
  }

  console.log('\n=== TEST INSERT SESSION ===');
  try {
    await client.execute({
      sql: `INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['sess_' + Date.now(), Date.now() + 86400000, 'token_' + Date.now(), Date.now(), Date.now(), testUserId]
    });
    console.log('  Session insert: OK');
  } catch (e) {
    console.log('  Session insert FAILED:', e.message);
  }

  console.log('\n=== CLEANUP TEST DATA ===');
  try {
    await client.execute({ sql: `DELETE FROM session WHERE user_id = ?`, args: [testUserId] });
    await client.execute({ sql: `DELETE FROM account WHERE user_id = ?`, args: [testUserId] });
    await client.execute({ sql: `DELETE FROM user WHERE id = ?`, args: [testUserId] });
    console.log('  Cleanup: OK');
  } catch (e) {
    console.log('  Cleanup FAILED:', e.message);
  }

  console.log('\n=== CHECKING EXTRA COLUMNS IN USER ===');
  const userInfo = await client.execute('PRAGMA table_info(user)');
  const expectedCols = ['id', 'name', 'email', 'email_verified', 'image', 'phone', 'created_at', 'updated_at', 'last_seen', 'marketing_consent', 'marketing_consent_at'];
  const actualCols = userInfo.rows.map(r => r.name);
  const unexpected = actualCols.filter(c => !expectedCols.includes(c));
  const missing = expectedCols.filter(c => !actualCols.includes(c));
  if (unexpected.length) console.log('  Unexpected columns:', unexpected.join(', '));
  if (missing.length) console.log('  Missing columns:', missing.join(', '));
  if (!unexpected.length && !missing.length) console.log('  Columns match expected');

  await client.close();
}

main().catch(console.error);
