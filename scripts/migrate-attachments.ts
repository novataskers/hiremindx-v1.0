import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config();

async function migrate() {
  const client = createClient({
    url: process.env.TURSO_CONNECTION_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  console.log("Adding attachment columns to community_messages...");

  try {
    await client.execute("ALTER TABLE community_messages ADD COLUMN attachment_url TEXT;");
    console.log("Added attachment_url");
  } catch (e: any) {
    if (e.message.includes("already exists")) {
      console.log("attachment_url already exists");
    } else {
      console.error("Error adding attachment_url:", e);
    }
  }

  try {
    await client.execute("ALTER TABLE community_messages ADD COLUMN attachment_type TEXT;");
    console.log("Added attachment_type");
  } catch (e: any) {
    if (e.message.includes("already exists")) {
      console.log("attachment_type already exists");
    } else {
      console.error("Error adding attachment_type:", e);
    }
  }

  console.log("Migration complete.");
}

migrate();
