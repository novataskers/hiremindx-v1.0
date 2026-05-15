"use client";

import { useEffect, useState, useRef } from "react";
import { Brain, TrendingUp, ChevronDown, ChevronUp, Sparkles, Clock, Target, Zap, BarChart3 } from "lucide-react";

interface TimelinePoint {
  label: string;
  description: string;
}

interface TopTopic {
  topic: string;
  count: number;
}

interface PredictionData {
  prediction: string;
  confidence: number;
  reasoning: string;
  timeline: TimelinePoint[];
  supportingEvidence: string[];
  relatedTopics: string[];
  sessionCount: number;
  topTopics: TopTopic[];
}

interface PredictionCardProps {
  prompt: string;
}

export function PredictionCard({ prompt }: PredictionCardProps) {
  const [data, setData] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [animatedConfidence, setAnimatedConfidence] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchPrediction = async () => {
      try {
        const response = await fetch("/api/assist/predictions", {
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
        setError(e.message || "Failed to generate prediction");
      } finally {
        setLoading(false);
      }
    };

    fetchPrediction();
  }, [prompt]);

  // Animate confidence bar after loading
  useEffect(() => {
    if (data?.confidence) {
      const timer = setTimeout(() => {
        let current = 0;
        const target = data.confidence;
        const step = target / 40;
        const interval = setInterval(() => {
          current += step;
          if (current >= target) {
            current = target;
            clearInterval(interval);
          }
          setAnimatedConfidence(Math.round(current));
        }, 20);
        return () => clearInterval(interval);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [data?.confidence]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return { bar: "from-emerald-500 to-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10", label: "High Confidence" };
    if (confidence >= 60) return { bar: "from-amber-500 to-yellow-400", text: "text-amber-400", bg: "bg-amber-500/10", label: "Moderate Confidence" };
    return { bar: "from-orange-500 to-red-400", text: "text-orange-400", bg: "bg-orange-500/10", label: "Low Confidence" };
  };

  // Loading state
  if (loading) {
    return (
      <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center animate-pulse">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-purple-300">Prediction Engine</p>
              <p className="text-xs text-zinc-500">Analyzing your research memory...</p>
            </div>
          </div>
          {/* Animated loading steps */}
          <div className="space-y-3">
            {[
              { icon: Clock, text: "Loading research history...", delay: 0 },
              { icon: BarChart3, text: "Pattern matching topics...", delay: 800 },
              { icon: TrendingUp, text: "Cross-referencing global trends...", delay: 1600 },
              { icon: Sparkles, text: "Generating prediction...", delay: 2400 },
            ].map((step, i) => (
              <LoadingStep key={i} icon={step.icon} text={step.text} delay={step.delay} />
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
            <Brain className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-300">Prediction Failed</p>
            <p className="text-xs text-zinc-400">{error || "Unable to generate prediction"}</p>
          </div>
        </div>
      </div>
    );
  }

  const conf = getConfidenceColor(data.confidence);

  return (
    <div ref={cardRef} className="rounded-2xl border border-purple-500/20 bg-gradient-to-b from-purple-500/[0.06] to-transparent overflow-hidden prediction-card-enter">
      {/* Header */}
      <div
        className="p-4 cursor-pointer flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-violet-500/20 flex items-center justify-center border border-purple-500/20 shadow-lg shadow-purple-500/10">
          <Brain className="w-5 h-5 text-purple-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-purple-200">Prediction Engine</p>
            {data.sessionCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
                {data.sessionCount} session{data.sessionCount !== 1 ? "s" : ""} analyzed
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate">
            {data.sessionCount > 0 ? "Using YOUR research memory" : "Based on global trend data"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${conf.bg} ${conf.text}`}>
            {data.confidence}%
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 prediction-content-enter">
          {/* Prediction Statement */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-start gap-2.5">
              <Target className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-zinc-200 leading-relaxed">{data.prediction}</p>
            </div>
          </div>

          {/* Confidence Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500 font-medium">Confidence Score</span>
              <span className={`text-xs font-semibold ${conf.text}`}>{conf.label}</span>
            </div>
            <div className="h-2.5 rounded-full bg-zinc-800/80 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${conf.bar} transition-all duration-1000 ease-out shadow-lg`}
                style={{ width: `${animatedConfidence}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-600 mt-1.5">
              {animatedConfidence}% accurate based on {data.sessionCount > 0 ? "your research patterns + " : ""}global data
            </p>
          </div>

          {/* Timeline */}
          {data.timeline && data.timeline.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Prediction Timeline</p>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[18px] top-4 bottom-4 w-px bg-gradient-to-b from-zinc-700 via-purple-500/40 to-emerald-500/40" />
                <div className="space-y-4">
                  {data.timeline.map((point, i) => {
                    const isLast = i === data.timeline.length - 1;
                    const isPast = i === 0;
                    const dotColor = isPast
                      ? "bg-zinc-600 border-zinc-500"
                      : isLast
                      ? "bg-emerald-500/40 border-emerald-400 shadow-lg shadow-emerald-500/20"
                      : "bg-purple-500/40 border-purple-400";
                    const labelColor = isPast ? "text-zinc-500" : isLast ? "text-emerald-400" : "text-purple-300";
                    const icon = isPast ? Clock : isLast ? Sparkles : Zap;
                    const Icon = icon;

                    return (
                      <div key={i} className="flex items-start gap-3 relative">
                        <div className={`w-[38px] h-[38px] rounded-lg flex items-center justify-center flex-shrink-0 border ${dotColor}`}>
                          <Icon className={`w-4 h-4 ${labelColor}`} />
                        </div>
                        <div className="pt-1 min-w-0">
                          <p className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>{point.label}</p>
                          <p className="text-sm text-zinc-300 mt-0.5 leading-relaxed">{point.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Supporting Evidence */}
          {data.supportingEvidence && data.supportingEvidence.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Supporting Evidence</p>
              <div className="space-y-1.5">
                {data.supportingEvidence.map((evidence, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <span className="text-purple-500 mt-0.5 flex-shrink-0">▸</span>
                    <span>{evidence}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Research Memory Topics */}
          {data.topTopics && data.topTopics.length > 0 && (
            <div className="pt-2 border-t border-white/[0.04]">
              <p className="text-[11px] text-zinc-600 mb-2">Your top research topics:</p>
              <div className="flex flex-wrap gap-1.5">
                {data.topTopics.map((t, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md text-[10px] bg-purple-500/10 text-purple-300/70 border border-purple-500/10"
                  >
                    {t.topic} ({t.count}×)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning */}
          {data.reasoning && (
            <div className="pt-2 border-t border-white/[0.04]">
              <div className="flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-zinc-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-zinc-500 leading-relaxed">{data.reasoning}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inline styles for animations */}
      <style jsx>{`
        .prediction-card-enter {
          animation: predictionSlideIn 0.4s ease-out;
        }
        .prediction-content-enter {
          animation: predictionFadeIn 0.3s ease-out;
        }
        @keyframes predictionSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes predictionFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Loading step component
function LoadingStep({ icon: Icon, text, delay }: { icon: any; text: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), delay);
    const completeTimer = setTimeout(() => setComplete(true), delay + 600);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(completeTimer);
    };
  }, [delay]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2.5 prediction-card-enter">
      <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-300 ${complete ? "bg-purple-500/20" : "bg-zinc-800"}`}>
        <Icon className={`w-3.5 h-3.5 transition-colors duration-300 ${complete ? "text-purple-400" : "text-zinc-600"}`} />
      </div>
      <span className={`text-xs transition-colors duration-300 ${complete ? "text-zinc-300" : "text-zinc-500"}`}>{text}</span>
      {!complete && <span className="text-zinc-600 text-xs animate-pulse">●</span>}
    </div>
  );
}
