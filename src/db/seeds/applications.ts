import { db } from '@/db';
import { applications, user } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
    // First, try to get a valid user ID from the database
    const users = await db.select({ id: user.id }).from(user).limit(1);
    
    if (users.length === 0) {
        console.log('⚠️ No users found in database. Please seed users first.');
        return;
    }
    
    const userId = users[0].id;
    console.log(`📝 Using user ID: ${userId}`);

    const sampleApplications = [
        {
            userId: userId,
            jobId: 1,
            status: 'pending',
            appliedAt: new Date('2024-01-08').toISOString(),
            updatedAt: new Date('2024-01-08').toISOString(),
            notes: null,
        },
        {
            userId: userId,
            jobId: 2,
            status: 'applied',
            appliedAt: new Date('2024-01-11').toISOString(),
            updatedAt: new Date('2024-01-12').toISOString(),
            notes: 'Waiting for response from recruiter',
        },
        {
            userId: userId,
            jobId: 3,
            status: 'interview',
            appliedAt: new Date('2024-01-14').toISOString(),
            updatedAt: new Date('2024-01-18').toISOString(),
            notes: 'First round interview scheduled for next week',
        },
        {
            userId: userId,
            jobId: 4,
            status: 'accepted',
            appliedAt: new Date('2024-01-17').toISOString(),
            updatedAt: new Date('2024-01-21').toISOString(),
            notes: 'Offer received! Reviewing terms',
        },
        {
            userId: userId,
            jobId: 5,
            status: 'rejected',
            appliedAt: new Date('2024-01-20').toISOString(),
            updatedAt: new Date('2024-01-22').toISOString(),
            notes: 'Not selected for the position',
        },
    ];

    await db.insert(applications).values(sampleApplications);
    
    console.log('✅ Applications seeder completed successfully');
    console.log(`📊 Seeded ${sampleApplications.length} applications for user ${userId}`);
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});