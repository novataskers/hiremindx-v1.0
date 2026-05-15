import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { candidateCVs, hiringPositions, cvAnalysisResults } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { Mistral } from "@mistralai/mistralai";

// Use separate Mistral API key for bulk CV analysis
const mistral = new Mistral({ apiKey: process.env.MISTRAL_CV_ANALYSIS_API_KEY! });

// Helper to get user ID from either real session or dev session
async function getUserId(): Promise<string | null> {
  // First try better-auth session
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    return session.user.id;
  }
  
  // Fall back to dev session from cookie
  const cookieStore = await cookies();
  const devSessionCookie = cookieStore.get("devSession");
  if (devSessionCookie) {
    try {
      const devSession = JSON.parse(decodeURIComponent(devSessionCookie.value));
      if (devSession?.user?.id) {
        return devSession.user.id;
      }
    } catch {
      // Invalid cookie
    }
  }
  
  return null;
}

// Extract text from base64 PDF using pdf-parse
async function extractTextFromPDF(base64Data: string): Promise<string> {
  try {
    // Remove the data URL prefix if present
    const base64Content = base64Data.replace(/^data:application\/pdf;base64,/, "");
    console.log("PDF base64 length:", base64Content.length);
    
    const buffer = Buffer.from(base64Content, "base64");
    console.log("PDF buffer length:", buffer.length);
    
    // Import pdf-parse's internal parser directly to avoid test file loading bug
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    
    const data: any = await pdfParse(buffer);
    const extractedText = typeof data?.text === "string" ? data.text : "";
    const pageCount = typeof data?.numpages === "number" ? data.numpages : 0;
    
    console.log("PDF parsed, pages:", pageCount);
    console.log("Extracted text length:", extractedText.length);
    console.log("First 200 chars:", extractedText.substring(0, 200));
    
    return extractedText;
  } catch (error) {
    console.error("Error extracting PDF text:", error);
    return "";
  }
}

// Analyze a single CV against position requirements
async function analyzeCV(
  cvText: string,
  position: {
    title: string;
    department: string;
    organization: string;
    description: string | null;
    requirements: string | null;
    preferredSkills: string[] | null;
    experienceRequired: string | null;
    educationRequired: string | null;
  }
): Promise<{
  overallScore: number;
  skillsMatch: number;
  experienceMatch: number;
  educationMatch: number;
  recommendation: "highly_recommended" | "recommended" | "consider" | "not_recommended";
  strengths: string[];
  weaknesses: string[];
  summary: string;
  detailedAnalysis: string;
  suggestedDepartments: string[];
  candidateName: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
}> {
  const prompt = `You are an expert HR analyst. Analyze the following CV against the job position requirements and provide a detailed assessment.

POSITION DETAILS:
- Title: ${position.title}
- Department: ${position.department}
- Organization: ${position.organization}
- Description: ${position.description || "Not specified"}
- Requirements: ${position.requirements || "Not specified"}
- Preferred Skills: ${position.preferredSkills?.join(", ") || "Not specified"}
- Experience Required: ${position.experienceRequired || "Not specified"}
- Education Required: ${position.educationRequired || "Not specified"}

CANDIDATE'S CV:
${cvText}

Analyze this CV and respond with ONLY a valid JSON object (no markdown, no code blocks, just the JSON):
{
  "overallScore": <number 0-100>,
  "skillsMatch": <number 0-100>,
  "experienceMatch": <number 0-100>,
  "educationMatch": <number 0-100>,
  "recommendation": <"highly_recommended" | "recommended" | "consider" | "not_recommended">,
  "strengths": [<array of 3-5 key strengths>],
  "weaknesses": [<array of 2-4 areas for improvement>],
  "summary": "<2-3 sentence executive summary>",
  "detailedAnalysis": "<detailed paragraph analysis>",
  "suggestedDepartments": [<array of other departments this candidate might fit>],
  "candidateName": "<extracted name or null>",
  "candidateEmail": "<extracted email or null>",
  "candidatePhone": "<extracted phone or null>"
}

Scoring guidelines:
- 80-100: Exceptional candidate, exceeds requirements
- 60-79: Strong candidate, meets most requirements  
- 40-59: Moderate candidate, meets some requirements
- 0-39: Weak candidate, does not meet key requirements`;

  try {
    const response = await mistral.chat.complete({
      model: "mistral-large-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Invalid response from Mistral");
    }

    // Clean the response - remove any markdown formatting
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith("```json")) {
      cleanedContent = cleanedContent.slice(7);
    }
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent.slice(3);
    }
    if (cleanedContent.endsWith("```")) {
      cleanedContent = cleanedContent.slice(0, -3);
    }
    cleanedContent = cleanedContent.trim();

    const result = JSON.parse(cleanedContent);
    return {
      overallScore: Math.min(100, Math.max(0, result.overallScore || 0)),
      skillsMatch: Math.min(100, Math.max(0, result.skillsMatch || 0)),
      experienceMatch: Math.min(100, Math.max(0, result.experienceMatch || 0)),
      educationMatch: Math.min(100, Math.max(0, result.educationMatch || 0)),
      recommendation: result.recommendation || "consider",
      strengths: result.strengths || [],
      weaknesses: result.weaknesses || [],
      summary: result.summary || "Analysis completed",
      detailedAnalysis: result.detailedAnalysis || "",
      suggestedDepartments: result.suggestedDepartments || [],
      candidateName: result.candidateName || null,
      candidateEmail: result.candidateEmail || null,
      candidatePhone: result.candidatePhone || null,
    };
  } catch (error) {
    console.error("Error analyzing CV with Mistral:", error);
    throw error;
  }
}

