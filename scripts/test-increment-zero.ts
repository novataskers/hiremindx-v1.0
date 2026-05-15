import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
config();

async function main() {
  const { useFeature } = await import('../src/lib/usage-limits.js');
  const { db } = await import('../src/db/index.js');
  const { userUsageLimits } = await import('../src/db/schema.js');

  const rows = await db.select().from(userUsageLimits).limit(1);
  const userId = rows[0]?.userId;
  if (!userId) { console.log('No users'); return; }

  // Reset community_ai_count
  await db.update(userUsageLimits).set({ communityAiCount: 0 }).where(eq(userUsageLimits.userId, userId));

  console.log('=== Test increment=0 (check only) ===');
  const r1 = await useFeature(userId, 'community_ai_agent', 0);
  console.log('check-only:', JSON.stringify(r1, null, 2));

  console.log('\n=== Test increment=1 ===');
  const r2 = await useFeature(userId, 'community_ai_agent', 1);
  console.log('after increment:', JSON.stringify(r2, null, 2));

  console.log('\n=== Test increment=0 after consuming ===');
  const r3 = await useFeature(userId, 'community_ai_agent', 0);
  console.log('check-only after consume:', JSON.stringify(r3, null, 2));

  console.log('\n=== Test increment=1 after consuming (should block) ===');
  const r4 = await useFeature(userId, 'community_ai_agent', 1);
  console.log('second increment:', JSON.stringify(r4, null, 2));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
