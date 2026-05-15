import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cvAnalysis } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Extract and validate ID
    const { id } = await context.params;
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const recordId = parseInt(id);

    // Fetch CV analysis record
    const record = await db
      .select()
      .from(cvAnalysis)
      .where(eq(cvAnalysis.id, recordId))
      .limit(1);

    // Check if record exists
    if (record.length === 0) {
      return NextResponse.json(
        { error: 'CV analysis record not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (record[0].userId !== session.user.id) {
      return NextResponse.json(
        {
          error: 'You do not have permission to access this record',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      );
    }

    return NextResponse.json(record[0], { status: 200 });
  } catch (error) {
    console.error('GET CV analysis error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error'),
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
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

    const recordId = parseInt(id);

    // Check if record exists and belongs to user
    const existingRecord = await db
      .select()
      .from(cvAnalysis)
      .where(eq(cvAnalysis.id, recordId))
      .limit(1);

    if (existingRecord.length === 0) {
      return NextResponse.json(
        { error: 'CV analysis record not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (existingRecord[0].userId !== userId) {
      return NextResponse.json(
        { error: 'You do not have permission to update this record', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      fullName,
      email,
      phone,
      skills,
      expertise,
      jobTitles,
      experienceYears,
      education,
      summary,
      rawText,
    } = body;

    // Validate email format if provided
    if (email !== undefined && email !== null && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format', code: 'INVALID_EMAIL' },
          { status: 400 }
        );
      }
    }

    // Validate experienceYears if provided
    if (experienceYears !== undefined && experienceYears !== null) {
      const years = parseInt(experienceYears);
      if (isNaN(years) || years < 0) {
        return NextResponse.json(
          { error: 'Experience years must be a non-negative integer', code: 'INVALID_EXPERIENCE_YEARS' },
          { status: 400 }
        );
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (fullName !== undefined) updateData.fullName = fullName !== null ? fullName.trim() : null;
    if (email !== undefined) updateData.email = email !== null ? email.trim().toLowerCase() : null;
    if (phone !== undefined) updateData.phone = phone !== null ? phone.trim() : null;
    if (skills !== undefined) {
      if (typeof skills === 'string') {
        updateData.skills = skills;
      } else if (Array.isArray(skills) || typeof skills === 'object') {
        updateData.skills = JSON.stringify(skills);
      } else {
        updateData.skills = null;
      }
    }
    if (expertise !== undefined) updateData.expertise = expertise !== null ? expertise.trim() : null;
    if (jobTitles !== undefined) {
      if (typeof jobTitles === 'string') {
        updateData.jobTitles = jobTitles;
      } else if (Array.isArray(jobTitles) || typeof jobTitles === 'object') {
        updateData.jobTitles = JSON.stringify(jobTitles);
      } else {
        updateData.jobTitles = null;
      }
    }
    if (experienceYears !== undefined) updateData.experienceYears = experienceYears !== null ? parseInt(experienceYears) : null;
    if (education !== undefined) {
      if (typeof education === 'string') {
        updateData.education = education;
      } else if (Array.isArray(education) || typeof education === 'object') {
        updateData.education = JSON.stringify(education);
      } else {
        updateData.education = null;
      }
    }
    if (summary !== undefined) updateData.summary = summary !== null ? summary.trim() : null;
    if (rawText !== undefined) updateData.rawText = rawText;

    // Update record in database
    const updatedRecord = await db
      .update(cvAnalysis)
      .set(updateData)
      .where(
        and(
          eq(cvAnalysis.id, recordId),
          eq(cvAnalysis.userId, userId)
        )
      )
      .returning();

    if (updatedRecord.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update record', code: 'UPDATE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedRecord[0], { status: 200 });
  } catch (error) {
    console.error('PUT CV analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
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

    const recordId = parseInt(id);

    // Check if record exists and belongs to user
    const existingRecord = await db
      .select()
      .from(cvAnalysis)
      .where(eq(cvAnalysis.id, recordId))
      .limit(1);

    if (existingRecord.length === 0) {
      return NextResponse.json(
        { error: 'CV analysis record not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (existingRecord[0].userId !== userId) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this record', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Delete record from database
    const deletedRecord = await db
      .delete(cvAnalysis)
      .where(
        and(
          eq(cvAnalysis.id, recordId),
          eq(cvAnalysis.userId, userId)
        )
      )
      .returning();

    if (deletedRecord.length === 0) {
      return NextResponse.json(
        { error: 'Failed to delete record', code: 'DELETE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'CV analysis record deleted successfully',
        record: deletedRecord[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('DELETE CV analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
