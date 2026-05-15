"use client";

import { useEffect, useState } from "react";
import { Search, ChevronDown, ChevronUp, AlertTriangle, ExternalLink, Shield, Loader2, FileText, Globe } from "lucide-react";

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  favicon: string;
  hostname: string;
}

interface DeepResearchData {
  results: SearchResult[];
  summary: string;
  query: string;
  totalResults: number;
}

interface DeepResearchCardProps {
  prompt: string;
}

export function DeepResearchCard({ prompt }: DeepResearchCardProps) {
  const [data, setData] = useState<DeepResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  // Strip markdown chars from AI summary so it renders as clean prose
  const cleanMarkdown = (text: string): string => {
    return text
      .replace(/#{1,6}\s*/g, '')           // Remove # headings
      .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold** → bold
      .replace(/\*([^*]+)\*/g, '$1')       // *italic* → italic
      .replace(/__([^_]+)__/g, '$1')       // __bold__ → bold
      .replace(/_([^_]+)_/g, '$1')         // _italic_ → italic
      .replace(/`([^`]+)`/g, '$1')         // `code` → code
      .replace(/^\s*[-*+]\s+/gm, '• ')     // List items → bullet
      .replace(/^\s*\d+\.\s+/gm, '')       // Numbered lists
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')  // [link](url) → link text
      .replace(/\n{3,}/g, '\n\n')          // Collapse multiple newlines
      .trim();
  };

  useEffect(() => {
    const fetchResearch = async () => {
      try {
        const response = await fetch("/api/assist/deep-research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `Error ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (e: any) {
        setError(e.message || "Failed to perform research");
      } finally {
        setLoading(false);
      }
    };

    fetchResearch();
  }, [prompt]);

  // Loading state
  if (loading) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-gradient-to-b from-red-950/20 to-black overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center animate-pulse border border-red-500/20">
              <Search className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-red-300">Deep Research Mode</p>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider">ACTIVE</span>
              </div>
              <p className="text-xs text-zinc-500">Scanning deep sources...</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {["Searching public records & databases...", "Crawling document repositories...", "Analyzing results..."].map((text, i) => (
              <div key={i} className="flex items-center gap-2" style={{ animation: `fadeIn 0.3s ease ${i * 0.5}s both` }}>
                <Loader2 className="w-3.5 h-3.5 text-red-500/60 animate-spin" />
                <span className="text-xs text-zinc-500">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <style jsx>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
            <Search className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-300">Research Failed</p>
            <p className="text-xs text-zinc-400">{error || "Unable to perform research"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-500/20 bg-gradient-to-b from-red-950/15 to-transparent overflow-hidden deep-research-enter">
      {/* Header */}
      <div
        className="p-4 cursor-pointer flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600/30 to-rose-900/20 flex items-center justify-center border border-red-500/20 shadow-lg shadow-red-500/10">
          <Search className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-red-200">Deep Research Mode</p>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider">ACTIVE</span>
          </div>
          <p className="text-xs text-zinc-500 truncate">{data.totalResults} sources found for &quot;{data.query}&quot;</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 deep-research-content-enter">
          {/* Disclaimer */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <p className="text-[11px] text-amber-500/80">Deep research results — Verify independently before use</p>
          </div>

          {/* Intelligence Summary with Inline Sources */}
          {data.summary && (
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-start gap-2.5 mb-3">
                <Shield className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Intelligence Summary</p>
                  <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">{cleanMarkdown(data.summary)}</p>
                </div>
              </div>

              {/* Source Links — inline inside the summary section */}
              {data.results && data.results.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/[0.06]">
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Globe className="w-3 h-3" />
                    Sources & Documents
                  </p>
                  <div className="space-y-2">
                    {data.results.map((result, i) => (
                      <a
                        key={i}
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2.5 p-2.5 rounded-lg border border-red-500/10 bg-red-500/[0.03] hover:border-red-500/25 hover:bg-red-500/[0.06] transition-all hover:scale-[1.005] group"
                      >
                        <img
                          src={result.favicon}
                          alt=""
                          className="w-4 h-4 rounded-sm mt-0.5 flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium text-zinc-200 truncate group-hover:text-white">{result.title}</p>
                            <ExternalLink className="w-3 h-3 text-zinc-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">{result.snippet}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <FileText className="w-2.5 h-2.5 text-zinc-600" />
                            <p className="text-[10px] text-zinc-600">{result.hostname}</p>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .deep-research-enter {
          animation: deepSlideIn 0.4s ease-out;
        }
        .deep-research-content-enter {
          animation: deepFadeIn 0.3s ease-out;
        }
        @keyframes deepSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes deepFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
