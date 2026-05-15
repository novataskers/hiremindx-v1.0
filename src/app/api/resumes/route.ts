import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { resumes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user via better-auth session
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Check usage limits
    const { useFeature } = await import("@/lib/usage-limits");
    const usageResult = await useFeature(userId, "file_uploads");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        code: "LIMIT_REACHED",
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    const body = await request.json();

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

    const { fileName, fileUrl, fileSize } = body;

    // Validate required fields
    if (!fileName) {
      return NextResponse.json(
        { error: 'fileName is required', code: 'MISSING_FILE_NAME' },
        { status: 400 }
      );
    }

    if (!fileUrl) {
      return NextResponse.json(
        { error: 'fileUrl is required', code: 'MISSING_FILE_URL' },
        { status: 400 }
      );
    }

    if (fileSize === undefined || fileSize === null) {
      return NextResponse.json(
        { error: 'fileSize is required', code: 'MISSING_FILE_SIZE' },
        { status: 400 }
      );
    }

    // Validate fileSize is a number
    if (typeof fileSize !== 'number' || isNaN(fileSize)) {
      return NextResponse.json(
        { error: 'fileSize must be a valid number', code: 'INVALID_FILE_SIZE' },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const sanitizedFileName = fileName.trim();
    const sanitizedFileUrl = fileUrl.trim();

    if (!sanitizedFileName) {
      return NextResponse.json(
        { error: 'fileName cannot be empty', code: 'EMPTY_FILE_NAME' },
        { status: 400 }
      );
    }

    if (!sanitizedFileUrl) {
      return NextResponse.json(
        { error: 'fileUrl cannot be empty', code: 'EMPTY_FILE_URL' },
        { status: 400 }
      );
    }

    // Create timestamp
    const timestamp = new Date().toISOString();

    // Insert resume with auto-generated fields
    const newResume = await db
      .insert(resumes)
      .values({
        userId,
        fileName: sanitizedFileName,
        fileUrl: sanitizedFileUrl,
        fileSize,
        uploadedAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    return NextResponse.json(newResume[0], { status: 201 });
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
    // Authenticate user via better-auth session
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);

    // Pagination parameters
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');

    // Validate pagination parameters
    if (isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: 'Invalid limit parameter', code: 'INVALID_LIMIT' },
        { status: 400 }
      );
    }

    if (isNaN(offset) || offset < 0) {
      return NextResponse.json(
        { error: 'Invalid offset parameter', code: 'INVALID_OFFSET' },
        { status: 400 }
      );
    }

    // Fetch user's resumes with pagination, ordered by uploadedAt DESC
    const userResumes = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.uploadedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(userResumes, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}