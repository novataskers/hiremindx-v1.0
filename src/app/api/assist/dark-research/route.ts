/**
 * Dark Web Research Mode API
 * Runs 3 parallel search strategies (surface, deep, dark) and organizes
 * results into tiered categories with an intelligence-analyst AI summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { searchWithSerper } from "@/lib/search-utils";

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

// Redact potentially illegal/harmful content
function redactContent(text: string): string {
  const patterns = [
    /\b(ssn|social security)\s*:?\s*\d{3}-?\d{2}-?\d{4}\b/gi,
    /\b(credit card|cc)\s*:?\s*\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gi,
    /\b(password|passwd)\s*:?\s*.{8,}/gi,
  ];
  let cleaned = text;
  for (const p of patterns) {
    cleaned = cleaned.replace(p, "[REDACTED]");
  }
  return cleaned;
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

    // Clean the prompt (remove "dark web research:" prefix)
    const cleanPrompt = prompt.replace(/^dark\s*(web|mode)?\s*research\s*:?\s*/i, "").trim() || prompt;

    // Run 3 parallel search strategies
    const [surfaceResults, deepResults, darkResults] = await Promise.all([
      // Surface Web — standard search
      searchWithSerper(cleanPrompt, 6).catch(() => []),
      // Deep Web — academic, government, research databases
      searchWithSerper(
        `${cleanPrompt} site:gov OR site:edu OR site:who.int OR site:worldbank.org OR site:arxiv.org OR site:scholar.google.com OR filetype:pdf`,
        6
      ).catch(() => []),
      // Dark Web — paste sites, aggregators, leak databases (public legal content only)
      searchWithSerper(
        `${cleanPrompt} site:pastebin.com OR site:archive.org OR site:wikileaks.org OR site:documentcloud.org OR site:scribd.com OR "leaked" OR "unredacted" OR "confidential" OR "internal report"`,
        6
      ).catch(() => []),
    ]);

    // Format and redact results
    const formatResult = (r: any) => {
      let hostname = "";
      try { hostname = new URL(r.link).hostname.replace("www.", ""); } catch {}
      return {
        title: redactContent(r.title || hostname),
        snippet: redactContent(r.snippet || ""),
        url: r.link,
        favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
        hostname,
      };
    };

    const surface = (surfaceResults || []).map(formatResult);
    const deep = (deepResults || []).map(formatResult);
    const dark = (darkResults || []).map(formatResult);

    // Generate AI intelligence summary via Mistral
    const allSnippets = [
      ...surface.map(r => r.snippet),
      ...deep.map(r => r.snippet),
      ...dark.map(r => r.snippet),
    ].filter(Boolean).join("\n");

    let summary = "";
    try {
      const mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-large-latest",
          messages: [{
            role: "user",
            content: `You are an intelligence analyst. Based on the following research data about "${cleanPrompt}", provide a brief 3-4 sentence intelligence summary. Be factual and cite specific data points. No disclaimers.\n\nData:\n${allSnippets.substring(0, 3000)}`,
          }],
          max_tokens: 400,
          temperature: 0.4,
        }),
      });
      if (mistralRes.ok) {
        const data = await mistralRes.json();
        summary = data.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("Summary generation error:", e);
    }

    return NextResponse.json({
      surface,
      deep,
      dark,
      summary: redactContent(summary),
      query: cleanPrompt,
      totalResults: surface.length + deep.length + dark.length,
    });
  } catch (error: unknown) {
    console.error("Dark research API error:", error);
    const msg = error instanceof Error ? error.message : "Failed to perform research";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
