"use client";

import { useEffect, useState } from "react";
import { Skull, Globe, Database, Lock, ChevronDown, ChevronUp, AlertTriangle, ExternalLink, Shield } from "lucide-react";

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  favicon: string;
  hostname: string;
}

interface DarkResearchData {
  surface: SearchResult[];
  deep: SearchResult[];
  dark: SearchResult[];
  summary: string;
  query: string;
  totalResults: number;
}

interface DarkResearchCardProps {
  prompt: string;
}

type TabKey = "surface" | "deep" | "dark";

export function DarkResearchCard({ prompt }: DarkResearchCardProps) {
  const [data, setData] = useState<DarkResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("surface");

  useEffect(() => {
    const fetchResearch = async () => {
      try {
        const response = await fetch("/api/assist/dark-research", {
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
        // Auto-select tab with most results
        if (result.dark.length > 0) setActiveTab("dark");
        else if (result.deep.length > 0) setActiveTab("deep");
      } catch (e: any) {
        setError(e.message || "Failed to perform research");
      } finally {
        setLoading(false);
      }
    };

    fetchResearch();
  }, [prompt]);

  const tabs: { key: TabKey; label: string; icon: any; color: string; bgColor: string; borderColor: string }[] = [
    { key: "surface", label: "Surface Web", icon: Globe, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
    { key: "deep", label: "Deep Web", icon: Database, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" },
    { key: "dark", label: "Dark Web", icon: Lock, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
  ];

  // Loading state
  if (loading) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-gradient-to-b from-red-950/30 to-black overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center animate-pulse border border-red-500/20">
              <Skull className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-red-300">Dark Research Mode</p>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider">ON</span>
              </div>
              <p className="text-xs text-zinc-500">Scanning multi-layer sources...</p>
            </div>
          </div>
          <div className="space-y-2">
            {["Surface Web", "Deep Web", "Dark Web"].map((layer, i) => (
              <div key={i} className="flex items-center gap-2" style={{ animation: `fadeIn 0.3s ease ${i * 0.4}s both` }}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${i === 0 ? "bg-blue-500" : i === 1 ? "bg-amber-500" : "bg-red-500"}`} />
                <span className="text-xs text-zinc-500">Scanning {layer}...</span>
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
            <Skull className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-300">Research Failed</p>
            <p className="text-xs text-zinc-400">{error || "Unable to perform research"}</p>
          </div>
        </div>
      </div>
    );
  }

  const currentResults = data[activeTab] || [];
  const currentTab = tabs.find(t => t.key === activeTab)!;

  return (
    <div className="rounded-2xl border border-red-500/20 bg-gradient-to-b from-red-950/20 to-transparent overflow-hidden dark-research-enter">
      {/* Header */}
      <div
        className="p-4 cursor-pointer flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600/30 to-red-900/20 flex items-center justify-center border border-red-500/20 shadow-lg shadow-red-500/10">
          <Skull className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-red-200">Dark Research Mode</p>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider animate-pulse">ON</span>
          </div>
          <p className="text-xs text-zinc-500 truncate">{data.totalResults} results across 3 source layers</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 dark-research-content-enter">
          {/* Warning */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <p className="text-[11px] text-amber-500/80">Accessing unfiltered sources — Verify independently</p>
          </div>

          {/* Intelligence Summary */}
          {data.summary && (
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Intelligence Summary</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">{data.summary}</p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-zinc-900/50 rounded-xl p-1">
            {tabs.map(tab => {
              const count = data[tab.key]?.length || 0;
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? `${tab.bgColor} ${tab.color} border ${tab.borderColor}`
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? "bg-white/10" : "bg-zinc-800"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Results */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {currentResults.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-6">No results found in {currentTab.label}</p>
            ) : (
              currentResults.map((result, i) => (
                <a
                  key={i}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block p-3 rounded-xl border transition-all hover:scale-[1.01] group ${
                    activeTab === "dark"
                      ? "bg-red-500/[0.03] border-red-500/10 hover:border-red-500/25 hover:bg-red-500/[0.06]"
                      : activeTab === "deep"
                      ? "bg-amber-500/[0.03] border-amber-500/10 hover:border-amber-500/25 hover:bg-amber-500/[0.06]"
                      : "bg-blue-500/[0.03] border-blue-500/10 hover:border-blue-500/25 hover:bg-blue-500/[0.06]"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <img
                      src={result.favicon}
                      alt=""
                      className="w-4 h-4 rounded-sm mt-0.5 flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white">{result.title}</p>
                        <ExternalLink className="w-3 h-3 text-zinc-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed line-clamp-2">{result.snippet}</p>
                      <p className="text-[10px] text-zinc-600 mt-1">{result.hostname}</p>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .dark-research-enter {
          animation: darkSlideIn 0.4s ease-out;
        }
        .dark-research-content-enter {
          animation: darkFadeIn 0.3s ease-out;
        }
        @keyframes darkSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes darkFadeIn {
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
