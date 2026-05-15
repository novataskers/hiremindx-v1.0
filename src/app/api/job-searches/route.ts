import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { jobSearches } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from "@/lib/auth";

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

    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json(
        { 
          error: "User ID cannot be provided in request body",
          code: "USER_ID_NOT_ALLOWED" 
        },
        { status: 400 }
      );
    }

    const { searchQuery, filters } = body;

    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim() === '') {
      return NextResponse.json(
        { error: 'Search query is required and must be a non-empty string', code: 'MISSING_SEARCH_QUERY' },
        { status: 400 }
      );
    }

    const trimmedSearchQuery = searchQuery.trim();

    let filtersString: string | null = null;
    if (filters !== undefined && filters !== null) {
      if (typeof filters === 'string') {
        filtersString = filters;
      } else if (typeof filters === 'object') {
        try {
          filtersString = JSON.stringify(filters);
        } catch (error) {
          return NextResponse.json(
            { error: 'Invalid filters format', code: 'INVALID_FILTERS' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Filters must be a string or object', code: 'INVALID_FILTERS_TYPE' },
          { status: 400 }
        );
      }
    }

    const newJobSearch = await db.insert(jobSearches)
      .values({
        userId: user.id,
        searchQuery: trimmedSearchQuery,
        filters: filtersString,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(newJobSearch[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
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
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');

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

    const results = await db.select()
      .from(jobSearches)
      .where(eq(jobSearches.userId, user.id))
      .orderBy(desc(jobSearches.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}