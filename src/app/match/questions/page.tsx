"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import Header from "@/components/Header";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle, ArrowLeft, Users, GraduationCap, Upload, FileText, Sparkles,
  ChevronRight, Copy, Check, Download, RefreshCw, Loader2, AlertCircle, X,
  ChevronDown, ChevronUp, History, Trash2, Clock, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type QuestionType = "candidates" | "exams" | null;
type Difficulty = "easy" | "medium" | "hard";

interface GeneratedQuestion { id: number; question: string; answer: string; category: string; rationale: string; expectedTopics: string[]; }
interface GeneratedData { questions: GeneratedQuestion[]; candidateSummary: string; keyAreasToProbe: string[]; }
interface HistorySession { id: number; department: string; position: string | null; difficulty: string; questionCount: number; candidateName: string | null; candidateSummary: string; keyAreasToProbe: string[]; questions: GeneratedQuestion[]; createdAt: string; }

export default function QuestionMakerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" /></div>}>
      <QuestionMakerContent />
    </Suspense>
  );
}

function QuestionMakerContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  const typeFromUrl = searchParams.get("type") as QuestionType;
  const [questionType, setQuestionType] = useState<QuestionType>(typeFromUrl || null);
  const [step, setStep] = useState(typeFromUrl === "candidates" ? 2 : 1);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [department, setDepartment] = useState("");
  const [purpose, setPurpose] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvData, setCvData] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generatedData, setGeneratedData] = useState<GeneratedData | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const r = await fetch("/api/interview-question-history");
      if (r.ok) { const d = await r.json(); setHistory(d.sessions || []); }
    } catch {} finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => { if (showHistory) fetchHistory(); }, [showHistory, fetchHistory]);

  const saveToHistory = useCallback(async (data: GeneratedData) => {
    try { await fetch("/api/interview-question-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department, position: purpose, difficulty, questionCount: data.questions.length, candidateSummary: data.candidateSummary, keyAreasToProbe: data.keyAreasToProbe, questions: data.questions }) }); } catch {}
  }, [department, purpose, difficulty]);

  const deleteSession = async (id: number) => {
    const prev = [...history];
    setHistory(h => h.filter(s => s.id !== id)); setDeletingId(id);
    try {
      const r = await fetch(`/api/interview-question-history?id=${id}`, { method: "DELETE" });
      if (r.ok) toast.success("Session deleted"); else { setHistory(prev); toast.error("Failed to delete"); }
    } catch { setHistory(prev); toast.error("Failed to delete"); } finally { setDeletingId(null); }
  };

  const loadSession = (s: HistorySession) => {
    setDepartment(s.department); setPurpose(s.position || ""); setDifficulty(s.difficulty as Difficulty);
    setQuestionCount(s.questionCount); setGeneratedData({ questions: s.questions, candidateSummary: s.candidateSummary, keyAreasToProbe: s.keyAreasToProbe });
    setQuestionType("candidates"); setStep(3); setShowHistory(false);
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type === "application/pdf") { setCvFile(file); setError(null); const r = new FileReader(); r.onload = () => setCvData(r.result as string); r.readAsDataURL(file); }
    else setError("Please upload a PDF file");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type === "application/pdf") { setCvFile(file); setError(null); const r = new FileReader(); r.onload = () => setCvData(r.result as string); r.readAsDataURL(file); }
    else setError("Please upload a PDF file");
  }, []);

  const handleGenerate = async () => {
    if (!cvData || !department) { setError("Please upload a CV and enter the department"); return; }
    setIsGenerating(true); setError(null); setGenerationProgress(0);
    const interval = setInterval(() => { setGenerationProgress(p => p >= 90 ? 90 : Math.min(p + Math.random() * 10, 90)); }, 500);
    try {
      const res = await fetch("/api/generate-interview-questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cvData, difficulty, department, purpose, questionCount }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate questions");
      setGenerationProgress(100); setGeneratedData(data.data); setStep(3); await saveToHistory(data.data);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to generate questions"); } finally { clearInterval(interval); setIsGenerating(false); }
  };

  const copyQuestion = (q: GeneratedQuestion) => { navigator.clipboard.writeText(`Q: ${q.question}\n\nA: ${q.answer}`); setCopiedId(q.id); setTimeout(() => setCopiedId(null), 2000); };
  const copyAllQuestions = () => { if (!generatedData) return; navigator.clipboard.writeText(generatedData.questions.map((q, i) => `${i + 1}. Q: ${q.question}\n\n   A: ${q.answer}`).join("\n\n---\n\n")); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000); };
  const toggleAnswer = (id: number) => { setExpandedAnswers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  const downloadQuestions = () => {
    if (!generatedData) { toast.error("No questions to download"); return; }
    let content = `INTERVIEW QUESTIONS - ${department.toUpperCase()}\n${"=".repeat(60)}\n\nDifficulty: ${difficulty.toUpperCase()}\n${purpose ? `Position: ${purpose}\n` : ""}Generated: ${new Date().toLocaleDateString()}\n\nCANDIDATE SUMMARY\n${"-".repeat(40)}\n${generatedData.candidateSummary}\n\nKEY AREAS\n${"-".repeat(40)}\n${generatedData.keyAreasToProbe.map(a => `• ${a}`).join("\n")}\n\n${"=".repeat(60)}\n\n`;
    generatedData.questions.forEach((q, i) => { content += `QUESTION ${i + 1} [${(q.category || "General").toUpperCase()}]\n${"-".repeat(40)}\nQ: ${q.question}\n\nA: ${q.answer || "No answer provided"}\n\nWhy: ${q.rationale}\n\n${"─".repeat(60)}\n\n`; });
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `interview-questions-${department.toLowerCase().replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success("Downloaded successfully");
  };

  const resetFlow = () => { setQuestionType(null); setStep(1); setDifficulty("medium"); setDepartment(""); setPurpose(""); setQuestionCount(10); setCvFile(null); setCvData(null); setGeneratedData(null); setError(null); };

  if (!mounted) return <div className="flex min-h-screen items-center justify-center bg-black"><div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" /></div>;

  const inputCls = "w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 text-sm";

  return (
    <div className="relative min-h-screen bg-black text-white">
      <HeroBackground />
      <div className="fixed inset-0 bg-black/60 pointer-events-none z-0" />

      {/* History button */}
      <button onClick={() => setShowHistory(true)} className="fixed top-24 right-6 z-20 p-3 rounded-xl border border-white/[0.08] bg-black/80 text-white/40 hover:text-white hover:border-white/20 transition-all" title="View History">
        <History className="w-5 h-5" />
      </button>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30 }}
              className="fixed right-0 top-0 h-full w-full max-w-sm z-50 bg-black border-l border-white/[0.08] flex flex-col">
              <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
                <h2 className="text-lg font-black tracking-tighter">History</h2>
                <button onClick={() => setShowHistory(false)} className="p-2 rounded-xl hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-white/40" /></div>
                ) : history.length === 0 ? (
                  <div className="text-center py-12 text-white/30 text-sm">No history yet</div>
                ) : (
                  history.map(s => (
                    <div key={s.id} className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => loadSession(s)} className="flex-1 text-left">
                          <p className="font-semibold text-white text-sm">{s.department}</p>
                          {s.position && <p className="text-xs text-white/40">{s.position}</p>}
                          <p className="text-[11px] text-white/25 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(s.createdAt).toLocaleDateString()}</p>
                          <p className="text-[11px] text-white/30 mt-1">{s.questionCount} questions · {s.difficulty}</p>
                        </button>
                        <button onClick={() => deleteSession(s.id)} disabled={deletingId === s.id} className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="relative z-10">
        <Header />
        <main className="max-w-3xl mx-auto px-5 pt-32 pb-20">
          {/* Back */}
          <button onClick={() => router.push("/bulk-cv")} className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/80 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Match
          </button>

          {/* Step 1: Choose type */}
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="mb-10">
                  <h1 className="text-5xl font-black tracking-tighter text-white mb-3">Interview Questions</h1>
                  <p className="text-white/40 font-light">Generate tailored questions based on a candidate's CV.</p>
                </div>
                <div className="grid gap-4">
                  {[
                    { id: "candidates", icon: Users, title: "For Candidates", desc: "Upload a CV and generate personalized interview questions for hiring managers." },
                    { id: "exams", icon: GraduationCap, title: "For Exams", desc: "Generate questions for academic assessments and study materials." },
                  ].map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button key={opt.id} onClick={() => { setQuestionType(opt.id as QuestionType); setStep(2); }}
                        className="group text-left p-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.15] transition-all">
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-t-2xl" />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl border border-white/[0.08] bg-white/[0.06] flex items-center justify-center">
                              <Icon className="w-5 h-5 text-white/60" />
                            </div>
                            <div>
                              <h3 className="font-bold text-white">{opt.title}</h3>
                              <p className="text-sm text-white/40 mt-0.5">{opt.desc}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="mb-8">
                  <button onClick={() => setStep(1)} className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/80 mb-4 transition-colors"><ArrowLeft className="w-4 h-4" /> Back</button>
                  <h1 className="text-4xl font-black tracking-tighter text-white">Configure Questions</h1>
                </div>

                <div className="space-y-5">
                  {/* CV Upload */}
                  <div
                    onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                    className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${cvFile ? "border-white/25 bg-white/[0.05]" : "border-white/[0.08] hover:border-white/20"}`}
                    onClick={() => document.getElementById("cv-upload")?.click()}>
                    <input id="cv-upload" type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
                    {cvFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileText className="w-6 h-6 text-white/60" />
                        <div className="text-left">
                          <p className="font-semibold text-white text-sm">{cvFile.name}</p>
                          <p className="text-xs text-white/40">{(cvFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setCvFile(null); setCvData(null); }} className="ml-auto p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-white/30 mx-auto mb-3" />
                        <p className="text-white/50 font-medium text-sm">Drop PDF CV here or click to upload</p>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Department *</label>
                    <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g., Computer Science" className={`w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 text-sm`} />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Position / Role</label>
                    <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g., Senior Engineer" className={`w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 text-sm`} />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Difficulty</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["easy", "medium", "hard"] as Difficulty[]).map(d => (
                        <button key={d} onClick={() => setDifficulty(d)} className={`py-2.5 rounded-xl text-sm font-semibold border transition-all capitalize ${difficulty === d ? "bg-white text-black border-white" : "bg-white/[0.03] border-white/[0.08] text-white/50 hover:bg-white/[0.06]"}`}>{d}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Number of Questions: {questionCount}</label>
                    <input type="range" min="5" max="20" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} className="w-full accent-white" />
                  </div>

                  {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

                  <button onClick={handleGenerate} disabled={isGenerating || !cvData || !department}
                    className="w-full py-3.5 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" />Generating... {Math.round(generationProgress)}%</> : <><Sparkles className="w-4 h-4" />Generate Questions</>}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && generatedData && (
              <motion.div key="step3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                {/* Summary card */}
                <div className="mb-6 p-5 rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-2xl font-black tracking-tighter text-white">{department}</h2>
                      <p className="text-sm text-white/40">{generatedData.candidateSummary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button onClick={() => setExpandedAnswers(expandedAnswers.size === generatedData.questions.length ? new Set() : new Set(generatedData.questions.map(q => q.id)))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] transition-all">
                        {expandedAnswers.size === generatedData.questions.length ? <><ChevronUp className="w-3.5 h-3.5" />Hide Answers</> : <><ChevronDown className="w-3.5 h-3.5" />Show Answers</>}
                      </button>
                      <button onClick={copyAllQuestions} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] transition-all">
                        {copiedAll ? <><Check className="w-3.5 h-3.5 text-emerald-400" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy All</>}
                      </button>
                      <button onClick={downloadQuestions} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] transition-all">
                        <Download className="w-3.5 h-3.5" />Download
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {generatedData.keyAreasToProbe.map((area, i) => (
                      <span key={i} className="px-2.5 py-1 text-xs font-medium rounded-full border border-white/[0.08] bg-white/[0.04] text-white/50">{area}</span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {generatedData.questions.map((q, i) => (
                    <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start gap-3">
                          <span className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xs font-bold text-white/50 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-medium text-white text-sm leading-relaxed">{q.question}</p>
                              <button onClick={() => copyQuestion(q)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors shrink-0">
                                {copiedId === q.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`px-2 py-0.5 text-[11px] rounded-md font-medium ${q.category === "technical" ? "bg-blue-500/10 text-blue-400" : q.category === "behavioral" ? "bg-purple-500/10 text-purple-400" : q.category === "situational" ? "bg-orange-500/10 text-orange-400" : "bg-teal-500/10 text-teal-400"}`}>{q.category}</span>
                              <button onClick={() => toggleAnswer(q.id)} className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md bg-white/[0.04] text-white/40 hover:bg-white/[0.08] transition-colors">
                                {expandedAnswers.has(q.id) ? <><ChevronUp className="w-3 h-3" />Hide</> : <><ChevronDown className="w-3 h-3" />Answer</>}
                              </button>
                            </div>
                          </div>
                        </div>
                        <AnimatePresence>
                          {expandedAnswers.has(q.id) && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                              <div className="mt-4 pl-10">
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                  <p className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-2">Expected Answer</p>
                                  <p className="text-sm text-white/60 leading-relaxed">{q.answer}</p>
                                </div>
                                <p className="text-xs text-white/30 mt-3 pl-1"><span className="text-white/40 font-medium">Why: </span>{q.rationale}</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex justify-center pt-6">
                  <button onClick={resetFlow} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white text-sm font-semibold transition-all">
                    <RefreshCw className="w-4 h-4" />Generate More
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
