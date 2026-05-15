import { createClient } from "@libsql/client";

const client = createClient({
  url: "libsql://hiremindx-novataskers.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzYwODk2NjcsImlkIjoiMDE5ZDg3MmYtODIwMS03YzA0LWJkMGYtNjA4MDExNmUzN2JiIiwicmlkIjoiMDdkZTk4MzAtMzE0Ny00OGFjLWEwMzktNzBmOTEwNjU0NDc5In0.B7Dd6kD3UmDq_QzXtC_D1GD-39NPV-QfrBJ0nFYO1canls7_ectRR9CHZP6UZ7o0Yjw1pegJntbAvuNIXQwCDQ",
});

async function migrate() {
  try {
    // Check if column exists
    const cols = await client.execute("PRAGMA table_info(user_usage_limits)");
    const hasColumn = cols.rows.some((r: any) => r.name === 'community_post_count');
    
    if (hasColumn) {
      console.log("Column community_post_count already exists");
    } else {
      await client.execute(`
        ALTER TABLE user_usage_limits 
        ADD COLUMN community_post_count INTEGER NOT NULL DEFAULT 0
      `);
      console.log("Added community_post_count column");
    }
    
    client.close();
  } catch (e) {
    console.error("Migration failed:", e);
    client.close();
    process.exit(1);
  }
}

migrate();
