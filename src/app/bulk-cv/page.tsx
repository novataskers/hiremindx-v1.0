"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import Header from "@/components/Header";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Upload, FileText, Users, Brain, ChevronRight, X, Loader2,
  Building2, Briefcase, GraduationCap, Clock, CheckCircle2, AlertCircle,
  Trophy, Star, TrendingUp, Mail, Phone, ChevronDown, ChevronUp,
  ArrowLeft, Sparkles, Trash2, HelpCircle, Copy, Check, Download,
} from "lucide-react";
import { toast } from "sonner";

function useDevSession() {
  const [devSession, setDevSession] = useState<{ user: { id: string; name: string; email: string } } | null>(null);
  const [isChecked, setIsChecked] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("devSession");
      if (stored) { try { setDevSession(JSON.parse(stored)); } catch { setDevSession(null); } }
      setIsChecked(true);
    }
  }, []);
  return { devSession, isChecked };
}

interface HiringPosition {
  id: number; title: string; department: string; organization: string;
  description: string | null; requirements: string | null; preferredSkills: string[] | null;
  experienceRequired: string | null; educationRequired: string | null;
  status: string; createdAt: string; updatedAt: string; cvCount: number; analyzedCount: number;
}

interface CandidateResult {
  rank: number;
  cv: { id: number; fileName: string; candidateName: string | null; candidateEmail: string | null; candidatePhone: string | null; rawText?: string | null; status: string; uploadedAt: string; };
  analysis: { overallScore: number; skillsMatch: number; experienceMatch: number; educationMatch: number; recommendation: string; strengths: string[]; weaknesses: string[]; summary: string; detailedAnalysis: string; suggestedDepartments: string[]; analyzedAt: string; } | null;
}

interface GeneratedQuestion { id: number; question: string; answer: string; category: string; rationale: string; expectedTopics: string[]; }
interface GeneratedQuestionsData { questions: GeneratedQuestion[]; candidateSummary: string; keyAreasToProbe: string[]; }

type Difficulty = "easy" | "medium" | "hard";

