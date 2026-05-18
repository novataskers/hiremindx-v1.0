const fs = require('fs');

// Load env from .env.production
const envContent = fs.readFileSync('.env.production', 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Za-z0-9_]+)="(.*)"$/);
  if (match) process.env[match[1]] = match[2];
}

// Use tsx to run TypeScript directly
const { execSync } = require('child_process');

const script = `
import { db } from '../src/db';
import { user, account } from '../src/db/schema';

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
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    console.log('User insert OK:', result);
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
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      password: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    console.log('Account insert OK:', result);
  } catch (e: any) {
    console.log('Account insert FAILED:', e.message);
    if (e.cause) console.log('  cause:', e.cause.message);
  }

  // Test with missing id (simulate better-auth without id)
  console.log('\n=== Inserting account WITHOUT id via Drizzle ===');
  try {
    const result = await db.insert(account).values({
      accountId: 'google_456',
      providerId: 'google',
      userId: testUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    console.log('Account insert (no id) OK:', result);
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
`;

fs.writeFileSync('scripts/test-real-drizzle-temp.ts', script);

try {
  execSync('npx tsx scripts/test-real-drizzle-temp.ts', { stdio: 'inherit', cwd: process.cwd() });
} catch (e) {
  // tsx might not be available
}

fs.unlinkSync('scripts/test-real-drizzle-temp.ts');
