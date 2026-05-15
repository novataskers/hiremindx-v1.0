import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { leads } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const leadId = parseInt(id);

    const lead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (lead.length === 0) {
      return NextResponse.json(
        { error: 'Lead not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (lead[0].userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    return NextResponse.json(lead[0], { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const leadId = parseInt(id);

    const existingLead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (existingLead.length === 0) {
      return NextResponse.json(
        { error: 'Lead not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (existingLead[0].userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json(
        {
          error: 'User ID cannot be provided in request body',
          code: 'USER_ID_NOT_ALLOWED',
        },
        { status: 400 }
      );
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
      notes,
    } = body;

    if (status !== undefined) {
      const validStatuses = ['new', 'contacted', 'replied', 'qualified', 'rejected'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            code: 'INVALID_STATUS',
          },
          { status: 400 }
        );
      }
    }

    if (matchScore !== undefined) {
      const score = parseInt(matchScore);
      if (isNaN(score) || score < 0 || score > 100) {
        return NextResponse.json(
          {
            error: 'Match score must be a number between 0 and 100',
            code: 'INVALID_MATCH_SCORE',
          },
          { status: 400 }
        );
      }
    }

    if (contactEmail !== undefined && contactEmail.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contactEmail)) {
        return NextResponse.json(
          {
            error: 'Invalid email format',
            code: 'INVALID_EMAIL',
          },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (companyName !== undefined) updateData.companyName = companyName.trim();
    if (contactName !== undefined) updateData.contactName = contactName.trim();
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail.trim().toLowerCase();
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone.trim();
    if (companyWebsite !== undefined) updateData.companyWebsite = companyWebsite.trim();
    if (industry !== undefined) updateData.industry = industry.trim();
    if (location !== undefined) updateData.location = location.trim();
    if (companySize !== undefined) updateData.companySize = companySize.trim();
    if (matchScore !== undefined) updateData.matchScore = parseInt(matchScore);
    if (matchReason !== undefined) updateData.matchReason = matchReason;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const updatedLead = await db
      .update(leads)
      .set(updateData)
      .where(and(eq(leads.id, leadId), eq(leads.userId, session.user.id)))
      .returning();

    if (updatedLead.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update lead', code: 'UPDATE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedLead[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const leadId = parseInt(id);

    const existingLead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (existingLead.length === 0) {
      return NextResponse.json(
        { error: 'Lead not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (existingLead[0].userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const deletedLead = await db
      .delete(leads)
      .where(and(eq(leads.id, leadId), eq(leads.userId, session.user.id)))
      .returning();

    if (deletedLead.length === 0) {
      return NextResponse.json(
        { error: 'Failed to delete lead', code: 'DELETE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Lead deleted successfully',
        lead: deletedLead[0],
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