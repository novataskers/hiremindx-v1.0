"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { HeroBackground } from "@/components/HeroBackground";
import {
  GraduationCap,
  Send,
  Loader2,
  Upload,
  FileText,
  X,
  Download,
  History,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Mic,
  MicOff,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import jsPDF from "jspdf";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MCQQuestion {
  id: number;
  question: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
}

interface CQQuestion {
  id: number;
  question: string;
  marks: number;
  modelAnswer: string;
  keyPoints: string[];
}

interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  type?: "text" | "options" | "upload" | "questions" | "generating";
  options?: { label: string; value: string }[];
  mcqQuestions?: MCQQuestion[];
  cqQuestions?: CQQuestion[];
}

interface HistorySession {
  id: number;
  subject: string;
  topic: string;
  questionTypes: string;
  difficulty: string;
  questionCount: number;
  instructions: string | null;
  bookName: string | null;
  mcqQuestions: MCQQuestion[];
  cqQuestions: CQQuestion[];
  createdAt: string;
}

type ConversationStep =
  | "greeting"
  | "subject"
  | "topic"
  | "questionType"
  | "difficulty"
  | "questionCount"
  | "instructions"
  | "upload"
  | "confirm"
  | "generating"
  | "done";

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExamQuestionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      }
    >
      <ExamQuestionsContent />
    </Suspense>
  );
}

