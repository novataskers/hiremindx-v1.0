import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getEmailToken } from "@/lib/google-auth";

export async function POST(request: NextRequest) {
  try {
    const { to, subject, message } = await request.json();
    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    if (!to || !subject || !message) {
      return NextResponse.json({ error: "to, subject, and message are required" }, { status: 400 });
    }

    const userRecord = await db.query.user.findFirst({
      where: eq(user.id, sessionId),
    });

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check usage limits
    const { useFeature } = await import("@/lib/usage-limits");
    const usageResult = await useFeature(sessionId, "email_outreach");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    const emailToken = await getEmailToken(sessionId);

    if (!emailToken) {
      return NextResponse.json({ error: "No Google or Microsoft account linked with a valid email token. Please reconnect your email account." }, { status: 404 });
    }

    const { accessToken, provider } = emailToken;

    if (provider === "microsoft") {
      return await sendViaMicrosoft(accessToken, to, subject, message);
    }

    return await sendViaGmail(accessToken, to, subject, message);

  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Gmail ───────────────────────────────────────────────────────────────────

async function sendViaGmail(accessToken: string, to: string, subject: string, message: string) {
  const hasNonAscii = /[^\x00-\x7F]/.test(subject);
  const encodedSubject = hasNonAscii
    ? `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
    : subject;

  const emailContent = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(message, 'utf-8').toString('base64')
  ].join('\n');

  const base64Email = Buffer.from(emailContent)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

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
    console.error("Gmail API error:", errorData);
    return NextResponse.json({ error: "Failed to send email", details: errorData }, { status: gmailResponse.status });
  }

  const result = await gmailResponse.json();
  return NextResponse.json({ success: true, message: `Email sent to ${to}`, messageId: result.id, provider: "google" });
}

// ── Microsoft Graph ─────────────────────────────────────────────────────────

async function sendViaMicrosoft(accessToken: string, to: string, subject: string, message: string) {
  const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: message,
        },
        toRecipients: [
          { emailAddress: { address: to } },
        ],
      },
      saveToSentItems: true,
    }),
  });

  if (!graphResponse.ok) {
    const errorData = await graphResponse.json();
    console.error("Microsoft Graph API error:", errorData);
    return NextResponse.json({ error: "Failed to send email", details: errorData }, { status: graphResponse.status });
  }

  // Microsoft Graph sendMail returns 202 with no body on success
  return NextResponse.json({ success: true, message: `Email sent to ${to}`, provider: "microsoft" });
}
