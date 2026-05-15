import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { applications } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

const VALID_STATUSES = ['pending', 'applied', 'interview', 'accepted', 'rejected'];

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Get session from Authorization header
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

    const applicationId = parseInt(id);

    // Get request body
    const body = await request.json();
    const { status, notes } = body;

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value', code: 'INVALID_STATUS' },
        { status: 400 }
      );
    }

    // Check if application exists and belongs to user
    const existingApplication = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (existingApplication.length === 0) {
      return NextResponse.json(
        { error: 'Application not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (existingApplication[0].userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden - not your application', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Prepare update data
    const updateData: {
      status?: string;
      notes?: string;
      updatedAt: string;
    } = {
      updatedAt: new Date().toISOString(),
    };

    if (status !== undefined) {
      updateData.status = status;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // Update application
    const updated = await db
      .update(applications)
      .set(updateData)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'Application not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}