function ExamQuestionsContent() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && theme === "dark";

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [currentStep, setCurrentStep] = useState<ConversationStep>("greeting");
  const [isGenerating, setIsGenerating] = useState(false);

  // Collected data
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [questionType, setQuestionType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [bookPdf, setBookPdf] = useState<string | null>(null);
  const [bookName, setBookName] = useState<string | null>(null);

  // Results
  const [mcqQuestions, setMcqQuestions] = useState<MCQQuestion[]>([]);
  const [cqQuestions, setCqQuestions] = useState<CQQuestion[]>([]);
  const [showAnswers, setShowAnswers] = useState(false);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  // Voice input state
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Voice recognition setup
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      const processedResults = new Set<string>();

      recognitionRef.current.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript.trim();
            const resultKey = `${i}-${transcript}`;
            if (transcript && !processedResults.has(resultKey)) {
              processedResults.add(resultKey);
              
              if (inputRef.current) {
                const start = inputRef.current.selectionStart || 0;
                const end = inputRef.current.selectionEnd || 0;
                const text = inputRef.current.value;
                const before = text.substring(0, start);
                const after = text.substring(end);
                const spaceBefore = before.length > 0 && !before.endsWith(" ") ? " " : "";
                const spaceAfter = after.length > 0 && !after.startsWith(" ") ? " " : "";
                const newValue = before + spaceBefore + transcript + spaceAfter + after;
                
                setInput(newValue);
                
                setTimeout(() => {
                  if (inputRef.current) {
                    const newPos = start + spaceBefore.length + transcript.length + spaceAfter.length;
                    inputRef.current.selectionStart = newPos;
                    inputRef.current.selectionEnd = newPos;
                    inputRef.current.focus();
                  }
                }, 10);
              } else {
                setInput((prev) => prev + (prev ? " " : "") + transcript);
              }
            }
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        }
      };

      recognitionRef.current.onend = () => {
        if (isListeningRef.current) {
          try {
            recognitionRef.current?.start();
          } catch (e) {
            setIsListening(false);
          }
        }
      };
    }
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (!recognitionRef.current) {
        toast.error("Microphone not supported in this browser.");
        return;
      }
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Speech recognition start error:', error);
      }
    }
  };

  // Start conversation
  useEffect(() => {
    if (mounted && messages.length === 0) {
      addAIMessage(
        "Hello! I'm your Exam Question Generator. I'll help you create a professional question paper.\n\nWhat **subject** would you like to create questions for?",
        "text"
      );
      setCurrentStep("subject");
    }
  }, [mounted]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (currentStep !== "generating" && currentStep !== "done") {
      inputRef.current?.focus();
    }
  }, [currentStep]);

  const addAIMessage = (
    content: string,
    type: ChatMessage["type"] = "text",
    extra?: Partial<ChatMessage>
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `ai-${Date.now()}-${Math.random()}`,
        role: "ai",
        content,
        type,
        ...extra,
      },
    ]);
  };

  const addUserMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content, type: "text" },
    ]);
  };

  // ─── Conversation Flow ──────────────────────────────────────────────────────

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    const text = input.trim();
    setInput("");
    processUserInput(text);
  };

  const processUserInput = (text: string) => {
    addUserMessage(text);

    switch (currentStep) {
      case "subject":
        setSubject(text);
        setCurrentStep("topic");
        setTimeout(() => {
          addAIMessage(
            `Great, **${text}**! Now, what specific **topic** or chapter should the questions focus on?`
          );
        }, 400);
        break;

      case "topic":
        setTopic(text);
        setCurrentStep("questionType");
        setTimeout(() => {
          addAIMessage(
            "What type of questions would you like?",
            "options",
            {
              options: [
                { label: "MCQ Only", value: "mcq" },
                { label: "CQ Only", value: "cq" },
                { label: "Both MCQ & CQ", value: "both" },
              ],
            }
          );
        }, 400);
        break;

      case "questionType":
        handleQuestionTypeInput(text);
        break;

      case "difficulty":
        handleDifficultyInput(text);
        break;

      case "questionCount":
        handleQuestionCountInput(text);
        break;

      case "instructions":
        if (text.toLowerCase() === "skip" || text.toLowerCase() === "no") {
          setInstructions("");
        } else {
          setInstructions(text);
        }
        setCurrentStep("upload");
        setTimeout(() => {
          addAIMessage(
            "Would you like to **upload a PDF** of a book or chapter for context-aware question generation? This is optional.",
            "upload"
          );
        }, 400);
        break;

      case "upload":
        if (text.toLowerCase() === "skip" || text.toLowerCase() === "no") {
          proceedToConfirm();
        }
        break;

      case "confirm":
        if (
          text.toLowerCase().includes("yes") ||
          text.toLowerCase().includes("generate") ||
          text.toLowerCase().includes("go")
        ) {
          generateQuestions();
        } else if (
          text.toLowerCase().includes("no") ||
          text.toLowerCase().includes("restart") ||
          text.toLowerCase().includes("start over")
        ) {
          resetConversation();
        }
        break;

      case "done":
        // Allow asking for regeneration
        if (
          text.toLowerCase().includes("new") ||
          text.toLowerCase().includes("another") ||
          text.toLowerCase().includes("again") ||
          text.toLowerCase().includes("restart")
        ) {
          resetConversation();
        }
        break;
    }
  };

  const handleQuestionTypeInput = (text: string) => {
    const lower = text.toLowerCase();
    let type = "";
    if (lower.includes("both")) type = "both";
    else if (lower.includes("mcq") || lower.includes("multiple")) type = "mcq";
    else if (lower.includes("cq") || lower.includes("creative") || lower.includes("written"))
      type = "cq";
    else type = "both";

    setQuestionType(type);
    setCurrentStep("difficulty");
    setTimeout(() => {
      addAIMessage("What difficulty level?", "options", {
        options: [
          { label: "Easy", value: "easy" },
          { label: "Medium", value: "medium" },
          { label: "Hard", value: "hard" },
        ],
      });
    }, 400);
  };

  const handleDifficultyInput = (text: string) => {
    const lower = text.toLowerCase();
    let diff = "medium";
    if (lower.includes("easy")) diff = "easy";
    else if (lower.includes("hard")) diff = "hard";
    else diff = "medium";

    setDifficulty(diff);
    setCurrentStep("questionCount");
    setTimeout(() => {
      addAIMessage(
        "How many questions would you like? (e.g., 5, 10, 15, 20)"
      );
    }, 400);
  };

  const handleQuestionCountInput = (text: string) => {
    const num = parseInt(text.replace(/[^0-9]/g, ""));
    const count = isNaN(num) ? 10 : Math.min(Math.max(num, 1), 30);
    setQuestionCount(count);
    setCurrentStep("instructions");
    setTimeout(() => {
      addAIMessage(
        `Got it, **${count} questions**. Any additional instructions for question generation?\n\nFor example: "Focus on application-based questions" or "Include diagrams description".\n\nType **skip** if none.`
      );
    }, 400);
  };

  const handleOptionClick = (value: string) => {
    if (isGenerating) return;
    const labels: Record<string, string> = {
      mcq: "MCQ Only",
      cq: "CQ Only",
      both: "Both MCQ & CQ",
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
    };
    processUserInput(labels[value] || value);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }
    setBookName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setBookPdf(reader.result as string);
      addUserMessage(`Uploaded: ${file.name}`);
      setTimeout(() => {
        proceedToConfirm();
      }, 300);
    };
    reader.readAsDataURL(file);
  };

  const removeFile = () => {
    setBookPdf(null);
    setBookName(null);
  };

  const proceedToConfirm = () => {
    setCurrentStep("confirm");
    const typeLabel =
      questionType === "mcq"
        ? "MCQ"
        : questionType === "cq"
        ? "CQ"
        : "Both MCQ & CQ";
    setTimeout(() => {
      addAIMessage(
        `Here's a summary of your exam paper:\n\n` +
          `- **Subject:** ${subject}\n` +
          `- **Topic:** ${topic}\n` +
          `- **Type:** ${typeLabel}\n` +
          `- **Difficulty:** ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}\n` +
          `- **Questions:** ${questionCount}\n` +
          `${instructions ? `- **Instructions:** ${instructions}\n` : ""}` +
          `${bookName ? `- **Reference PDF:** ${bookName}\n` : ""}\n` +
          `Shall I generate the questions? Type **yes** to proceed or **restart** to start over.`
      );
    }, 400);
  };

  // ─── Generation ─────────────────────────────────────────────────────────────

  const generateQuestions = async () => {
    setCurrentStep("generating");
    setIsGenerating(true);
    addAIMessage("Generating your exam questions...", "generating");

    try {
      const response = await fetch("/api/generate-exam-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic,
          questionType,
          difficulty,
          questionCount,
          instructions: instructions || undefined,
          bookPdf: bookPdf || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed");

      const mcq = data.data.mcqQuestions || [];
      const cq = data.data.cqQuestions || [];
      setMcqQuestions(mcq);
      setCqQuestions(cq);

      // Remove the generating message and add results
      setMessages((prev) => prev.filter((m) => m.type !== "generating"));

      const totalCount = mcq.length + cq.length;
      addAIMessage(
        `Your exam paper is ready! Generated **${totalCount} questions** (${mcq.length} MCQ, ${cq.length} CQ).\n\nYou can toggle answers, download as PDF, or type **new** to create another paper.`,
        "questions",
        { mcqQuestions: mcq, cqQuestions: cq }
      );

      setCurrentStep("done");

      // Save to history
      await fetch("/api/exam-question-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic,
          questionTypes: questionType,
          difficulty,
          questionCount: totalCount,
          instructions: instructions || null,
          bookName: bookName || null,
          mcqQuestions: mcq,
          cqQuestions: cq,
        }),
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.type !== "generating"));
      addAIMessage(
        `Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}. Please type **restart** to try again.`
      );
      setCurrentStep("done");
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── PDF Download ───────────────────────────────────────────────────────────

  const downloadPDF = (mcq: MCQQuestion[], cq: CQQuestion[]) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const usableWidth = pageWidth - margin * 2;
      let y = 20;

      const checkPage = (needed: number) => {
        if (y + needed > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 20;
        }
      };

      // Title
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(`${subject} - Exam Questions`, margin, y);
      y += 8;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Topic: ${topic} | Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} | Date: ${new Date().toLocaleDateString()}`,
        margin,
        y
      );
      y += 4;
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      // MCQ Section
      if (mcq.length > 0) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Multiple Choice Questions", margin, y);
        y += 8;

        mcq.forEach((q, i) => {
          checkPage(40);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          const qLines = doc.splitTextToSize(`${i + 1}. ${q.question}`, usableWidth);
          doc.text(qLines, margin, y);
          y += qLines.length * 5 + 3;

          doc.setFont("helvetica", "normal");
          q.options.forEach((opt) => {
            checkPage(8);
            const optLines = doc.splitTextToSize(`    ${opt.label}) ${opt.text}`, usableWidth - 10);
            doc.text(optLines, margin, y);
            y += optLines.length * 5 + 1;
          });
          y += 5;
        });
      }

      // CQ Section
      if (cq.length > 0) {
        checkPage(20);
        y += 5;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Creative / Written Questions", margin, y);
        y += 8;

        cq.forEach((q, i) => {
          checkPage(20);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          const qLines = doc.splitTextToSize(
            `${i + 1}. ${q.question} [${q.marks} marks]`,
            usableWidth
          );
          doc.text(qLines, margin, y);
          y += qLines.length * 5 + 6;
        });
      }

      // Answer Key
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Answer Key", margin, y);
      y += 4;
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      if (mcq.length > 0) {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("MCQ Answers", margin, y);
        y += 7;

        mcq.forEach((q, i) => {
          checkPage(15);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text(`${i + 1}. ${q.correctAnswer}`, margin, y);
          doc.setFont("helvetica", "normal");
          const expLines = doc.splitTextToSize(`   - ${q.explanation}`, usableWidth - 15);
          y += 5;
          doc.text(expLines, margin, y);
          y += expLines.length * 4 + 4;
        });
      }

      if (cq.length > 0) {
        checkPage(15);
        y += 5;
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("CQ Model Answers", margin, y);
        y += 7;

        cq.forEach((q, i) => {
          checkPage(30);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text(`${i + 1}. [${q.marks} marks]`, margin, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          const ansLines = doc.splitTextToSize(q.modelAnswer, usableWidth - 5);
          doc.text(ansLines, margin + 5, y);
          y += ansLines.length * 4 + 3;

          doc.setFont("helvetica", "italic");
          doc.text("Key Points:", margin + 5, y);
          y += 5;
          q.keyPoints.forEach((kp) => {
            checkPage(8);
            const kpLines = doc.splitTextToSize(`• ${kp}`, usableWidth - 15);
            doc.text(kpLines, margin + 10, y);
            y += kpLines.length * 4 + 2;
          });
          y += 5;
        });
      }

      doc.save(
        `${subject.toLowerCase().replace(/\s+/g, "-")}-${topic.toLowerCase().replace(/\s+/g, "-")}-exam.pdf`
      );
      toast.success("PDF downloaded!");
    } catch (error) {
      console.error("PDF download error:", error);
      toast.error("Failed to download PDF");
    }
  };

  // ─── History ────────────────────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/exam-question-history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.sessions || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (showHistory) fetchHistory();
  }, [showHistory, fetchHistory]);

  const deleteSession = async (id: number) => {
    const prev = [...history];
    setHistory((h) => h.filter((s) => s.id !== id));
    setDeletingId(id);
    try {
      const res = await fetch(`/api/exam-question-history?id=${id}`, { method: "DELETE" });
      if (res.ok) toast.success("Session deleted");
      else {
        setHistory(prev);
        toast.error("Failed to delete");
      }
    } catch {
      setHistory(prev);
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const loadSession = (s: HistorySession) => {
    setSubject(s.subject);
    setTopic(s.topic);
    setQuestionType(s.questionTypes);
    setDifficulty(s.difficulty);
    setQuestionCount(s.questionCount);
    setInstructions(s.instructions || "");
    setBookName(s.bookName);
    setMcqQuestions((s.mcqQuestions as MCQQuestion[]) || []);
    setCqQuestions((s.cqQuestions as CQQuestion[]) || []);
    setShowHistory(false);

    // Rebuild chat with results
    const typeLabel =
      s.questionTypes === "mcq" ? "MCQ" : s.questionTypes === "cq" ? "CQ" : "MCQ & CQ";
    setMessages([
      {
        id: "loaded-1",
        role: "ai",
        content: `Loaded session: **${s.subject} - ${s.topic}** (${typeLabel}, ${s.difficulty})`,
        type: "text",
      },
      {
        id: "loaded-2",
        role: "ai",
        content: `Here are your ${s.questionCount} questions. Toggle answers or download as PDF. Type **new** to create another paper.`,
        type: "questions",
        mcqQuestions: (s.mcqQuestions as MCQQuestion[]) || [],
        cqQuestions: (s.cqQuestions as CQQuestion[]) || [],
      },
    ]);
    setCurrentStep("done");
    setShowAnswers(false);
  };

  // ─── Reset ──────────────────────────────────────────────────────────────────

  const resetConversation = () => {
    setMessages([]);
    setInput("");
    setSubject("");
    setTopic("");
    setQuestionType("");
    setDifficulty("");
    setQuestionCount(0);
    setInstructions("");
    setBookPdf(null);
    setBookName(null);
    setMcqQuestions([]);
    setCqQuestions([]);
    setShowAnswers(false);
    setCurrentStep("greeting");

    // Re-trigger greeting
    setTimeout(() => {
      addAIMessage(
        "Hello! I'm your Exam Question Generator. I'll help you create a professional question paper.\n\nWhat **subject** would you like to create questions for?"
      );
      setCurrentStep("subject");
    }, 200);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

    return (
      <div className="relative h-[100dvh] overflow-hidden">
        <HeroBackground />
        <div className={`relative z-10 flex h-full ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {/* History Sidebar */}
          {showHistory && (
            <div className="fixed inset-0 z-[100] flex md:relative md:inset-auto">
              <div
                className={`fixed inset-0 ${isDark ? 'bg-black/70' : 'bg-black/30'} md:hidden`}
                onClick={() => setShowHistory(false)}
              />
              <div className={`relative w-72 max-w-[85vw] md:w-64 ${isDark ? 'bg-zinc-900/40 backdrop-blur-xl border-white/10' : 'bg-white/40 backdrop-blur-xl border-white/40'} border-r h-full flex flex-col z-10 animate-in slide-in-from-left duration-300`}>
                <div className={`p-3 ${isDark ? 'border-white/5' : 'border-black/5'} border-b flex items-center justify-between`}>
                  <h2 className="text-sm font-semibold">Exam History</h2>
                  <Button variant="ghost" size="icon" className={`h-8 w-8 md:hidden ${isDark ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`} onClick={() => setShowHistory(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="p-2">
                  <Button
                    onClick={resetConversation}
                    variant="outline"
                    className={`w-full flex items-center gap-2 h-9 text-sm ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-white/60 border-black/10 hover:bg-white/80 text-gray-900'}`}
                  >
                    <Plus className="w-4 h-4" />
                    New Exam
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : history.length === 0 ? (
                    <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'} text-center py-8`}>
                      No exam history yet
                    </p>
                  ) : (
                    history.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => loadSession(s)}
                        className={`p-2.5 rounded-lg cursor-pointer transition-all flex items-center gap-2 ${
                          isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{s.subject} - {s.topic}</p>
                          <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                            {s.questionCount} Qs &middot; {s.difficulty} &middot; {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 flex-shrink-0 ${isDark ? 'text-zinc-500 hover:text-red-400 hover:bg-red-400/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(s.id);
                          }}
                          disabled={deletingId === s.id}
                        >
                          {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <header className={`h-12 flex items-center px-4 gap-3 flex-shrink-0 border-b ${isDark ? 'bg-white/5 border-white/5 backdrop-blur-md' : 'bg-white/40 border-black/5 backdrop-blur-md'}`}>
              <Link href="/bulk-cv" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <GraduationCap className="w-5 h-5 text-primary" />
                <span className="font-semibold">Exam Question Generator</span>
              </Link>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={resetConversation}
                className={`gap-1.5 ${isDark ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isDark ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="w-4 h-4" />
              </Button>
            </header>

            {/* Messages */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto"
            >
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === "ai" ? (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                          <GraduationCap className="w-4 h-4 text-primary-foreground" />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          {msg.type === "generating" ? (
                            <div className="flex items-center gap-3">
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              <span className={`text-sm ${isDark ? 'text-zinc-300' : 'text-gray-600'}`}>Generating questions...</span>
                            </div>
                          ) : (
                            <div
                              className={`prose prose-sm max-w-none ${isDark ? 'prose-invert text-zinc-200' : 'text-gray-800'}`}
                              dangerouslySetInnerHTML={{
                                __html: msg.content
                                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                                  .replace(/\n/g, "<br/>"),
                              }}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-end">
                        <div className={`rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] ${isDark ? 'bg-primary text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>
                          <p className="text-sm">{msg.content}</p>
                        </div>
                      </div>
                    )}

                    {/* Option buttons */}
                    {msg.type === "options" && msg.options && currentStep !== "done" && (
                      <div className="flex flex-wrap gap-2 mt-3 ml-11">
                        {msg.options.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleOptionClick(opt.value)}
                            disabled={isGenerating}
                            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:scale-[1.02] ${
                              isDark
                                ? "bg-white/5 border-white/10 text-zinc-200 hover:border-primary/50 hover:bg-white/10"
                                : "bg-white border-black/10 text-gray-700 hover:border-primary/50 hover:bg-primary/5 shadow-sm"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Upload zone */}
                    {msg.type === "upload" && currentStep === "upload" && (
                      <div className="mt-3 ml-11 flex flex-wrap gap-3">
                        {bookPdf ? (
                          <div
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
                              isDark
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "bg-primary/5 border-primary/20 text-primary"
                            }`}
                          >
                            <FileText className="w-4 h-4" />
                            <span className="text-sm">{bookName}</span>
                            <button onClick={removeFile} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all hover:scale-[1.02] ${
                              isDark
                                ? "bg-white/5 border-white/10 text-zinc-200 hover:border-primary/50"
                                : "bg-white border-black/10 text-gray-700 hover:border-primary/50 shadow-sm"
                            }`}
                          >
                            <Upload className="w-4 h-4" />
                            Upload PDF
                          </button>
                        )}
                        <button
                          onClick={() => {
                            addUserMessage("Skip");
                            proceedToConfirm();
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:scale-[1.02] ${
                            isDark
                              ? "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200"
                              : "bg-white border-black/10 text-gray-500 hover:text-gray-700 shadow-sm"
                          }`}
                        >
                          Skip
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>
                    )}

                    {/* Questions display */}
                    {msg.type === "questions" && msg.mcqQuestions && msg.cqQuestions && (
                      <div className="mt-4 ml-11 space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAnswers(!showAnswers)}
                            className={`gap-2 ${isDark ? "border-white/10 hover:bg-white/10" : ""}`}
                          >
                            {showAnswers ? <><ChevronUp className="w-4 h-4" /> Hide Answers</> : <><ChevronDown className="w-4 h-4" /> Show Answers</>}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadPDF(msg.mcqQuestions!, msg.cqQuestions!)}
                            className={`gap-2 ${isDark ? "border-white/10 hover:bg-white/10" : ""}`}
                          >
                            <Download className="w-4 h-4" /> Download PDF
                          </Button>
                        </div>

                        {msg.mcqQuestions!.length > 0 && (
                          <div>
                            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                              <BookOpen className="w-4 h-4" /> MCQ ({msg.mcqQuestions!.length})
                            </h3>
                            <div className="space-y-3">
                              {msg.mcqQuestions!.map((q, i) => (
                                <div key={q.id} className={`p-4 rounded-xl border ${isDark ? "bg-zinc-800/40 border-white/5" : "bg-white/70 border-zinc-200 shadow-sm"}`}>
                                  <p className={`text-sm font-medium mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>{i + 1}. {q.question}</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2">
                                    {q.options.map((opt) => (
                                      <div key={opt.label} className={`px-3 py-1.5 rounded-lg text-sm ${
                                        showAnswers && opt.label === q.correctAnswer
                                          ? isDark ? "bg-green-500/15 border border-green-500/30 text-green-300" : "bg-green-50 border border-green-300 text-green-700"
                                          : isDark ? "bg-zinc-700/40 text-zinc-300" : "bg-zinc-100 text-zinc-700"
                                      }`}>
                                        <span className="font-medium">{opt.label})</span> {opt.text}
                                      </div>
                                    ))}
                                  </div>
                                  {showAnswers && (
                                    <div className={`mt-2 p-3 rounded-lg text-xs ${isDark ? "bg-green-500/10 border border-green-500/20 text-green-300" : "bg-green-50 border border-green-200 text-green-700"}`}>
                                      <strong>Answer: {q.correctAnswer}</strong> - {q.explanation}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {msg.cqQuestions!.length > 0 && (
                          <div>
                            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
                              <BookOpen className="w-4 h-4" /> Creative Questions ({msg.cqQuestions!.length})
                            </h3>
                            <div className="space-y-3">
                              {msg.cqQuestions!.map((q, i) => (
                                <div key={q.id} className={`p-4 rounded-xl border ${isDark ? "bg-zinc-800/40 border-white/5" : "bg-white/70 border-zinc-200 shadow-sm"}`}>
                                  <div className="flex items-start justify-between mb-2">
                                    <p className={`text-sm font-medium ${isDark ? "text-white" : "text-zinc-900"}`}>{i + 1}. {q.question}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-50 text-indigo-600"}`}>{q.marks} marks</span>
                                  </div>
                                  {showAnswers && (
                                    <div className={`mt-2 p-3 rounded-lg text-xs space-y-2 ${isDark ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-200" : "bg-indigo-50 border border-indigo-200 text-indigo-800"}`}>
                                      <p><strong>Model Answer:</strong> {q.modelAnswer}</p>
                                      <div>
                                        <strong>Key Points:</strong>
                                        <ul className="list-disc ml-4 mt-1 space-y-0.5">
                                          {q.keyPoints.map((kp, ki) => (<li key={ki}>{kp}</li>))}
                                        </ul>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Bar */}
            <div className={`flex-shrink-0 p-3 border-t ${isDark ? 'border-white/5' : 'border-black/5'}`}>
              <div className="max-w-3xl mx-auto">
                <div className={`relative flex items-end rounded-3xl border transition-all duration-300 ${
                  isDark
                    ? 'bg-zinc-900/60 backdrop-blur-xl border-white/10 focus-within:border-white/20'
                    : 'bg-white/60 backdrop-blur-xl border-black/10 focus-within:border-black/20'
                }`}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      currentStep === "generating"
                        ? "Generating..."
                        : currentStep === "done"
                        ? "Type 'new' to create another paper..."
                        : "Type your response..."
                    }
                    disabled={isGenerating}
                    className={`flex-1 bg-transparent px-4 py-3 text-sm focus:outline-none ${
                      isDark
                        ? 'text-white placeholder:text-zinc-500'
                        : 'text-gray-900 placeholder:text-gray-400'
                    } disabled:opacity-50`}
                  />

                  <div className="flex items-center gap-0.5 p-2">
                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={isGenerating}
                      className={`p-2 rounded-full transition-colors ${
                        isListening
                          ? "bg-red-500 text-white"
                          : isDark
                            ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'
                      } disabled:opacity-50`}
                      title={isListening ? "Stop listening" : "Voice input"}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!input.trim() || isGenerating}
                      className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-colors"
                      title="Send message"
                    >
                      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
}
