import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { resumes } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { id } = await context.params;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const resumeId = parseInt(id);

    // Check if resume exists and belongs to user
    const existingResume = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, resumeId))
      .limit(1);

    if (existingResume.length === 0) {
      return NextResponse.json(
        { error: 'Resume not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (existingResume[0].userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden - not your resume', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Delete the resume
    const deleted = await db
      .delete(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .returning();

    return NextResponse.json(
      {
        message: 'Resume deleted successfully',
        resume: deleted[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}