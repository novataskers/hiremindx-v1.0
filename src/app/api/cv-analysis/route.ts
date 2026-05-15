import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cvAnalysis, resumes } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

// Helper function to extract email from text
function extractEmail(text: string): string | null {
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
  const match = text.match(emailRegex);
  return match ? match[0].toLowerCase() : null;
}

// Helper function to extract phone from text
function extractPhone(text: string): string | null {
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const match = text.match(phoneRegex);
  return match ? match[0].trim() : null;
}

// Helper function to extract skills from text
function extractSkills(text: string): string[] {
  const skillKeywords = [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'C++', 'C#',
    'Ruby', 'PHP', 'Swift', 'Kotlin', 'Go', 'Rust', 'SQL', 'MongoDB', 'PostgreSQL',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Git', 'Agile', 'Scrum',
    'Marketing', 'SEO', 'SEM', 'Sales', 'CRM', 'Content Writing', 'Copywriting',
    'Data Analysis', 'Excel', 'PowerPoint', 'Project Management', 'Leadership',
    'Communication', 'Problem Solving', 'Team Collaboration', 'HTML', 'CSS',
    'Vue.js', 'Angular', 'Django', 'Flask', 'Spring', 'Laravel', 'Rails',
    'Machine Learning', 'AI', 'Deep Learning', 'TensorFlow', 'PyTorch',
    'GraphQL', 'REST API', 'Microservices', 'CI/CD', 'DevOps', 'Linux',
    'Figma', 'Adobe XD', 'Photoshop', 'Illustrator', 'UI/UX', 'Design',
    'Financial Analysis', 'Accounting', 'Budgeting', 'Forecasting',
    'Customer Service', 'Technical Support', 'Troubleshooting'
  ];

  const foundSkills: string[] = [];
  const lowerText = text.toLowerCase();

  for (const skill of skillKeywords) {
    if (lowerText.includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  }

  return [...new Set(foundSkills)];
}

// Helper function to infer expertise from skills
function inferExpertise(skills: string[]): string {
  const categories = {
    'Software Engineering': ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'C++', 'HTML', 'CSS'],
    'Data Science': ['Python', 'Machine Learning', 'AI', 'TensorFlow', 'PyTorch', 'Data Analysis'],
    'DevOps': ['Docker', 'Kubernetes', 'AWS', 'Azure', 'CI/CD', 'Linux'],
    'Marketing': ['Marketing', 'SEO', 'SEM', 'Content Writing', 'Copywriting'],
    'Sales': ['Sales', 'CRM', 'Customer Service'],
    'Design': ['Figma', 'Adobe XD', 'Photoshop', 'UI/UX', 'Design'],
    'Finance': ['Financial Analysis', 'Accounting', 'Budgeting', 'Forecasting'],
    'Project Management': ['Project Management', 'Agile', 'Scrum', 'Leadership']
  };

  let maxCount = 0;
  let primaryExpertise = 'General';

  for (const [category, keywords] of Object.entries(categories)) {
    const count = skills.filter(skill => 
      keywords.some(keyword => skill.toLowerCase().includes(keyword.toLowerCase()))
    ).length;

    if (count > maxCount) {
      maxCount = count;
      primaryExpertise = category;
    }
  }

  return primaryExpertise;
}

// Helper function to extract job titles from text
function extractJobTitles(text: string): string[] {
  const titleKeywords = [
    'Software Engineer', 'Senior Developer', 'Junior Developer', 'Full Stack Developer',
    'Frontend Developer', 'Backend Developer', 'DevOps Engineer', 'Data Scientist',
    'Product Manager', 'Project Manager', 'Marketing Manager', 'Sales Manager',
    'UX Designer', 'UI Designer', 'Graphic Designer', 'Analyst', 'Consultant',
    'Director', 'Team Lead', 'Tech Lead', 'CTO', 'CEO', 'VP', 'Manager',
    'Coordinator', 'Specialist', 'Associate', 'Intern', 'Trainee'
  ];

  const foundTitles: string[] = [];
  const lowerText = text.toLowerCase();

  for (const title of titleKeywords) {
    if (lowerText.includes(title.toLowerCase())) {
      foundTitles.push(title);
    }
  }

  return [...new Set(foundTitles)];
}

// Helper function to estimate experience years
function estimateExperience(text: string): number {
  const yearRegex = /(\d+)\+?\s*years?/gi;
  const matches = text.match(yearRegex);
  
  if (matches && matches.length > 0) {
    const years = matches.map(match => parseInt(match.match(/\d+/)?.[0] || '0'));
    return Math.max(...years);
  }

  // Estimate based on number of job positions mentioned
  const jobCount = (text.match(/\d{4}\s*-\s*\d{4}/g) || []).length;
  return Math.min(jobCount * 2, 15);
}

