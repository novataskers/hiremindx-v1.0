import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { jobs } from '@/db/schema';
import { eq, like, and, or, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    // Single record fetch by ID
    if (id) {
      const parsedId = parseInt(id);
      if (isNaN(parsedId)) {
        return NextResponse.json(
          { error: 'Valid ID is required', code: 'INVALID_ID' },
          { status: 400 }
        );
      }

      const job = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, parsedId))
        .limit(1);

      if (job.length === 0) {
        return NextResponse.json(
          { error: 'Job not found', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      return NextResponse.json(job[0], { status: 200 });
    }

    // List with filters, pagination, and search
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const location = searchParams.get('location');
    const sort = searchParams.get('sort') ?? 'createdAt';
    const order = searchParams.get('order') ?? 'desc';

    const baseQuery = db.select().from(jobs);

    // Build where conditions
    const conditions = [];

    // Search across title, company, and location
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          like(jobs.title, searchTerm),
          like(jobs.company, searchTerm),
          like(jobs.location, searchTerm)
        )
      );
    }

    // Status filter
    if (status) {
      conditions.push(eq(jobs.status, status));
    }

    // Location filter
    if (location) {
      conditions.push(like(jobs.location, `%${location}%`));
    }

    const filteredQuery = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    // Apply sorting
    const sortColumn = sort === 'createdAt' ? jobs.createdAt : jobs.createdAt;
    const sortedQuery = order === 'asc'
      ? filteredQuery.orderBy(sortColumn)
      : filteredQuery.orderBy(desc(sortColumn));

    // Apply pagination
    const results = await sortedQuery.limit(limit).offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract and validate fields
    const { 
      title, 
      company, 
      description, 
      location, 
      salaryRange, 
      jobUrl, 
      matchScore, 
      status 
    } = body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json(
        { error: 'Title is required and must be a non-empty string', code: 'MISSING_TITLE' },
        { status: 400 }
      );
    }

    if (!company || typeof company !== 'string' || company.trim() === '') {
      return NextResponse.json(
        { error: 'Company is required and must be a non-empty string', code: 'MISSING_COMPANY' },
        { status: 400 }
      );
    }

    // Validate matchScore if provided
    if (matchScore !== undefined && matchScore !== null) {
      const score = parseInt(matchScore);
      if (isNaN(score) || score < 0 || score > 100) {
        return NextResponse.json(
          { error: 'Match score must be between 0 and 100', code: 'INVALID_MATCH_SCORE' },
          { status: 400 }
        );
      }
    }

    // Validate status if provided
    if (status !== undefined && status !== null) {
      if (status !== 'active' && status !== 'archived') {
        return NextResponse.json(
          { error: 'Status must be either "active" or "archived"', code: 'INVALID_STATUS' },
          { status: 400 }
        );
      }
    }

    // Prepare insert data with sanitized inputs
    const now = new Date().toISOString();
    const insertData: any = {
      title: title.trim(),
      company: company.trim(),
      status: status || 'active',
      createdAt: now,
      updatedAt: now,
    };

    // Add optional fields if provided
    if (description !== undefined && description !== null) {
      insertData.description = typeof description === 'string' ? description.trim() : description;
    }

    if (location !== undefined && location !== null) {
      insertData.location = typeof location === 'string' ? location.trim() : location;
    }

    if (salaryRange !== undefined && salaryRange !== null) {
      insertData.salaryRange = typeof salaryRange === 'string' ? salaryRange.trim() : salaryRange;
    }

    if (jobUrl !== undefined && jobUrl !== null) {
      insertData.jobUrl = typeof jobUrl === 'string' ? jobUrl.trim() : jobUrl;
    }

    if (matchScore !== undefined && matchScore !== null) {
      insertData.matchScore = parseInt(matchScore);
    }

    // Insert into database
    const newJob = await db.insert(jobs).values(insertData).returning();

    return NextResponse.json(newJob[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const parsedId = parseInt(id);

    // Check if job exists
    const existingJob = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, parsedId))
      .limit(1);

    if (existingJob.length === 0) {
      return NextResponse.json(
        { error: 'Job not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { 
      title, 
      company, 
      description, 
      location, 
      salaryRange, 
      jobUrl, 
      matchScore, 
      status 
    } = body;

    // Validate fields if provided
    if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
      return NextResponse.json(
        { error: 'Title must be a non-empty string', code: 'INVALID_TITLE' },
        { status: 400 }
      );
    }

    if (company !== undefined && (typeof company !== 'string' || company.trim() === '')) {
      return NextResponse.json(
        { error: 'Company must be a non-empty string', code: 'INVALID_COMPANY' },
        { status: 400 }
      );
    }

    if (matchScore !== undefined && matchScore !== null) {
      const score = parseInt(matchScore);
      if (isNaN(score) || score < 0 || score > 100) {
        return NextResponse.json(
          { error: 'Match score must be between 0 and 100', code: 'INVALID_MATCH_SCORE' },
          { status: 400 }
        );
      }
    }

    if (status !== undefined && status !== null) {
      if (status !== 'active' && status !== 'archived') {
        return NextResponse.json(
          { error: 'Status must be either "active" or "archived"', code: 'INVALID_STATUS' },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (title !== undefined) {
      updateData.title = title.trim();
    }

    if (company !== undefined) {
      updateData.company = company.trim();
    }

    if (description !== undefined) {
      updateData.description = description !== null && typeof description === 'string' 
        ? description.trim() 
        : description;
    }

    if (location !== undefined) {
      updateData.location = location !== null && typeof location === 'string' 
        ? location.trim() 
        : location;
    }

    if (salaryRange !== undefined) {
      updateData.salaryRange = salaryRange !== null && typeof salaryRange === 'string' 
        ? salaryRange.trim() 
        : salaryRange;
    }

    if (jobUrl !== undefined) {
      updateData.jobUrl = jobUrl !== null && typeof jobUrl === 'string' 
        ? jobUrl.trim() 
        : jobUrl;
    }

    if (matchScore !== undefined) {
      updateData.matchScore = matchScore !== null ? parseInt(matchScore) : null;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    // Update in database
    const updated = await db
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, parsedId))
      .returning();

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const parsedId = parseInt(id);

    // Check if job exists
    const existingJob = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, parsedId))
      .limit(1);

    if (existingJob.length === 0) {
      return NextResponse.json(
        { error: 'Job not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Delete from database
    const deleted = await db
      .delete(jobs)
      .where(eq(jobs.id, parsedId))
      .returning();

    return NextResponse.json(
      { 
        message: 'Job deleted successfully', 
        job: deleted[0] 
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
