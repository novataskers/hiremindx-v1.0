"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, ExternalLink, Loader2, CheckCircle2, Activity, Newspaper, Zap, BarChart2, Shield, Gauge } from "lucide-react";

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

interface AgentStep {
  step: number;
  label: string;
  status: "running" | "done";
}

interface FearGreedData {
  value: number;
  label: string;
}

interface MarketAgentCardProps {
  prompt: string;
  conversationHistory?: { role: string; content: string }[];
  onDone?: () => void;
}

const STEP_ICONS = [Activity, BarChart2, Newspaper, Gauge, Zap];

function fmt(n: number | undefined, decimals = 2): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(decimals)}`;
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtVol(vol: number | undefined, type: string): { label: string; color: string } {
  if (!vol) return { label: "—", color: "text-white/40" };
  if (type === "crypto") {
    if (vol > 50_000_000_000) return { label: "Extreme", color: "text-emerald-400" };
    if (vol > 10_000_000_000) return { label: "High", color: "text-emerald-400" };
    if (vol > 1_000_000_000) return { label: "Moderate", color: "text-yellow-400" };
    return { label: "Low", color: "text-orange-400" };
  }
  if (vol > 100_000_000) return { label: "Extreme", color: "text-emerald-400" };
  if (vol > 50_000_000) return { label: "High", color: "text-emerald-400" };
  if (vol > 10_000_000) return { label: "Moderate", color: "text-yellow-400" };
  return { label: "Low", color: "text-orange-400" };
}

export function MarketAgentCard({ prompt, conversationHistory = [], onDone }: MarketAgentCardProps) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sentiment, setSentiment] = useState<{ score: number; label: string } | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [phase, setPhase] = useState<"steps" | "analysis" | "done">("steps");
  const [expanded, setExpanded] = useState(true);
  const [showNews, setShowNews] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    run();
  }, []);

  async function run() {
    try {
      const res = await fetch("/api/assist/market-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, conversationHistory }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Market analysis failed");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
          } catch {}
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to fetch market data");
      setPhase("done");
      onDone?.();
    }
  }

  function handleEvent(event: any) {
    switch (event.type) {
      case "step":
        setSteps(prev => {
          const existing = prev.findIndex(s => s.step === event.step);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { step: event.step, label: event.label, status: event.status };
            return updated;
          }
          return [...prev, { step: event.step, label: event.label, status: event.status }];
        });
        break;
      case "prices":
        setPrices(event.data);
        break;
      case "news":
        setNews(event.data);
        setSentiment(event.sentiment);
        break;
      case "fearGreed":
        setFearGreed(event.data);
        break;
      case "analysis_start":
        setPhase("analysis");
        break;
      case "token":
        setAnalysis(prev => prev + event.text);
        break;
      case "done":
        setPhase("done");
        onDone?.();
        break;
      case "error":
        setError(event.message);
        setPhase("done");
        onDone?.();
        break;
    }
  }

  const sentimentColor =
    sentiment?.label === "Bullish" ? "text-emerald-400" :
    sentiment?.label === "Bearish" ? "text-red-400" : "text-yellow-400";

  const sentimentBg =
    sentiment?.label === "Bullish" ? "bg-emerald-500/10 border-emerald-500/30" :
    sentiment?.label === "Bearish" ? "bg-red-500/10 border-red-500/30" : "bg-yellow-500/10 border-yellow-500/30";

  // Fear & Greed color coding
  const fgColor = fearGreed
    ? fearGreed.value <= 25 ? { text: "text-red-400", bg: "bg-red-500/10 border-red-500/30", bar: "bg-red-500" }
    : fearGreed.value <= 45 ? { text: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", bar: "bg-orange-500" }
    : fearGreed.value <= 55 ? { text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", bar: "bg-yellow-500" }
    : fearGreed.value <= 75 ? { text: "text-lime-400", bg: "bg-lime-500/10 border-lime-500/30", bar: "bg-lime-500" }
    : { text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", bar: "bg-emerald-500" }
    : null;

  return (
    <div className="market-agent-card w-full rounded-2xl overflow-hidden border border-white/10 bg-[#0d1117] mt-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none bg-gradient-to-r from-[#0d1117] to-[#111827] border-b border-white/10"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <BarChart2 size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Live Market Intelligence</span>
          {phase !== "done" && (
            <span className="flex items-center gap-1 text-xs text-blue-400 animate-pulse">
              <Loader2 size={10} className="animate-spin" /> Analyzing...
            </span>
          )}
          {phase === "done" && !error && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 size={10} /> Complete
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-white/50" /> : <ChevronDown size={14} className="text-white/50" />}
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Agent Steps */}
          {steps.length > 0 && (
            <div className="space-y-2">
              {steps.map((step) => {
                const Icon = STEP_ICONS[(step.step - 1) % STEP_ICONS.length];
                return (
                  <div key={step.step} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      step.status === "done" ? "bg-emerald-500/20" : "bg-blue-500/20"
                    }`}>
                      {step.status === "done"
                        ? <CheckCircle2 size={12} className="text-emerald-400" />
                        : <Loader2 size={12} className="text-blue-400 animate-spin" />
                      }
                    </div>
                    <span className={`text-xs ${step.status === "done" ? "text-white/70" : "text-white"}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Price Cards */}
          {prices.length > 0 && (
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-2 font-medium">Live Prices</div>
              <div className="grid grid-cols-2 gap-2">
                {prices.map((p) => {
                  const up = p.changePercent >= 0;
                  const vol = fmtVol(p.volume, p.type);
                  return (
                    <div key={p.symbol} className={`rounded-xl p-3 border ${up ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs text-white/50 font-mono">{p.symbol}</div>
                          <div className="text-sm font-bold text-white mt-0.5">{fmt(p.price)}</div>
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
                          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {fmtPct(p.changePercent)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/40">
                        <span>H: {fmt(p.high)}</span>
                        <span>L: {fmt(p.low)}</span>
                        <span className={`ml-auto font-medium ${vol.color}`}>Vol: {vol.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sentiment Bar */}
          {sentiment && (
            <div className={`rounded-xl border p-3 ${sentimentBg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/60 font-medium">Market Sentiment</span>
                <span className={`text-sm font-bold ${sentimentColor}`}>{sentiment.label}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    sentiment.label === "Bullish" ? "bg-emerald-500" :
                    sentiment.label === "Bearish" ? "bg-red-500" : "bg-yellow-500"
                  }`}
                  style={{ width: `${Math.round(sentiment.score * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-white/30 mt-1">
                <span>Bearish</span>
                <span>Neutral</span>
                <span>Bullish</span>
              </div>
            </div>
          )}

          {/* Fear & Greed Index Gauge */}
          {fearGreed && fgColor && (
            <div className={`rounded-xl border p-3 ${fgColor.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Gauge size={14} className={fgColor.text} />
                  <span className="text-xs text-white/60 font-medium">Fear & Greed Index</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${fgColor.text}`}>{fearGreed.value}</span>
                  <span className={`text-xs font-semibold ${fgColor.text}`}>{fearGreed.label}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${fgColor.bar}`}
                  style={{ width: `${fearGreed.value}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-white/30 mt-1">
                <span>Extreme Fear</span>
                <span>Neutral</span>
                <span>Extreme Greed</span>
              </div>
              <div className="mt-2 text-[10px] text-white/40 flex items-center gap-1">
                <Shield size={10} />
                {fearGreed.value <= 25
                  ? "Extreme fear often signals buying opportunities (contrarian indicator)"
                  : fearGreed.value <= 45
                  ? "Fear in the market — potential accumulation zone"
                  : fearGreed.value <= 55
                  ? "Market sentiment is neutral — wait for clearer signals"
                  : fearGreed.value <= 75
                  ? "Greed rising — consider taking partial profits"
                  : "Extreme greed — historically signals overbought conditions"}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          {(analysis || phase === "analysis") && (
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-2 font-medium">AI Trade Signals & Analysis</div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-white/90 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}
                  components={{
                    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                    h2: ({ children }) => <h2 className="text-white font-bold text-base mt-4 mb-2 flex items-center gap-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-white font-semibold mt-3 mb-1.5">{children}</h3>,
                    ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>,
                    li: ({ children }) => <li className="text-white/80">{children}</li>,
                    p: ({ children }) => <p className="mb-2">{children}</p>,
                    hr: () => <hr className="border-white/10 my-4" />,
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-3">
                        <table className="w-full text-xs border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="border-b border-white/20">{children}</thead>,
                    th: ({ children }) => <th className="text-left py-1.5 px-2 text-white/60 font-semibold">{children}</th>,
                    td: ({ children }) => <td className="py-1.5 px-2 text-white/80 border-t border-white/5">{children}</td>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-blue-500/50 pl-3 my-2 text-white/70 italic">{children}</blockquote>
                    ),
                  }}
                >{analysis}</ReactMarkdown>
                {phase === "analysis" && (
                  <span className="inline-block w-1 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </div>
          )}

          {/* News accordion */}
          {news.length > 0 && phase === "done" && (
            <div>
              <button
                onClick={() => setShowNews(v => !v)}
                className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors"
              >
                <Newspaper size={12} />
                {showNews ? "Hide" : "Show"} {news.length} news sources
                {showNews ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {showNews && (
                <div className="mt-2 space-y-1.5">
                  {news.map((n, i) => (
                    <a
                      key={i}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 rounded-lg p-2 bg-white/5 hover:bg-white/10 transition-colors group"
                    >
                      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        n.sentiment === "positive" ? "bg-emerald-400" :
                        n.sentiment === "negative" ? "bg-red-400" : "bg-yellow-400"
                      }`} />
                      <span className="text-xs text-white/70 group-hover:text-white leading-snug">{n.title}</span>
                      <ExternalLink size={10} className="flex-shrink-0 mt-0.5 text-white/30 group-hover:text-white/60" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
