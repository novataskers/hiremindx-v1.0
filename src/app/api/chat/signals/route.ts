import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { communityMessages, conversationParticipants } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, sql, desc, like } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get recent signals (last 1 minute) across all user's conversations
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000).toISOString();

    const signals = await db.select({
      id: communityMessages.id,
      conversationId: communityMessages.conversationId,
      text: communityMessages.text,
      senderId: communityMessages.senderId,
      senderName: sql<string>`''`.as('senderName'),
      attachmentType: communityMessages.attachmentType,
      createdAt: communityMessages.createdAt,
    })
    .from(communityMessages)
    .innerJoin(conversationParticipants, eq(communityMessages.conversationId, conversationParticipants.conversationId))
    .where(
      and(
        eq(conversationParticipants.userId, currentUser.id),
        sql`${communityMessages.attachmentType} LIKE 'voice_call_%'`,
        sql`${communityMessages.createdAt} > ${oneMinuteAgo}`,
        sql`${communityMessages.senderId} != ${currentUser.id}`
      )
    )
    .orderBy(desc(communityMessages.createdAt))
    .limit(5);

    return NextResponse.json(signals);
  } catch (error) {
    console.error('Error fetching signals:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
