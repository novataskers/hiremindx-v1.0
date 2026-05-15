/**
 * Deep Research Mode API
 * Performs comprehensive document-level research using multiple search
 * strategies, crawls into specific websites, finds documents/files,
 * and generates an intelligence summary with inline source links.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { searchWithSerper } from "@/lib/search-utils";
import { useFeature } from "@/lib/usage-limits";

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

// Redact potentially sensitive content
function redactContent(text: string): string {
  const patterns = [
    /\b(ssn|social security)\s*:?\s*\d{3}-?\d{2}-?\d{4}\b/gi,
    /\b(credit card|cc)\s*:?\s*\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gi,
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

    // Check usage limits
    const usageResult = await useFeature(userId, "deep_research");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    // Clean the prompt (remove command prefixes)
    const cleanPrompt = prompt
      .replace(/^deep\s*research\s*(mode)?\s*:?\s*/i, "")
      .replace(/^find\s+unfiltered\s*/i, "")
      .replace(/^\[Deep Research\]\s*/i, "")
      .trim() || prompt;

    // Run multiple search strategies in parallel for comprehensive results
    const [
      standardResults,
      documentResults,
      govResults,
      archiveResults,
    ] = await Promise.all([
      // Standard comprehensive search
      searchWithSerper(cleanPrompt, 5).catch(() => []),
      // Document-specific search (PDFs, files, reports)
      searchWithSerper(
        `${cleanPrompt} filetype:pdf OR filetype:doc OR filetype:xlsx OR "report" OR "document" OR "file"`,
        5
      ).catch(() => []),
      // Government & institutional search
      searchWithSerper(
        `${cleanPrompt} site:gov OR site:edu OR site:org OR site:who.int OR site:worldbank.org OR site:justice.gov OR site:sec.gov OR site:courtlistener.com`,
        5
      ).catch(() => []),
      // Archive & public records search
      searchWithSerper(
        `${cleanPrompt} site:archive.org OR site:documentcloud.org OR site:scribd.com OR site:courtlistener.com OR site:law.cornell.edu OR "public record" OR "court filing"`,
        5
      ).catch(() => []),
    ]);

    // Combine and deduplicate results
    const allResults: Map<string, any> = new Map();
    const addResults = (results: any[]) => {
      for (const r of results || []) {
        if (r?.link && !allResults.has(r.link)) {
          let hostname = "";
          try { hostname = new URL(r.link).hostname.replace("www.", ""); } catch {}
          allResults.set(r.link, {
            title: redactContent(r.title || hostname),
            snippet: redactContent(r.snippet || ""),
            url: r.link,
            favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
            hostname,
          });
        }
      }
    };

    addResults(standardResults);
    addResults(documentResults);
    addResults(govResults);
    addResults(archiveResults);

    const combinedResults = Array.from(allResults.values());

    // Generate AI intelligence summary that references the found sources
    const allSnippets = combinedResults
      .map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet} (${r.url})`)
      .join("\n");

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
            content: `You are a deep research intelligence analyst. The user asked: "${cleanPrompt}"

Based on these research results, provide a comprehensive intelligence briefing (4-6 sentences). Be specific — cite data points, names, dates. Reference specific documents or files found. If the user asked to find a specific document or file, mention exactly which result contains it and the direct link.

Research data:
${allSnippets.substring(0, 4000)}

Rules:
- Be factual and detailed
- Reference specific sources by name
- If documents/PDFs were found, highlight them specifically
- No disclaimers or hedging — deliver the intelligence directly
- If the query is about a specific file or document, tell the user exactly where to find it`,
          }],
          max_tokens: 600,
          temperature: 0.3,
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
      results: combinedResults,
      summary: redactContent(summary),
      query: cleanPrompt,
      totalResults: combinedResults.length,
    });
  } catch (error: unknown) {
    console.error("Deep research API error:", error);
    const msg = error instanceof Error ? error.message : "Failed to perform research";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
