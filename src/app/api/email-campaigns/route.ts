import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emailCampaigns, leads } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { leadId, subject, body: emailBody, sendNow } = body;

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Validate required fields
    if (!leadId) {
      return NextResponse.json({ 
        error: "leadId is required",
        code: "MISSING_LEAD_ID" 
      }, { status: 400 });
    }

    if (!subject || typeof subject !== 'string' || subject.trim() === '') {
      return NextResponse.json({ 
        error: "subject is required and must be a non-empty string",
        code: "INVALID_SUBJECT" 
      }, { status: 400 });
    }

    if (!emailBody || typeof emailBody !== 'string' || emailBody.trim() === '') {
      return NextResponse.json({ 
        error: "body is required and must be a non-empty string",
        code: "INVALID_BODY" 
      }, { status: 400 });
    }

    // Validate leadId is valid integer
    const parsedLeadId = parseInt(leadId);
    if (isNaN(parsedLeadId)) {
      return NextResponse.json({ 
        error: "leadId must be a valid integer",
        code: "INVALID_LEAD_ID" 
      }, { status: 400 });
    }

    // Fetch lead by leadId and verify it belongs to user
    const lead = await db.select()
      .from(leads)
      .where(and(
        eq(leads.id, parsedLeadId),
        eq(leads.userId, session.user.id)
      ))
      .limit(1);

    if (lead.length === 0) {
      // Check if lead exists at all
      const leadExists = await db.select()
        .from(leads)
        .where(eq(leads.id, parsedLeadId))
        .limit(1);

      if (leadExists.length === 0) {
        return NextResponse.json({ 
          error: "Lead not found",
          code: "LEAD_NOT_FOUND" 
        }, { status: 404 });
      }

      // Lead exists but doesn't belong to user
      return NextResponse.json({ 
        error: "You do not have permission to access this lead",
        code: "FORBIDDEN" 
      }, { status: 403 });
    }

    const currentTimestamp = new Date().toISOString();

    // Prepare campaign data based on sendNow flag
    const campaignData = {
      userId: session.user.id,
      leadId: parsedLeadId,
      subject: subject.trim(),
      body: emailBody.trim(),
      status: sendNow ? 'sent' : 'draft',
      sentAt: sendNow ? currentTimestamp : null,
      openedAt: null,
      repliedAt: null,
      replyContent: null,
      errorMessage: null,
      createdAt: currentTimestamp,
      updatedAt: currentTimestamp
    };

    // Insert email campaign
    const newCampaign = await db.insert(emailCampaigns)
      .values(campaignData)
      .returning();

    return NextResponse.json(newCampaign[0], { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const status = searchParams.get('status');
    const leadIdParam = searchParams.get('leadId');

    // Build where conditions
    const conditions = [eq(emailCampaigns.userId, session.user.id)];

    // Add status filter
    if (status) {
      const validStatuses = ['draft', 'scheduled', 'sent', 'delivered', 'opened', 'replied', 'bounced', 'failed'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ 
          error: "Invalid status. Must be one of: draft, scheduled, sent, delivered, opened, replied, bounced, failed",
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
      conditions.push(eq(emailCampaigns.status, status));
    }

    // Add leadId filter
    if (leadIdParam) {
      const parsedLeadId = parseInt(leadIdParam);
      if (isNaN(parsedLeadId)) {
        return NextResponse.json({ 
          error: "leadId must be a valid integer",
          code: "INVALID_LEAD_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(emailCampaigns.leadId, parsedLeadId));
    }

    // Fetch campaigns with lead details using left join
    const campaigns = await db.select({
      id: emailCampaigns.id,
      userId: emailCampaigns.userId,
      leadId: emailCampaigns.leadId,
      subject: emailCampaigns.subject,
      body: emailCampaigns.body,
      status: emailCampaigns.status,
      sentAt: emailCampaigns.sentAt,
      openedAt: emailCampaigns.openedAt,
      repliedAt: emailCampaigns.repliedAt,
      replyContent: emailCampaigns.replyContent,
      errorMessage: emailCampaigns.errorMessage,
      createdAt: emailCampaigns.createdAt,
      updatedAt: emailCampaigns.updatedAt,
      lead: {
        id: leads.id,
        userId: leads.userId,
        companyName: leads.companyName,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        contactPhone: leads.contactPhone,
        companyWebsite: leads.companyWebsite,
        industry: leads.industry,
        location: leads.location,
        companySize: leads.companySize,
        matchScore: leads.matchScore,
        matchReason: leads.matchReason,
        status: leads.status,
        notes: leads.notes,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt
      }
    })
    .from(emailCampaigns)
    .leftJoin(leads, eq(emailCampaigns.leadId, leads.id))
    .where(and(...conditions))
    .orderBy(desc(emailCampaigns.createdAt))
    .limit(limit)
    .offset(offset);

    return NextResponse.json(campaigns, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}