// POST - Analyze all pending CVs for a position
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check usage limits
    const { useFeature } = await import("@/lib/usage-limits");
    const usageResult = await useFeature(userId, "bulk_cv_analysis");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    const body = await request.json();
    const { positionId } = body;

    if (!positionId) {
      return NextResponse.json({ error: "Position ID is required" }, { status: 400 });
    }

    // Verify the position exists and belongs to the user
    const [position] = await db
      .select()
      .from(hiringPositions)
      .where(
        and(
          eq(hiringPositions.id, positionId),
          eq(hiringPositions.userId, userId)
        )
      );

    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    // Update position status to analyzing
    await db
      .update(hiringPositions)
      .set({ status: "analyzing", updatedAt: new Date().toISOString() })
      .where(eq(hiringPositions.id, positionId));

    // Get all CVs for this position
    const allCVs = await db
      .select()
      .from(candidateCVs)
      .where(eq(candidateCVs.positionId, positionId));
    
    // Filter to only unanalyzed CVs (pending or error status)
    const cvsToAnalyze = allCVs.filter(cv => cv.status !== "analyzed");

    if (cvsToAnalyze.length === 0) {
      return NextResponse.json({ 
        message: "No CVs to analyze",
        analyzed: 0 
      });
    }

    console.log(`Found ${cvsToAnalyze.length} CVs to analyze`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const cv of cvsToAnalyze) {
        try {
          console.log(`Processing CV ${cv.id}: ${cv.fileName}`);
          
          // Update CV status to analyzing
          await db
            .update(candidateCVs)
            .set({ status: "analyzing" })
            .where(eq(candidateCVs.id, cv.id));

          // Extract text from PDF
          let cvText = cv.rawText;
          console.log(`CV ${cv.id} rawText exists:`, !!cvText);
          console.log(`CV ${cv.id} fileUrl exists:`, !!cv.fileUrl);
          console.log(`CV ${cv.id} fileUrl length:`, cv.fileUrl?.length ?? 0);
          
          if (!cvText && cv.fileUrl) {
            cvText = await extractTextFromPDF(cv.fileUrl);
            console.log(`CV ${cv.id} extracted text length:`, cvText?.length ?? 0);
            
            // Save extracted text for future use
            await db
              .update(candidateCVs)
              .set({ rawText: cvText })
              .where(eq(candidateCVs.id, cv.id));
          }

          if (!cvText || cvText.trim().length < 50) {
            console.log(`CV ${cv.id} text too short or empty, marking as error`);
            // Update CV status to error
            await db
              .update(candidateCVs)
              .set({ status: "error" })
              .where(eq(candidateCVs.id, cv.id));
            errorCount++;
            continue;
          }

        // Analyze the CV
        const analysis = await analyzeCV(cvText, {
          title: position.title,
          department: position.department,
          organization: position.organization,
          description: position.description,
          requirements: position.requirements,
          preferredSkills: position.preferredSkills as string[] | null,
          experienceRequired: position.experienceRequired,
          educationRequired: position.educationRequired,
        });

        // Save the analysis results
        const now = new Date().toISOString();
        const [analysisResult] = await db
          .insert(cvAnalysisResults)
          .values({
            cvId: cv.id,
            positionId: positionId,
            overallScore: analysis.overallScore,
            skillsMatch: analysis.skillsMatch,
            experienceMatch: analysis.experienceMatch,
            educationMatch: analysis.educationMatch,
            recommendation: analysis.recommendation,
            strengths: analysis.strengths,
            weaknesses: analysis.weaknesses,
            summary: analysis.summary,
            detailedAnalysis: analysis.detailedAnalysis,
            suggestedDepartments: analysis.suggestedDepartments,
            analyzedAt: now,
          })
          .returning();

        // Update CV with extracted info and status
        await db
          .update(candidateCVs)
          .set({
            status: "analyzed",
            candidateName: analysis.candidateName,
            candidateEmail: analysis.candidateEmail,
            candidatePhone: analysis.candidatePhone,
          })
          .where(eq(candidateCVs.id, cv.id));

        results.push({
          cvId: cv.id,
          fileName: cv.fileName,
          candidateName: analysis.candidateName,
          overallScore: analysis.overallScore,
          recommendation: analysis.recommendation,
        });

        successCount++;
      } catch (error) {
        console.error(`Error analyzing CV ${cv.id}:`, error);
        await db
          .update(candidateCVs)
          .set({ status: "error" })
          .where(eq(candidateCVs.id, cv.id));
        errorCount++;
      }
    }

    // Update position status to completed
    await db
      .update(hiringPositions)
      .set({ status: "completed", updatedAt: new Date().toISOString() })
      .where(eq(hiringPositions.id, positionId));

    return NextResponse.json({
      success: true,
      analyzed: successCount,
      errors: errorCount,
      results: results.sort((a, b) => b.overallScore - a.overallScore),
    });
  } catch (error) {
    console.error("Error in bulk CV analysis:", error);
    return NextResponse.json(
      { error: "Failed to analyze CVs" },
      { status: 500 }
    );
  }
}

