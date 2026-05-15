import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cvAnalysis, leads } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';

// Mock data for realistic lead generation
const companyNamesByIndustry = {
  tech: [
    'TechVision Solutions', 'CloudScale Systems', 'DataForge Inc', 'NexusPoint Technologies',
    'Quantum Innovations', 'ByteCraft Labs', 'Streamline Software', 'Vertex Analytics',
    'CoreLogic Systems', 'Infinity Tech Group', 'PulseWave Digital', 'Zenith Computing'
  ],
  marketing: [
    'BrandBoost Agency', 'Creative Pulse Marketing', 'Digital Heights Studio', 'MarketMakers Group',
    'Catalyst Marketing Co', 'Elevate Brand Partners', 'Momentum Digital', 'Spark Creative Agency',
    'Peak Performance Marketing', 'Velocity Growth Partners', 'Impact Media Group', 'Fusion Marketing'
  ],
  sales: [
    'Revenue Accelerators', 'Growth Partners LLC', 'Sales Dynamics Corp', 'Summit Sales Solutions',
    'Pinnacle Business Group', 'Enterprise Growth Advisors', 'Strategic Sales Partners', 'Apex Revenue Systems',
    'Victory Sales Consultants', 'Momentum Business Solutions', 'Alliance Growth Partners', 'Premier Sales Group'
  ],
  default: [
    'Horizon Enterprises', 'Sterling Corporation', 'Pinnacle Solutions', 'Vanguard Group',
    'Summit Industries', 'Keystone Partners', 'Meridian Associates', 'Cornerstone Ventures',
    'Atlas Corporation', 'Pioneer Business Group', 'Foundation Partners', 'Legacy Enterprises'
  ]
};

const firstNames = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
  'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark'
];

const cities = [
  'San Francisco, CA', 'New York, NY', 'Austin, TX', 'Seattle, WA', 'Boston, MA',
  'Denver, CO', 'Chicago, IL', 'Los Angeles, CA', 'Portland, OR', 'Atlanta, GA',
  'Miami, FL', 'Dallas, TX', 'San Diego, CA', 'Phoenix, AZ', 'Philadelphia, PA'
];

const companySizes = ['10-50', '51-200', '201-500', '501-1000', '1000+'];

function getIndustryCategory(expertise: string): string {
  const expertiseLower = expertise.toLowerCase();
  if (expertiseLower.includes('software') || expertiseLower.includes('engineering') || 
      expertiseLower.includes('developer') || expertiseLower.includes('tech')) {
    return 'tech';
  }
  if (expertiseLower.includes('marketing') || expertiseLower.includes('digital')) {
    return 'marketing';
  }
  if (expertiseLower.includes('sales') || expertiseLower.includes('business development')) {
    return 'sales';
  }
  return 'default';
}

function getIndustryName(category: string): string {
  const industries = {
    tech: ['Technology', 'SaaS', 'Cloud Computing', 'Software Development', 'AI/ML', 'Cybersecurity'],
    marketing: ['Digital Marketing', 'Advertising', 'E-commerce', 'Brand Management', 'Social Media'],
    sales: ['B2B Sales', 'Enterprise Software', 'Consulting', 'Professional Services', 'Business Solutions'],
    default: ['Professional Services', 'Consulting', 'Business Services', 'Finance', 'Healthcare']
  };
  const categoryIndustries = industries[category as keyof typeof industries] || industries.default;
  return categoryIndustries[Math.floor(Math.random() * categoryIndustries.length)];
}

function generatePhoneNumber(): string {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const firstPart = Math.floor(Math.random() * 900) + 100;
  const secondPart = Math.floor(Math.random() * 9000) + 1000;
  return `+1-${areaCode}-${firstPart}-${secondPart}`;
}

function generateCompanyName(category: string): string {
  const companies = companyNamesByIndustry[category as keyof typeof companyNamesByIndustry] || companyNamesByIndustry.default;
  return companies[Math.floor(Math.random() * companies.length)];
}

function generateContactName(): { firstName: string; lastName: string; fullName: string } {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`
  };
}

function generateEmail(firstName: string, lastName: string, companyName: string): string {
  const domain = companyName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .replace(/(inc|corp|llc|solutions|group|systems|technologies|partners|agency|consulting)$/i, '');
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}.com`;
}

