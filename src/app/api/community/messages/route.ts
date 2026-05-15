import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { communityDMs, communityProfiles, notifications, user } from "@/db/schema";
import { eq, or, and, desc, inArray, gt, lt } from "drizzle-orm";
import sendHireMindXEmailNotification from "@/lib/email/sendHireMindXEmailNotification";

function formatConversationPreview(message: string) {
  if (typeof message !== "string") return "";

  if (message.startsWith("[CONTRACT_OFFER_JSON]")) {
    try {
      const parsed = JSON.parse(message.replace("[CONTRACT_OFFER_JSON]", ""));
      if (parsed?.type === "contract_offer") {
        const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Contract Offer";
        return `📄 Contract Offer: ${title}`;
      }
    } catch {}
    return "📄 Contract Offer";
  }

  if (message.startsWith("[CONTRACT_RESPONSE]")) {
    try {
      const parsed = JSON.parse(message.replace("[CONTRACT_RESPONSE]", ""));
      if (parsed?.action === "accepted") return "✅ Contract accepted";
      if (parsed?.action === "declined") return "❌ Contract declined";
    } catch {}
    return "📄 Contract updated";
  }

  if (message.startsWith("[CONTRACT_CANCEL]")) {
    return "⚠️ Contract cancelled";
  }

  if (message.startsWith("[DISPUTE]")) {
    try {
      const parsed = JSON.parse(message.replace("[DISPUTE]", ""));
      const title = typeof parsed?.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Dispute";
      return `⚠️ Dispute Raised: ${title}`;
    } catch {}
    return "⚠️ Dispute Raised";
  }

  return message;
}

function buildAuthHeaders(req: NextRequest) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const authz = req.headers.get("authorization");
  if (authz) h.set("authorization", authz);
  return h;
}

