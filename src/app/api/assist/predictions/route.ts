/**
 * Memory-Based Prediction Engine API
 * Loads user research history, pattern-matches topics, cross-references with
 * global trends, and generates predictions with confidence scores.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { researchSessions, predictions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { searchWithSerper } from "@/lib/search-utils";
import { useFeature } from "@/lib/usage-limits";

export const maxDuration = 60;

// ─── Resolve user ──────────────────────────────────────────────────────────────
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

// ─── Topic extraction (lightweight, no AI call) ────────────────────────────────
function extractTopicAndKeywords(query: string): {
  topic: string;
  keywords: string[];
  entities: string[];
  category: string;
} {
  const lower = query.toLowerCase();

  // Category detection
  let category = "general";
  if (/\b(hir(e|ing)|recruit|job|talent|candidate|workforce|employment|staff)\b/i.test(lower)) category = "hiring";
  else if (/\b(ai|machine learning|ml|deep learning|tech|software|algorithm|neural|gpt|llm)\b/i.test(lower)) category = "technology";
  else if (/\b(market|stock|crypto|invest|financ|econom|trade|price)\b/i.test(lower)) category = "market";
  else if (/\b(universit|college|education|student|academic|school|professor|teach)\b/i.test(lower)) category = "education";
  else if (/\b(health|medical|pharma|hospital|doctor|patient|disease)\b/i.test(lower)) category = "healthcare";

  // Remove stop words and extract meaningful keywords
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "under", "about",
    "against", "out", "over", "up", "down", "off", "then", "than",
    "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
    "neither", "each", "every", "all", "any", "few", "more", "most",
    "other", "some", "such", "no", "only", "own", "same", "too",
    "very", "just", "because", "how", "what", "when", "where", "which",
    "who", "whom", "why", "this", "that", "these", "those", "i", "me",
    "my", "we", "our", "you", "your", "he", "him", "she", "her", "it",
    "its", "they", "them", "their", "predict", "trend", "future",
    "happens", "next", "forecast", "tell", "show", "give",
  ]);

  const words = lower
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  const keywords = [...new Set(words)].slice(0, 10);

  // Extract entities (capitalized words from original query)
  const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const entities: string[] = [];
  let match;
  while ((match = entityPattern.exec(query)) !== null) {
    if (!stopWords.has(match[1].toLowerCase()) && match[1].length > 2) {
      entities.push(match[1]);
    }
  }

  // Topic: first few meaningful keywords joined
  const topic = keywords.slice(0, 4).join(" ") || "general research";

  return { topic, keywords, entities: [...new Set(entities)], category };
}

// ─── Main handler ──────────────────────────────────────────────────────────────
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
    const usageResult = await useFeature(userId, "ai_prediction");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    // 1. Load user's research history (last 50 sessions)
    const userSessions = await db
      .select()
      .from(researchSessions)
      .where(eq(researchSessions.userId, userId))
      .orderBy(desc(researchSessions.createdAt))
      .limit(50);

    // 2. Analyze research patterns
    const topicFrequency: Record<string, number> = {};
    const categoryFrequency: Record<string, number> = {};
    const allKeywords: string[] = [];
    const allEntities: string[] = [];
    const recentTopics: string[] = [];

    for (const s of userSessions) {
      // Count topics
      topicFrequency[s.topic] = (topicFrequency[s.topic] || 0) + 1;
      // Count categories
      if (s.category) categoryFrequency[s.category] = (categoryFrequency[s.category] || 0) + 1;
      // Collect keywords & entities
      if (Array.isArray(s.keywords)) allKeywords.push(...(s.keywords as string[]));
      if (Array.isArray(s.entities)) allEntities.push(...(s.entities as string[]));
      // Recent topics (last 10)
      if (recentTopics.length < 10) recentTopics.push(s.topic);
    }

    // Top topics by frequency
    const topTopics = Object.entries(topicFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));

    // Keyword frequency
    const kwFreq: Record<string, number> = {};
    for (const kw of allKeywords) kwFreq[kw] = (kwFreq[kw] || 0) + 1;
    const topKeywords = Object.entries(kwFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([kw, count]) => ({ keyword: kw, count }));

    // 3. Search for current global trends related to the prediction query
    let trendData: any[] = [];
    try {
      const searchResults = await searchWithSerper(`${prompt} trends 2025 2026 forecast`, 8);
      if (searchResults?.length > 0) {
        trendData = searchResults.map((s: any) => ({
          title: s.title,
          snippet: s.snippet,
          url: s.link,
        }));
      }
    } catch (e) {
      console.error("Trend search error:", e);
    }

    // 4. Build the prediction prompt for Mistral
    const researchContext = userSessions.length > 0
      ? `## User's Research History (${userSessions.length} sessions)

### Top Researched Topics:
${topTopics.map(t => `- "${t.topic}" (researched ${t.count} times)`).join("\n")}

### Most Common Keywords:
${topKeywords.map(k => `- "${k.keyword}" (appeared ${k.count} times)`).join("\n")}

### Recent Session Topics (chronological):
${recentTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

### Research Categories:
${Object.entries(categoryFrequency).map(([cat, count]) => `- ${cat}: ${count} sessions`).join("\n")}

### Unique Entities Mentioned:
${[...new Set(allEntities)].slice(0, 20).join(", ")}
`
      : "No prior research history available. Generate prediction based on global data only.";

    const globalTrends = trendData.length > 0
      ? `## Current Global Trend Data:\n${trendData.map((t, i) => `${i + 1}. ${t.title}\n   ${t.snippet}`).join("\n\n")}`
      : "No specific trend data found.";

    const predictionPrompt = `You are a Prediction Intelligence Engine. Your job is to generate data-driven predictions by cross-referencing a user's personal research patterns with current global trends.

${researchContext}

${globalTrends}

## User's Prediction Request:
"${prompt}"

Generate a prediction in the following strict JSON format (NO markdown, just raw JSON):
{
  "prediction": "A clear, specific prediction statement (2-3 sentences max)",
  "confidence": <number 0-100>,
  "reasoning": "Why this prediction is likely (reference user's research patterns + global data)",
  "timeline": [
    { "label": "Past", "description": "What user researched / what has happened" },
    { "label": "Present", "description": "Current situation / emerging signals" },
    { "label": "Future", "description": "What is predicted to happen" }
  ],
  "relatedTopics": ["topic1", "topic2", "topic3"],
  "supportingEvidence": [
    "Evidence point 1 from trends",
    "Evidence point 2 from research patterns"
  ]
}

CRITICAL RULES:
- Confidence MUST be between 40 and 95. Never 100% or below 40%.
- If user has relevant research history, reference it to personalize the prediction.
- If no research history, base prediction on global trends only and set confidence lower (40-65%).
- Make predictions SPECIFIC and DATA-DRIVEN, not vague platitudes.
- The "Past" timeline should reference the user's actual research if available.
- Output ONLY valid JSON, no markdown fences, no extra text.`;

    // 5. Call Mistral for prediction generation
    const mistralResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [{ role: "user", content: predictionPrompt }],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!mistralResponse.ok) {
      throw new Error(`Mistral API error: ${mistralResponse.status}`);
    }

    const mistralData = await mistralResponse.json();
    const rawContent = mistralData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown fences if present)
    let predictionResult;
    try {
      const jsonStr = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      predictionResult = JSON.parse(jsonStr);
    } catch {
      // Fallback if JSON parsing fails
      predictionResult = {
        prediction: rawContent.slice(0, 500),
        confidence: 50,
        reasoning: "Generated from available data.",
        timeline: [
          { label: "Past", description: "Research data collected" },
          { label: "Present", description: "Analyzing patterns" },
          { label: "Future", description: rawContent.slice(0, 200) },
        ],
        relatedTopics: recentTopics.slice(0, 3),
        supportingEvidence: ["Based on available research data"],
      };
    }

    // 6. Save prediction to database
    const relatedIds = userSessions.slice(0, 5).map(s => s.id);
    const now = new Date().toISOString();

    await db.insert(predictions).values({
      userId,
      query: prompt,
      prediction: predictionResult.prediction,
      confidence: Math.min(95, Math.max(40, predictionResult.confidence || 50)),
      reasoning: predictionResult.reasoning,
      timelineData: predictionResult.timeline,
      trendData: trendData.slice(0, 5),
      relatedSessionIds: relatedIds,
      relatedTopics: predictionResult.relatedTopics || [],
      createdAt: now,
    });

    // 7. Return response
    return NextResponse.json({
      prediction: predictionResult.prediction,
      confidence: Math.min(95, Math.max(40, predictionResult.confidence || 50)),
      reasoning: predictionResult.reasoning,
      timeline: predictionResult.timeline || [],
      supportingEvidence: predictionResult.supportingEvidence || [],
      relatedTopics: predictionResult.relatedTopics || [],
      sessionCount: userSessions.length,
      topTopics: topTopics.slice(0, 3),
    });
  } catch (error: unknown) {
    console.error("Prediction API error:", error);
    const msg = error instanceof Error ? error.message : "Failed to generate prediction";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
