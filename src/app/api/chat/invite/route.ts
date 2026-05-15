import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { invitations, user, account, conversations, conversationParticipants } from '@/db/schema';
import { getCurrentUser, getBaseURL } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getEmailToken } from '@/lib/google-auth';

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email, conversationId, inviteType = 'individual' } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (inviteType === 'group' && conversationId) {
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
        return NextResponse.json({ error: 'You are not a member of this group' }, { status: 403 });
      }
    }

    const token = randomUUID();
    const inviteLink = `${getBaseURL()}/chat/join?token=${token}`;

    await db.insert(invitations).values({
      inviterId: currentUser.id,
      email: email,
      token: token,
      conversationId: conversationId || null,
      inviteType: inviteType,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    const emailToken = await getEmailToken(currentUser.id);

    if (!emailToken) {
      return NextResponse.json({ 
        error: 'Email account not linked', 
        message: 'Please sign in with Google or Microsoft to send invitation emails.' 
      }, { status: 400 });
    }

    let groupName = '';
    if (inviteType === 'group' && conversationId) {
      const conv = await db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId),
      });
      groupName = conv?.name || 'a group';
    }

    const subject = inviteType === 'group' 
      ? `Join ${groupName} on HireMindX Chat!`
      : `Join me on HireMindX Chat!`;
    const emailBody = groupName 
      ? `${currentUser.name} has invited you to join the group "${groupName}" on HireMindX Chat.`
      : `${currentUser.name} has invited you to start a conversation on HireMindX Chat.`;

    const message = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #333;">You're invited to chat!</h2>
        <p>${emailBody}</p>
        <div style="margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Join ${inviteType === 'group' ? 'Group' : 'Conversation'}
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">If you don't have an account, you'll be able to create one after clicking the link.</p>
      </div>
    `;

    if (emailToken.provider === "microsoft") {
      const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${emailToken.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "HTML", content: message },
            toRecipients: [{ emailAddress: { address: email } }],
          },
          saveToSentItems: true,
        }),
      });

      if (!graphResponse.ok) {
        const errorData = await graphResponse.json();
        console.error("Microsoft Graph API error:", errorData);
        return NextResponse.json({ error: 'Failed to send email via Microsoft', details: errorData }, { status: 500 });
      }
    } else {
      const messageId = `<${token}@hiremind.chat>`;
      const date = new Date().toUTCString();

      const emailContent = [
        `To: ${email}`,
        `Subject: ${subject}`,
        `Date: ${date}`,
        `Message-ID: ${messageId}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        message
      ].join('\n');

      const base64Email = Buffer.from(emailContent)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${emailToken.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: base64Email }),
      });

      if (!gmailResponse.ok) {
        const errorData = await gmailResponse.json();
        console.error("Gmail API error:", errorData);
        return NextResponse.json({ error: 'Failed to send email via Gmail API', details: errorData }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('Error in invite route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