function normalizeAttachmentsValue(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isDemoOrMockUser(userId: string, email?: string | null) {
  const normalizedId = String(userId || "").toLowerCase();
  const normalizedEmail = String(email || "").toLowerCase();

  return (
    normalizedId.includes("demo") ||
    normalizedId.startsWith("free_") ||
    normalizedId.length < 10 ||
    normalizedEmail.endsWith("@hiremindx.demo") ||
    normalizedEmail.includes("demo") ||
    normalizedEmail.includes("mock")
  );
}

function getBaseSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function parseCommunityMessageType(message: string) {
  if (message.startsWith("[CONTRACT_OFFER_JSON]")) {
    try {
      const parsed = JSON.parse(message.replace("[CONTRACT_OFFER_JSON]", ""));
      return { kind: "contract_offer" as const, data: parsed };
    } catch {
      return { kind: "contract_offer" as const, data: null };
    }
  }

  if (message.startsWith("[CONTRACT_RESPONSE]")) {
    try {
      const parsed = JSON.parse(message.replace("[CONTRACT_RESPONSE]", ""));
      return { kind: "contract_response" as const, data: parsed };
    } catch {
      return { kind: "contract_response" as const, data: null };
    }
  }

  if (message.startsWith("[CONTRACT_CANCEL]")) {
    try {
      const parsed = JSON.parse(message.replace("[CONTRACT_CANCEL]", ""));
      return { kind: "contract_cancel" as const, data: parsed };
    } catch {
      return { kind: "contract_cancel" as const, data: null };
    }
  }

  if (message.startsWith("[DELIVERABLE]")) {
    try {
      const parsed = JSON.parse(message.replace("[DELIVERABLE]", ""));
      return { kind: "deliverable" as const, data: parsed };
    } catch {
      return { kind: "deliverable" as const, data: null };
    }
  }

  if (message.startsWith("[REVISION_REQUEST]")) {
    try {
      const parsed = JSON.parse(message.replace("[REVISION_REQUEST]", ""));
      return { kind: "revision_request" as const, data: parsed };
    } catch {
      return { kind: "revision_request" as const, data: null };
    }
  }

  if (message.startsWith("[DISPUTE]")) {
    try {
      const parsed = JSON.parse(message.replace("[DISPUTE]", ""));
      return { kind: "dispute" as const, data: parsed };
    } catch {
      return { kind: "dispute" as const, data: null };
    }
  }

  return { kind: "message" as const, data: null };
}

function buildNotificationPayload(messageValue: string, senderName: string) {
  const parsed = parseCommunityMessageType(messageValue);

  if (parsed.kind === "contract_offer") {
    const titleText =
      typeof parsed.data?.title === "string" && parsed.data.title.trim()
        ? parsed.data.title.trim()
        : "Contract Offer";

    return {
      notificationType: "contract_offer",
      title: "New contract offer",
      message: `${senderName} sent you a contract offer: ${titleText}.`,
      ctaUrl: `${getBaseSiteUrl()}/community`,
    };
  }

  if (parsed.kind === "contract_response") {
    const action =
      parsed.data?.action === "accepted"
        ? "accepted"
        : parsed.data?.action === "declined"
          ? "declined"
          : parsed.data?.action === "escrow_funded"
            ? "escrow_funded"
            : parsed.data?.action === "released"
              ? "released"
              : "updated";

    const isDeclined = action === "declined";
    const isFunded = action === "escrow_funded";
    const isReleased = action === "released";

    let title = "Contract response received";
    let message = `${senderName} ${action} your contract offer.`;

    if (isDeclined) {
      title = "Contract declined";
      message = `${senderName} declined your contract offer.`;
    } else if (isFunded) {
      title = "Escrow Funded — Start Working!";
      message = `${senderName} has funded the escrow. You can now start working on the contract.`;
    } else if (isReleased) {
      title = "Payment Released!";
      message = `${senderName} has released the payment from escrow. Funds will be available once settlement completes.`;
    } else if (action === "accepted") {
      title = "Contract Accepted";
      message = `${senderName} accepted your contract offer.`;
    }

    return {
      notificationType: "contract_response",
      title,
      message,
      ctaUrl: `${getBaseSiteUrl()}/community`,
    };
  }

  if (parsed.kind === "contract_cancel") {
    return {
      notificationType: "contract_response",
      title: "Contract cancelled",
      message: `${senderName} cancelled a contract conversation.`,
      ctaUrl: `${getBaseSiteUrl()}/community`,
    };
  }

  if (parsed.kind === "deliverable") {
    return {
      notificationType: "deliverable",
      title: "Deliverable Submitted",
      message: `${senderName} submitted work for your review.`,
      ctaUrl: `${getBaseSiteUrl()}/community`,
    };
  }

  if (parsed.kind === "revision_request") {
    return {
      notificationType: "revision_request",
      title: "Revision Requested",
      message: `${senderName} requested changes to your deliverable.`,
      ctaUrl: `${getBaseSiteUrl()}/community`,
    };
  }

  if (parsed.kind === "dispute") {
    const disputeTitle = typeof parsed.data?.title === "string" && parsed.data.title.trim()
      ? parsed.data.title.trim()
      : "Dispute";
    return {
      notificationType: "dispute",
      title: "Dispute Raised",
      message: `${senderName} raised a dispute: ${disputeTitle}.`,
      ctaUrl: `${getBaseSiteUrl()}/community`,
    };
  }

  return {
    notificationType: "message",
    title: "New message",
    message: `${senderName} sent you a new message.`,
    ctaUrl: `${getBaseSiteUrl()}/community`,
  };
}

async function createNotificationAndEmail(params: {
  receiverId: string;
  receiverEmail?: string | null;
  senderName: string;
  rawMessage: string;
}) {
  const payload = buildNotificationPayload(params.rawMessage, params.senderName);

  try {
    await db.insert(notifications).values({
      userId: params.receiverId,
      type: payload.notificationType,
      title: payload.title,
      message: payload.message,
      actionUrl: payload.ctaUrl,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to create community notification:", error);
  }

  if (!params.receiverEmail || isDemoOrMockUser(params.receiverId, params.receiverEmail)) {
    return;
  }

  try {
    const emailResult = await sendHireMindXEmailNotification({
      to: params.receiverEmail,
      recipientName: params.senderName,
    });

    console.log("[Community email notification]", {
      receiverId: params.receiverId,
      receiverEmail: params.receiverEmail,
      notificationType: payload.notificationType,
      success: emailResult.success,
      skipped: emailResult.skipped ?? false,
      error: emailResult.error ?? null,
      messageId: emailResult.messageId ?? null,
    });
  } catch (error) {
    console.error("Failed to send community email notification:", error);
  }
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) {
    console.warn("/api/community/messages GET unauthorized", {
      hasCookie: Boolean(req.headers.get("cookie")),
      origin: req.headers.get("origin"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const withUser = searchParams.get("withUser");
  const conversationsOnly = searchParams.get("conversations");
  const since = searchParams.get("since"); // ISO timestamp for delta queries
  const limitParam = searchParams.get("limit");
  const before = searchParams.get("before"); // message ID for pagination
  const MESSAGE_PAGE_LIMIT = Math.min(Math.max(parseInt(limitParam || "50"), 1), 200);

  if (conversationsOnly === "true") {
    // Optimized: fetch only the latest message per conversation using a subquery approach
    // First get all messages for this user, ordered newest first
    const allMessages = await db
      .select({
        id: communityDMs.id,
        conversationKey: communityDMs.conversationKey,
        senderId: communityDMs.senderId,
        receiverId: communityDMs.receiverId,
        message: communityDMs.message,
        createdAt: communityDMs.createdAt,
        isRead: communityDMs.isRead,
        projectId: communityDMs.projectId,
        hiddenForUsers: communityDMs.hiddenForUsers,
        visibleTo: communityDMs.visibleTo,
      })
      .from(communityDMs)
      .where(
        or(
          eq(communityDMs.senderId, session.user.id),
          eq(communityDMs.receiverId, session.user.id)
        )
      )
      .orderBy(desc(communityDMs.createdAt));

    const conversationMap = new Map<string, {
      partnerId: string;
      conversationKey: string;
      lastMessage: string;
      lastMessageAt: string;
      unreadCount: number;
      projectId: number | null;
    }>();

    for (const msg of allMessages) {
      // Skip messages hidden for this user
      const hiddenFor = Array.isArray(msg.hiddenForUsers) ? msg.hiddenForUsers : [];
      if (hiddenFor.includes(session.user.id)) continue;
      // Skip messages not visible to this user
      if (msg.visibleTo) {
        const visibleToArr = Array.isArray(msg.visibleTo) ? msg.visibleTo : [];
        if (visibleToArr.length > 0 && !visibleToArr.includes(session.user.id)) continue;
      }

      const partnerId = msg.senderId === session.user.id ? msg.receiverId : msg.senderId;
      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, {
          partnerId,
          conversationKey: msg.conversationKey,
          lastMessage: formatConversationPreview(msg.message),
          lastMessageAt: msg.createdAt,
          unreadCount: 0,
          projectId: msg.projectId,
        });
      }
      if (msg.receiverId === session.user.id && !msg.isRead) {
        const conv = conversationMap.get(partnerId)!;
        conv.unreadCount++;
      }
    }

    // Batch-fetch profiles and users instead of N+1 queries
    const partnerIds = Array.from(conversationMap.keys());
    const profiles = partnerIds.length > 0
      ? await db.select().from(communityProfiles).where(inArray(communityProfiles.userId, partnerIds))
      : [];
    const users = partnerIds.length > 0
      ? await db.select().from(user).where(inArray(user.id, partnerIds))
      : [];
    const profileMap = new Map(profiles.map((p: any) => [p.userId, p]));
    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const conversations = [];
    for (const [, conv] of conversationMap) {
      const profile = profileMap.get(conv.partnerId);
      const u = userMap.get(conv.partnerId);
      conversations.push({
        ...conv,
        partnerName: profile?.displayName || u?.name || "Unknown",
        partnerImage: u?.image || null,
        partnerType: profile?.userType || "unknown",
        partnerHeadline: profile?.headline || null,
      });
    }

    return NextResponse.json({ conversations });
  }

  if (withUser) {
    const ids = [session.user.id, withUser].sort();
    const convKey = `${ids[0]}_${ids[1]}`;

    // Build where conditions
    const conditions = [eq(communityDMs.conversationKey, convKey)];

    // Delta query: only fetch messages newer than 'since' timestamp
    if (since) {
      conditions.push(gt(communityDMs.createdAt, since));
    }

    // Pagination: fetch messages older than 'before' message ID
    if (before) {
      conditions.push(lt(communityDMs.id, parseInt(before)));
    }

    const messages = await db
      .select()
      .from(communityDMs)
      .where(and(...conditions))
      .orderBy(desc(communityDMs.createdAt))
      .limit(MESSAGE_PAGE_LIMIT);

    // Mark as read (non-blocking, fire-and-forget)
    db.update(communityDMs)
      .set({ isRead: true })
      .where(
        and(
          eq(communityDMs.conversationKey, convKey),
          eq(communityDMs.receiverId, session.user.id),
          eq(communityDMs.isRead, false)
        )
      )
      .catch((err: any) => console.error("Failed to mark messages as read:", err));

    const normalizedMessages = messages
      .filter((msg) => {
        // Filter out messages hidden for this user
        const hiddenFor = Array.isArray(msg.hiddenForUsers) ? msg.hiddenForUsers : [];
        if (hiddenFor.includes(session.user.id)) return false;
        // Filter out messages not visible to this user
        if (msg.visibleTo) {
          const visibleToArr = Array.isArray(msg.visibleTo) ? msg.visibleTo : [];
          if (visibleToArr.length > 0 && !visibleToArr.includes(session.user.id)) return false;
        }
        return true;
      })
      .map((msg) => ({
        ...msg,
        attachments: normalizeAttachmentsValue(msg.attachments),
        hiddenForUsers: msg.hiddenForUsers || null,
        visibleTo: msg.visibleTo || null,
      }));

    // Return in chronological order (oldest first) for the frontend
    // unless it's a delta query (newest first is fine for appending)
    const orderedMessages = since
      ? normalizedMessages // delta: already newest first, frontend will append
      : normalizedMessages.reverse(); // initial load: chronological order

    return NextResponse.json({
      messages: orderedMessages,
      hasMore: messages.length >= MESSAGE_PAGE_LIMIT && !since, // only for initial paginated loads
    });
  }

  return NextResponse.json({ error: "Provide ?conversations=true or ?withUser=<userId>" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) {
    console.warn("/api/community/messages POST unauthorized", {
      hasCookie: Boolean(req.headers.get("cookie")),
      origin: req.headers.get("origin"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let receiverIdStr = "";
  let senderIdStr = "";

  try {
    const body = await req.json();
    const { receiverId, message, projectId, proposalId, attachments } = body;

    if (!receiverId || !message) {
      return NextResponse.json({ error: "receiverId and message are required" }, { status: 400 });
    }

    receiverIdStr = String(receiverId);
    senderIdStr = String(session.user.id);

    // Check usage limits
    const { useFeature } = await import("@/lib/usage-limits");
    const usageResult = await useFeature(senderIdStr, "community_messaging");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    let [receiver] = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, receiverIdStr));

    if (!receiver) {
      const mockEmail = `demo_${receiverIdStr}@hiremindx.demo`;
      try {
        await db.insert(user).values({
          id: receiverIdStr,
          name: "Demo Professional",
          email: mockEmail,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        receiver = { id: receiverIdStr, email: mockEmail };
      } catch (e) {
        console.error("Failed to insert mock user:", e);
        return NextResponse.json(
          { error: "This user is not available for messaging." },
          { status: 400 }
        );
      }
    }

    const [sender] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, senderIdStr));

    const ids = [senderIdStr, receiverIdStr].sort();
    const convKey = `${ids[0]}_${ids[1]}`;
    const now = new Date().toISOString();

    // Support visibleTo parameter for role-targeted messages
    const visibleToValue = body.visibleTo || null;

    let newMsg;
    try {
      const result = await db.insert(communityDMs).values({
        conversationKey: convKey,
        senderId: senderIdStr,
        receiverId: receiverIdStr,
        message: String(message),
        attachments: attachments || null,
        projectId: projectId ? Number(projectId) : null,
        proposalId: proposalId ? Number(proposalId) : null,
        isRead: false,
        hiddenForUsers: null,
        visibleTo: visibleToValue ? JSON.stringify(visibleToValue) : null,
        createdAt: now,
      }).returning();
      newMsg = result[0];
    } catch (dbErr) {
      console.error("DB insert with returning() failed, trying without:", dbErr);
      await db.insert(communityDMs).values({
        conversationKey: convKey,
        senderId: senderIdStr,
        receiverId: receiverIdStr,
        message: String(message),
        attachments: attachments || null,
        projectId: projectId ? Number(projectId) : null,
        proposalId: proposalId ? Number(proposalId) : null,
        isRead: false,
        hiddenForUsers: null,
        visibleTo: visibleToValue ? JSON.stringify(visibleToValue) : null,
        createdAt: now,
      });
      const recent = await db.select().from(communityDMs)
        .where(eq(communityDMs.conversationKey, convKey))
        .orderBy(desc(communityDMs.createdAt))
        .limit(1);
      newMsg = recent[0] || {
        id: Date.now(),
        conversationKey: convKey,
        senderId: senderIdStr,
        receiverId: receiverIdStr,
        message: String(message),
        attachments: attachments || null,
        projectId: projectId ? Number(projectId) : null,
        proposalId: proposalId ? Number(proposalId) : null,
        isRead: false,
        createdAt: now,
      };
    }

    // ── SSE Broadcast: push message to both sender and receiver instantly ──
    try {
      const { broadcastNewMessage, broadcastConversationUpdate } = await import("@/lib/sse-registry");
      const normalizedForSSE = {
        ...newMsg,
        attachments: normalizeAttachmentsValue(newMsg.attachments),
      };
      broadcastNewMessage(normalizedForSSE);
      // Notify both users that their conversation list needs updating
      broadcastConversationUpdate(senderIdStr, { conversationKey: convKey, lastMessage: formatConversationPreview(String(message)), lastMessageAt: now });
      broadcastConversationUpdate(receiverIdStr, { conversationKey: convKey, lastMessage: formatConversationPreview(String(message)), lastMessageAt: now });
    } catch (sseErr) {
      console.error("SSE broadcast failed (non-critical):", sseErr);
    }

    // ── Non-blocking: fire notifications and emails in the background ──
    createNotificationAndEmail({
      receiverId: receiverIdStr,
      receiverEmail: receiver?.email || null,
      senderName: sender?.name || session.user.name || "Someone",
      rawMessage: String(message),
    }).catch((err: any) => console.error("Background notification/email failed:", err));

    // If this is a dispute message, also email info@atlasinfrastructuregroup.com (non-blocking)
    if (String(message).startsWith("[DISPUTE]")) {
      const disputeParsed = parseCommunityMessageType(String(message));
      const disputeData = disputeParsed.data;
      const senderEmail = sender?.email || session.user.email || "Unknown";
      const receiverEmail = receiver?.email || "Unknown";
      sendHireMindXEmailNotification({
        to: "info@atlasinfrastructuregroup.com",
        subject: `New Dispute Raised — ${disputeData?.title || "Untitled"}`,
        title: "Dispute Raised on HireMindX",
        summary: `${disputeData?.raisedByRole || "User"} raised a dispute: ${disputeData?.title || "Untitled"}. ${disputeData?.description || ""}`,
        recipientName: "HireMindX Team",
        metadata: [
          { label: "Raised By", value: `${sender?.name || "Unknown"} (${disputeData?.raisedByRole || "unknown"})` },
          { label: "Dispute Title", value: disputeData?.title || "Untitled" },
          { label: "Description", value: disputeData?.description || "No description" },
          { label: "Client Email", value: disputeData?.raisedByRole === "client" ? senderEmail : receiverEmail },
          { label: "Freelancer Email", value: disputeData?.raisedByRole === "freelancer" ? senderEmail : receiverEmail },
          { label: "Contract ID", value: disputeData?.contractId || "N/A" },
          { label: "Date/Time", value: disputeData?.createdAt || now },
          { label: "Attachments", value: Array.isArray(disputeData?.attachments) ? `${disputeData.attachments.length} file(s)` : "None" },
        ],
      }).catch((emailErr: any) => console.error("Failed to send dispute email to info@atlas:", emailErr));
    }

    const normalizedMsg = {
      ...newMsg,
      attachments: normalizeAttachmentsValue(newMsg.attachments),
    };

    return NextResponse.json({ message: normalizedMsg });
  } catch (error) {
    console.error("Error sending community message:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Internal Server Error", details: errMsg }, { status: 500 });
  } finally {
    if (!receiverIdStr || !senderIdStr) return;
    if (receiverIdStr.includes("demo") || receiverIdStr.startsWith("free_") || receiverIdStr.length < 10) {
      const ids = [senderIdStr, receiverIdStr].sort();
      const convKey = `${ids[0]}_${ids[1]}`;
      triggerDemoBotReply(receiverIdStr, senderIdStr, convKey);
    }
  }
}

async function triggerDemoBotReply(botId: string, userId: string, convKey: string) {
  setTimeout(async () => {
    try {
      const db = (await import("@/db")).db;
      const { communityDMs } = await import("@/db/schema");
      const now = new Date().toISOString();
      const result = await db.insert(communityDMs).values({
        conversationKey: convKey,
        senderId: botId,
        receiverId: userId,
        message: "Thanks for reaching out! I typically respond within 24 hours. (This is an automated demo reply)",
        isRead: false,
        createdAt: now,
      }).returning();
      const botMsg = result[0] || {
        id: Date.now(),
        conversationKey: convKey,
        senderId: botId,
        receiverId: userId,
        message: "Thanks for reaching out! I typically respond within 24 hours. (This is an automated demo reply)",
        isRead: false,
        createdAt: now,
      };
      // Push bot reply via SSE
      try {
        const { broadcastNewMessage } = await import("@/lib/sse-registry");
        broadcastNewMessage(botMsg);
      } catch {}
      console.log(`Demo bot reply sent for ${botId}`);
    } catch (err) {
      console.error("Demo bot failed to reply:", err);
    }
  }, 1500);
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) {
    console.warn("/api/community/messages PATCH unauthorized", {
      hasCookie: Boolean(req.headers.get("cookie")),
      origin: req.headers.get("origin"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { withUser } = body;

  if (!withUser) {
    return NextResponse.json({ error: "withUser is required" }, { status: 400 });
  }

  const ids = [session.user.id, withUser].sort();
  const convKey = `${ids[0]}_${ids[1]}`;

  await db
    .update(communityDMs)
    .set({ isRead: true })
    .where(
      and(
        eq(communityDMs.conversationKey, convKey),
        eq(communityDMs.receiverId, session.user.id),
        eq(communityDMs.isRead, false)
      )
    );

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conversationKey = searchParams.get("conversationKey");
  const messageId = searchParams.get("id");

  if (conversationKey) {
    // Soft delete: add user to hiddenForUsers for all messages in this conversation
    const messages = await db.select().from(communityDMs)
      .where(
        and(
          eq(communityDMs.conversationKey, conversationKey),
          or(
            eq(communityDMs.senderId, session.user.id),
            eq(communityDMs.receiverId, session.user.id)
          )
        )
      );

    for (const msg of messages) {
      const existing = Array.isArray(msg.hiddenForUsers) ? msg.hiddenForUsers : [];
      if (!existing.includes(session.user.id)) {
        const updated = [...existing, session.user.id];
        await db.update(communityDMs)
          .set({ hiddenForUsers: JSON.stringify(updated) })
          .where(eq(communityDMs.id, msg.id));
      }
    }
    return NextResponse.json({ success: true });
  }

  if (messageId) {
    // Soft delete single message for this user only
    const [msg] = await db.select().from(communityDMs)
      .where(eq(communityDMs.id, parseInt(messageId)))
      .limit(1);

    if (msg) {
      const existing = Array.isArray(msg.hiddenForUsers) ? msg.hiddenForUsers : [];
      if (!existing.includes(session.user.id)) {
        const updated = [...existing, session.user.id];
        await db.update(communityDMs)
          .set({ hiddenForUsers: JSON.stringify(updated) })
          .where(eq(communityDMs.id, msg.id));
      }
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Provide ?conversationKey=... or ?id=..." }, { status: 400 });
}
