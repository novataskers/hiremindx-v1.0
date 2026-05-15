import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { applications, jobs } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';

async function getAuthenticatedUser(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !session.user) {
      return null;
    }
    return session.user;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { jobId, notes } = body;

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json(
        {
          error: 'User ID cannot be provided in request body',
          code: 'USER_ID_NOT_ALLOWED',
        },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required', code: 'MISSING_JOB_ID' },
        { status: 400 }
      );
    }

    // Validate jobId is a valid integer
    const parsedJobId = parseInt(jobId);
    if (isNaN(parsedJobId)) {
      return NextResponse.json(
        { error: 'Invalid job ID format', code: 'INVALID_JOB_ID' },
        { status: 400 }
      );
    }

    // Check if job exists
    const existingJob = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, parsedJobId))
      .limit(1);

    if (existingJob.length === 0) {
      return NextResponse.json(
        { error: 'Job not found', code: 'JOB_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check if user already applied to this job
    const existingApplication = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.userId, user.id),
          eq(applications.jobId, parsedJobId)
        )
      )
      .limit(1);

    if (existingApplication.length > 0) {
      return NextResponse.json(
        {
          error: 'Already applied to this job',
          code: 'DUPLICATE_APPLICATION',
        },
        { status: 409 }
      );
    }

    // Create new application
    const now = new Date().toISOString();
    const newApplication = await db
      .insert(applications)
      .values({
        userId: user.id,
        jobId: parsedJobId,
        status: 'pending',
        appliedAt: now,
        updatedAt: now,
        notes: notes || null,
      })
      .returning();

    return NextResponse.json(newApplication[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const statusFilter = searchParams.get('status');

    // Build base query with user filter
    let whereConditions = eq(applications.userId, user.id);

    // Add status filter if provided
    if (statusFilter) {
      const validStatuses = ['pending', 'applied', 'interview', 'accepted', 'rejected'];
      if (validStatuses.includes(statusFilter)) {
        whereConditions = and(
          eq(applications.userId, user.id),
          eq(applications.status, statusFilter)
        ) as any;
      }
    }

    // Fetch applications with job details using join
    const userApplications = await db
      .select({
        id: applications.id,
        userId: applications.userId,
        jobId: applications.jobId,
        status: applications.status,
        appliedAt: applications.appliedAt,
        updatedAt: applications.updatedAt,
        notes: applications.notes,
        job: {
          id: jobs.id,
          title: jobs.title,
          company: jobs.company,
          description: jobs.description,
          location: jobs.location,
          salaryRange: jobs.salaryRange,
          jobUrl: jobs.jobUrl,
          matchScore: jobs.matchScore,
          status: jobs.status,
          createdAt: jobs.createdAt,
          updatedAt: jobs.updatedAt,
        },
      })
      .from(applications)
      .leftJoin(jobs, eq(applications.jobId, jobs.id))
      .where(whereConditions)
      .orderBy(desc(applications.appliedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(userApplications, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}