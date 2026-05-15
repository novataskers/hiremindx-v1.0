import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  url: process.env.TURSO_CONNECTION_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  console.log('Testing direct insert into community_dms...');
  
  try {
    // Try a test insert to see if it works
    const result = await client.execute({
      sql: `INSERT INTO community_dms (conversation_key, sender_id, receiver_id, message, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['test_key_001', 'test_sender', 'test_receiver', 'Test message', 0, new Date().toISOString()],
    });
    console.log('Insert result:', JSON.stringify(result, null, 2));
    console.log('Insert succeeded! lastInsertRowid:', result.lastInsertRowid);
    
    // Now try a select
    const selectResult = await client.execute({
      sql: `SELECT * FROM community_dms WHERE conversation_key = ?`,
      args: ['test_key_001'],
    });
    console.log('Select result:', JSON.stringify(selectResult.rows, null, 2));
    
    // Clean up test data
    await client.execute({
      sql: `DELETE FROM community_dms WHERE conversation_key = ?`,
      args: ['test_key_001'],
    });
    console.log('Test data cleaned up');
    
  } catch (e: any) {
    console.error('Insert failed with error:', e.message);
    console.error('Full error:', e);
  }
  
  process.exit(0);
}

main();
