import { db } from '../src/db';
import { user, account } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const testUserId = 'real_drizzle_' + Date.now();
  const testEmail = 'real_' + Date.now() + '@example.com';

  console.log('=== Inserting user via Drizzle ORM ===');
  try {
    const result = await db.insert(user).values({
      id: testUserId,
      name: 'Test User',
      email: testEmail,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    console.log('User insert OK:', JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.log('User insert FAILED:', e.message);
    if (e.cause) console.log('  cause:', e.cause.message);
  }

  console.log('\n=== Inserting account via Drizzle ORM ===');
  try {
    const result = await db.insert(account).values({
      id: 'acct_' + Date.now(),
      accountId: 'google_123',
      providerId: 'google',
      userId: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    console.log('Account insert OK:', JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.log('Account insert FAILED:', e.message);
    if (e.cause) console.log('  cause:', e.cause.message);
  }

  console.log('\n=== Inserting account WITHOUT id via Drizzle ===');
  try {
    const result = await db.insert(account).values({
      accountId: 'google_456',
      providerId: 'google',
      userId: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    console.log('Account insert (no id) OK:', JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.log('Account insert (no id) FAILED:', e.message);
    if (e.cause) console.log('  cause:', e.cause.message);
  }

  console.log('\n=== Cleanup ===');
  try {
    await db.delete(account).where(eq(account.userId, testUserId));
    await db.delete(user).where(eq(user.id, testUserId));
    console.log('Cleanup OK');
  } catch (e: any) {
    console.log('Cleanup FAILED:', e.message);
  }
}

main().catch(console.error);
