"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, ArrowRight, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

// Set up PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface CVUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UploadStep = "upload" | "analyzing" | "generating" | "complete";

interface AnalysisResult {
  id: number;
  fullName: string;
  expertise: string;
  skills: string[];
  experienceYears: number;
}

export default function CVUploadModal({ open, onOpenChange }: CVUploadModalProps) {
  const router = useRouter();
  const [uploadStep, setUploadStep] = useState<UploadStep>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [leadsCount, setLeadsCount] = useState(0);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      if (uploadedFile.type !== "application/pdf") {
        toast.error("Please upload a PDF file");
        return;
      }
      
      if (uploadedFile.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error("File size must be less than 10MB");
        return;
      }

      setFileName(uploadedFile.name);
      setFile(uploadedFile);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;

    try {
      setUploadStep("analyzing");
      setProgress(10);

      // Extract text from PDF
      toast.info("Extracting text from PDF...");
      const cvText = await extractTextFromPDF(file);
      setProgress(30);

      if (!cvText || cvText.trim().length < 50) {
        throw new Error("Could not extract enough text from the PDF. Please make sure your CV is not scanned or image-based.");
      }

      // Analyze CV
      toast.info("Analyzing your CV with AI...");
      const analysisResponse = await fetch("/api/cv-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cvText,
          resumeId: null,
        }),
      });

      if (!analysisResponse.ok) {
        const error = await analysisResponse.json();
        if (analysisResponse.status === 429 && error?.limitReached) {
          const usage = error.usage || {};
          window.dispatchEvent(new CustomEvent("usage-limit-reached", { detail: { message: error.error, resetAt: usage.resetAt || null, isLifetime: usage.isLifetime !== undefined ? usage.isLifetime : true } }));
          throw new Error("LIMIT_REACHED_SILENT");
        }
        throw new Error(error.error || "Failed to analyze CV");
      }

      const analysis = await analysisResponse.json();
      setAnalysisResult(analysis);
      setProgress(60);

      // Generate leads
      setUploadStep("generating");
      toast.info("Generating matched leads...");
      
      const leadsResponse = await fetch("/api/leads/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cvAnalysisId: analysis.id,
          count: 10,
        }),
      });

      if (!leadsResponse.ok) {
        const error = await leadsResponse.json();
        throw new Error(error.error || "Failed to generate leads");
      }

      const leads = await leadsResponse.json();
      setLeadsCount(leads.length);
      setProgress(100);

      // Complete
      setUploadStep("complete");
      toast.success("CV analyzed and leads generated successfully!");

    } catch (error) {
      console.error("Error processing CV:", error);
      const isSilent = error instanceof Error && error.message === "LIMIT_REACHED_SILENT";
      if (!isSilent) {
        toast.error(error instanceof Error ? error.message : "Failed to process CV");
      }
      setUploadStep("upload");
      setProgress(0);
    }
  };

  const handleViewLeads = () => {
    onOpenChange(false);
    router.push("/leads");
    
    // Reset modal state after navigation
    setTimeout(() => {
      setUploadStep("upload");
      setFileName("");
      setFile(null);
      setProgress(0);
      setAnalysisResult(null);
      setLeadsCount(0);
    }, 300);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setUploadStep("upload");
      setFileName("");
      setFile(null);
      setProgress(0);
      setAnalysisResult(null);
      setLeadsCount(0);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Upload className="w-6 h-6 text-primary" />
            {uploadStep === "upload" && "Upload your CV"}
            {uploadStep === "analyzing" && "Analyzing CV"}
            {uploadStep === "generating" && "Generating Leads"}
            {uploadStep === "complete" && "Analysis Complete"}
          </DialogTitle>
        </DialogHeader>

        {uploadStep === "upload" && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
              <label className="cursor-pointer block">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <div className="text-sm font-medium mb-2">
                  {fileName ? "Change PDF" : "Upload PDF"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Max file size: 10MB
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>

            {fileName && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <FileText className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium flex-1">{fileName}</span>
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>

                <Button
                  onClick={handleAnalyze}
                  className="w-full"
                  size="lg"
                >
                  Analyze CV & Generate Leads
                  <Sparkles className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        )}

        {(uploadStep === "analyzing" || uploadStep === "generating") && (
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {uploadStep === "analyzing" && "Analyzing your CV..."}
                  {uploadStep === "generating" && "Finding matching companies..."}
                </span>
                <span className="font-semibold">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>PDF uploaded successfully</span>
              </div>
              {progress >= 30 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Text extracted from CV</span>
                </div>
              )}
              {progress >= 60 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Skills and expertise identified</span>
                </div>
              )}
              {uploadStep === "generating" && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Searching for matching leads...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {uploadStep === "complete" && analysisResult && (
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-accent p-4 rounded-lg space-y-2">
                <h3 className="font-semibold">CV Analysis Summary</h3>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="font-medium">{analysisResult.fullName}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Expertise:</span>{" "}
                    <span className="font-medium">{analysisResult.expertise}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Experience:</span>{" "}
                    <span className="font-medium">{analysisResult.experienceYears} years</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Skills:</span>{" "}
                    <span className="font-medium">
                      {analysisResult.skills.slice(0, 5).join(", ")}
                      {analysisResult.skills.length > 5 && ` +${analysisResult.skills.length - 5} more`}
                    </span>
                  </p>
                </div>
              </div>

              <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-primary mb-1">{leadsCount}</p>
                <p className="text-sm text-muted-foreground">
                  Matched leads generated
                </p>
              </div>

              <Button
                onClick={handleViewLeads}
                className="w-full"
                size="lg"
              >
                View Leads
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}