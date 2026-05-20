/**
 * Assist File Upload Endpoint
 * Receives raw file bytes via multipart/form-data, uploads to Cloudflare R2,
 * and returns a public URL reference.
 */

import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/html",
  "text/css",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/xml",
  "application/javascript",
  "text/javascript",
]);

const ALLOWED_EXTENSIONS = [
  ".txt", ".md", ".markdown", ".html", ".htm", ".css", ".js", ".ts", ".tsx",
  ".jsx", ".json", ".xml", ".csv", ".pdf", ".doc", ".docx", ".png", ".jpg",
  ".jpeg", ".gif", ".webp", ".svg",
];

async function resolveUserId(headersList: Headers): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: headersList });
    if (session?.user) return session.user.id;
  } catch {}
  const cookie = headersList.get("cookie") || "";
  const devCookie = cookie.split(";").find((c) => c.trim().startsWith("devSession="));
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
  try {
    const headersList = await headers();
    const userId = await resolveUserId(headersList);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    const isAllowed =
      ALLOWED_TYPES.has(file.type) ||
      ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

    if (!isAllowed) {
      return NextResponse.json({ error: "File type not supported" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const publicUrl = await uploadToR2(buffer, file.name, file.type || "application/octet-stream");

    return NextResponse.json({
      url: publicUrl,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
    });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    const msg = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
