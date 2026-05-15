import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_CONNECTION_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function run() {
  try {
    console.log("Adding columns...");
    await client.execute("ALTER TABLE user ADD COLUMN last_seen INTEGER");
    console.log("Added last_seen to user");
  } catch (e) {
    console.log("last_seen might already exist");
  }

  try {
    await client.execute("ALTER TABLE conversation_participants ADD COLUMN typing_until INTEGER");
    console.log("Added typing_until to conversation_participants");
  } catch (e) {
    console.log("typing_until might already exist");
  }
  
  process.exit(0);
}

run();