export default function BulkCVPage() {
  const { data: session, isPending } = useSession();
  const { devSession, isChecked: devSessionChecked } = useDevSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const isAuthenticated = session?.user || devSession?.user;
  const isAuthLoading = isPending || !devSessionChecked;

  const [positions, setPositions] = useState<HiringPosition[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<HiringPosition | null>(null);
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedCandidate, setExpandedCandidate] = useState<number | null>(null);
  const [newPosition, setNewPosition] = useState({ title: "", department: "", organization: "", description: "", requirements: "", preferredSkills: "", experienceRequired: "", educationRequired: "" });

  // Interview questions integration state
  const [generatingQuestionsFor, setGeneratingQuestionsFor] = useState<number | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<Record<number, GeneratedQuestionsData>>({});
  const [questionDifficulty, setQuestionDifficulty] = useState<Record<number, Difficulty>>({});
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const [copiedAllFor, setCopiedAllFor] = useState<number | null>(null);
  const [showPostAnalysisModal, setShowPostAnalysisModal] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!isAuthLoading && !isAuthenticated) router.push("/"); }, [isAuthenticated, isAuthLoading, router]);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch("/api/hiring-positions");
      const data = await res.json();
      if (!res.ok) { if (res.status !== 401) toast.error(data.error || "Failed to load positions"); return; }
      if (data.positions) setPositions(data.positions);
    } catch { toast.error("Failed to load positions"); } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { if (isAuthenticated) fetchPositions(); }, [isAuthenticated, fetchPositions]);

  const fetchCandidates = async (positionId: number) => {
    try {
      const res = await fetch(`/api/cv-bulk-analyze?positionId=${positionId}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to load candidates"); return; }
      if (data.candidates) setCandidates(data.candidates);
    } catch { toast.error("Failed to load candidates"); }
  };

  const handleSelectPosition = async (position: HiringPosition) => { setSelectedPosition(position); setCandidates([]); setShowPostAnalysisModal(false); await fetchCandidates(position.id); };

  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPosition.title || !newPosition.department || !newPosition.organization) { toast.error("Please fill in all required fields"); return; }
    setIsCreating(true);
    try {
      const res = await fetch("/api/hiring-positions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newPosition, preferredSkills: newPosition.preferredSkills ? newPosition.preferredSkills.split(",").map(s => s.trim()) : null }) });
      const data = await res.json();
      if (data.position) { setPositions(prev => [{ ...data.position, cvCount: 0, analyzedCount: 0 }, ...prev]); setShowCreateModal(false); setNewPosition({ title: "", department: "", organization: "", description: "", requirements: "", preferredSkills: "", experienceRequired: "", educationRequired: "" }); toast.success("Position created successfully"); }
    } catch { toast.error("Failed to create position"); } finally { setIsCreating(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedPosition || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    const pdfFiles = files.filter(f => f.type === "application/pdf");
    if (!pdfFiles.length) { toast.error("Please select PDF files only"); return; }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("positionId", selectedPosition.id.toString());
      pdfFiles.forEach(file => formData.append("files", file));
      const res = await fetch("/api/candidate-cvs", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to upload CVs"); return; }
      if (data.success) { toast.success(`Uploaded ${data.uploaded} CV(s) successfully`); await fetchPositions(); await fetchCandidates(selectedPosition.id); setSelectedPosition(prev => prev ? { ...prev, cvCount: prev.cvCount + data.uploaded } : null); }
    } catch { toast.error("Failed to upload CVs"); } finally { setIsUploading(false); e.target.value = ""; }
  };

  const handleAnalyze = async () => {
    if (!selectedPosition) return;
    setIsAnalyzing(true); setAnalysisProgress(0);
    let progress = 0;
    const interval = setInterval(() => { const rem = 95 - progress; progress = Math.min(95, progress + Math.max(0.5, rem * 0.02)); setAnalysisProgress(Math.round(progress)); }, 200);
    try {
      const res = await fetch("/api/cv-bulk-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionId: selectedPosition.id }) });
      const data = await res.json();
      clearInterval(interval); setAnalysisProgress(100);
      if (!res.ok) {
        if (res.status === 429 && data?.limitReached) {
          const usage = data.usage || {};
          window.dispatchEvent(new CustomEvent("usage-limit-reached", { detail: { message: data.error, resetAt: usage.resetAt || null, isLifetime: usage.isLifetime !== undefined ? usage.isLifetime : true } }));
          throw new Error("LIMIT_REACHED_SILENT");
        }
        throw new Error(data?.error || "Failed to analyze CVs");
      }
      if (data.success) {
        toast.success(`Analyzed ${data.analyzed} CV(s) successfully`);
        await fetchPositions();
        await fetchCandidates(selectedPosition.id);
        // Show the post-analysis modal
        setShowPostAnalysisModal(true);
      }
      else if (data.message) toast.info(data.message);
    } catch (err: any) { 
      clearInterval(interval); 
      const isSilent = err instanceof Error && err.message === "LIMIT_REACHED_SILENT";
      if (!isSilent) toast.error("Failed to analyze CVs"); 
    } finally { setTimeout(() => { setIsAnalyzing(false); setAnalysisProgress(0); }, 500); }
  };

  const handleDeletePosition = async (positionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this position? All CVs and analysis results will be permanently deleted.")) return;
    try {
      const res = await fetch(`/api/hiring-positions?id=${positionId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { toast.success("Position deleted successfully"); setPositions(prev => prev.filter(p => p.id !== positionId)); if (selectedPosition?.id === positionId) { setSelectedPosition(null); setCandidates([]); } }
      else toast.error(data.error || "Failed to delete position");
    } catch { toast.error("Failed to delete position"); }
  };

  // ── Interview Questions Generation ──────────────────────────────────────
  const handleGenerateQuestions = async (candidate: CandidateResult) => {
    if (!selectedPosition || !candidate.analysis) return;
    const cvId = candidate.cv.id;
    setGeneratingQuestionsFor(cvId);

    try {
      const difficulty = questionDifficulty[cvId] || "medium";
      const res = await fetch("/api/generate-interview-from-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvText: candidate.cv.rawText || candidate.analysis.summary || candidate.analysis.detailedAnalysis || "",
          candidateName: candidate.cv.candidateName || candidate.cv.fileName,
          department: selectedPosition.department,
          position: selectedPosition.title,
          difficulty,
          questionCount: 10,
          strengths: candidate.analysis.strengths,
          weaknesses: candidate.analysis.weaknesses,
          summary: candidate.analysis.summary,
          overallScore: candidate.analysis.overallScore,
          skillsMatch: candidate.analysis.skillsMatch,
          experienceMatch: candidate.analysis.experienceMatch,
          educationMatch: candidate.analysis.educationMatch,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && data?.limitReached) {
          const usage = data.usage || {};
          window.dispatchEvent(new CustomEvent("usage-limit-reached", { detail: { message: data.error, resetAt: usage.resetAt || null, isLifetime: usage.isLifetime !== undefined ? usage.isLifetime : true } }));
          throw new Error("LIMIT_REACHED_SILENT");
        }
        throw new Error(data.error || "Failed to generate questions");
      }
      if (data.data) {
        setGeneratedQuestions(prev => ({ ...prev, [cvId]: data.data }));
        toast.success("Interview questions generated!");
      }
    } catch (err: any) {
      const isSilent = err instanceof Error && err.message === "LIMIT_REACHED_SILENT";
      if (!isSilent) toast.error(err.message || "Failed to generate interview questions");
    } finally {
      setGeneratingQuestionsFor(null);
    }
  };

  const toggleAnswer = (key: string) => {
    setExpandedAnswers(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const copyQuestion = (q: GeneratedQuestion, cvId: number) => {
    const key = `${cvId}-${q.id}`;
    navigator.clipboard.writeText(`Q: ${q.question}\n\nA: ${q.answer}`);
    setCopiedQuestionId(key);
    setTimeout(() => setCopiedQuestionId(null), 2000);
  };

  const copyAllQuestions = (cvId: number) => {
    const data = generatedQuestions[cvId];
    if (!data) return;
    navigator.clipboard.writeText(data.questions.map((q, i) => `${i + 1}. Q: ${q.question}\n\n   A: ${q.answer}`).join("\n\n---\n\n"));
    setCopiedAllFor(cvId);
    setTimeout(() => setCopiedAllFor(null), 2000);
  };

  const downloadQuestions = (cvId: number, candidateName: string) => {
    const data = generatedQuestions[cvId];
    if (!data || !selectedPosition) return;
    let content = `INTERVIEW QUESTIONS — ${candidateName}\n${"=".repeat(60)}\nPosition: ${selectedPosition.title}\nDepartment: ${selectedPosition.department}\nDifficulty: ${(questionDifficulty[cvId] || "medium").toUpperCase()}\nGenerated: ${new Date().toLocaleDateString()}\n\nCANDIDATE SUMMARY\n${"-".repeat(40)}\n${data.candidateSummary}\n\nKEY AREAS TO PROBE\n${"-".repeat(40)}\n${data.keyAreasToProbe.map(a => `• ${a}`).join("\n")}\n\n${"=".repeat(60)}\n\n`;
    data.questions.forEach((q, i) => { content += `QUESTION ${i + 1} [${(q.category || "General").toUpperCase()}]\n${"-".repeat(40)}\nQ: ${q.question}\n\nA: ${q.answer || "No answer provided"}\n\nWhy: ${q.rationale}\n\n${"─".repeat(60)}\n\n`; });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `interview-questions-${candidateName.toLowerCase().replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success("Downloaded successfully");
  };

  const getRec = (rec: string) => {
    const map: Record<string, { color: string; label: string }> = {
      highly_recommended: { color: "text-emerald-400", label: "Highly Recommended" },
      recommended: { color: "text-blue-400", label: "Recommended" },
      consider: { color: "text-amber-400", label: "Consider" },
    };
    return map[rec] || { color: "text-red-400", label: "Not Recommended" };
  };

  const scoreColor = (s: number) => s >= 80 ? "text-emerald-400" : s >= 60 ? "text-blue-400" : s >= 40 ? "text-amber-400" : "text-red-400";

  const analyzedCandidates = candidates.filter(c => c.analysis);
  const hasAnalyzedCandidates = analyzedCandidates.length > 0;

  if (!mounted || isAuthLoading) return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
    </div>
  );
  if (!isAuthenticated) return null;

  const inputCls = "w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 text-sm";

  return (
    <div className="relative min-h-screen bg-black text-white">
      <HeroBackground />
      <div className="fixed inset-0 bg-black/60 pointer-events-none z-0" />

      <div className="relative z-10">
        <Header />
        <main className="max-w-7xl mx-auto px-5 pt-32 pb-20">

          {/* Page Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <button onClick={() => router.push("/")} className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/80 mb-4 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </button>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-white">Bulk CV Analysis</h1>
                <p className="mt-1 text-white/40 font-light text-sm sm:text-base">Upload CVs and let AI rank your candidates automatically.</p>
              </div>
              <button onClick={() => setShowCreateModal(true)} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition-all w-full sm:w-auto shrink-0">
                <Plus className="w-4 h-4" /> New Position
              </button>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Positions Sidebar */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h2 className="text-sm font-bold tracking-[0.1em] uppercase text-white/40 mb-4">Positions</h2>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-white/40" /></div>
              ) : positions.length === 0 ? (
                <div className="text-center py-12 text-white/30">
                  <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No positions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {positions.map(pos => (
                    <div key={pos.id} onClick={() => handleSelectPosition(pos)}
                      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${selectedPosition?.id === pos.id ? "bg-white/[0.08] border-white/25" : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white text-sm truncate">{pos.title}</h3>
                          <p className="text-xs text-white/40 truncate">{pos.department}</p>
                          <p className="text-[11px] text-white/25 mt-0.5">{pos.organization}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={e => handleDeletePosition(pos.id, e)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[11px] text-white/30 flex items-center gap-1"><FileText className="w-3 h-3" />{pos.cvCount} CVs</span>
                        <span className="text-[11px] text-white/30 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{pos.analyzedCount} analyzed</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Main panel */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
              {selectedPosition ? (
                <div className="p-6">
                  <div className="mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 mb-4">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-black tracking-tighter text-white">
                          {selectedPosition.title}
                        </h2>
                        <p className="text-white/40 text-xs sm:text-sm">
                          {selectedPosition.department} · {selectedPosition.organization}
                        </p>
                      </div>
                      <span className={`self-start px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold border ${selectedPosition.status === "completed" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-white/10 text-white/40 bg-white/5"}`}>
                        {selectedPosition.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label data-tour="bulkcv-upload" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] text-white/70 text-sm cursor-pointer transition-all">
                        <Upload className="w-4 h-4" />
                        {isUploading ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</> : "Upload CVs"}
                        <input type="file" multiple accept=".pdf" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                      </label>
                      <button onClick={handleAnalyze} disabled={isAnalyzing || selectedPosition.cvCount === 0 || selectedPosition.cvCount === selectedPosition.analyzedCount}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        <Sparkles className="w-4 h-4" />
                        {isAnalyzing ? `Analyzing... ${analysisProgress}%` : "Analyze All CVs"}
                        {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin" />}
                      </button>
                    </div>
                  </div>



                  {candidates.length === 0 ? (
                    <div className="text-center py-16 text-white/25">
                      <Users className="w-14 h-14 mx-auto mb-3 opacity-50" />
                      <p className="text-lg">No CVs uploaded yet</p>
                      <p className="text-sm mt-1 text-white/20">Upload CVs to start the analysis</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold tracking-[0.1em] uppercase text-white/40">Rankings ({candidates.length})</h3>
                      {candidates.map(c => {
                        const cvId = c.cv.id;
                        const hasQuestions = !!generatedQuestions[cvId];
                        const isGenerating = generatingQuestionsFor === cvId;
                        const difficulty = questionDifficulty[cvId] || "medium";

                        return (
                        <div key={cvId} className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                          <button onClick={() => setExpandedCandidate(expandedCandidate === cvId ? null : cvId)} className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${c.rank === 1 ? "bg-amber-400/20 text-amber-400 border border-amber-400/30" : c.rank === 2 ? "bg-white/10 text-white/70 border border-white/20" : c.rank === 3 ? "bg-amber-700/20 text-amber-600 border border-amber-700/30" : "bg-white/[0.05] text-white/30 border border-white/[0.08]"}`}>
                                {c.rank <= 3 ? <Trophy className="w-4 h-4" /> : c.rank}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-semibold text-white text-sm truncate">{c.cv.candidateName || c.cv.fileName}</h4>
                                {c.cv.candidateName && <p className="text-xs text-white/30 truncate">{c.cv.fileName}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0">
                              <div className="flex items-center gap-3">
                                {c.analysis ? (
                                  <>
                                    <span className={`text-[11px] sm:text-xs font-medium ${getRec(c.analysis.recommendation).color}`}>{getRec(c.analysis.recommendation).label}</span>
                                    <span className={`text-lg sm:text-xl font-black ${scoreColor(c.analysis.overallScore)}`}>{c.analysis.overallScore}</span>
                                  </>
                                ) : (
                                  <span className="text-xs text-white/30">{c.cv.status === "pending" ? "Pending" : "Analyzing..."}</span>
                                )}
                              </div>
                              {expandedCandidate === cvId ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                            </div>
                          </button>
                          <AnimatePresence>
                            {expandedCandidate === cvId && c.analysis && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="p-4 border-t border-white/[0.06] space-y-4">
                                  {(c.cv.candidateEmail || c.cv.candidatePhone) && (
                                    <div className="flex flex-wrap gap-3">
                                      {c.cv.candidateEmail && <a href={`mailto:${c.cv.candidateEmail}`} className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"><Mail className="w-3.5 h-3.5" />{c.cv.candidateEmail}</a>}
                                      {c.cv.candidatePhone && <a href={`tel:${c.cv.candidatePhone}`} className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"><Phone className="w-3.5 h-3.5" />{c.cv.candidatePhone}</a>}
                                    </div>
                                  )}
                                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                    {[["Skills", c.analysis.skillsMatch], ["Experience", c.analysis.experienceMatch], ["Education", c.analysis.educationMatch]].map(([label, val]) => (
                                      <div key={label as string} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                        <p className="text-[11px] text-white/30 mb-1">{label}</p>
                                        <p className={`text-base sm:text-lg font-black ${scoreColor(val as number)}`}>{val}%</p>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-xs text-white/50 leading-relaxed">{c.analysis.summary}</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                    {c.analysis.strengths.length > 0 && (
                                      <div>
                                        <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Strengths</p>
                                        <ul className="space-y-1">{c.analysis.strengths.map((s, i) => <li key={i} className="text-xs text-white/40 flex items-start gap-1.5"><span className="text-emerald-400 mt-0.5">+</span>{s}</li>)}</ul>
                                      </div>
                                    )}
                                    {c.analysis.weaknesses.length > 0 && (
                                      <div>
                                        <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-2">Weaknesses</p>
                                        <ul className="space-y-1">{c.analysis.weaknesses.map((w, i) => <li key={i} className="text-xs text-white/40 flex items-start gap-1.5"><span className="text-red-400 mt-0.5">−</span>{w}</li>)}</ul>
                                      </div>
                                    )}
                                  </div>

                                  {/* ── Interview Questions Section ────────────────────── */}
                                  <div className="pt-3 border-t border-white/[0.06]">
                                    {!hasQuestions ? (
                                      <div className="flex items-center gap-3 flex-wrap">
                                        {/* Difficulty selector */}
                                        <div className="flex items-center gap-1.5">
                                          {(["easy", "medium", "hard"] as Difficulty[]).map(d => (
                                            <button key={d} onClick={() => setQuestionDifficulty(prev => ({ ...prev, [cvId]: d }))}
                                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all capitalize ${difficulty === d ? "bg-white text-black border-white" : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:bg-white/[0.06]"}`}>
                                              {d}
                                            </button>
                                          ))}
                                        </div>
                                        <button data-tour="bulkcv-questions" onClick={() => handleGenerateQuestions(c)} disabled={isGenerating}
                                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 text-white text-sm font-bold hover:from-purple-500 hover:to-violet-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20">
                                          {isGenerating ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" />Generating Questions...</>
                                          ) : (
                                            <><HelpCircle className="w-4 h-4" />Generate Interview Questions</>
                                          )}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="space-y-3">
                                        {/* Questions header */}
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <HelpCircle className="w-4 h-4 text-purple-400" />
                                            <span className="text-sm font-bold text-purple-300">Interview Questions</span>
                                            <span className="text-[11px] text-white/30">({generatedQuestions[cvId].questions.length} questions · {difficulty})</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button onClick={() => copyAllQuestions(cvId)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] transition-all">
                                              {copiedAllFor === cvId ? <><Check className="w-3 h-3 text-emerald-400" />Copied!</> : <><Copy className="w-3 h-3" />Copy All</>}
                                            </button>
                                            <button onClick={() => downloadQuestions(cvId, c.cv.candidateName || c.cv.fileName)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] transition-all">
                                              <Download className="w-3 h-3" />Download
                                            </button>
                                            <button onClick={() => { setGeneratedQuestions(prev => { const n = { ...prev }; delete n[cvId]; return n; }); }}
                                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] transition-all">
                                              <Sparkles className="w-3 h-3" />Regenerate
                                            </button>
                                          </div>
                                        </div>

                                        {/* Key areas */}
                                        {generatedQuestions[cvId].keyAreasToProbe.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {generatedQuestions[cvId].keyAreasToProbe.map((area, i) => (
                                              <span key={i} className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-purple-500/10 text-purple-300/60 border border-purple-500/10">{area}</span>
                                            ))}
                                          </div>
                                        )}

                                        {/* Questions list */}
                                        <div className="space-y-2">
                                          {generatedQuestions[cvId].questions.map((q, i) => {
                                            const answerKey = `${cvId}-${q.id}`;
                                            return (
                                              <div key={q.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                                                <div className="flex items-start gap-2">
                                                  <span className="w-5 h-5 rounded-md bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-white/40 shrink-0 mt-0.5">{i + 1}</span>
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                      <p className="text-xs font-medium text-white/80 leading-relaxed">{q.question}</p>
                                                      <button onClick={() => copyQuestion(q, cvId)} className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white transition-colors shrink-0">
                                                        {copiedQuestionId === answerKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                      </button>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                      <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${q.category === "technical" ? "bg-blue-500/10 text-blue-400" : q.category === "behavioral" ? "bg-purple-500/10 text-purple-400" : q.category === "situational" ? "bg-orange-500/10 text-orange-400" : "bg-teal-500/10 text-teal-400"}`}>{q.category}</span>
                                                      <button onClick={() => toggleAnswer(answerKey)} className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-white/[0.04] text-white/35 hover:bg-white/[0.08] transition-colors">
                                                        {expandedAnswers.has(answerKey) ? <><ChevronUp className="w-2.5 h-2.5" />Hide</> : <><ChevronDown className="w-2.5 h-2.5" />Answer</>}
                                                      </button>
                                                    </div>
                                                    <AnimatePresence>
                                                      {expandedAnswers.has(answerKey) && (
                                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                          <div className="mt-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                                                            <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-1">Expected Answer</p>
                                                            <p className="text-[11px] text-white/50 leading-relaxed">{q.answer}</p>
                                                          </div>
                                                          <p className="text-[10px] text-white/25 mt-1.5"><span className="text-white/35 font-medium">Why: </span>{q.rationale}</p>
                                                        </motion.div>
                                                      )}
                                                    </AnimatePresence>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-white/25">
                  <Users className="w-14 h-14 mb-4 opacity-50" />
                  <p className="text-lg">Select a position to view candidates</p>
                  <p className="text-sm mt-1 text-white/20">or create a new position to get started</p>
                </div>
              )}
            </motion.div>
          </div>
        </main>
      </div>

      {/* Create Position Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-black border border-white/[0.08] rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-2xl" />
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black tracking-tighter text-white">Create Position</h2>
                <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-xl hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreatePosition} className="space-y-4">
                {[["Position Title *", "title", "e.g., Computer Science Professor"], ["Department *", "department", "e.g., Computer Science Department"], ["Organization *", "organization", "e.g., Harvard University"], ["Experience Required", "experienceRequired", "e.g., 5+ years"], ["Education Required", "educationRequired", "e.g., PhD in CS"], ["Preferred Skills (comma-separated)", "preferredSkills", "e.g., Machine Learning, Python"]].map(([label, key, placeholder]) => (
                  <div key={key as string}>
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">{label}</label>
                    <input type="text" value={(newPosition as any)[key as string]} onChange={e => setNewPosition({ ...newPosition, [key as string]: e.target.value })} placeholder={placeholder as string} className={inputCls} />
                  </div>
                ))}
                {[["Job Description", "description", "Describe the role...", 3], ["Requirements", "requirements", "Required qualifications...", 2]].map(([label, key, placeholder, rows]) => (
                  <div key={key as string}>
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">{label}</label>
                    <textarea value={(newPosition as any)[key as string]} onChange={e => setNewPosition({ ...newPosition, [key as string]: e.target.value })} placeholder={placeholder as string} rows={rows as number} className={`${inputCls} resize-none`} />
                  </div>
                ))}
                <button type="submit" disabled={isCreating} className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {isCreating ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Create Position</>}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post-Analysis Prompt Modal */}
      <AnimatePresence>
        {showPostAnalysisModal && hasAnalyzedCandidates && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-black border border-purple-500/30 rounded-2xl p-6 overflow-hidden relative"
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent rounded-t-2xl" />
              <div className="absolute top-0 left-0 right-0 h-32 bg-purple-500/10 blur-3xl -z-10" />
              
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/30 flex items-center justify-center mb-5">
                  <HelpCircle className="w-8 h-8 text-purple-400" />
                </div>
                <h2 className="text-xl font-black tracking-tighter text-white mb-2">Analysis Complete!</h2>
                <p className="text-sm text-white/50 mb-8 leading-relaxed">
                  Would you like to automatically generate tailored interview questions for your top candidate based on their CV analysis?
                </p>
                
                <div className="flex flex-col gap-3 w-full">
                  <button 
                    onClick={() => {
                      const topCandidate = analyzedCandidates[0];
                      if (topCandidate) {
                        setExpandedCandidate(topCandidate.cv.id);
                        setTimeout(() => handleGenerateQuestions(topCandidate), 100);
                      }
                      setShowPostAnalysisModal(false);
                    }}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 text-white text-sm font-bold hover:from-purple-500 hover:to-violet-500 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Make Interview Questions
                  </button>
                  <button 
                    onClick={() => setShowPostAnalysisModal(false)}
                    className="w-full py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/60 text-sm font-semibold hover:bg-white/[0.08] hover:text-white transition-all"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
