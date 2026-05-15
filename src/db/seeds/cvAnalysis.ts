import { db } from '@/db';
import { cvAnalysis, user } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
    // First, get a valid user ID from the database
    const existingUsers = await db.select({ id: user.id }).from(user).limit(1);
    
    if (existingUsers.length === 0) {
        console.warn('⚠️  No users found in database. Please seed users first before seeding CV analysis records.');
        return;
    }
    
    const userId = existingUsers[0].id;
    console.log(`Using user ID: ${userId}`);
    
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
    const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const sampleCvAnalysis = [
        {
            userId: userId,
            resumeId: null,
            fullName: 'Alex Rivera',
            email: 'alex.rivera@email.com',
            phone: '+1-555-123-4567',
            skills: JSON.stringify(['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'AWS', 'Docker', 'PostgreSQL', 'MongoDB', 'Git']),
            expertise: 'Software Engineering',
            jobTitles: JSON.stringify(['Senior Software Engineer', 'Full Stack Developer', 'Software Engineer']),
            experienceYears: 7,
            education: JSON.stringify([{
                degree: 'B.S. Computer Science',
                institution: 'University of California',
                year: '2016'
            }]),
            summary: 'Alex Rivera is an experienced Software Engineering professional with 7+ years of expertise. Skilled in JavaScript, TypeScript, React, Node.js, Python. Previously worked as Senior Software Engineer, bringing strong technical and leadership capabilities to drive successful project outcomes.',
            rawText: 'Alex Rivera\nalex.rivera@email.com | +1-555-123-4567\n\nSenior Software Engineer with 7 years of experience in building scalable web applications. Expertise in JavaScript, TypeScript, React, Node.js, and cloud technologies.\n\nExperience:\nSenior Software Engineer at TechCorp (2020-Present)\nFull Stack Developer at StartupHub (2018-2020)\nSoftware Engineer at CodeFactory (2016-2018)\n\nEducation:\nB.S. Computer Science, University of California, 2016\n\nSkills: JavaScript, TypeScript, React, Node.js, Python, AWS, Docker, PostgreSQL, MongoDB, Git',
            analyzedAt: threeDaysAgo.toISOString(),
            updatedAt: threeDaysAgo.toISOString(),
        },
        {
            userId: userId,
            resumeId: null,
            fullName: 'Sarah Chen',
            email: 'sarah.chen@email.com',
            phone: '+1-555-987-6543',
            skills: JSON.stringify(['Marketing', 'SEO', 'SEM', 'Content Writing', 'Social Media', 'Google Analytics', 'Email Marketing', 'Copywriting', 'Adobe Creative Suite']),
            expertise: 'Marketing',
            jobTitles: JSON.stringify(['Marketing Manager', 'Digital Marketing Specialist', 'Content Marketing Coordinator']),
            experienceYears: 5,
            education: JSON.stringify([{
                degree: 'B.A. Marketing',
                institution: 'Boston University',
                year: '2018'
            }]),
            summary: 'Sarah Chen is an experienced Marketing professional with 5+ years of expertise. Skilled in Marketing, SEO, SEM, Content Writing, Social Media. Previously worked as Marketing Manager, bringing strong technical and leadership capabilities to drive successful project outcomes.',
            rawText: 'Sarah Chen\nsarah.chen@email.com | +1-555-987-6543\n\nMarketing Manager with 5 years of experience in digital marketing and brand strategy. Proven track record in SEO, content creation, and campaign management.\n\nExperience:\nMarketing Manager at BrandBoost Agency (2021-Present)\nDigital Marketing Specialist at Creative Pulse (2019-2021)\nContent Marketing Coordinator at MediaHub (2018-2019)\n\nEducation:\nB.A. Marketing, Boston University, 2018\n\nSkills: Marketing, SEO, SEM, Content Writing, Social Media Marketing, Google Analytics, Email Marketing, Copywriting, Adobe Creative Suite',
            analyzedAt: fiveDaysAgo.toISOString(),
            updatedAt: fiveDaysAgo.toISOString(),
        },
        {
            userId: userId,
            resumeId: null,
            fullName: 'Marcus Johnson',
            email: 'marcus.j@email.com',
            phone: '+1-555-456-7890',
            skills: JSON.stringify(['Sales', 'B2B Sales', 'SaaS', 'CRM', 'Salesforce', 'Lead Generation', 'Account Management', 'Negotiation', 'Business Development']),
            expertise: 'Sales',
            jobTitles: JSON.stringify(['Sales Director', 'Senior Account Executive', 'Business Development Manager']),
            experienceYears: 10,
            education: JSON.stringify([
                {
                    degree: 'MBA',
                    institution: 'Harvard Business School',
                    year: '2013'
                },
                {
                    degree: 'B.S. Business Administration',
                    institution: 'University of Texas',
                    year: '2011'
                }
            ]),
            summary: 'Marcus Johnson is an experienced Sales professional with 10+ years of expertise. Skilled in Sales, B2B Sales, SaaS, CRM, Salesforce. Previously worked as Sales Director, bringing strong technical and leadership capabilities to drive successful project outcomes.',
            rawText: 'Marcus Johnson\nmarcus.j@email.com | +1-555-456-7890\n\nSales Director with 10+ years of experience in B2B SaaS sales. Expert in building high-performing sales teams and closing enterprise deals.\n\nExperience:\nSales Director at Revenue Accelerators (2020-Present)\nSenior Account Executive at CloudScale Systems (2017-2020)\nBusiness Development Manager at Enterprise Solutions (2014-2017)\n\nEducation:\nMBA, Harvard Business School, 2013\nB.S. Business Administration, University of Texas, 2011\n\nSkills: B2B Sales, SaaS Sales, CRM, Salesforce, Lead Generation, Account Management, Negotiation, Business Development, Team Leadership',
            analyzedAt: oneWeekAgo.toISOString(),
            updatedAt: oneWeekAgo.toISOString(),
        }
    ];

    await db.insert(cvAnalysis).values(sampleCvAnalysis);
    
    console.log('✅ CV Analysis seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});