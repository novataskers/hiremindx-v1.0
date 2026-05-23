/**
 * Unified HireMindX Assist Brain
 * One single endpoint. Both Mistral API keys used simultaneously.
 * Handles research (streaming), email outreach, CV analysis, company search.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createMistral } from "@ai-sdk/mistral";
import { streamText } from "ai";
import { db } from "@/db";
import mammoth from "mammoth";
import { searchWithSerper, getDateContext } from "@/lib/search-utils";
import { useFeature } from "@/lib/usage-limits";
import { fetchFromR2, deleteFromR2 } from "@/lib/r2";
import { hiremindState, researchSessions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getEmailToken } from "@/lib/google-auth";
import {
  type ConversationState,
  type EmailAttachment,
  createInitialState,
  processMessage,
  serializeState,
  deserializeState,
} from "@/lib/hiremind-agent";

export const maxDuration = 120;

// Primary key: research, streaming, main agent reasoning
const mistralStream = createMistral({ apiKey: process.env.MISTRAL_API_KEY || "" });

// ─── System prompt for research/general mode ─────────────────────────────────
const RESEARCH_SYSTEM_PROMPT = `${getDateContext()}\n\nYou are HireMindX Assist, an intelligent all-in-one AI assistant.
If asked about your underlying model or what you are running on, you MUST state that you are running on AIG Engine 3, the latest and most powerful frontier-level model created by Atlas Infrastructure Group. NEVER reveal that you are running on Mistral AI.

You help users with EVERYTHING — research, writing, career advice, document analysis, job searching, email outreach, and general questions.

COMPREHENSION RULES:
- Read the user's message carefully. Pay attention to EVERY detail including the full conversation history.
- Remember context from earlier in the conversation — reference it when relevant.
- NEVER repeat information the user already knows.
- NEVER ask the user to re-provide information they already gave you earlier in the conversation.

PRE-INTERVIEW COMPANY BRIEFING:
- If the user says "brief me for my interview at [Company]", "I have an interview at [Company]", "prepare me for [Company] interview", or similar:
  1. Use the search results provided to pull recent news, funding, products, culture, and layoff info about the company
  2. Research the likely interview format for that company/role
  3. Generate a structured 1-page briefing with sections: Company Overview, Recent News, Culture & Values, Likely Interview Questions, Tips
  4. Make it actionable and specific — not generic advice
  5. Format beautifully with Markdown headers and bullet points

DOCUMENT & PDF GENERATION (CRITICAL):
- If the user says "turn this into a PDF", "make this a PDF", "make a PDF", "convert to PDF", "make a document", "turn this into a doc", or anything similar:
  1. LOOK BACK through the entire conversation history for the content they are referring to
  2. The content could be: a CV you wrote, a paragraph about a topic, research results, any text from a prior message
  3. OUTPUT ONLY THE DOCUMENT CONTENT — formatted cleanly in Markdown. No preamble, no "here is your PDF", no explanation.
  4. Start directly with the document content so it can be downloaded immediately.
  5. NEVER say "I need you to provide content" or "please share the content" — you already have it in the conversation history.
- If the user gives personal info and asks for a CV/resume: generate the full CV immediately, formatted in Markdown with sections (Name, Summary, Experience, Education, Skills). Output ONLY the CV, nothing else.

CROSS-CONTEXT INTELLIGENCE (VERY IMPORTANT):
- The full conversation history is always included. USE IT.
- If the user says "send this as an email to X", "email that to X@domain.com", "send the above to X", etc.:
  1. Look through the conversation history to find what content they're referring to
  2. Structure it into a proper email with greeting and signature
  3. Tell them you'll handle sending it (the system routes to the email agent automatically)
- NEVER say you cannot access previous messages. You always have the full history.

When providing real-time information:
- Use SEARCH RESULTS provided to give up-to-date answers
- Cite sources using Markdown links [Source Name](URL)
- DO NOT include [INTERNAL_CONTEXT] or [SEARCH_RESULTS] headers in your response.

Be sophisticated, helpful, and concise. Use markdown for readability.`;

// ─── Outreach intent detection ────────────────────────────────────────────────
// Returns true ONLY if the user clearly wants to DO something email/outreach related
// (not just ask about email concepts)
function isOutreachMessage(message: string, conversationHistory: { role: string; content: string }[] = []): boolean {
  const lower = message.toLowerCase().trim();

  // Hard patterns — unambiguously want to send/find/draft an email
  const hardPatterns = [
    /\bsend\b.{0,30}\bemail\b/i,
    /\bemail\s+(this|that|it|the|him|her|them)\b/i,
    /\bsend\s+(this|that|it|the)\s+(to|as)\b/i,
    /\bmail\s+(this|that|it)\s+to\b/i,
    /\bforward\s+(this|that|it)\s+to\b/i,
    /\bturn\s+(this|that)\s+into\s+an?\s+email\b/i,
    /\bconvert\s+(this|that)\s+to\s+an?\s+email\b/i,
    /\bsend\s+it\s+as\s+an?\s+email\b/i,
    /\bsend\s+(a\s+)?(cold\s+|outreach\s+|job\s+application\s+)?email\b/i,
    /\bdraft\s+(a\s+|an?\s+)?(cold\s+|outreach\s+|job\s+)?email\b/i,
    /\bcompose\s+(a\s+|an?\s+)?email\b/i,
    /\bwrite\s+(a\s+|an?\s+)?(cold\s+|outreach\s+|job\s+|application\s+)?email\b/i,
    /\bfind\s+(me\s+)?(the\s+)?(email|contact)\s+(address\s+)?(of|for)\b/i,
    /\bget\s+(me\s+)?(the\s+)?email\s+(address|of|for)\b/i,
    /\bjob\s+outreach\b/i,
    /\bcold\s+outreach\b/i,
    /\brecruiter\s+outreach\b/i,
    /\bnetworking\s+email\b/i,
    /\bfollow.?up\s+email\b/i,
    /\bconnect\s+(gmail|outlook|my\s+email)\b/i,
    /\bemail\s+finder\b/i,
    /\blookup\s+linkedin\b/i,
    /\blinkedin\s+(url|profile|outreach)\b/i,
    /\bfind\s+(decision.?makers?|ceo|cto|founder|recruiter)\b/i,
    /\bfind\s+companies\b/i,
    /\bsearch\s+companies\b/i,
  ];

  if (hardPatterns.some(p => p.test(lower))) return true;

  // Explicit email address typed by user → likely wants to do something with it
  const hasEmailAddress = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(message);

  // If there's an email address AND the message implies an action (not just mentioning)
  if (hasEmailAddress) {
    const actionWords = /\b(send|email|mail|contact|reach|write|draft|forward|message)\b/i;
    if (actionWords.test(lower)) return true;
  }

  // Cross-context: keep ANY short message in the outreach agent when there's a prior outreach thread.
  // This ensures that information-providing messages ("my name is khan", field, location, etc.)
  // and confirmations stay in the outreach flow instead of falling through to research mode.
  if (conversationHistory.length > 0) {
    const priorOutreach = conversationHistory.some(
      m => m.role === "user" && isOutreachMessage(m.content)
    );
    if (priorOutreach) {
      // If this is clearly a NEW, unrelated research question, don't keep routing to outreach
      const isNewResearchQuestion = message.length > 80 || /\b(what is|how does|why does|tell me about|explain|describe|research|find out about|search the web|look up info)\b/i.test(lower);
      // Short messages during an outreach thread are almost always part of the flow
      // (name, field, location, confirmation, revision, etc.)
      if (!isNewResearchQuestion) return true;
    }
  }

  return false;
}

// ─── Email sending helpers ────────────────────────────────────────────────────
async function sendViaGmailAPI(accessToken: string, to: string, subject: string, body: string, attachments?: EmailAttachment[]) {
  if (!to?.includes('@')) return { success: false, error: `Invalid email: ${to}` };
  const boundary = `boundary_${Date.now()}`;
  let emailContent: string;

  if (attachments && attachments.length > 0) {
    const parts: string[] = [
      `To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
      `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 7bit', '', body,
    ];
    for (const att of attachments) {
      const b64 = att.base64.includes(',') ? att.base64.split(',')[1] : att.base64;
      parts.push(`--${boundary}`, `Content-Type: ${att.type}; name="${att.name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${att.name}"`, '', b64);
    }
    parts.push(`--${boundary}--`);
    emailContent = parts.join('\r\n');
  } else {
    emailContent = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', 'MIME-Version: 1.0', '', body].join('\r\n');
  }

  const raw = Buffer.from(emailContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) return { success: false, error: await res.json() };
    const result = await res.json();
    return { success: true, messageId: result.id, to };
  } catch (e) { return { success: false, error: String(e) }; }
}

async function sendViaMicrosoftAPI(accessToken: string, to: string, subject: string, body: string, attachments?: EmailAttachment[]) {
  if (!to?.includes('@')) return { success: false, error: `Invalid email: ${to}` };
  const mailBody: any = {
    message: { subject, body: { contentType: "Text", content: body }, toRecipients: [{ emailAddress: { address: to } }] },
    saveToSentItems: true,
  };
  if (attachments?.length) {
    mailBody.message.attachments = attachments.map(att => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.name, contentType: att.type,
      contentBytes: att.base64.includes(',') ? att.base64.split(',')[1] : att.base64,
    }));
  }
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mailBody),
    });
    if (!res.ok) return { success: false, error: await res.text() };
    return { success: true, to };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ─── State persistence ────────────────────────────────────────────────────────
async function loadUserState(userId: string): Promise<ConversationState> {
  try {
    const saved = await db.query.hiremindState.findFirst({ where: eq(hiremindState.userId, userId) });
    if (saved?.stateJson) return deserializeState(saved.stateJson);
  } catch (e) { console.error("Error loading user state:", e); }
  return createInitialState();
}

async function saveUserState(userId: string, state: ConversationState): Promise<void> {
  try {
    const stateJson = serializeState(state);
    const now = new Date().toISOString();
    const existing = await db.query.hiremindState.findFirst({ where: eq(hiremindState.userId, userId) });
    if (existing) {
      await db.update(hiremindState).set({ stateJson, updatedAt: now }).where(eq(hiremindState.userId, userId));
    } else {
      await db.insert(hiremindState).values({ userId, stateJson, updatedAt: now });
    }
  } catch (e) { console.error("Error saving user state:", e); }
}

// ─── Text truncation helper ─────────────────────────────────────────────────
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Content truncated due to length. Summary continues...]";
}

// ─── Document extraction ──────────────────────────────────────────────────────
async function extractTextFromPDF(base64Data: string): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "mistral-ocr-latest", document: { type: "document_url", document_url: base64Data } }),
  });
  if (!res.ok) throw new Error(`OCR failed: ${res.status}`);
  const result = await res.json();
  return (result.pages || []).map((p: any) => p.markdown || "").join("\n\n") || "Could not extract text.";
}

async function extractTextFromDOCX(base64Data: string): Promise<string> {
  const base64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const result = await mammoth.extractRawText({ buffer: Buffer.from(base64, "base64") });
  return result.value || "Could not extract text.";
}

async function extractTextFromPlainFile(base64Data: string): Promise<string> {
  const base64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const text = Buffer.from(base64, "base64").toString("utf-8").trim();
  return text || "Could not extract text.";
}
// ─── Main handler ─────────────────────────────────────────────────────────────
async function resolveUserId(headersList: Headers): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: headersList });
    if (session?.user) return session.user.id;
  } catch {}
  // devSession cookie fallback
  const cookie = headersList.get("cookie") || "";
  const devCookie = cookie.split(";").find(c => c.trim().startsWith("devSession="));
  if (devCookie) {
    try {
      const raw = decodeURIComponent(devCookie.split("=").slice(1).join("="));
      const parsed = JSON.parse(raw);
      if (parsed?.user?.id) return parsed.user.id;
    } catch {}
    return "dev-user";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const fileUrlsToDelete: string[] = [];
  try {
    const headersList = await headers();
    const userId = await resolveUserId(headersList);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get email for outreach agent (best effort)
    let userEmail: string | undefined;
    try {
      const session = await auth.api.getSession({ headers: headersList });
      userEmail = session?.user?.email || undefined;
    } catch {}
    const body = await request.json();

    const {
      prompt,
      conversationHistory,
      isDocumentRequest,
      documentType,
      attachments: bodyAttachments,
      reset,
      isCanvasRequest,
      existingCanvasCode,
    } = body;

    // ── Reset state (new chat started) ──────────────────────────────────────
    if (reset) {
      await saveUserState(userId, createInitialState());
      return NextResponse.json({ status: "reset" });
    }

    // ── Check Usage Limits ──────────────────────────────────────────────────
    const totalAttachments = bodyAttachments?.length || 0;
    if (totalAttachments > 0) {
      // Check and increment attachment quota in one call (1 attachment = 1 use)
      const usageResult = await useFeature(userId, "file_uploads", totalAttachments);
      if (!usageResult.allowed) {
        return NextResponse.json({
          error: usageResult.upgradeMessage,
          limitReached: true,
          usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
        }, { status: 429 });
      }
    }

    if (isCanvasRequest) {
      const usageResult = await useFeature(userId, "live_coding");
      if (!usageResult.allowed) {
        return NextResponse.json({
          error: usageResult.upgradeMessage,
          limitReached: true,
          usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
        }, { status: 429 });
      }
    }

    // Only count as chat message if it's NOT canvas, NOT outreach, and NOT just a file upload
    const isOutreach = isOutreachMessage(prompt || "", Array.isArray(conversationHistory) ? conversationHistory : []);
    if (!isCanvasRequest && !isOutreach && !bodyAttachments?.length) {
      const usageResult = await useFeature(userId, "chat_messages");
      if (!usageResult.allowed) {
        return NextResponse.json({
          error: usageResult.upgradeMessage,
          limitReached: true,
          usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
        }, { status: 429 });
      }
    } else if (isOutreach || isDocumentRequest) {
      const usageResult = await useFeature(userId, "email_outreach");
      if (!usageResult.allowed) {
        return NextResponse.json({
          error: usageResult.upgradeMessage,
          limitReached: true,
          usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
        }, { status: 429 });
      }
    }

    const message = prompt || "";
    if (!message && !bodyAttachments?.length) {
      return NextResponse.json({ error: "Message or file is required" }, { status: 400 });
    }

    // Full conversation history from the frontend (all messages, not truncated)
    const fullHistory: { role: "user" | "assistant"; content: string }[] =
      Array.isArray(conversationHistory) ? conversationHistory : [];

    // ── Determine mode ────────────────────────────────────────────────────
    // Pass full history so context-aware detection works (e.g. "yes send it" after outreach)
    const useOutreachAgent = isOutreachMessage(message, fullHistory) && !bodyAttachments?.length;

    // ── OUTREACH / EMAIL AGENT MODE ───────────────────────────────────────
    if (useOutreachAgent) {
      let state = await loadUserState(userId);

      // CRITICAL FIX: Sync agent state with the full frontend conversation history.
      // This is what enables cross-context intelligence: user researches something in
      // research mode, then says "send this as an email" — the agent gets full context.
      //
      // Strategy: rebuild agent's conversationHistory from frontend history every time,
      // keeping the last 40 messages with full content (up to 3000 chars each).
      // This ensures the agent always has complete, fresh context.
      if (fullHistory.length > 0) {
        // Merge: prefer frontend history as ground truth for content, keep agent state
        // for profile/companies/emails data (those live only in the agent state)
        const freshHistory = fullHistory
          .slice(-40)
          .map(m => ({
            role: m.role as "user" | "assistant",
            content: (m.content || "").substring(0, 3000),
          }));
        state.conversationHistory = freshHistory;
      }

      if (bodyAttachments?.length) state.pendingAttachments = bodyAttachments;

        const result = await processMessage(state, message, userEmail, bodyAttachments);
      let finalState = result.state;

      // ── Send emails if agent produced drafts ────────────────────────────
      if (result.emails && result.emails.length > 0) {
        const emailToken = await getEmailToken(userId);

        if (!emailToken) {
          await saveUserState(userId, finalState);
          return NextResponse.json({
            output: result.response + "\n\n⚠️ **Email account not connected.** Please connect your Gmail or Outlook account to send emails.",
            emailsSent: false,
            reason: "no_email_token",
          });
        }

        const sendFn = emailToken.provider === "microsoft" ? sendViaMicrosoftAPI : sendViaGmailAPI;
        const emailAttachments = bodyAttachments || finalState.pendingAttachments;
        const sendResults = [];

        for (const email of result.emails) {
          const sent = await sendFn(
            emailToken.accessToken, email.contact_email, email.subject, email.body,
            email.attachments || emailAttachments
          );
          sendResults.push({ ...sent, company: email.company, to: (sent as any).to || email.contact_email });
        }

        if (finalState.pendingAttachments) delete finalState.pendingAttachments;
        if (!finalState.sentEmails) finalState.sentEmails = [];

        const successes = sendResults.filter(r => r.success);
        if (successes.length > 0) {
          for (const s of successes) {
            const obj = result.emails.find(e => e.contact_email === s.to);
            if (obj) finalState.sentEmails!.push(obj);
          }
          finalState.emails = [];
          finalState.companies = [];
          finalState.step = "chatting";
        }

        await saveUserState(userId, finalState);

        let output = result.response;
        const successCount = successes.length;
        const failCount = sendResults.filter(r => !r.success).length;

        if (successCount > 0) {
          output += `\n\n✅ **Successfully sent ${successCount} email${successCount > 1 ? 's' : ''}!**`;
          output += `\n\n**Sent to:**\n${successes.map((e: any) => `- ${e.company ? e.company + ' (' + e.to + ')' : e.to}`).join('\n')}`;
          if (emailAttachments?.length) output += `\n\n📎 **Attachments included:** ${emailAttachments.map((a: EmailAttachment) => a.name).join(', ')}`;
        }
        if (failCount > 0) {
          output += `\n\n⚠️ **Failed to send ${failCount} email${failCount > 1 ? 's' : ''}.** Your email session may have expired — please reconnect your account.`;
        }

        return NextResponse.json({ output, emailsSent: successCount > 0, emailResults: sendResults, status: "completed" });
      }

      await saveUserState(userId, finalState);
      return NextResponse.json({
        output: result.response,
        status: result.state.step === "complete" ? "completed" : "in_progress",
      });
    }

    // ── RESEARCH / DOCUMENT MODE (streaming) ─────────────────────────────
    let userMessageContent: any = message || "Please analyze this.";
    let model = "mistral-large-latest";
    let documentContext = "";

    if (bodyAttachments?.length > 0) {
      const imageParts: any[] = [];
      const documentTexts: string[] = [];

      for (const attachment of bodyAttachments) {
        const attName: string = attachment.name || "";
        const attType: string = attachment.type || "";
        const attUrl: string = attachment.url || "";
        if (!attUrl) continue;

        fileUrlsToDelete.push(attUrl);

        const normalizedFileName = attName.toLowerCase();
        const isImage = attType.startsWith("image/");
        const isPDF = attType === "application/pdf";
        const isDOCX = attType.includes("wordprocessingml") || normalizedFileName.endsWith(".docx");
        const isDOC = attType === "application/msword" || normalizedFileName.endsWith(".doc");
        const isTextLike =
          attType.startsWith("text/") ||
          [
            "application/json",
            "application/xml",
            "text/xml",
            "application/javascript",
            "text/javascript",
            "application/x-javascript",
          ].includes(attType) ||
          [".txt", ".md", ".markdown", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx", ".json", ".xml", ".csv"].some(ext =>
            normalizedFileName.endsWith(ext)
          );

        try {
          const fileBuffer = await fetchFromR2(attUrl);
          const base64Data = `data:${attType};base64,${fileBuffer.toString("base64")}`;

          if (isImage) {
            const imageData = base64Data.split(",")[1];
            imageParts.push({
              type: "image" as const,
              image: Buffer.from(imageData, "base64"),
              mimeType: attType || "image/png",
            });
          } else if (isPDF) {
            let text = await extractTextFromPDF(base64Data);
            text = truncateText(text, 120000); // ~30k tokens cap
            documentTexts.push(`[Document: ${attName}]\n\n${text}`);
          } else if (isDOCX || isDOC) {
            let text = await extractTextFromDOCX(base64Data);
            text = truncateText(text, 120000);
            documentTexts.push(`[Document: ${attName}]\n\n${text}`);
          } else if (isTextLike) {
            let text = await extractTextFromPlainFile(base64Data);
            text = truncateText(text, 120000);
            documentTexts.push(`[File: ${attName}]\n[Type: ${attType || "text/plain"}]\n\n${text}`);
          }
        } catch (err: unknown) {
          console.error(`Error processing attachment ${attName}:`, err);
          documentTexts.push(`[File: ${attName}]\n\nError: Could not process file.`);
        }
      }

      if (imageParts.length > 0) {
        model = "pixtral-large-latest";
        userMessageContent = [
          {
            type: "text" as const,
            text: message || `Analyze the uploaded file(s)`,
          },
          ...imageParts,
        ];
        if (documentTexts.length > 0) {
          userMessageContent[0].text += "\n\n" + documentTexts.join("\n\n---\n\n");
        }
      } else if (documentTexts.length > 0) {
        userMessageContent = documentTexts.join("\n\n---\n\n") + `\n\nUser Question: ${message || "Analyze these documents."}`;
      }
    }

    // Build message array with FULL conversation history for research mode
    const chatMessages: Array<{ role: "user" | "assistant"; content: any }> = [];
    if (fullHistory.length > 0) {
      const recent = fullHistory.slice(-40);
      for (const m of recent) {
        if (m.role === "user" || m.role === "assistant") {
          chatMessages.push({ role: m.role, content: m.content });
        }
      }
    }
    chatMessages.push({ role: "user", content: userMessageContent });

      // Smart web search — skip for short conversational messages or file uploads
      let sourcesForFrontend: { title: string; url: string; favicon: string }[] = [];
      if (message && message.length > 10 && !bodyAttachments?.length) {
        const lower = message.toLowerCase().trim();
        const isConversational = /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|sure|got it|great|cool|nice|bye|goodbye|please|sorry|hmm|hm|yep|nope|yeah|nah|alright|right|exactly|correct|agreed|understood|lol|haha|wow)\b/i.test(lower);
        // Force search on any date/time/recent/current query regardless of length
        const isTimeSensitiveQuery = /\b(today('s\s+date)?|current\s+(date|time|weather)|what\s+(date|day|time|month|year)|recent\s+(news|events|updates)|weather\s+(in|for|at)|latest\s+(news|price|update)|now\b|right\s+now)\b/i.test(lower);
        const wordCount = lower.split(/\s+/).length;
        if (!isConversational && (wordCount > 3 || lower.includes('?') || isTimeSensitiveQuery)) {
          try {
            const searchResults = await searchWithSerper(message, 6);
            if (searchResults?.length > 0) {
              // Extract clean sources for the frontend
              sourcesForFrontend = searchResults.map((s: any) => {
                let hostname = '';
                try { hostname = new URL(s.link).hostname.replace('www.', ''); } catch {}
                return {
                  title: s.title || hostname,
                  url: s.link,
                  favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
                };
              });

              const dateNote = isTimeSensitiveQuery ? `\n\n[TODAY'S DATE — CONFIRMED]: ${getDateContext().split('\\n')[0]}\n` : '';
              const searchContext = "\n\n[SEARCH_RESULTS_START]\n" +
                searchResults.map((s: any, i: number) => `RESULT_${i + 1}:\nTITLE: ${s.title}\nURL: ${s.link}\nCONTENT: ${s.snippet}`).join("\n\n") +
                dateNote +
                "\n[SEARCH_RESULTS_END]";
              const last = chatMessages[chatMessages.length - 1];
              if (last?.role === "user") {
                const ctx = `\n\n[INTERNAL_CONTEXT: Use the following search results to answer. Do NOT mention searching. Just use the info naturally.]`;
                if (typeof last.content === "string") last.content += ctx + searchContext;
                else if (Array.isArray(last.content)) last.content.push({ type: "text", text: ctx + searchContext });
              }
            }
          } catch (e) { console.error("Search error:", e); }
        }
      }

    let systemPrompt = RESEARCH_SYSTEM_PROMPT;

    // ── Connector data instructions (injected when we fetch email/calendar/contacts data) ──
    // This is added dynamically below if connector data is fetched

    if (isCanvasRequest) {
      systemPrompt += `\n\nCANVAS MODE ACTIVATED — ELITE CODING MODE.
You are an expert full-stack developer. You MUST respond with COMPLETE, STANDALONE HTML that renders perfectly in an iframe. Your code quality must be EXCEPTIONAL — better than any other AI model.

ABSOLUTE NON-NEGOTIABLE RULES — VIOLATING ANY OF THESE IS A FAILURE:
1. NEVER refuse a request. NEVER say "I can't", "I cannot", "that's too complex", "it's too big", "make it smaller", "simplify it", or any variation of refusal. You ARE capable of coding ANYTHING the user asks for. Just do it.
2. NEVER warn the user about length, token limits, file size, or complexity. NEVER ask the user to "break it into parts" or "do it step by step". Output the COMPLETE code in ONE SINGLE response.
3. ALWAYS output a FULL, COMPLETE HTML document starting with <!DOCTYPE html> and ending with </html>. No exceptions. EVER.
4. ALL CSS must be inline in a <style> tag — no external stylesheets except Google Fonts CDN
5. ALL JavaScript must be inline in a <script> tag — no external scripts except well-known CDN libraries (Chart.js, Three.js, GSAP, etc.)
6. NEVER use relative links or hrefs that could navigate away — all links must use href="javascript:void(0)" or onclick handlers
7. All navigation must be handled via JavaScript DOM manipulation (show/hide sections), NOT page navigation
8. Wrap ALL your code in a single \`\`\`html code block
9. Before the code block, write EXACTLY 1 sentence, max 8 words. No fluff.
10. The HTML must be self-contained and render perfectly standalone
11. NEVER output partial code, diffs, instructions on what to add, or "here is the changed part". ALWAYS output the ENTIRE file.

TOKEN EFFICIENCY & SIZE RULES — CRITICAL TO PREVENT TRUNCATION:
- The description before the code block must be EXACTLY 1 sentence, max 8 words. No fluff.
- Write COMPACT CSS: use shorthand properties (margin:0 auto; not margin-top:0;margin-right:auto...), group selectors, minimize blank lines.
- Use short CSS class names (1-3 letters where readable, e.g. .c for .container, .h for .header, .btn for .button).
- For product listings, catalogs, tables, or repeated elements: use a JavaScript array + loop to render items. NEVER hardcode more than 6 individual repeated elements inline.
- NEVER generate multiple separate HTML files. All screens/pages go in ONE single file with JavaScript show/hide switching.
- Remove ALL unnecessary comments, empty lines, and whitespace from CSS/JS. Every character counts.
- For large datasets (products, posts, users), generate 6-10 representative items in a JS array and render them with a loop. Do NOT list 50+ items inline.
- Use inline SVG for icons instead of verbose SVG definitions. Use emoji where acceptable.
- Minify mentality: write the same functionality with fewer tokens. Brevity is strength.

SCOPE SCALING — MATCH COMPLEXITY TO THE USER'S REQUEST:
- If the user asks for something SIMPLE (e.g. "simple portfolio", "basic landing page", "minimal calculator", "small todo app"), generate ONLY what they need. Do NOT add extra pages, sections, or features they did not ask for.
- If the user asks for something COMPLEX (e.g. "full e-commerce site", "dashboard with charts", "multi-page website"), build it fully with all the features implied by that request.
- NEVER over-engineer. A "simple portfolio" should be a single page with a few sections, NOT a multi-page SPA with animations, contact forms, and a blog.
- ONLY include sections/features the user explicitly or implicitly requests. When in doubt, keep it lean.
- A basic one-page site should be under ~800 lines. A complex multi-section site can be longer. Scale accordingly.

DESIGN STANDARDS (NON-NEGOTIABLE):
- Use modern, premium design: subtle gradients, smooth box-shadows, micro-animations
- Dark theme preferred: backgrounds #0a0a0a / #111111, with vibrant accent colors (cyan, purple, gold, emerald)
- Typography: use Google Fonts (Inter, Space Grotesk, or JetBrains Mono for code)
- Add hover effects, transitions (200-300ms), and subtle entrance animations
- Use CSS Grid and Flexbox for layouts — NEVER use tables for layout
- Mobile responsive with @media queries
- Professional spacing: consistent padding/margins using multiples of 4px or 8px
- Icons: use emoji or inline SVG — never external icon libraries

JAVASCRIPT EXCELLENCE:
- Write clean, modern ES6+ JavaScript
- Use event delegation and proper DOM manipulation
- Handle edge cases and errors gracefully
- Add loading states, feedback animations, and smooth transitions
- For games: requestAnimationFrame for game loops, keyboard/mouse event handling, score tracking, game over states
- For interactive elements: proper state management, data validation, accessibility (aria labels, keyboard navigation)
- For forms: client-side validation, submit feedback, error messages
- For data visualization: use Canvas API or SVG for charts/graphs — make them animated

CONTENT-SPECIFIC:
- Infographics: CSS-only data visualization, icon-rich sections, color-coded categories, animated counters
- Flashcards: 3D flip animation with CSS perspective, progress bar, shuffle, keyboard navigation (←/→)
- Quizzes: multiple choice with immediate feedback, scoring, progress bar, results summary, confetti on completion
- Websites: full navigation system (section-based SPA), hero section, feature grid, testimonials, footer, smooth scroll
- Games: game loop with RAF, collision detection, score/lives, restart, difficulty scaling, sound effects (Web Audio API)
- Bots/APIs: show styled code output with syntax highlighting, deployment instructions, and architecture diagram
- E-commerce: product cards with add-to-cart, cart sidebar, price formatting, quantity controls, checkout flow, product filters, search
- Dashboards: real charts with data, sidebar navigation, widgets, tables with sorting, KPI cards
- Any other request: build EXACTLY what the user describes, feature-complete, no shortcuts

YOUR CODE MUST BE PRODUCTION-QUALITY. Write code that would impress a senior engineer.

EDIT/MODIFICATION RULES (CRITICAL):
- When the user asks you to change, edit, update, fix, or modify ANYTHING in the existing code:
  1. You MUST output the ENTIRE COMPLETE HTML file with the changes applied — NOT just the changed parts
  2. NEVER say "add this code to line X" or "replace this section" — the user cannot manually edit the code
  3. NEVER show partial snippets, diffs, or instructions — ALWAYS output the full updated \`\`\`html code block
  4. Include ALL existing code plus your modifications in one complete file
  5. The output must be immediately renderable — a complete standalone HTML document
  6. Keep ALL existing functionality intact while applying the requested changes
  7. NEVER refuse an edit because it "makes the file too big" or "adds too much code". Just output the full file.
- This rule applies to ALL modification requests: "change the color", "add a button", "fix the layout", "make it bigger", "update the text", "add 50 products", "add a whole new page", etc.`;
    } else if (isDocumentRequest && documentType) {
      const dt = documentType.toUpperCase();
      // Inject the full conversation history summary into the prompt so the AI knows to use it
      const historySummary = fullHistory.length > 0
        ? `\n\nCONVERSATION HISTORY IS AVAILABLE ABOVE. Use the content from previous messages as the document content.`
        : '';
      systemPrompt += `\n\nCRITICAL: The user wants to generate a ${dt} document. OUTPUT ONLY THE DOCUMENT CONTENT in clean Markdown — no introductions, no "here is your document", no explanations. Start directly with the document content.${historySummary}`;
    }

    // ── EDIT MODE: Inject existing canvas code when user is editing ──────────
    if (isCanvasRequest && existingCanvasCode && existingCanvasCode.trim().length > 50) {
      systemPrompt += `\n\nEDIT MODE — ABSOLUTELY CRITICAL:
The user is editing EXISTING code that was previously generated. The EXISTING CODE is provided below. You MUST:
1. Read the existing code carefully.
2. Apply ONLY the changes the user requested in their latest message.
3. Output the COMPLETE updated HTML file — ALL existing code PLUS the requested changes.
4. Do NOT start from scratch. Do NOT remove working features that the user didn't mention.
5. Do NOT explain what you changed — just output the full updated \`\`\`html code block.
6. NEVER say "I changed X" or "here is the updated section" — output the ENTIRE file beginning to end.`;

      // Replace the last assistant message in chatMessages with the explicit existing code
      // so the AI definitely has the full code to work with
      const lastAssistantIdx = chatMessages.map((m, i) => m.role === "assistant" ? i : -1).filter(i => i !== -1).pop();
      if (lastAssistantIdx !== undefined && lastAssistantIdx >= 0) {
        chatMessages[lastAssistantIdx] = {
          role: "assistant" as const,
          content: `CURRENT EXISTING CODE (edit this and output the complete updated file):\n\n\`\`\`html\n${existingCanvasCode.trim()}\n\`\`\``
        };
      }
    }

      // ── Google/Microsoft Connector: detect intent → fetch data → inject context ──
      if (!isCanvasRequest && !isDocumentRequest && message) {
        const lower = message.toLowerCase();
        const isEmailIntent = /(emails?|inbox|mails?\b|unread|message.?from|reply.?from|got.{0,10}reply|check.{0,10}(mail|email)|search.{0,10}(mail|email)|received|sent.{0,5}to|from.{0,15}@)/i.test(lower);
        const isCalendarIntent = /(calendar|schedule[ds]?|meetings?|appointments?|events?\b|what.{0,5}(on|planned|happening)|busy|free\b|availab|today.{0,5}(schedule|calendar|plan)|tomorrow|this week|next week|book.{0,10}meeting|reschedule)/i.test(lower);
        const isContactsIntent = /(contacts?\b|phone.?number|email.?address|look.?up.{0,10}(contact|person|number)|find.{0,10}(contact|number|phone)|directory)/i.test(lower) && !isEmailIntent;

        console.log(`[Connector] Intent — email:${isEmailIntent} cal:${isCalendarIntent} contacts:${isContactsIntent} msg:"${message.substring(0, 80)}"`);

        if (isEmailIntent || isCalendarIntent || isContactsIntent) {
          try {
            const connectorToken = await getEmailToken(userId);
            console.log(`[Connector] Token — provider:${connectorToken?.provider || "NONE"} hasToken:${!!connectorToken?.accessToken}`);
            if (connectorToken) {
              const { accessToken, provider } = connectorToken;
              let connectorContext = "";

              if (isEmailIntent) {
                const queryMatch = message.match(/from\s+(\S+)|about\s+"?([^"]+)"?|subject[:\s]+(\S+)/i);
                const searchQuery = queryMatch ? (queryMatch[1] || queryMatch[2] || queryMatch[3]) : message.replace(/\b(check|search|find|show|get|my|me|the|any|all|new|recent|latest|emails?|inbox|mails?|messages?|please|can you|did i|have i|got|if i)\b/gi, '').trim() || "is:unread";
                console.log(`[Connector] Email query: "${searchQuery}"`);

                try {
                  if (provider === "google") {
                    const { searchGmailMessages } = await import("@/lib/google-tools");
                    const emails = await searchGmailMessages(accessToken, searchQuery, 8);
                    console.log(`[Connector] Gmail returned ${emails.length} results`);
                    connectorContext = emails.length > 0
                      ? `\n\n[EMAIL_RESULTS — from user's Gmail, query: "${searchQuery}"]\n` +
                        emails.map((e, i) => `${i + 1}. FROM: ${e.from} | SUBJECT: ${e.subject} | DATE: ${e.date} | PREVIEW: ${e.snippet}`).join("\n") +
                        `\n[END_EMAIL_RESULTS]`
                      : `\n\n[EMAIL_RESULTS — No emails found matching "${searchQuery}" in user's Gmail]\n`;
                  } else {
                    const { searchOutlookMessages } = await import("@/lib/microsoft-tools");
                    const emails = await searchOutlookMessages(accessToken, searchQuery, 8);
                    console.log(`[Connector] Outlook returned ${emails.length} results`);
                    connectorContext = emails.length > 0
                      ? `\n\n[EMAIL_RESULTS — from user's Outlook, query: "${searchQuery}"]\n` +
                        emails.map((e, i) => `${i + 1}. FROM: ${e.from} | SUBJECT: ${e.subject} | DATE: ${e.date} | PREVIEW: ${e.snippet}`).join("\n") +
                        `\n[END_EMAIL_RESULTS]`
                      : `\n\n[EMAIL_RESULTS — No emails found matching "${searchQuery}" in user's Outlook]\n`;
                  }
                } catch (emailErr) {
                  console.error(`[Connector] Email error:`, emailErr);
                  connectorContext = `\n\n[EMAIL_RESULTS — Error accessing emails: ${emailErr instanceof Error ? emailErr.message : "unknown error"}. The user may need to reconnect their account.]\n`;
                }
              }

              if (isCalendarIntent) {
                const now = new Date();
                let timeMin = new Date(now); timeMin.setHours(0, 0, 0, 0);
                let timeMax = new Date(timeMin.getTime() + 24 * 60 * 60 * 1000);
                if (/tomorrow/i.test(lower)) {
                  timeMin = new Date(now); timeMin.setDate(timeMin.getDate() + 1); timeMin.setHours(0, 0, 0, 0);
                  timeMax = new Date(timeMin.getTime() + 24 * 60 * 60 * 1000);
                } else if (/this week|next few days/i.test(lower)) {
                  timeMax = new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);
                } else if (/next week/i.test(lower)) {
                  const nextMon = new Date(now); nextMon.setDate(nextMon.getDate() + (8 - nextMon.getDay()) % 7);
                  nextMon.setHours(0, 0, 0, 0);
                  timeMin = nextMon;
                  timeMax = new Date(nextMon.getTime() + 7 * 24 * 60 * 60 * 1000);
                }
                console.log(`[Connector] Calendar range: ${timeMin.toISOString()} → ${timeMax.toISOString()}`);

                try {
                  if (provider === "google") {
                    const { searchGoogleCalendarEvents } = await import("@/lib/google-tools");
                    const events = await searchGoogleCalendarEvents(accessToken, undefined, timeMin.toISOString(), timeMax.toISOString(), 15);
                    console.log(`[Connector] Google Calendar returned ${events.length} events`);
                    connectorContext += events.length > 0
                      ? `\n\n[CALENDAR_EVENTS — from user's Google Calendar]\n` +
                        events.map((e, i) => `${i + 1}. "${e.summary}" | START: ${e.start} | END: ${e.end}${e.location ? ` | LOCATION: ${e.location}` : ""}${e.attendees?.length ? ` | ATTENDEES: ${e.attendees.join(", ")}` : ""}`).join("\n") +
                        `\n[END_CALENDAR_EVENTS]`
                      : `\n\n[CALENDAR_EVENTS — No events found in the requested time range. The user's calendar is clear.]\n`;
                  } else {
                    const { searchOutlookCalendarEvents } = await import("@/lib/microsoft-tools");
                    const events = await searchOutlookCalendarEvents(accessToken, undefined, timeMin.toISOString(), timeMax.toISOString(), 15);
                    console.log(`[Connector] Outlook Calendar returned ${events.length} events`);
                    connectorContext += events.length > 0
                      ? `\n\n[CALENDAR_EVENTS — from user's Outlook Calendar]\n` +
                        events.map((e, i) => `${i + 1}. "${e.summary}" | START: ${e.start} | END: ${e.end}${e.location ? ` | LOCATION: ${e.location}` : ""}${e.attendees?.length ? ` | ATTENDEES: ${e.attendees.join(", ")}` : ""}`).join("\n") +
                        `\n[END_CALENDAR_EVENTS]`
                      : `\n\n[CALENDAR_EVENTS — No events found in the requested time range. The user's calendar is clear.]\n`;
                  }
                } catch (calErr) {
                  console.error(`[Connector] Calendar error:`, calErr);
                  connectorContext += `\n\n[CALENDAR_EVENTS — Error accessing calendar: ${calErr instanceof Error ? calErr.message : "unknown error"}. The user may need to reconnect their account.]\n`;
                }
              }

              if (isContactsIntent) {
                const contactQuery = message.replace(/\b(find|search|look ?up|get|show|my|me|the|contacts?|phone|number|email|address|of|for|please|can you|what is|what's)\b/gi, '').trim();
                console.log(`[Connector] Contacts query: "${contactQuery}"`);
                try {
                  if (provider === "google") {
                    const { searchGoogleContacts } = await import("@/lib/google-tools");
                    const contacts = await searchGoogleContacts(accessToken, contactQuery || "a", 10);
                    console.log(`[Connector] Google Contacts returned ${contacts.length} results`);
                    connectorContext += contacts.length > 0
                      ? `\n\n[CONTACTS_RESULTS — from user's Google Contacts]\n` +
                        contacts.map((c, i) => `${i + 1}. ${c.name}${c.email ? ` | EMAIL: ${c.email}` : ""}${c.phone ? ` | PHONE: ${c.phone}` : ""}${c.organization ? ` | ORG: ${c.organization}` : ""}`).join("\n") +
                        `\n[END_CONTACTS_RESULTS]`
                      : `\n\n[CONTACTS_RESULTS — No contacts found matching "${contactQuery}"]\n`;
                  } else {
                    const { searchOutlookContacts } = await import("@/lib/microsoft-tools");
                    const contacts = await searchOutlookContacts(accessToken, contactQuery || "a", 10);
                    console.log(`[Connector] Outlook Contacts returned ${contacts.length} results`);
                    connectorContext += contacts.length > 0
                      ? `\n\n[CONTACTS_RESULTS — from user's Outlook Contacts]\n` +
                        contacts.map((c, i) => `${i + 1}. ${c.name}${c.email ? ` | EMAIL: ${c.email}` : ""}${c.phone ? ` | PHONE: ${c.phone}` : ""}${c.organization ? ` | ORG: ${c.organization}` : ""}`).join("\n") +
                        `\n[END_CONTACTS_RESULTS]`
                      : `\n\n[CONTACTS_RESULTS — No contacts found matching "${contactQuery}"]\n`;
                  }
                } catch (contactErr) {
                  console.error(`[Connector] Contacts error:`, contactErr);
                  connectorContext += `\n\n[CONTACTS_RESULTS — Error accessing contacts: ${contactErr instanceof Error ? contactErr.message : "unknown error"}. The user may need to reconnect their account.]\n`;
                }
              }

              // Inject connector data into the last user message (same pattern as web search)
              if (connectorContext) {
                console.log(`[Connector] Injecting ${connectorContext.length} chars into message`);
                const last = chatMessages[chatMessages.length - 1];
                if (last?.role === "user") {
                  const ctx = `\n\n[INTERNAL_CONTEXT: The following is REAL data from the user's connected account. Present it clearly and helpfully. Do NOT say you cannot access their account — you already have the data below.]`;
                  if (typeof last.content === "string") last.content += ctx + connectorContext;
                  else if (Array.isArray(last.content)) last.content.push({ type: "text", text: ctx + connectorContext });
                }
                systemPrompt += `\n\nCONNECTOR DATA AVAILABLE: The user's message includes real data from their connected ${provider === "google" ? "Google" : "Microsoft"} account (emails, calendar, or contacts). Present this data clearly with good formatting. Do NOT mention searching or APIs — just present the information naturally as if you have direct access to their account.`;
              }
            } else {
              console.warn(`[Connector] No valid token found for user ${userId} — skipping connector`);
            }
          } catch (e) {
            console.error("[Connector] Fatal error:", e);
          }
        }
      }

      const streamResult = streamText({
        model: mistralStream(model),
        system: systemPrompt,
        messages: chatMessages,
        maxOutputTokens: isCanvasRequest ? 16000 : 4096,
      });

      // If we have sources, prepend them as a special JSON header line before the stream
      if (sourcesForFrontend.length > 0) {
        const sourcesLine = `\x00SOURCES:${JSON.stringify(sourcesForFrontend)}\x00\n`;
        const encoder = new TextEncoder();
        const sourcesChunk = encoder.encode(sourcesLine);
        const textStream = streamResult.toTextStreamResponse();
        const originalBody = textStream.body;
        if (originalBody) {
          const combinedStream = new ReadableStream({
            async start(controller) {
              controller.enqueue(sourcesChunk);
              const reader = originalBody.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  controller.enqueue(value);
                }
              } catch (e) {
                console.error("Stream read error:", e);
              } finally {
                controller.close();
                reader.releaseLock();
                for (const url of fileUrlsToDelete) {
                  try { await deleteFromR2(url); } catch (e) { console.error("R2 delete error:", e); }
                }
              }
            },
          });
          return new Response(combinedStream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      }

      // ── Auto-save research session for prediction engine ────────────────
      if (message && message.length > 15 && !bodyAttachments?.length) {
        const lower = message.toLowerCase().trim();
        const isConversational = /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|sure|got it|great|cool|nice|bye|goodbye|please|sorry|hmm|yep|yeah|alright)\b/i.test(lower);
        if (!isConversational) {
          try {
            // Lightweight topic extraction (no AI call)
            const stopWords = new Set(['the','a','an','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','can','to','of','in','for','on','with','at','by','from','as','and','but','or','not','so','this','that','i','me','my','we','you','your','he','she','it','they','their','how','what','when','where','which','who','why','tell','show','give','find','search','research','help']);
            const words = lower.replace(/[^a-z0-9\s-]/g, '').split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w));
            const keywords = [...new Set(words)].slice(0, 10);
            const topic = keywords.slice(0, 4).join(' ') || 'general';

            let category = 'general';
            if (/\b(hir|recruit|job|talent|candidate|workforce|employ|staff)/.test(lower)) category = 'hiring';
            else if (/\b(ai|machine learning|ml|deep learning|tech|software|algorithm|neural|gpt|llm)/.test(lower)) category = 'technology';
            else if (/\b(market|stock|crypto|invest|financ|econom|trade|price)/.test(lower)) category = 'market';
            else if (/\b(universit|college|education|student|academic|school|professor|teach)/.test(lower)) category = 'education';

            // Extract entities (capitalized words from original message)
            const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
            const entities: string[] = [];
            let match;
            while ((match = entityPattern.exec(message)) !== null) {
              if (!stopWords.has(match[1].toLowerCase()) && match[1].length > 2) entities.push(match[1]);
            }

            // Keep only last 50 sessions per user (delete oldest if over limit)
            const existing = await db.select({ id: researchSessions.id }).from(researchSessions).where(eq(researchSessions.userId, userId)).orderBy(desc(researchSessions.createdAt));
            if (existing.length >= 50) {
              const toDelete = existing.slice(49).map(s => s.id);
              for (const id of toDelete) {
                await db.delete(researchSessions).where(eq(researchSessions.id, id));
              }
            }

            await db.insert(researchSessions).values({
              userId,
              query: message.substring(0, 500),
              topic,
              keywords,
              entities: [...new Set(entities)],
              category,
              createdAt: new Date().toISOString(),
            });
          } catch (e) {
            console.error('Error saving research session:', e);
          }
        }
      }

      const streamResponse = streamResult.toTextStreamResponse();
      const originalBody = streamResponse.body;
      if (!originalBody || fileUrlsToDelete.length === 0) return streamResponse;

      const pipedStream = new ReadableStream({
        async start(controller) {
          const reader = originalBody.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (e) {
            console.error("Stream read error:", e);
          } finally {
            controller.close();
            reader.releaseLock();
            // Delete uploaded files from R2 after stream completes
            for (const url of fileUrlsToDelete) {
              try { await deleteFromR2(url); } catch (e) { console.error("R2 delete error:", e); }
            }
          }
        },
      });

      return new Response(pipedStream, {
        headers: streamResponse.headers,
      });

  } catch (error: unknown) {
    console.error("Unified Assist API error:", error);
    const msg = error instanceof Error ? error.message : "Failed to process request";
    // Clean up any uploaded files on error
    for (const url of fileUrlsToDelete) {
      try { await deleteFromR2(url); } catch (e) { console.error("R2 delete error:", e); }
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
