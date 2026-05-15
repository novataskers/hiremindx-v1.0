import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { jobs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        {
          error: 'Valid ID is required',
          code: 'INVALID_ID',
        },
        { status: 400 }
      );
    }

    // Fetch job by ID
    const job = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, parseInt(id)))
      .limit(1);

    // Check if job exists
    if (job.length === 0) {
      return NextResponse.json(
        {
          error: 'Job not found',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // Return job object
    return NextResponse.json(job[0], { status: 200 });
  } catch (error) {
    console.error('GET job error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error as Error).message,
      },
      { status: 500 }
    );
  }
}