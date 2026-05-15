/**
 * Canvas Deploy API
 * Deploys canvas projects to HireMindX's own hosting (self-hosted)
 * Projects are stored in the database and served from /canvas/[id]
 * Supports both new deploys and redeployments (updates)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createClient } from "@libsql/client";

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getClient() {
  return createClient({
    url: process.env.TURSO_CONNECTION_URL || "file:./local.db",
    authToken: process.env.TURSO_AUTH_TOKEN || "fallback_token",
  });
}

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code, projectName, action, projectId: existingProjectId } = await request.json();
    
    if (!code) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }

    const name = projectName || `Canvas Project`;

    if (action === 'deploy') {
      const now = new Date().toISOString();
      const client = getClient();

      // If existingProjectId is provided, UPDATE the existing project (redeploy)
      if (existingProjectId) {
        await client.execute({
          sql: 'UPDATE canvas_projects SET html_content = ?, title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
          args: [code, name, now, existingProjectId, session.user.id],
        });

        const origin = request.headers.get('origin') || request.headers.get('host') || 'hiremindx.com';
        const protocol = origin.includes('localhost') ? 'http' : 'https';
        const baseUrl = origin.startsWith('http') ? origin : `${protocol}://${origin}`;
        const deployUrl = `${baseUrl}/canvas/${existingProjectId}`;

        return NextResponse.json({
          success: true,
          deployUrl,
          projectId: existingProjectId,
          projectName: name,
          redeployed: true,
        });
      }

      // New deploy — INSERT
      const projectId = generateId();
      await client.execute({
        sql: 'INSERT INTO canvas_projects (id, user_id, title, html_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [projectId, session.user.id, name, code, now, now],
      });

      const origin = request.headers.get('origin') || request.headers.get('host') || 'hiremindx.com';
      const protocol = origin.includes('localhost') ? 'http' : 'https';
      const baseUrl = origin.startsWith('http') ? origin : `${protocol}://${origin}`;
      const deployUrl = `${baseUrl}/canvas/${projectId}`;

      return NextResponse.json({
        success: true,
        deployUrl,
        projectId,
        projectName: name,
      });
    }

    // Default: return files for download
    return NextResponse.json({
      success: true,
      projectName: name,
      files: { "index.html": code },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Deploy failed";
    console.error('Canvas deploy error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
