import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { conversations, conversationParticipants, user } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, or, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all conversations where the user is a participant
    const userConversations = await db.select({
      id: conversations.id,
      type: conversations.type,
      name: conversations.name,
      image: conversations.image,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .innerJoin(conversationParticipants, eq(conversations.id, conversationParticipants.conversationId))
    .where(eq(conversationParticipants.userId, currentUser.id))
    .orderBy(sql`${conversations.updatedAt} DESC`);

    // For each conversation, get details about participants
    const conversationsWithDetails = await Promise.all(userConversations.map(async (conv) => {
      const now = Math.floor(Date.now() / 1000);
      
      const participants = await db.select({
        id: user.id,
        name: user.name,
        image: user.image,
        lastSeen: user.lastSeen,
        typingUntil: conversationParticipants.typingUntil,
      })
      .from(conversationParticipants)
      .innerJoin(user, eq(conversationParticipants.userId, user.id))
      .where(eq(conversationParticipants.conversationId, conv.id));

      const otherParticipants = participants.filter(p => p.id !== currentUser.id);
      const isOnline = otherParticipants.some(p => p.lastSeen && (now - p.lastSeen) < 60);
      const isTyping = otherParticipants.some(p => p.typingUntil && p.typingUntil > now);
      const typingUsers = otherParticipants
        .filter(p => p.typingUntil && p.typingUntil > now)
        .map(p => p.name);

      if (conv.type === 'individual') {
        const other = otherParticipants[0];
        return {
          ...conv,
          name: other?.name || 'Unknown User',
          image: other?.image,
          otherUserId: other?.id,
          online: isOnline,
          isTyping: isTyping,
          typingUsers: typingUsers
        };
      }
      
      return {
        ...conv,
        online: isOnline,
        isTyping: isTyping,
        typingUsers: typingUsers
      };
    }));

    return NextResponse.json(conversationsWithDetails);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { type, name, image, participantIds } = await request.json();

    if (type === 'group' && !name) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    // Start a transaction
    const result = await db.transaction(async (tx) => {
      // 1. Create conversation
      const [newConv] = await tx.insert(conversations).values({
        type,
        name: type === 'group' ? name : null,
        image: type === 'group' ? image : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).returning();

      // 2. Add participants
      const participantsToInsert = [currentUser.id, ...participantIds].map(userId => ({
        conversationId: newConv.id,
        userId,
        joinedAt: new Date().toISOString(),
      }));

      await tx.insert(conversationParticipants).values(participantsToInsert);

      return newConv;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { conversationIds } = await request.json();

    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return NextResponse.json({ error: 'Conversation IDs are required' }, { status: 400 });
    }

    // We only allow deleting if the user is a participant. 
    // Drizzle will handle the cascading delete if schema is set up with onDelete: 'cascade'
    // which it is for conversationParticipants and communityMessages.
    
    await db.delete(conversations)
      .where(
        and(
          sql`${conversations.id} IN ${conversationIds}`,
          // Verify participation
          sql`EXISTS (SELECT 1 FROM ${conversationParticipants} WHERE ${conversationParticipants.conversationId} = ${conversations.id} AND ${conversationParticipants.userId} = ${currentUser.id})`
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversations:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
