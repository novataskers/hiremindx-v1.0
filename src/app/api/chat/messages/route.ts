import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { communityMessages, conversations, conversationParticipants, user } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
  }

  try {
    // Check if user is a participant
    const isParticipant = await db.select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, parseInt(conversationId)),
          eq(conversationParticipants.userId, currentUser.id)
        )
      )
      .limit(1);

    if (isParticipant.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

      // Fetch messages
      const messages = await db.select({
        id: communityMessages.id,
        text: communityMessages.text,
        attachmentUrl: communityMessages.attachmentUrl,
        attachmentType: communityMessages.attachmentType,
        senderId: communityMessages.senderId,
        senderName: user.name,
        createdAt: communityMessages.createdAt,
        status: communityMessages.status,
      })
      .from(communityMessages)
      .leftJoin(user, eq(communityMessages.senderId, user.id))
      .where(eq(communityMessages.conversationId, parseInt(conversationId)))
      .orderBy(communityMessages.createdAt);

    // Transform messages to include attachments as array for frontend compatibility
    const transformedMessages = messages.map(msg => {
      const transformed: any = {
        id: msg.id,
        text: msg.text,
        senderId: msg.senderId,
        senderName: msg.senderName,
        createdAt: msg.createdAt,
        status: msg.status,
        attachments: msg.attachmentUrl ? [{
          url: msg.attachmentUrl,
          type: msg.attachmentType,
        }] : [],
      };
      return transformed;
    });

    return NextResponse.json(transformedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

    try {
      const { conversationId, text, attachmentUrl, attachmentType } = await request.json();

      if (!conversationId || (!text && !attachmentUrl)) {
        return NextResponse.json({ error: 'Conversation ID and content are required' }, { status: 400 });
      }

      // Check if user is a participant
      const isParticipant = await db.select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, currentUser.id)
          )
        )
        .limit(1);

      if (isParticipant.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Insert message
      const [newMessage] = await db.insert(communityMessages).values({
        conversationId,
        senderId: currentUser.id,
        text: text || "",
        attachmentUrl,
        attachmentType,
        createdAt: new Date().toISOString(),
        status: 'sent',
      }).returning();

    // Update conversation updatedAt
    await db.update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conversationId));

    return NextResponse.json(newMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { messageIds } = await request.json();

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'Message IDs are required' }, { status: 400 });
    }

    await db.delete(communityMessages)
      .where(
        and(
          sql`${communityMessages.id} IN ${messageIds}`,
          eq(communityMessages.senderId, currentUser.id)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting messages:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
