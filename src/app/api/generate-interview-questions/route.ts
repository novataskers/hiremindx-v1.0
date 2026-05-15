import { NextRequest, NextResponse } from "next/server";
import { Mistral } from "@mistralai/mistralai";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";

// Use same Mistral API key as bulk CV analysis
const mistral = new Mistral({ apiKey: process.env.MISTRAL_CV_ANALYSIS_API_KEY! });

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

async function extractTextFromPDF(base64Data: string): Promise<string> {
  try {
    // Remove data URL prefix if present
    const base64Content = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;

    const buffer = Buffer.from(base64Content, "base64");

    // Use internal pdf-parse to avoid test file loading bug
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const data = await pdfParse(buffer);

    return data.text || "";
  } catch (error) {
    console.error("PDF extraction error:", error);
    return "";
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check usage limits
    const { useFeature } = await import("@/lib/usage-limits");
    const usageResult = await useFeature(userId, "interview_questions");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    const body = await request.json();
    const { cvData, difficulty, department, purpose, questionCount = 10 } = body;

    if (!cvData) {
      return NextResponse.json({ error: "CV data is required" }, { status: 400 });
    }

    if (!difficulty || !["easy", "medium", "hard"].includes(difficulty)) {
      return NextResponse.json({ error: "Valid difficulty (easy/medium/hard) is required" }, { status: 400 });
    }

    if (!department) {
      return NextResponse.json({ error: "Department is required" }, { status: 400 });
    }

    // Extract text from PDF
    const cvText = await extractTextFromPDF(cvData);

    if (!cvText || cvText.trim().length < 50) {
      return NextResponse.json(
        { error: "Could not extract sufficient text from CV. Please ensure the PDF contains readable text." },
        { status: 400 }
      );
    }

    // Generate interview questions using Mistral AI
    const difficultyDescriptions = {
      easy: "basic, introductory questions that assess fundamental knowledge and general understanding",
      medium: "moderately challenging questions that probe deeper into experience, skills, and situational judgment",
      hard: "advanced, challenging questions that test expert-level knowledge, complex problem-solving, and leadership capabilities"
    };

    const prompt = `You are an expert interview question generator for academic and professional recruitment.

Based on the candidate's CV below, generate ${questionCount} interview questions WITH IDEAL ANSWERS for hiring this candidate for the **${department}** department${purpose ? ` for the role/purpose: ${purpose}` : ""}.

**Difficulty Level: ${difficulty.toUpperCase()}**
${difficultyDescriptions[difficulty as keyof typeof difficultyDescriptions]}

**CV Content:**
${cvText.substring(0, 8000)}

**Instructions:**
1. Generate questions that are directly relevant to the candidate's background and the target department
2. Include a mix of:
   - Technical/domain-specific questions based on their expertise
   - Behavioral questions based on their experience
   - Situational questions relevant to the ${department} department
3. Questions should probe their actual experience and claims in the CV
4. For ${difficulty} difficulty, adjust the complexity and depth accordingly
5. **IMPORTANT: For each question, provide an ideal/expected answer that the interviewer can use as a reference to evaluate the candidate's response**

**Return the response in this exact JSON format:**
{
  "questions": [
    {
      "id": 1,
      "question": "The interview question text",
      "answer": "The ideal/expected answer that the candidate should provide. This helps the interviewer know what to look for in the candidate's response.",
      "category": "technical" | "behavioral" | "situational" | "domain-specific",
      "rationale": "Brief explanation of why this question is relevant based on their CV",
      "expectedTopics": ["topic1", "topic2"]
    }
  ],
  "candidateSummary": "Brief 2-3 sentence summary of the candidate's profile",
  "keyAreasToProbe": ["area1", "area2", "area3"]
}

Return ONLY valid JSON, no markdown formatting or code blocks.`;

    const response = await mistral.chat.complete({
      model: "mistral-large-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      maxTokens: 4000,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Failed to generate questions" },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let result;
    try {
      // Clean up the response - remove any markdown formatting
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      result = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json(
        { error: "Failed to parse generated questions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        difficulty,
        department,
        purpose,
        questionCount: result.questions?.length || 0,
      },
    });
  } catch (error) {
    console.error("Generate questions error:", error);
    return NextResponse.json(
      { error: "Failed to generate interview questions" },
      { status: 500 }
    );
  }
}
