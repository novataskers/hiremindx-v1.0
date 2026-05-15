import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { user, conversationParticipants } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, conversationId } = await request.json();

    if (type === 'heartbeat') {
      await db.update(user)
        .set({ lastSeen: Math.floor(Date.now() / 1000) })
        .where(eq(user.id, currentUser.id));
      return NextResponse.json({ success: true });
    }

    if (type === 'typing' && conversationId) {
      await db.update(conversationParticipants)
        .set({ typingUntil: Math.floor(Date.now() / 1000) + 5 })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, currentUser.id)
          )
        );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Error updating status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
