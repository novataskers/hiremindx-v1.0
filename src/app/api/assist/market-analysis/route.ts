import { NextRequest } from "next/server";
import { createMistral } from "@ai-sdk/mistral";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { useFeature } from "@/lib/usage-limits";

const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY! });

interface PriceData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  high?: number;
  low?: number;
  marketCap?: number;
  type: "stock" | "crypto" | "forex" | "commodity";
}

interface NewsItem {
  title: string;
  url: string;
  source: string;
  sentiment: "positive" | "negative" | "neutral";
  publishedAt: string;
}

// Detect what assets the user is asking about
function extractAssets(prompt: string): { symbols: string[]; type: string } {
  const p = prompt.toLowerCase();

  const cryptoMap: Record<string, string> = {
    bitcoin: "BTC", btc: "BTC", ethereum: "ETH", eth: "ETH",
    solana: "SOL", sol: "SOL", xrp: "XRP", ripple: "XRP",
    bnb: "BNB", binance: "BNB", cardano: "ADA", ada: "ADA",
    dogecoin: "DOGE", doge: "DOGE", avalanche: "AVAX", avax: "AVAX",
    polygon: "MATIC", matic: "MATIC", chainlink: "LINK", link: "LINK",
    litecoin: "LTC", ltc: "LTC", polkadot: "DOT", dot: "DOT",
  };

  const stockMap: Record<string, string> = {
    apple: "AAPL", aapl: "AAPL", tesla: "TSLA", tsla: "TSLA",
    microsoft: "MSFT", msft: "MSFT", google: "GOOGL", alphabet: "GOOGL", googl: "GOOGL",
    amazon: "AMZN", amzn: "AMZN", meta: "META", facebook: "META",
    nvidia: "NVDA", nvda: "NVDA", netflix: "NFLX", nflx: "NFLX",
    "s&p": "SPY", "s&p 500": "SPY", spy: "SPY", nasdaq: "QQQ", qqq: "QQQ",
    gold: "GC=F", silver: "SI=F", oil: "CL=F", "crude oil": "CL=F",
  };

  const forexMap: Record<string, string> = {
    "usd/eur": "USDEUR", "eur/usd": "EURUSD", euro: "EURUSD",
    "gbp/usd": "GBPUSD", pound: "GBPUSD", "usd/jpy": "USDJPY", yen: "USDJPY",
    "usd/cad": "USDCAD",
  };

  const detectedSymbols: string[] = [];
  let assetType = "general";

  for (const [key, symbol] of Object.entries(cryptoMap)) {
    if (p.includes(key)) { detectedSymbols.push(symbol); assetType = "crypto"; }
  }
  for (const [key, symbol] of Object.entries(stockMap)) {
    if (p.includes(key)) { detectedSymbols.push(symbol); if (assetType === "general") assetType = "stock"; }
  }
  for (const [key, symbol] of Object.entries(forexMap)) {
    if (p.includes(key)) { detectedSymbols.push(symbol); if (assetType === "general") assetType = "forex"; }
  }

  // Deduplicate
  const unique = [...new Set(detectedSymbols)];

  // If nothing detected but general market question, use defaults
  if (unique.length === 0) {
    if (p.includes("crypto") || p.includes("cryptocurrency")) {
      return { symbols: ["BTC", "ETH", "SOL"], type: "crypto" };
    }
    if (p.includes("forex") || p.includes("currency")) {
      return { symbols: ["EURUSD", "GBPUSD", "USDJPY"], type: "forex" };
    }
    if (p.includes("stock") || p.includes("market")) {
      return { symbols: ["AAPL", "TSLA", "NVDA", "SPY"], type: "stock" };
    }
    return { symbols: ["BTC", "ETH", "AAPL", "TSLA"], type: "general" };
  }

  return { symbols: unique.slice(0, 5), type: assetType };
}

