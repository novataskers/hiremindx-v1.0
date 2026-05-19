export interface SearchResult {
  name: string;
  website?: string;
  contactEmail?: string;
  description?: string;
  snippet?: string;
  link?: string;
  title?: string;
}

export interface SearchOptions {
  recency?: 'hour' | 'day' | 'week' | 'month';
}

const RECENCY_MAP: Record<string, string> = {
  hour: 'qdr:h',
  day: 'qdr:d',
  week: 'qdr:w',
  month: 'qdr:m',
};

export async function searchWithSerper(query: string, count: number = 5, options?: SearchOptions): Promise<SearchResult[]> {
  const serperApiKey = process.env.SERPER_API_KEY;
  if (!serperApiKey) {
    console.warn("SERPER_API_KEY not found in environment variables");
    return [];
  }
  try {
    const payload: Record<string, any> = { q: query, num: count };
    if (options?.recency && RECENCY_MAP[options.recency]) {
      payload.tbs = RECENCY_MAP[options.recency];
    }
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.organic || []).map((item: any) => ({
      name: item.title,
      title: item.title,
      website: item.link,
      link: item.link,
      description: item.snippet,
      snippet: item.snippet,
    }));
  } catch (error) {
    console.error("Serper search error:", error);
    return [];
  }
}

/**
 * Returns a live date context string + knowledge cutoff warning.
 * MUST be injected into every system prompt so the AI knows the real current date
 * and does not hallucinate its training data (cutoff ~June 2024) as "today".
 */
export function getDateContext(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'UTC',
  };
  const dateStr = now.toLocaleDateString('en-US', options);
  return `Today's date is ${dateStr}.\n\nIMPORTANT: Your training knowledge has a hard cutoff around June 2024. For ANY time-sensitive, real-time, or current question (date, day, time, recent news, weather, prices, events, etc.), you MUST rely ONLY on the real-time data/search results provided in this prompt. NEVER use your internal training knowledge for anything that changes over time. If the user asks "what is today's date", answer based on the date above, not your training data.`;
}
