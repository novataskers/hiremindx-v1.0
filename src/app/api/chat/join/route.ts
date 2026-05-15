import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { invitations, conversations, conversationParticipants } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const invitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.token, token),
        eq(invitations.status, 'pending')
      ),
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
    }

    if (invitation.inviterId === currentUser.id) {
      return NextResponse.json({ error: 'You cannot join your own invitation' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      if (invitation.inviteType === 'group' && invitation.conversationId) {
        const existingParticipant = await tx.select()
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, invitation.conversationId),
              eq(conversationParticipants.userId, currentUser.id)
            )
          )
          .limit(1);

        if (existingParticipant.length > 0) {
          await tx.update(invitations)
            .set({ status: 'accepted' })
            .where(eq(invitations.id, invitation.id));
          
          return { id: invitation.conversationId, alreadyMember: true };
        }

        await tx.insert(conversationParticipants).values({
          conversationId: invitation.conversationId,
          userId: currentUser.id,
          joinedAt: new Date().toISOString(),
        });

        await tx.update(invitations)
          .set({ status: 'accepted' })
          .where(eq(invitations.id, invitation.id));

        return { id: invitation.conversationId };
      } else {
        const existingConvs = await tx
          .select({ convId: conversationParticipants.conversationId })
          .from(conversationParticipants)
          .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
          .where(
            and(
              eq(conversationParticipants.userId, currentUser.id),
              eq(conversations.type, 'individual')
            )
          );

        for (const conv of existingConvs) {
          const otherParticipant = await tx.select()
            .from(conversationParticipants)
            .where(
              and(
                eq(conversationParticipants.conversationId, conv.convId),
                eq(conversationParticipants.userId, invitation.inviterId)
              )
            )
            .limit(1);

          if (otherParticipant.length > 0) {
            await tx.update(invitations)
              .set({ status: 'accepted' })
              .where(eq(invitations.id, invitation.id));
            
            return { id: conv.convId, alreadyExists: true };
          }
        }

        const [newConv] = await tx.insert(conversations).values({
          type: 'individual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).returning();

        await tx.insert(conversationParticipants).values([
          {
            conversationId: newConv.id,
            userId: invitation.inviterId,
            joinedAt: invitation.createdAt,
          },
          {
            conversationId: newConv.id,
            userId: currentUser.id,
            joinedAt: new Date().toISOString(),
          }
        ]);

        await tx.update(invitations)
          .set({ status: 'accepted' })
          .where(eq(invitations.id, invitation.id));

        return newConv;
      }
    });

    return NextResponse.json({ success: true, conversationId: result.id });
  } catch (error) {
    console.error('Error in join route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
