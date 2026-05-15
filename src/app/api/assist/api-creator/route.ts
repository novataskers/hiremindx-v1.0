/**
 * One-Shot API Creator
 * Generates complete production-ready code for research bots and APIs,
 * with deployment configuration and documentation.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const maxDuration = 60;

async function resolveUserId(headersList: Headers): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: headersList });
    if (session?.user) return session.user.id;
  } catch {}
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

// Parse platform and function from the user prompt
function parseIntent(prompt: string): { platform: string; func: string; dataSource: string } {
  const lower = prompt.toLowerCase();

  let platform = "api";
  if (/whatsapp/i.test(lower)) platform = "whatsapp";
  else if (/discord/i.test(lower)) platform = "discord";
  else if (/telegram/i.test(lower)) platform = "telegram";
  else if (/slack/i.test(lower)) platform = "slack";

  let func = "research assistant";
  if (/research/i.test(lower)) func = "research assistant";
  else if (/chat/i.test(lower)) func = "chatbot";
  else if (/notif/i.test(lower)) func = "notification service";
  else if (/monitor/i.test(lower)) func = "monitoring service";
  else if (/scrap/i.test(lower)) func = "web scraper";

  let dataSource = "web search";
  if (/database/i.test(lower)) dataSource = "database";
  else if (/api/i.test(lower)) dataSource = "external API";
  else if (/websocket|real.?time/i.test(lower)) dataSource = "websocket";

  return { platform, func, dataSource };
}

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const userId = await resolveUserId(headersList);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const { platform, func, dataSource } = parseIntent(prompt);

    // Generate complete production code via Mistral
    const codePrompt = `You are a senior full-stack developer. Generate a COMPLETE, production-ready ${platform} ${func} bot/API.

User request: "${prompt}"
Platform: ${platform}
Function: ${func}
Data source: ${dataSource}

Generate the following files as a JSON object with this exact structure:
{
  "projectName": "hiremindx-${platform}-bot",
  "platform": "${platform}",
  "files": [
    {
      "name": "index.js",
      "language": "javascript",
      "content": "// Full production code here"
    },
    {
      "name": "package.json",
      "language": "json",
      "content": "..."
    },
    {
      "name": ".env.example",
      "language": "text",
      "content": "..."
    },
    {
      "name": "README.md",
      "language": "markdown",
      "content": "..."
    },
    {
      "name": "vercel.json",
      "language": "json",
      "content": "..."
    }
  ],
  "deployUrl": "https://vercel.com/new/clone?repository-url=https://github.com/hiremindx/${platform}-bot",
  "description": "Brief description of what this bot does",
  "features": ["feature1", "feature2", "feature3"]
}

CRITICAL RULES:
1. Code must be COMPLETE and PRODUCTION-READY — no TODOs, no placeholders
2. Include FULL error handling, logging, and input validation
3. Include webhook handlers where applicable
4. Include environment variable configuration
5. Include HireMindX branding in comments: "// Built with HireMindX Assist — hiremindx.app"
6. Include a comprehensive README with setup instructions
7. Make deployment-ready for Vercel with proper config
8. Output ONLY valid JSON, no markdown fences`;

    const mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [{ role: "user", content: codePrompt }],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!mistralRes.ok) {
      throw new Error(`Mistral API error: ${mistralRes.status}`);
    }

    const mistralData = await mistralRes.json();
    const rawContent = mistralData.choices?.[0]?.message?.content || "";

    let result;
    try {
      const jsonStr = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      result = JSON.parse(jsonStr);
    } catch {
      // Fallback
      result = {
        projectName: `hiremindx-${platform}-bot`,
        platform,
        files: [
          {
            name: "index.js",
            language: "javascript",
            content: `// Built with HireMindX Assist — hiremindx.app\n// ${platform} ${func}\n\n${rawContent.substring(0, 2000)}`,
          },
          {
            name: "README.md",
            language: "markdown",
            content: `# HireMindX ${platform.charAt(0).toUpperCase() + platform.slice(1)} Bot\n\nGenerated by HireMindX Assist.\n\n## Setup\n\n1. Clone this repo\n2. Run \`npm install\`\n3. Copy \`.env.example\` to \`.env\` and fill in values\n4. Run \`npm start\``,
          },
        ],
        deployUrl: `https://vercel.com/new/clone?repository-url=https://github.com/hiremindx/${platform}-bot`,
        description: `A ${platform} ${func} bot built with HireMindX`,
        features: [func, "Error handling", "Webhook support"],
      };
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("API Creator error:", error);
    const msg = error instanceof Error ? error.message : "Failed to generate API";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
