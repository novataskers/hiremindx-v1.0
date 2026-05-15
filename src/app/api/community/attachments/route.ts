import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { communityDMs } from "@/db/schema";
import { eq, and } from "drizzle-orm";

function buildAuthHeaders(req: NextRequest) {
  const h = new Headers(req.headers);
  const cookie = req.headers.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const authz = req.headers.get("authorization");
  if (authz) h.set("authorization", authz);
  return h;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: buildAuthHeaders(req) });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const attachmentIndex = searchParams.get("attachmentIndex");
  const shouldDownload = searchParams.get("download") === "1";

  if (!messageId || attachmentIndex === null) {
    return NextResponse.json({ error: "messageId and attachmentIndex required" }, { status: 400 });
  }

  const parsedMessageId = Number.parseInt(messageId, 10);
  const parsedAttachmentIndex = Number.parseInt(attachmentIndex, 10);

  if (!Number.isInteger(parsedMessageId) || !Number.isInteger(parsedAttachmentIndex) || parsedAttachmentIndex < 0) {
    return NextResponse.json({ error: "Invalid messageId or attachmentIndex" }, { status: 400 });
  }

  try {
    // Verify user has access to this message
    const message = await db.select()
      .from(communityDMs)
      .where(eq(communityDMs.id, parsedMessageId))
      .limit(1);

    if (!message || message.length === 0) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const msg = message[0];
    const userId = session.user.id;

    // User must be either sender or receiver
    if (msg.senderId !== userId && msg.receiverId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the attachment
    let attachments = msg.attachments;
    if (typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments);
      } catch {
        return NextResponse.json({ error: "Invalid attachment data" }, { status: 400 });
      }
    }

    if (!Array.isArray(attachments) || !attachments[parsedAttachmentIndex]) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const attachment = attachments[parsedAttachmentIndex];

    if (!attachment?.url || typeof attachment.url !== "string") {
      return NextResponse.json({ error: "Attachment URL missing" }, { status: 400 });
    }

    // If stored as a data URL, decode and stream it back.
    // If stored as an external/http/blob URL, redirect so the client can open it.
    let mimeType = attachment.type || "application/octet-stream";
    const attachmentUrl = attachment.url;

    if (!attachmentUrl.startsWith("data:")) {
      const response = NextResponse.redirect(attachmentUrl);
      if (shouldDownload) {
        response.headers.set("Content-Disposition", `attachment; filename="${attachment.name || "attachment"}"`);
      }
      return response;
    }

    let base64Data = attachmentUrl;
    const parts = attachmentUrl.split(",");
    if (parts.length !== 2) {
      return NextResponse.json({ error: "Invalid attachment data URL" }, { status: 400 });
    }

    if (parts[0].includes(";")) {
      mimeType = parts[0].split(":")[1].split(";")[0];
    }
    base64Data = parts[1];

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, "base64");
    } catch (e) {
      console.error("Failed to decode base64:", e);
      return NextResponse.json({ error: "Failed to process attachment" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, max-age=60",
    };

    if (shouldDownload) {
      headers["Content-Disposition"] = `attachment; filename="${attachment.name || "attachment"}"`;
    } else if (mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType === "application/pdf") {
      headers["Content-Disposition"] = `inline; filename="${attachment.name || "attachment"}"`;
    } else {
      headers["Content-Disposition"] = `attachment; filename="${attachment.name || "attachment"}"`;
    }

    return new NextResponse(new Uint8Array(buffer), { headers, status: 200 });
  } catch (error) {
    console.error("Error serving attachment:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
