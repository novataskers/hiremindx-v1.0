import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emailCampaigns } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

const VALID_STATUSES = ['draft', 'scheduled', 'sent', 'delivered', 'opened', 'replied', 'bounced', 'failed'];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication check
    const session = await auth.api.getSession({
      headers: request.headers
    });

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

    const campaignId = parseInt(id);

    // Fetch campaign
    const campaign = await db.select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.id, campaignId))
      .limit(1);

    if (campaign.length === 0) {
      return NextResponse.json(
        { error: 'Campaign not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (campaign[0].userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to access this campaign', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    return NextResponse.json(campaign[0], { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
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
    const session = await auth.api.getSession({
      headers: request.headers
    });

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

    const campaignId = parseInt(id);

    // Check if campaign exists and belongs to user
    const existingCampaign = await db.select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.id, campaignId))
      .limit(1);

    if (existingCampaign.length === 0) {
      return NextResponse.json(
        { error: 'Campaign not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (existingCampaign[0].userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to update this campaign', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { status, openedAt, repliedAt, replyContent, errorMessage } = body;

    // Validate status if provided
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { 
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 
            code: 'INVALID_STATUS' 
          },
          { status: 400 }
        );
      }
    }

    // Validate timestamp fields if provided
    if (openedAt !== undefined && openedAt !== null) {
      const date = new Date(openedAt);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'Invalid openedAt timestamp format', code: 'INVALID_TIMESTAMP' },
          { status: 400 }
        );
      }
    }

    if (repliedAt !== undefined && repliedAt !== null) {
      const date = new Date(repliedAt);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'Invalid repliedAt timestamp format', code: 'INVALID_TIMESTAMP' },
          { status: 400 }
        );
      }
    }

    // Build update object with only provided fields
    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString()
    };

    if (status !== undefined) {
      updates.status = status;
    }

    if (openedAt !== undefined) {
      updates.openedAt = openedAt;
    }

    if (repliedAt !== undefined) {
      updates.repliedAt = repliedAt;
    }

    if (replyContent !== undefined) {
      updates.replyContent = typeof replyContent === 'string' ? replyContent.trim() : replyContent;
    }

    if (errorMessage !== undefined) {
      updates.errorMessage = typeof errorMessage === 'string' ? errorMessage.trim() : errorMessage;
    }

    // Update campaign in database
    const updatedCampaign = await db.update(emailCampaigns)
      .set(updates)
      .where(
        and(
          eq(emailCampaigns.id, campaignId),
          eq(emailCampaigns.userId, userId)
        )
      )
      .returning();

    if (updatedCampaign.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update campaign', code: 'UPDATE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedCampaign[0], { status: 200 });

  } catch (error) {
    console.error('PUT error:', error);
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
    const session = await auth.api.getSession({
      headers: request.headers
    });

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

    const campaignId = parseInt(id);

    // Check if campaign exists and belongs to user
    const existingCampaign = await db.select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.id, campaignId))
      .limit(1);

    if (existingCampaign.length === 0) {
      return NextResponse.json(
        { error: 'Campaign not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (existingCampaign[0].userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to delete this campaign', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Delete campaign
    const deletedCampaign = await db.delete(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.id, campaignId),
          eq(emailCampaigns.userId, userId)
        )
      )
      .returning();

    if (deletedCampaign.length === 0) {
      return NextResponse.json(
        { error: 'Failed to delete campaign', code: 'DELETE_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Campaign deleted successfully',
        campaign: deletedCampaign[0],
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}