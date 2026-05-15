import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { useFeature } from "@/lib/usage-limits";

export const maxDuration = 60;

import { hiremindState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEmailToken, type EmailProvider } from "@/lib/google-auth";
import {
  type ConversationState,
  type EmailAttachment,
  createInitialState,
  processMessage,
  getWelcomeMessage,
  serializeState,
  deserializeState,
} from "@/lib/hiremind-agent";

async function sendViaMicrosoftAPI(accessToken: string, to: string, subject: string, body: string, attachments?: EmailAttachment[]) {
  if (!to || !to.includes('@')) {
    console.error(`Invalid email address: ${to}`);
    return { success: false, error: `Invalid email address: ${to}` };
  }

  const mailBody: any = {
    message: {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  };

  if (attachments && attachments.length > 0) {
    mailBody.message.attachments = attachments.map(att => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.name,
      contentType: att.type,
      contentBytes: att.base64.includes(',') ? att.base64.split(',')[1] : att.base64,
    }));
  }

    try {
      console.log(`[Microsoft] Sending email to ${to}, subject: "${subject}", token length: ${accessToken?.length}`);
      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mailBody),
      });

      console.log(`[Microsoft] Graph API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Microsoft] Graph API error for ${to}: ${response.status} ${errorText}`);
        try {
          return { success: false, error: JSON.parse(errorText) };
        } catch {
          return { success: false, error: errorText };
        }
      }

      console.log(`[Microsoft] Email successfully sent to ${to} via Microsoft Graph.`);
      return { success: true, to };
  } catch (error) {
    console.error(`Fetch error sending to ${to} via Microsoft:`, error);
    return { success: false, error: String(error) };
  }
}

async function sendViaGmailAPI(accessToken: string, to: string, subject: string, body: string, attachments?: EmailAttachment[]) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  if (!to || !to.includes('@')) {
    console.error(`Invalid email address: ${to}`);
    return { success: false, error: `Invalid email address: ${to}` };
  }

  if (!body) {
    console.error(`Empty email body for ${to}`);
    return { success: false, error: "Email body is empty" };
  }

  let emailContent: string;
  
  if (attachments && attachments.length > 0) {
    const parts: string[] = [];
    
    parts.push(`To: ${to}`);
    parts.push(`Subject: ${subject}`);
    parts.push('MIME-Version: 1.0');
    parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    parts.push('');
    parts.push(`--${boundary}`);
    parts.push('Content-Type: text/plain; charset=utf-8');
    parts.push('Content-Transfer-Encoding: 7bit');
    parts.push('');
    parts.push(body);
    
    for (const attachment of attachments) {
      const base64Data = attachment.base64.includes(',') 
        ? attachment.base64.split(',')[1] 
        : attachment.base64;
      
      parts.push(`--${boundary}`);
      parts.push(`Content-Type: ${attachment.type}; name="${attachment.name}"`);
      parts.push('Content-Transfer-Encoding: base64');
      parts.push(`Content-Disposition: attachment; filename="${attachment.name}"`);
      parts.push('');
      parts.push(base64Data);
    }
    
    parts.push(`--${boundary}--`);
    emailContent = parts.join('\r\n');
  } else {
    emailContent = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body
    ].join('\r\n');
  }

  const base64Email = Buffer.from(emailContent)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  console.log(`Attempting to send email to ${to}${attachments?.length ? ` with ${attachments.length} attachment(s)` : ''}...`);

  try {
    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Email }),
    });

    if (!gmailResponse.ok) {
      const errorData = await gmailResponse.json();
      console.error(`Gmail API error for ${to}:`, JSON.stringify(errorData, null, 2));
      return { success: false, error: errorData };
    }

    const result = await gmailResponse.json();
    console.log(`Email successfully sent to ${to}. Message ID: ${result.id}`);
    return { success: true, messageId: result.id, to };
  } catch (error) {
    console.error(`Fetch error sending to ${to}:`, error);
    return { success: false, error: String(error) };
  }
}