// Fetch crypto prices from CoinGecko (free, no key needed)
async function fetchCryptoPrices(symbols: string[]): Promise<PriceData[]> {
  const coinIds: Record<string, string> = {
    BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple",
    BNB: "binancecoin", ADA: "cardano", DOGE: "dogecoin", AVAX: "avalanche-2",
    MATIC: "matic-network", LINK: "chainlink", LTC: "litecoin", DOT: "polkadot",
  };

  const ids = symbols.map(s => coinIds[s]).filter(Boolean).join(",");
  if (!ids) return [];

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`,
      { headers: { Accept: "application/json" }, next: { revalidate: 30 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((c: any): PriceData => ({
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price,
      change: c.price_change_24h,
      changePercent: c.price_change_percentage_24h,
      volume: c.total_volume,
      high: c.high_24h,
      low: c.low_24h,
      marketCap: c.market_cap,
      type: "crypto",
    }));
  } catch {
    return [];
  }
}

// Fetch stock/commodity prices from Yahoo Finance (unofficial free endpoint)
async function fetchStockPrices(symbols: string[]): Promise<PriceData[]> {
  const results: PriceData[] = [];

  for (const symbol of symbols) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 30 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) continue;

      const price = meta.regularMarketPrice || meta.previousClose;
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const change = price - prevClose;
      const changePercent = (change / prevClose) * 100;

      const isForex = symbol.length === 6 && !symbol.includes("=");
      const isCommodity = symbol.includes("=F");

      results.push({
        symbol,
        name: meta.longName || meta.shortName || symbol,
        price,
        change,
        changePercent,
        volume: meta.regularMarketVolume,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        type: isForex ? "forex" : isCommodity ? "commodity" : "stock",
      });
    } catch {
      continue;
    }
  }

  return results;
}

// Fetch market news via Serper (increased to 12 articles)
async function fetchMarketNews(query: string): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: `${query} market analysis trading`, num: 12, gl: "us" }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.news || []).slice(0, 12).map((item: any): NewsItem => {
      const title = item.title?.toLowerCase() || "";

      // Strong sentiment keywords get more weight
      const strongPositive = title.match(/surge|rally|soar|record|breakout|moon|explode|skyrocket/);
      const mildPositive = title.match(/bull|gain|rise|up|high|grow|boost|recover|rebound/);
      const strongNegative = title.match(/crash|plunge|collapse|tank|dump|bloodbath|capitulat/);
      const mildNegative = title.match(/fall|drop|bear|loss|decline|down|low|sell|fear|warn|slip|dip/);

      let sentiment: "positive" | "negative" | "neutral" = "neutral";
      if (strongPositive || mildPositive) sentiment = "positive";
      if (strongNegative || mildNegative) sentiment = "negative";
      // Strong signals override mild opposite
      if (strongPositive && !strongNegative) sentiment = "positive";
      if (strongNegative && !strongPositive) sentiment = "negative";

      return {
        title: item.title,
        url: item.link,
        source: item.source || new URL(item.link).hostname,
        sentiment,
        publishedAt: item.date || "now",
      };
    });
  } catch {
    return [];
  }
}

// Fetch Fear & Greed Index (crypto market, free API)
async function fetchFearGreedIndex(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const fng = data?.data?.[0];
    if (!fng) return null;
    return { value: parseInt(fng.value, 10), label: fng.value_classification };
  } catch {
    return null;
  }
}

// Compute overall sentiment score from news (weighted by keyword strength)
function computeSentiment(news: NewsItem[]): { score: number; label: "Bullish" | "Bearish" | "Neutral"; breakdown: { positive: number; negative: number; neutral: number } } {
  if (news.length === 0) return { score: 0.5, label: "Neutral", breakdown: { positive: 0, negative: 0, neutral: 0 } };

  const pos = news.filter(n => n.sentiment === "positive").length;
  const neg = news.filter(n => n.sentiment === "negative").length;
  const neu = news.filter(n => n.sentiment === "neutral").length;

  // Weighted score: stronger when sentiment is lopsided
  const total = news.length;
  const score = (pos - neg) / total + 0.5;
  const clamped = Math.min(1, Math.max(0, score));

  return {
    score: clamped,
    label: clamped > 0.6 ? "Bullish" : clamped < 0.4 ? "Bearish" : "Neutral",
    breakdown: { positive: pos, negative: neg, neutral: neu },
  };
}

// Compute technical context from price data (pseudo-indicators from available data)
function computeTechnicalContext(prices: PriceData[]): string {
  return prices.map(p => {
    const lines: string[] = [];
    lines.push(`── ${p.name} (${p.symbol}) ──`);
    lines.push(`  Price: $${p.price?.toLocaleString()} | 24h Change: ${p.changePercent >= 0 ? "+" : ""}${p.changePercent?.toFixed(2)}%`);

    if (p.high && p.low && p.high !== p.low) {
      const range = p.high - p.low;
      const positionInRange = ((p.price - p.low) / range) * 100;
      lines.push(`  24h Range: $${p.low.toLocaleString()} — $${p.high.toLocaleString()}`);
      lines.push(`  Position in Range: ${positionInRange.toFixed(0)}% (${positionInRange > 75 ? "⚠️ Near 24h HIGH — potential resistance" : positionInRange < 25 ? "⚠️ Near 24h LOW — potential support" : "Mid-range"})`);

      // Relative strength based on where price sits in range
      if (positionInRange > 80) lines.push(`  Momentum: STRONG UPWARD — trading near the top of today's range`);
      else if (positionInRange > 60) lines.push(`  Momentum: MODERATE UPWARD — above midpoint`);
      else if (positionInRange < 20) lines.push(`  Momentum: STRONG DOWNWARD — trading near the bottom of today's range`);
      else if (positionInRange < 40) lines.push(`  Momentum: MODERATE DOWNWARD — below midpoint`);
      else lines.push(`  Momentum: NEUTRAL — consolidating around midpoint`);
    }

    if (p.volume) {
      const volLabel = p.type === "crypto"
        ? (p.volume > 50_000_000_000 ? "EXTREMELY HIGH" : p.volume > 10_000_000_000 ? "HIGH" : p.volume > 1_000_000_000 ? "MODERATE" : "LOW")
        : (p.volume > 100_000_000 ? "EXTREMELY HIGH" : p.volume > 50_000_000 ? "HIGH" : p.volume > 10_000_000 ? "MODERATE" : "LOW");
      lines.push(`  Volume: ${p.volume.toLocaleString()} (${volLabel}) — ${volLabel === "EXTREMELY HIGH" || volLabel === "HIGH" ? "confirms trend strength" : "weak conviction, trend may reverse"}`);
    }

    if (p.marketCap) {
      const tier = p.marketCap > 100_000_000_000 ? "MEGA CAP (very stable)"
        : p.marketCap > 10_000_000_000 ? "LARGE CAP (stable)"
        : p.marketCap > 1_000_000_000 ? "MID CAP (moderate risk)"
        : "SMALL CAP (high risk/high reward)";
      lines.push(`  Market Cap: $${(p.marketCap / 1_000_000_000).toFixed(1)}B — ${tier}`);
    }

    // Volatility indicator from 24h change
    const absChange = Math.abs(p.changePercent || 0);
    if (absChange > 10) lines.push(`  ⚡ VOLATILITY: EXTREME (${absChange.toFixed(1)}% swing) — use tight stop losses`);
    else if (absChange > 5) lines.push(`  ⚡ VOLATILITY: HIGH (${absChange.toFixed(1)}% swing) — increased risk`);
    else if (absChange > 2) lines.push(`  VOLATILITY: MODERATE (${absChange.toFixed(1)}% swing)`);
    else lines.push(`  VOLATILITY: LOW (${absChange.toFixed(1)}% swing) — stable`);

    return lines.join("\n");
  }).join("\n\n");
}

