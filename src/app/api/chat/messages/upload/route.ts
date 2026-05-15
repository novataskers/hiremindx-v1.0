import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/db';
import { communityMessages, conversations, conversationParticipants } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const conversationId = formData.get('conversationId') as string;

    if (!file || !conversationId) {
      return NextResponse.json({ error: 'File and conversationId are required' }, { status: 400 });
    }

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

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size exceeds 5MB limit' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64Data}`;

    const [newMessage] = await db.insert(communityMessages).values({
      conversationId: parseInt(conversationId),
      senderId: currentUser.id,
      text: "",
      attachmentUrl: dataUrl,
      attachmentType: file.type,
      createdAt: new Date().toISOString(),
      status: 'sent',
    }).returning();

    await db.update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, parseInt(conversationId)));

    return NextResponse.json({ 
      success: true, 
      message: newMessage,
      fileUrl: dataUrl,
      fileName: file.name,
      fileType: file.type
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: String(error) }, { status: 500 });
  }
}