function generateWebsite(companyName: string): string {
  const domain = companyName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .replace(/(inc|corp|llc|solutions|group|systems|technologies|partners|agency|consulting)$/i, '');
  return `https://${domain}.com`;
}

function calculateMatchScore(skills: string[], category: string): number {
  const baseScore = 70;
  const categoryBonus = category === 'default' ? 0 : 10;
  const skillBonus = Math.min(skills.length * 2, 18);
  return baseScore + categoryBonus + skillBonus;
}

function generateMatchReason(expertise: string, skills: string[]): string {
  const skillsList = skills.slice(0, 3).join(', ');
  return `Matches your ${expertise} expertise and ${skillsList} skills. Strong alignment with company needs and growth opportunities.`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session?.user) {
      return NextResponse.json({ 
        error: 'Authentication required',
        code: 'UNAUTHORIZED' 
      }, { status: 401 });
    }

    // Check usage limits
    const { useFeature } = await import("@/lib/usage-limits");
    const usageResult = await useFeature(session.user.id, "email_outreach");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    const body = await request.json();
    const { cvAnalysisId, count = 5 } = body;

    if (!cvAnalysisId) {
      return NextResponse.json({ 
        error: 'cvAnalysisId is required',
        code: 'MISSING_CV_ANALYSIS_ID' 
      }, { status: 400 });
    }

    const parsedCvAnalysisId = parseInt(cvAnalysisId);
    if (isNaN(parsedCvAnalysisId)) {
      return NextResponse.json({ 
        error: 'cvAnalysisId must be a valid integer',
        code: 'INVALID_CV_ANALYSIS_ID' 
      }, { status: 400 });
    }

    const parsedCount = parseInt(count);
    if (isNaN(parsedCount) || parsedCount < 1 || parsedCount > 50) {
      return NextResponse.json({ 
        error: 'count must be between 1 and 50',
        code: 'INVALID_COUNT' 
      }, { status: 400 });
    }

    const cvAnalysisRecord = await db.select()
      .from(cvAnalysis)
      .where(eq(cvAnalysis.id, parsedCvAnalysisId))
      .limit(1);

    if (cvAnalysisRecord.length === 0) {
      return NextResponse.json({ 
        error: 'CV analysis not found',
        code: 'CV_ANALYSIS_NOT_FOUND' 
      }, { status: 404 });
    }

    if (cvAnalysisRecord[0].userId !== session.user.id) {
      return NextResponse.json({ 
        error: 'You do not have permission to access this CV analysis',
        code: 'FORBIDDEN' 
      }, { status: 403 });
    }

    const expertise = cvAnalysisRecord[0].expertise ?? 'general';
    const rawSkills = cvAnalysisRecord[0].skills;
    const skills = typeof rawSkills === 'string'
      ? JSON.parse(rawSkills)
      : Array.isArray(rawSkills)
        ? rawSkills
        : [];
    const category = getIndustryCategory(expertise);

    const generatedLeads = [];
    const timestamp = new Date().toISOString();

    for (let i = 0; i < parsedCount; i++) {
      const companyName = generateCompanyName(category);
      const contact = generateContactName();
      const contactEmail = generateEmail(contact.firstName, contact.lastName, companyName);
      const contactPhone = generatePhoneNumber();
      const companyWebsite = generateWebsite(companyName);
      const industry = getIndustryName(category);
      const location = cities[Math.floor(Math.random() * cities.length)];
      const companySize = companySizes[Math.floor(Math.random() * companySizes.length)];
      const matchScore = calculateMatchScore(skills, category);
      const matchReason = generateMatchReason(expertise, skills);

      generatedLeads.push({
        userId: session.user.id,
        companyName,
        contactName: contact.fullName,
        contactEmail,
        contactPhone,
        companyWebsite,
        industry,
        location,
        companySize,
        matchScore,
        matchReason,
        status: 'new',
        notes: null,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    const insertedLeads = await db.insert(leads)
      .values(generatedLeads)
      .returning();

    return NextResponse.json(insertedLeads, { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}
