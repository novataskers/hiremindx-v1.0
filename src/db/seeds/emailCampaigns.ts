import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { emailCampaigns, leads, user } from '@/db/schema';

async function main() {
    // Get a valid user ID from the database
    const users = await db.select({ id: user.id }).from(user).limit(1);

    if (users.length === 0) {
        console.log('⚠️  Warning: No users found in database. Please seed users first.');
        return;
    }

    const firstUser = users[0];

    if (!firstUser) {
        console.log('⚠️  Warning: No users found in database. Please seed users first.');
        return;
    }

    const userId = firstUser.id;
    console.log(`✅ Found user ID: ${userId}`);

    // Get lead IDs from the leads table (first 12 leads)
    const leadRecords = await db
        .select({
            id: leads.id,
            companyName: leads.companyName,
            contactName: leads.contactName,
            industry: leads.industry,
        })
        .from(leads)
        .where(eq(leads.userId, userId))
        .orderBy(asc(leads.id))
        .limit(12);

    if (leadRecords.length === 0) {
        console.log('⚠️  Warning: No leads found in database. Please seed leads first.');
        return;
    }

    console.log(`✅ Found ${leadRecords.length} leads`);

    const now = new Date();
    const getDateDaysAgo = (days: number) =>
        new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    const sampleCampaigns = [
        // 2 draft campaigns (not sent yet)
        {
            userId,
            leadId: leadRecords[0]?.id,
            subject: `Partnership opportunity with ${leadRecords[0]?.companyName || 'Your Company'}`,
            body: `Hi ${leadRecords[0]?.contactName || 'there'},

I came across ${leadRecords[0]?.companyName || 'your company'} and was impressed by your work in ${leadRecords[0]?.industry || 'your industry'}. With my background in software engineering and experience with full-stack development, I believe there could be great synergy between us.

I'd love to explore potential collaboration opportunities. Would you be open to a brief call next week?

Best regards,
John Doe`,
            status: 'draft' as const,
            sentAt: null,
            openedAt: null,
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(15),
            updatedAt: getDateDaysAgo(15),
        },
        {
            userId,
            leadId: leadRecords[1]?.id,
            subject: `Exploring collaboration in ${leadRecords[1]?.industry || 'Technology'}`,
            body: `Hi ${leadRecords[1]?.contactName || 'there'},

I noticed ${leadRecords[1]?.companyName || 'your organization'}'s impressive growth in the ${leadRecords[1]?.industry || 'tech'} sector. As someone specializing in product development and team leadership, I think we might have aligned interests.

Could we schedule a conversation to discuss how we might work together?

Best,
John Doe`,
            status: 'draft' as const,
            sentAt: null,
            openedAt: null,
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(12),
            updatedAt: getDateDaysAgo(12),
        },
        // 3 sent campaigns (sent but not opened)
        {
            userId,
            leadId: leadRecords[2]?.id,
            subject: 'Introduction: John Doe - Senior Software Engineer',
            body: `Hi ${leadRecords[2]?.contactName || 'there'},

I've been following ${leadRecords[2]?.companyName || 'your company'}'s work in ${leadRecords[2]?.industry || 'the industry'} and wanted to reach out. With over 8 years of experience in software architecture and team leadership, I believe we could create something valuable together.

Would you be interested in exploring potential synergies?

Looking forward to hearing from you,
John Doe`,
            status: 'sent' as const,
            sentAt: getDateDaysAgo(14),
            openedAt: null,
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(14),
            updatedAt: getDateDaysAgo(14),
        },
        {
            userId,
            leadId: leadRecords[3]?.id,
            subject: `Potential synergy between our teams at ${leadRecords[3]?.companyName || 'your company'}`,
            body: `Hello ${leadRecords[3]?.contactName || 'there'},

I came across ${leadRecords[3]?.companyName || 'your organization'} while researching innovative companies in ${leadRecords[3]?.industry || 'the industry'}. Your approach to building solutions really resonates with my experience in agile development and product strategy.

I'd love to discuss how we might collaborate. Are you available for a quick chat?

Best regards,
John Doe`,
            status: 'sent' as const,
            sentAt: getDateDaysAgo(10),
            openedAt: null,
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(10),
            updatedAt: getDateDaysAgo(10),
        },
        {
            userId,
            leadId: leadRecords[4]?.id,
            subject: `Connect: Experienced developer interested in ${leadRecords[4]?.companyName || 'your company'}`,
            body: `Hi ${leadRecords[4]?.contactName || 'there'},

I've been impressed by ${leadRecords[4]?.companyName || 'your company'}'s reputation in ${leadRecords[4]?.industry || 'the industry'}. With my technical expertise in cloud architecture and DevOps, plus a track record of scaling teams, I think there's potential for a great partnership.

Would you be open to a conversation about potential opportunities?

Best,
John Doe`,
            status: 'sent' as const,
            sentAt: getDateDaysAgo(8),
            openedAt: null,
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(8),
            updatedAt: getDateDaysAgo(8),
        },
        // 3 opened campaigns (sent and opened)
        {
            userId,
            leadId: leadRecords[5]?.id,
            subject: `Collaboration opportunity in ${leadRecords[5]?.industry || 'your industry'}`,
            body: `Hello ${leadRecords[5]?.contactName || 'there'},

I noticed ${leadRecords[5]?.companyName || 'your company'} is doing exceptional work in ${leadRecords[5]?.industry || 'the field'}. With my background in software engineering and experience leading cross-functional teams, I believe we could create something impactful together.

Would you be interested in exploring how we might work together?

Looking forward to connecting,
John Doe`,
            status: 'opened' as const,
            sentAt: getDateDaysAgo(7),
            openedAt: getDateDaysAgo(5),
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(7),
            updatedAt: getDateDaysAgo(5),
        },
        {
            userId,
            leadId: leadRecords[6]?.id,
            subject: 'Senior Engineer seeking collaboration opportunities',
            body: `Hi ${leadRecords[6]?.contactName || 'there'},

I came across ${leadRecords[6]?.companyName || 'your organization'} and was impressed by your innovative approach in ${leadRecords[6]?.industry || 'the industry'}. My experience with full-stack development, microservices architecture, and team mentorship aligns well with companies at your stage.

I'd love to explore potential collaboration. Would next week work for a brief call?

Best regards,
John Doe`,
            status: 'opened' as const,
            sentAt: getDateDaysAgo(6),
            openedAt: getDateDaysAgo(4),
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(6),
            updatedAt: getDateDaysAgo(4),
        },
        {
            userId,
            leadId: leadRecords[7]?.id,
            subject: `Introduction from a fellow ${leadRecords[7]?.industry || 'industry'} professional`,
            body: `Hello ${leadRecords[7]?.contactName || 'there'},

I've been following ${leadRecords[7]?.companyName || 'your company'}'s journey in ${leadRecords[7]?.industry || 'the industry'} with great interest. With my technical leadership experience and passion for building scalable systems, I see potential for meaningful collaboration.

Would you be open to discussing how we might work together?

Best,
John Doe`,
            status: 'opened' as const,
            sentAt: getDateDaysAgo(5),
            openedAt: getDateDaysAgo(3),
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(5),
            updatedAt: getDateDaysAgo(3),
        },
        // 2 replied campaigns (sent, opened, and replied)
        {
            userId,
            leadId: leadRecords[8]?.id,
            subject: `Interested in joining ${leadRecords[8]?.companyName || 'your team'}`,
            body: `Hi ${leadRecords[8]?.contactName || 'there'},

I came across ${leadRecords[8]?.companyName || 'your company'} and was impressed by your work in ${leadRecords[8]?.industry || 'the industry'}. With my background in distributed systems and experience with modern web technologies, I believe there could be great synergy between us.

I'd love to explore potential collaboration opportunities. Would you be open to a brief call next week?

Best regards,
John Doe`,
            status: 'replied' as const,
            sentAt: getDateDaysAgo(12),
            openedAt: getDateDaysAgo(10),
            repliedAt: getDateDaysAgo(8),
            replyContent: `Hi John,

Thanks for reaching out! I'd be interested in learning more about your background and experience. Let's schedule a call for next Tuesday at 2pm. I'll send you a calendar invite.

Best,
${leadRecords[8]?.contactName || 'Contact'}`,
            errorMessage: null,
            createdAt: getDateDaysAgo(12),
            updatedAt: getDateDaysAgo(8),
        },
        {
            userId,
            leadId: leadRecords[9]?.id,
            subject: `Engineering leadership opportunity at ${leadRecords[9]?.companyName || 'your company'}`,
            body: `Hello ${leadRecords[9]?.contactName || 'there'},

I've been following ${leadRecords[9]?.companyName || 'your organization'}'s growth in ${leadRecords[9]?.industry || 'the industry'} and wanted to reach out. My experience leading engineering teams and building scalable infrastructure might be a good fit for your current needs.

Could we schedule a conversation to discuss potential opportunities?

Looking forward to connecting,
John Doe`,
            status: 'replied' as const,
            sentAt: getDateDaysAgo(9),
            openedAt: getDateDaysAgo(7),
            repliedAt: getDateDaysAgo(5),
            replyContent: `Hi John,

Thanks for your email! We're actually looking for someone with your background. Would you be available for a call this week? Thursday or Friday afternoon would work well for us.

Looking forward to speaking with you,
${leadRecords[9]?.contactName || 'Contact'}`,
            errorMessage: null,
            createdAt: getDateDaysAgo(9),
            updatedAt: getDateDaysAgo(5),
        },
        // 1 delivered campaign (sent and delivered)
        {
            userId,
            leadId: leadRecords[10]?.id,
            subject: `Technical collaboration with ${leadRecords[10]?.companyName || 'your team'}`,
            body: `Hi ${leadRecords[10]?.contactName || 'there'},

I noticed ${leadRecords[10]?.companyName || 'your company'} is doing impressive work in ${leadRecords[10]?.industry || 'the field'}. With my expertise in cloud infrastructure and containerization, plus experience mentoring junior developers, I think we could create value together.

Would you be interested in discussing potential collaboration?

Best regards,
John Doe`,
            status: 'delivered' as const,
            sentAt: getDateDaysAgo(4),
            openedAt: null,
            repliedAt: null,
            replyContent: null,
            errorMessage: null,
            createdAt: getDateDaysAgo(4),
            updatedAt: getDateDaysAgo(4),
        },
        // 1 bounced campaign (failed to deliver)
        {
            userId,
            leadId: leadRecords[11]?.id,
            subject: `Partnership inquiry for ${leadRecords[11]?.companyName || 'your company'}`,
            body: `Hello ${leadRecords[11]?.contactName || 'there'},

I came across ${leadRecords[11]?.companyName || 'your organization'} while researching companies in ${leadRecords[11]?.industry || 'the industry'}. My background in software development and passion for innovative solutions aligns well with your mission.

I'd love to explore how we might work together. Are you available for a brief call?

Best,
John Doe`,
            status: 'bounced' as const,
            sentAt: getDateDaysAgo(3),
            openedAt: null,
            repliedAt: null,
            replyContent: null,
            errorMessage: 'Email address not found. The recipient email address does not exist or is no longer active.',
            createdAt: getDateDaysAgo(3),
            updatedAt: getDateDaysAgo(3),
        },
    ].filter(
        (campaign): campaign is typeof campaign & { leadId: number } =>
            campaign.leadId !== undefined
    );

    await db.insert(emailCampaigns).values(sampleCampaigns as any);

    console.log('✅ Email campaigns seeder completed successfully');
    console.log('   - 2 draft campaigns');
    console.log('   - 3 sent campaigns');
    console.log('   - 3 opened campaigns');
    console.log('   - 2 replied campaigns');
    console.log('   - 1 delivered campaign');
    console.log('   - 1 bounced campaign');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});
