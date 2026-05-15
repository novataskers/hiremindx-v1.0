"use client";

import { useEffect, useState } from "react";
import { Rocket, Code, FileText, Settings, ExternalLink, Copy, Check, ChevronDown, ChevronUp, Loader2, Terminal, Sparkles } from "lucide-react";

interface GeneratedFile {
  name: string;
  language: string;
  content: string;
}

interface APICreatorData {
  projectName: string;
  platform: string;
  files: GeneratedFile[];
  deployUrl: string;
  description: string;
  features: string[];
}

interface APICreatorCardProps {
  prompt: string;
}

export function APICreatorCard({ prompt }: APICreatorCardProps) {
  const [data, setData] = useState<APICreatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeFile, setActiveFile] = useState(0);
  const [copied, setCopied] = useState(false);
  const [buildPhase, setBuildPhase] = useState(0);

  useEffect(() => {
    // Animate build phases
    const phases = [0, 1, 2, 3];
    const timers = phases.map((_, i) =>
      setTimeout(() => setBuildPhase(i + 1), (i + 1) * 700)
    );

    const fetchAPI = async () => {
      try {
        const response = await fetch("/api/assist/api-creator", {
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
        setError(e.message || "Failed to generate API");
      } finally {
        setLoading(false);
      }
    };

    fetchAPI();
    return () => timers.forEach(clearTimeout);
  }, [prompt]);

  const copyCode = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith(".js") || name.endsWith(".ts")) return <Code className="w-3.5 h-3.5" />;
    if (name.endsWith(".json")) return <Settings className="w-3.5 h-3.5" />;
    if (name.endsWith(".md")) return <FileText className="w-3.5 h-3.5" />;
    return <Terminal className="w-3.5 h-3.5" />;
  };

  // Loading state
  if (loading) {
    return (
      <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-cyan-950/20 to-transparent overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-500/20 flex items-center justify-center border border-cyan-500/20">
              <Rocket className="w-5 h-5 text-cyan-400 animate-bounce" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cyan-300">Building your API...</p>
              <p className="text-xs text-zinc-500">Generating production code</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {[
              { text: "Parsing platform & function", done: buildPhase >= 1 },
              { text: "Generating full-stack code", done: buildPhase >= 2 },
              { text: "Creating deployment config", done: buildPhase >= 3 },
              { text: "Generating documentation", done: buildPhase >= 4 },
            ].map((step, i) => (
              <div key={i} className={`flex items-center gap-2 transition-all duration-300 ${step.done ? "opacity-100" : "opacity-40"}`}>
                <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${step.done ? "bg-cyan-500/20" : "bg-zinc-800"}`}>
                  {step.done ? (
                    <Check className="w-3 h-3 text-cyan-400" />
                  ) : (
                    <Loader2 className="w-3 h-3 text-zinc-600 animate-spin" />
                  )}
                </div>
                <span className={`text-xs ${step.done ? "text-zinc-300" : "text-zinc-600"}`}>{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-300">Build Failed</p>
            <p className="text-xs text-zinc-400">{error || "Unable to generate API"}</p>
          </div>
        </div>
      </div>
    );
  }

  const currentFile = data.files[activeFile];

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-cyan-950/[0.08] to-transparent overflow-hidden api-card-enter">
      {/* Header */}
      <div
        className="p-4 cursor-pointer flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-500/20 flex items-center justify-center border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
          <Rocket className="w-5 h-5 text-cyan-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-cyan-200">{data.projectName}</p>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">READY</span>
          </div>
          <p className="text-xs text-zinc-500 truncate">{data.description}</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 api-content-enter">
          {/* Features */}
          {data.features && data.features.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.features.map((feat, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md text-[10px] bg-cyan-500/10 text-cyan-300/80 border border-cyan-500/10">
                  ✅ {feat}
                </span>
              ))}
            </div>
          )}

          {/* File tabs */}
          <div className="flex gap-1 bg-zinc-900/50 rounded-xl p-1 overflow-x-auto">
            {data.files.map((file, i) => (
              <button
                key={i}
                onClick={() => setActiveFile(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeFile === i
                    ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                }`}
              >
                {getFileIcon(file.name)}
                <span>{file.name}</span>
              </button>
            ))}
          </div>

          {/* Code preview */}
          {currentFile && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                  {getFileIcon(currentFile.name)}
                  <span className="text-xs font-mono text-zinc-400">{currentFile.name}</span>
                </div>
                <button
                  onClick={() => copyCode(currentFile.content)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    copied ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <pre className="p-3 text-xs font-mono text-zinc-300 overflow-x-auto max-h-[350px] overflow-y-auto leading-relaxed">
                <code>{currentFile.content}</code>
              </pre>
            </div>
          )}

          {/* Deploy button */}
          <div className="flex items-center gap-3">
            <a
              href={data.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white transition-all hover:scale-[1.02] shadow-lg shadow-cyan-500/20"
            >
              <Rocket className="w-4 h-4" />
              Deploy to Vercel
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Sparkles className="w-3 h-3" />
              <span>Built with HireMindX Assist</span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .api-card-enter {
          animation: apiSlideIn 0.4s ease-out;
        }
        .api-content-enter {
          animation: apiFadeIn 0.3s ease-out;
        }
        @keyframes apiSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes apiFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
