import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { leads } from '@/db/schema';
import { eq, like, or, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const status = searchParams.get('status');
    const industry = searchParams.get('industry');
    const search = searchParams.get('search');

    const conditions = [eq(leads.userId, session.user.id)];

    if (status) {
      const validStatuses = ['new', 'contacted', 'replied', 'qualified', 'rejected'];
      if (validStatuses.includes(status)) {
        conditions.push(eq(leads.status, status));
      }
    }

    if (industry) {
      conditions.push(like(leads.industry, `%${industry}%`));
    }

    if (search) {
      const searchCondition = or(
        like(leads.companyName, `%${search}%`),
        like(leads.contactName, `%${search}%`),
        like(leads.contactEmail, `%${search}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const results = await db.select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { 
      companyName, 
      contactName, 
      contactEmail, 
      contactPhone, 
      companyWebsite, 
      industry, 
      location, 
      companySize, 
      matchScore, 
      matchReason, 
      status, 
      notes 
    } = body;

    if (!companyName || typeof companyName !== 'string' || companyName.trim() === '') {
      return NextResponse.json({ 
        error: "Company name is required and must be a non-empty string",
        code: "MISSING_COMPANY_NAME" 
      }, { status: 400 });
    }

    if (matchScore !== undefined && matchScore !== null) {
      const score = parseInt(matchScore);
      if (isNaN(score) || score < 0 || score > 100) {
        return NextResponse.json({ 
          error: "Match score must be between 0 and 100",
          code: "INVALID_MATCH_SCORE" 
        }, { status: 400 });
      }
    }

    const validStatuses = ['new', 'contacted', 'replied', 'qualified', 'rejected'];
    const leadStatus = status && validStatuses.includes(status) ? status : 'new';

    const now = new Date().toISOString();
    const newLead = await db.insert(leads)
      .values({
        userId: session.user.id,
        companyName: companyName.trim(),
        contactName: contactName ? contactName.trim() : null,
        contactEmail: contactEmail ? contactEmail.trim() : null,
        contactPhone: contactPhone ? contactPhone.trim() : null,
        companyWebsite: companyWebsite ? companyWebsite.trim() : null,
        industry: industry ? industry.trim() : null,
        location: location ? location.trim() : null,
        companySize: companySize ? companySize.trim() : null,
        matchScore: matchScore !== undefined && matchScore !== null ? parseInt(matchScore) : null,
        matchReason: matchReason ? matchReason.trim() : null,
        status: leadStatus,
        notes: notes ? notes.trim() : null,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return NextResponse.json(newLead[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const body = await request.json();

    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const existingLead = await db.select()
      .from(leads)
      .where(and(eq(leads.id, parseInt(id)), eq(leads.userId, session.user.id)))
      .limit(1);

    if (existingLead.length === 0) {
      return NextResponse.json({ 
        error: 'Lead not found or access denied',
        code: "LEAD_NOT_FOUND" 
      }, { status: 404 });
    }

    const { 
      companyName, 
      contactName, 
      contactEmail, 
      contactPhone, 
      companyWebsite, 
      industry, 
      location, 
      companySize, 
      matchScore, 
      matchReason, 
      status, 
      notes 
    } = body;

    if (companyName !== undefined && (typeof companyName !== 'string' || companyName.trim() === '')) {
      return NextResponse.json({ 
        error: "Company name must be a non-empty string",
        code: "INVALID_COMPANY_NAME" 
      }, { status: 400 });
    }

    if (matchScore !== undefined && matchScore !== null) {
      const score = parseInt(matchScore);
      if (isNaN(score) || score < 0 || score > 100) {
        return NextResponse.json({ 
          error: "Match score must be between 0 and 100",
          code: "INVALID_MATCH_SCORE" 
        }, { status: 400 });
      }
    }

    const validStatuses = ['new', 'contacted', 'replied', 'qualified', 'rejected'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return NextResponse.json({ 
        error: "Status must be one of: new, contacted, replied, qualified, rejected",
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    const updateData: any = {
      updatedAt: new Date().toISOString()
    };

    if (companyName !== undefined) updateData.companyName = companyName.trim();
    if (contactName !== undefined) updateData.contactName = contactName ? contactName.trim() : null;
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail ? contactEmail.trim() : null;
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone ? contactPhone.trim() : null;
    if (companyWebsite !== undefined) updateData.companyWebsite = companyWebsite ? companyWebsite.trim() : null;
    if (industry !== undefined) updateData.industry = industry ? industry.trim() : null;
    if (location !== undefined) updateData.location = location ? location.trim() : null;
    if (companySize !== undefined) updateData.companySize = companySize ? companySize.trim() : null;
    if (matchScore !== undefined) updateData.matchScore = matchScore !== null ? parseInt(matchScore) : null;
    if (matchReason !== undefined) updateData.matchReason = matchReason ? matchReason.trim() : null;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes ? notes.trim() : null;

    const updated = await db.update(leads)
      .set(updateData)
      .where(and(eq(leads.id, parseInt(id)), eq(leads.userId, session.user.id)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ 
        error: 'Lead not found or access denied',
        code: "LEAD_NOT_FOUND" 
      }, { status: 404 });
    }

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const existingLead = await db.select()
      .from(leads)
      .where(and(eq(leads.id, parseInt(id)), eq(leads.userId, session.user.id)))
      .limit(1);

    if (existingLead.length === 0) {
      return NextResponse.json({ 
        error: 'Lead not found or access denied',
        code: "LEAD_NOT_FOUND" 
      }, { status: 404 });
    }

    const deleted = await db.delete(leads)
      .where(and(eq(leads.id, parseInt(id)), eq(leads.userId, session.user.id)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ 
        error: 'Lead not found or access denied',
        code: "LEAD_NOT_FOUND" 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Lead deleted successfully',
      lead: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}