// Helper function to extract education
function extractEducation(text: string): Array<{ degree: string; institution: string; year?: string }> {
  const educationKeywords = [
    'Bachelor', 'Master', 'PhD', 'Associate', 'Diploma', 'Certificate',
    'B.S.', 'B.A.', 'M.S.', 'M.A.', 'MBA', 'B.Tech', 'M.Tech'
  ];

  const education: Array<{ degree: string; institution: string; year?: string }> = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const keyword of educationKeywords) {
      if (line.toLowerCase().includes(keyword.toLowerCase())) {
        const yearMatch = line.match(/\d{4}/);
        education.push({
          degree: keyword,
          institution: 'University',
          year: yearMatch ? yearMatch[0] : undefined
        });
        break;
      }
    }
  }

  return education.length > 0 ? education : [{ degree: 'Not specified', institution: 'Not specified' }];
}

// Helper function to extract full name
function extractFullName(text: string): string {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Try first non-empty line
  if (lines.length > 0) {
    const firstLine = lines[0];
    // Check if it looks like a name (2-4 words, no special characters except spaces)
    if (/^[a-zA-Z\s]{2,50}$/.test(firstLine) && firstLine.split(' ').length <= 4) {
      return firstLine;
    }
  }

  return 'Name Not Found';
}

// Helper function to generate professional summary
function generateSummary(data: {
  fullName: string;
  expertise: string;
  experienceYears: number;
  skills: string[];
  jobTitles: string[];
}): string {
  const skillsList = data.skills.slice(0, 5).join(', ');
  const latestTitle = data.jobTitles.length > 0 ? data.jobTitles[0] : 'professional';
  
  if (data.experienceYears > 0) {
    return `${data.fullName} is an experienced ${data.expertise} professional with ${data.experienceYears}+ years of expertise. Skilled in ${skillsList}. Previously worked as ${latestTitle}, bringing strong technical and leadership capabilities to drive successful project outcomes.`;
  } else {
    return `${data.fullName} is a ${data.expertise} professional with expertise in ${skillsList}. Demonstrates strong capabilities as ${latestTitle} with a focus on delivering high-quality results and continuous learning.`;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ 
        error: 'Authentication required',
        code: 'UNAUTHORIZED' 
      }, { status: 401 });
    }

    // Pagination parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');

    // Fetch cv analyses for authenticated user
    const analyses = await db.select()
      .from(cvAnalysis)
      .where(eq(cvAnalysis.userId, session.user.id))
      .orderBy(desc(cvAnalysis.analyzedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(analyses, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ 
        error: 'Authentication required',
        code: 'UNAUTHORIZED' 
      }, { status: 401 });
    }

    const body = await request.json();

    // Security: Block userId in request body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check usage limits
    const { useFeature } = await import("@/lib/usage-limits");
    const usageResult = await useFeature(session.user.id, "file_uploads");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    const { resumeId, cvText } = body;

    // Validate required fields
    if (!cvText || typeof cvText !== 'string' || cvText.trim().length === 0) {
      return NextResponse.json({ 
        error: 'cvText is required and must be a non-empty string',
        code: 'MISSING_CV_TEXT' 
      }, { status: 400 });
    }

    // Validate resumeId if provided
    if (resumeId !== undefined && resumeId !== null) {
      if (isNaN(parseInt(resumeId))) {
        return NextResponse.json({ 
          error: 'resumeId must be a valid integer',
          code: 'INVALID_RESUME_ID' 
        }, { status: 400 });
      }

      // Verify resume belongs to user
      const resume = await db.select()
        .from(resumes)
        .where(and(
          eq(resumes.id, parseInt(resumeId)),
          eq(resumes.userId, session.user.id)
        ))
        .limit(1);

      if (resume.length === 0) {
        return NextResponse.json({ 
          error: 'Resume not found or does not belong to you',
          code: 'RESUME_NOT_FOUND' 
        }, { status: 404 });
      }
    }

    // Parse CV text
    const trimmedText = cvText.trim();
    const fullName = extractFullName(trimmedText);
    const email = extractEmail(trimmedText);
    const phone = extractPhone(trimmedText);
    const skills = extractSkills(trimmedText);
    const expertise = inferExpertise(skills);
    const jobTitles = extractJobTitles(trimmedText);
    const experienceYears = estimateExperience(trimmedText);
    const education = extractEducation(trimmedText);

    const summary = generateSummary({
      fullName,
      expertise,
      experienceYears,
      skills,
      jobTitles
    });

    const now = new Date().toISOString();

    // Insert CV analysis
    const newAnalysis = await db.insert(cvAnalysis)
      .values({
        userId: session.user.id,
        resumeId: resumeId ? parseInt(resumeId) : null,
        fullName,
        email,
        phone,
        skills: JSON.stringify(skills),
        expertise,
        jobTitles: JSON.stringify(jobTitles),
        experienceYears,
        education: JSON.stringify(education),
        summary,
        rawText: trimmedText,
        analyzedAt: now,
        updatedAt: now
      })
      .returning();

    return NextResponse.json(newAnalysis[0], { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}