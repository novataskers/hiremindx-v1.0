import { createClient } from '@libsql/client';

const connectionUrl = process.env.TURSO_CONNECTION_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!connectionUrl) {
  throw new Error('TURSO_CONNECTION_URL is required');
}

const client = createClient({
  url: connectionUrl,
  authToken,
});

async function main() {
  console.log('Creating tables...');
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT,
        image TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    console.log('Created conversations table');

    await client.execute(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        joined_at TEXT NOT NULL
      );
    `);
    console.log('Created conversation_participants table');

    await client.execute(`
      CREATE TABLE IF NOT EXISTS community_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        created_at TEXT NOT NULL
      );
    `);
    console.log('Created community_messages table');

    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    process.exit(0);
  }
}

void main();