// GET - Get analysis results for a position
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const positionId = parseInt(searchParams.get("positionId") || "");

    if (isNaN(positionId)) {
      return NextResponse.json({ error: "Invalid position ID" }, { status: 400 });
    }

    // Verify the position belongs to the user
    const [position] = await db
      .select()
      .from(hiringPositions)
      .where(
        and(
          eq(hiringPositions.id, positionId),
          eq(hiringPositions.userId, userId)
        )
      );

    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    // Get all CVs with their analysis results
    const cvsWithResults = await db
      .select({
        cv: candidateCVs,
        analysis: cvAnalysisResults,
      })
      .from(candidateCVs)
      .leftJoin(cvAnalysisResults, eq(candidateCVs.id, cvAnalysisResults.cvId))
      .where(eq(candidateCVs.positionId, positionId));

    // Sort by overall score (highest first)
    const sortedResults = cvsWithResults.sort((a, b) => {
      const scoreA = a.analysis?.overallScore ?? -1;
      const scoreB = b.analysis?.overallScore ?? -1;
      return scoreB - scoreA;
    });

    return NextResponse.json({
      position,
      candidates: sortedResults.map((item, index) => ({
        rank: index + 1,
        cv: {
          id: item.cv.id,
          fileName: item.cv.fileName,
          candidateName: item.cv.candidateName,
          candidateEmail: item.cv.candidateEmail,
          candidatePhone: item.cv.candidatePhone,
          rawText: item.cv.rawText,
          status: item.cv.status,
          uploadedAt: item.cv.uploadedAt,
        },
        analysis: item.analysis
          ? {
              overallScore: item.analysis.overallScore,
              skillsMatch: item.analysis.skillsMatch,
              experienceMatch: item.analysis.experienceMatch,
              educationMatch: item.analysis.educationMatch,
              recommendation: item.analysis.recommendation,
              strengths: item.analysis.strengths,
              weaknesses: item.analysis.weaknesses,
              summary: item.analysis.summary,
              detailedAnalysis: item.analysis.detailedAnalysis,
              suggestedDepartments: item.analysis.suggestedDepartments,
              analyzedAt: item.analysis.analyzedAt,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching analysis results:", error);
    return NextResponse.json(
      { error: "Failed to fetch analysis results" },
      { status: 500 }
    );
  }
}
