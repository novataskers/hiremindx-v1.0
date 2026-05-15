import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emailCampaigns } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user using better-auth session
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Extract and validate ID from params
    const { id } = await context.params;
    const parsedId = parseInt(id);

    if (!id || isNaN(parsedId)) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // Query campaign by ID
    const campaign = await db
      .select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.id, parsedId))
      .limit(1);

    if (campaign.length === 0) {
      return NextResponse.json(
        { error: 'Campaign not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify userId matches session user
    if (campaign[0].userId !== userId) {
      return NextResponse.json(
        { error: 'Access forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // Check if campaign already sent
    const currentStatus = campaign[0].status;
    const alreadySentStatuses = ['sent', 'delivered', 'opened', 'replied'];
    
    if (alreadySentStatuses.includes(currentStatus)) {
      return NextResponse.json(
        { error: 'Campaign already sent', code: 'ALREADY_SENT' },
        { status: 400 }
      );
    }

    // Update campaign status to sent
    const updateData = {
      status: 'sent',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedCampaign = await db
      .update(emailCampaigns)
      .set(updateData)
      .where(
        and(
          eq(emailCampaigns.id, parsedId),
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
    console.error('POST /api/email-campaigns/[id]/send error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}