export async function POST(req: NextRequest) {
  // Auth check
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  // Usage limit check
  const usageResult = await useFeature(session.user.id, "market_analysis");
  if (!usageResult.allowed) {
    return new Response(JSON.stringify({
      error: usageResult.upgradeMessage,
      limitReached: true,
      usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
    }), { status: 429, headers: { "Content-Type": "application/json" } });
  }

  const { prompt, conversationHistory = [] } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Step 1 — Detect assets
        send({ type: "step", step: 1, label: "Detecting assets from your query...", status: "running" });
        const { symbols, type: assetType } = extractAssets(prompt);
        await new Promise(r => setTimeout(r, 400));
        send({ type: "step", step: 1, label: `Detected: ${symbols.join(", ")}`, status: "done" });

        // Step 2 — Fetch live prices
        send({ type: "step", step: 2, label: "Fetching live market prices...", status: "running" });
        const cryptoSymbols = symbols.filter(s => ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","LTC","DOT"].includes(s));
        const stockSymbols = symbols.filter(s => !cryptoSymbols.includes(s));

        const [cryptoPrices, stockPrices] = await Promise.all([
          cryptoSymbols.length > 0 ? fetchCryptoPrices(cryptoSymbols) : Promise.resolve([]),
          stockSymbols.length > 0 ? fetchStockPrices(stockSymbols) : Promise.resolve([]),
        ]);
        const allPrices = [...cryptoPrices, ...stockPrices];
        send({ type: "step", step: 2, label: `Fetched prices for ${allPrices.length} asset(s)`, status: "done" });
        send({ type: "prices", data: allPrices });

        // Step 3 — Fetch news & sentiment
        send({ type: "step", step: 3, label: "Scanning live news & sentiment...", status: "running" });
        const newsQuery = symbols.length > 0 ? symbols.join(" ") : assetType;
        const news = await fetchMarketNews(newsQuery);
        const sentiment = computeSentiment(news);
        send({ type: "step", step: 3, label: `Sentiment: ${sentiment.label} (${news.length} articles analyzed)`, status: "done" });
        send({ type: "news", data: news, sentiment });

        // Step 4 — Fear & Greed Index + Technical Indicators
        send({ type: "step", step: 4, label: "Computing technical indicators & market sentiment...", status: "running" });
        const isCryptoQuery = assetType === "crypto" || cryptoSymbols.length > 0;
        const fearGreed = isCryptoQuery ? await fetchFearGreedIndex() : null;
        const technicalContext = computeTechnicalContext(allPrices);
        await new Promise(r => setTimeout(r, 300));
        send({ type: "step", step: 4, label: `Technical analysis complete${fearGreed ? ` | Fear & Greed: ${fearGreed.value} (${fearGreed.label})` : ""}`, status: "done" });
        if (fearGreed) {
          send({ type: "fearGreed", data: fearGreed });
        }

        // Step 5 — AI analysis & signals (the big one)
        send({ type: "step", step: 5, label: "Generating AI trade signals with risk analysis...", status: "running" });

        const newsContext = news.slice(0, 8).map(n =>
          `[${n.sentiment.toUpperCase()}] ${n.title} (${n.source})`
        ).join("\n");

        const fearGreedContext = fearGreed
          ? `\nFEAR & GREED INDEX: ${fearGreed.value}/100 (${fearGreed.label})\n- 0-25: Extreme Fear (historically = strong BUY zone)\n- 25-45: Fear (potential accumulation zone)\n- 45-55: Neutral\n- 55-75: Greed (caution, potential top forming)\n- 75-100: Extreme Greed (historically = strong SELL zone / take profit)\n`
          : "";

        const systemPrompt = `You are an elite quantitative trading analyst and AI market intelligence system with institutional-grade analysis capabilities. You have LIVE real-time market data, news sentiment, and technical indicators fed directly into your context. Your signals are used by professional traders.

## YOUR ANALYSIS FRAMEWORK

You must analyze each asset using ALL of the following dimensions:

### 1. PRICE ACTION ANALYSIS
- Current price vs 24h range (support/resistance levels)
- Momentum direction and strength
- Volume confirmation of trend

### 2. SENTIMENT ANALYSIS
- News sentiment breakdown (bullish/bearish/neutral ratio)
- ${fearGreed ? `Fear & Greed Index reading: ${fearGreed.value} (${fearGreed.label}) — USE THIS as a key contrarian indicator` : "General market mood from news flow"}
- Social/media sentiment direction

### 3. RISK ASSESSMENT
- Volatility level and what it means for position sizing
- Market cap tier and liquidity risk
- Key risk factors specific to this asset right now

## OUTPUT FORMAT — FOLLOW EXACTLY

For EACH asset, provide this EXACT structure:

### [Asset Name] ([SYMBOL]) — [SIGNAL: 🟢 BUY / 🔴 SELL / 🟡 HOLD] — Confidence: [X]%

**Current Price**: $[price]
**24h Change**: [+/-X.XX]%

📊 **Signal Breakdown**:
| Metric | Value |
|--------|-------|
| Signal | [BUY 🟢 / SELL 🔴 / HOLD 🟡] |
| Confidence | [X]% |
| Entry Zone | $[low] — $[high] |
| Take Profit 1 | $[price] (+[X]%) |
| Take Profit 2 | $[price] (+[X]%) |
| Stop Loss | $[price] (-[X]%) |
| Risk/Reward | 1:[X] |
| Timeframe | [Short-term (1-24h) / Medium-term (1-7d) / Long-term (1-4w)] |

**Why this signal**:
- [Reason 1 backed by the live data]
- [Reason 2 backed by news/sentiment]
- [Reason 3 backed by technical position]

⚠️ **Risk Alert**: [Specific risks for this trade — what could invalidate the signal]

---

After ALL individual asset analyses, provide:

## 📈 Overall Market Summary

[2-3 sentence synthesis of the overall market condition, what's driving it, and the dominant theme]

## 🎯 Top Pick

[Which asset has the highest-conviction signal right now and why — be specific]

## ⚠️ Position Sizing Guide

Based on the current volatility:
- **Conservative**: Risk [X]% of portfolio per trade
- **Moderate**: Risk [X]% of portfolio per trade
- **Aggressive**: Risk [X]% of portfolio per trade

## KEY RULES:
1. NEVER give vague signals. Every signal MUST have a specific entry price, take-profit, and stop-loss.
2. Confidence % must reflect the ACTUAL strength of the data. Don't inflate it.
3. If the data is mixed/unclear, signal HOLD — don't force a BUY or SELL.
4. Always include the Risk/Reward ratio. If it's below 1:1.5, DON'T recommend the trade.
5. Consider the Fear & Greed Index as a CONTRARIAN indicator (extreme fear = buy opportunity, extreme greed = sell opportunity).
6. Be HONEST about risks. Traders lose money when risks are hidden.

LIVE TECHNICAL DATA:
${technicalContext}

LIVE NEWS SENTIMENT (${sentiment.label} — ${sentiment.breakdown.positive} positive, ${sentiment.breakdown.negative} negative, ${sentiment.breakdown.neutral} neutral out of ${news.length} articles):
${newsContext}
${fearGreedContext}
User question: ${prompt}`;

          send({ type: "step", step: 5, label: "Generating AI trade signals with risk analysis...", status: "done" });
          send({ type: "analysis_start" });

          const result = streamText({
            model: mistral("mistral-large-latest"),
            system: systemPrompt,
            messages: [
              ...conversationHistory.slice(-4).map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
              { role: "user", content: prompt },
            ],
            maxOutputTokens: 2500,
            temperature: 0.2,
          });

          for await (const delta of result.textStream) {
            if (delta) send({ type: "token", text: delta });
          }

        send({ type: "done" });
      } catch (err: any) {
        send({ type: "error", message: err?.message || "Market analysis failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