async function loadUserState(userId: string): Promise<ConversationState> {
  try {
    const saved = await db.query.hiremindState.findFirst({
      where: eq(hiremindState.userId, userId),
    });
    
    if (saved && saved.stateJson) {
      return deserializeState(saved.stateJson);
    }
  } catch (error) {
    console.error("Error loading user state:", error);
  }
  return createInitialState();
}

async function saveUserState(userId: string, state: ConversationState): Promise<void> {
  try {
    const stateJson = serializeState(state);
    const now = new Date().toISOString();
    
    const existing = await db.query.hiremindState.findFirst({
      where: eq(hiremindState.userId, userId),
    });
    
    if (existing) {
      await db.update(hiremindState)
        .set({ stateJson, updatedAt: now })
        .where(eq(hiremindState.userId, userId));
    } else {
      await db.insert(hiremindState).values({
        userId,
        stateJson,
        updatedAt: now,
      });
    }
  } catch (error) {
    console.error("Error saving user state:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const reqBody = await request.json();
    const { chatInput, reset, attachments, conversationHistory } = reqBody;

    if (reset) {
      const newState = createInitialState();
      await saveUserState(userId, newState);
      return NextResponse.json({
        output: getWelcomeMessage(),
        status: "welcome",
      });
    }

    if (!chatInput) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Check usage limits
    const usageResult = await useFeature(userId, "chat_messages");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        output: `⚠️ **Daily limit reached!** ${usageResult.upgradeMessage}\n\nYou've used ${usageResult.currentUsage} of ${usageResult.limit} messages today.\n\n[Upgrade your plan →](/premium)`,
        status: "limit_reached",
        limitReached: true,
        usage: {
          used: usageResult.currentUsage,
          limit: usageResult.limit,
          remaining: usageResult.remaining,
          plan: usageResult.plan,
          resetAt: usageResult.resetAt,
          isLifetime: usageResult.isLifetime,
        },
      }, { status: 429 });
    }

      let state = await loadUserState(userId);
      
      // CRITICAL FIX: Do NOT overwrite backend conversationHistory with frontend history
      // The backend state is the source of truth. Frontend history is just for display.
      // Overwriting causes loss of context (emails, companies, attachments) between messages.
      // Only merge new messages that aren't already in the backend history if needed.
      
      // If user has attachments from previous message (pendingAttachments), preserve them
      // Only update pendingAttachments if new attachments are provided
      if (attachments && attachments.length > 0) {
        state.pendingAttachments = attachments;
      }
      // If no new attachments but state has pending ones, keep them (they persist until used)

      // Pass attachments to processMessage for CV extraction
      const result = await processMessage(state, chatInput, session.user.email || undefined, attachments);
    
    // Move save to after email logic or if no emails
    let finalState = result.state;

    if (result.emails && result.emails.length > 0) {
        const emailToken = await getEmailToken(userId);
        
        if (!emailToken) {
          console.warn(`Email sending skipped for user ${userId}: No email token available`);
          await saveUserState(userId, finalState);
          return NextResponse.json({
            output: result.response + "\n\n⚠️ **Email account not connected.** Please sign in with Google or Microsoft to send emails automatically.",
            emails: result.emails,
            emailsSent: false,
            reason: "no_email_token",
            status: "pending_email",
          });
        }

        const emailAttachments = attachments || finalState.pendingAttachments;
        const sendFn = emailToken.provider === "microsoft" ? sendViaMicrosoftAPI : sendViaGmailAPI;

        const sendResults = [];
        for (const email of result.emails) {
          const attachmentsToSend = email.attachments || emailAttachments;
          const sent = await sendFn(
            emailToken.accessToken,
            email.contact_email,
            email.subject,
            email.body,
            attachmentsToSend
          );
          sendResults.push({ ...sent, company: email.company });
        }
      
      if (finalState.pendingAttachments) {
        delete finalState.pendingAttachments;
      }
      
      // Update sent emails history and clear current drafts/companies
      if (!finalState.sentEmails) finalState.sentEmails = [];
      
      const successResults = sendResults.filter(r => r.success);
      if (successResults.length > 0) {
        // Find the full email objects for the successful sends
        for (const sent of successResults) {
          const emailObj = result.emails.find(e => e.company === sent.company && e.contact_email === sent.to);
          if (emailObj) {
            finalState.sentEmails.push(emailObj);
          }
        }
        
        // Clear current session data so we don't duplicate
        finalState.emails = [];
        finalState.companies = [];
        finalState.step = "chatting";
      }
      
      await saveUserState(userId, finalState);

      const successCount = successResults.length;
      const failedCount = sendResults.filter(r => !r.success).length;

      let outputMessage = result.response;
      if (successCount > 0) {
        outputMessage += `\n\n✅ **Successfully sent ${successCount} email${successCount > 1 ? 's' : ''}!**`;
        const sentEmails = sendResults.filter(r => r.success);
        outputMessage += `\n\n**Emails sent to:**\n${sentEmails.map(e => `- ${e.company} (${e.to})`).join('\n')}`;
        if (emailAttachments?.length) {
          outputMessage += `\n\n📎 **Attachments included:** ${emailAttachments.map((a: EmailAttachment) => a.name).join(', ')}`;
        }
      }
      if (failedCount > 0) {
        console.error(`Failed to send ${failedCount} emails for user ${userId}`);
          outputMessage += `\n\n⚠️ **Failed to send ${failedCount} email${failedCount > 1 ? 's' : ''}.**\n\nThis usually happens if your email session has expired or permissions are missing. Please try **signing out and signing back in** with your Google or Microsoft account.`;
      }

      return NextResponse.json({
        output: outputMessage,
        emailsSent: successCount > 0,
        emailResults: sendResults,
        status: "completed",
      });
    }

    await saveUserState(userId, finalState);

    return NextResponse.json({
      output: result.response,
      status: result.state.step === "complete" ? "completed" : "in_progress",
    });
  } catch (error: unknown) {
    console.error("HireMindX chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({
        output: getWelcomeMessage(),
        status: "welcome",
      });
    }

    const state = await loadUserState(session.user.id);
    
      // If they have messages in history, it's a returning session
      if (state.conversationHistory.length > 0) {
        let resumeMsg = `👋 **Welcome back!** I remember our conversation. `;
        
        if (state.profile.fullName) {
          resumeMsg += `Hi ${state.profile.fullName}! `;
        }
        
        if (state.emails.length > 0) {
            resumeMsg += `I still have **${state.emails.length} drafted emails** ready. Should we send them?\n\n[OPTIONS:Yes, send them|No, let me review|Start fresh]`;
          } else if (state.companies.length > 0) {
            resumeMsg += `I found **${state.companies.length} companies** for you earlier. Want me to draft emails?\n\n[OPTIONS:Draft emails|Search again|Start fresh]`;
          } else if (state.profile.jobField) {
          // Sanitize jobField - only show if it looks like a valid job field (short, no sentence-like patterns)
          const jobField = state.profile.jobField;
          const isValidJobField = jobField.length < 50 && !jobField.toLowerCase().includes("attach") && !jobField.toLowerCase().includes("file") && !jobField.toLowerCase().includes("email");
          if (isValidJobField) {
              resumeMsg += `We were looking for **${jobField}** roles${state.profile.location ? ` in **${state.profile.location}**` : ""}. What would you like to do?\n\n[OPTIONS:Search for companies|Send custom email|Start fresh]`;
            } else {
              resumeMsg += `What would you like to do?\n\n[OPTIONS:Job Outreach|Client Outreach|Business Outreach|Send an Email]`;
            }
          } else {
            resumeMsg += `How can I help you today?\n\n[OPTIONS:Job Outreach|Client Outreach|Business Outreach|Send an Email]`;
          }

      return NextResponse.json({
        output: resumeMsg,
        status: "resumed",
        state: {
          profile: state.profile,
          step: state.step
        }
      });
    }
  } catch (error) {
    console.error("GET state error:", error);
  }

  return NextResponse.json({
    output: getWelcomeMessage(),
    status: "welcome",
  });
}
