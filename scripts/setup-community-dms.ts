import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  url: process.env.TURSO_CONNECTION_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  try {
    const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='community_dms'");
    console.log('community_dms table exists:', result.rows.length > 0);
    if (result.rows.length > 0) {
      const cols = await client.execute("PRAGMA table_info(community_dms)");
      console.log('Columns:', JSON.stringify(cols.rows, null, 2));
    } else {
      console.log('The community_dms table does NOT exist - this is why messages fail!');
      console.log('Creating the table now...');
      
      await client.execute(`
        CREATE TABLE IF NOT EXISTS community_dms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_key TEXT NOT NULL,
          sender_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          receiver_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          project_id INTEGER,
          proposal_id INTEGER,
          is_read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);
      console.log('community_dms table created successfully!');
      
      // Create index on conversation_key for faster lookups
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_community_dms_conversation_key ON community_dms(conversation_key)
      `);
      console.log('Index on conversation_key created.');
      
      // Create index on sender_id and receiver_id
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_community_dms_sender ON community_dms(sender_id)
      `);
      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_community_dms_receiver ON community_dms(receiver_id)
      `);
      console.log('Indexes on sender_id and receiver_id created.');
    }
  } catch(e: any) { 
    console.error('Error:', e.message); 
  }
  process.exit(0);
}

main();
