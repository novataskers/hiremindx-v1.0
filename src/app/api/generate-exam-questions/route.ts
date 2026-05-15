import { NextRequest, NextResponse } from "next/server";
import { Mistral } from "@mistralai/mistralai";
import { auth } from "@/lib/auth";
import { headers, cookies } from "next/headers";

const mistral = new Mistral({ apiKey: process.env.MISTRAL_CV_ANALYSIS_API_KEY! });

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) return session.user.id;

  const cookieStore = await cookies();
  const devSessionCookie = cookieStore.get("devSession");
  if (devSessionCookie) {
    try {
      const devSession = JSON.parse(decodeURIComponent(devSessionCookie.value));
      if (devSession?.user?.id) return devSession.user.id;
    } catch {
      // Invalid cookie
    }
  }
  return null;
}

async function extractTextFromPDF(base64Data: string): Promise<string> {
  try {
    const base64Content = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;
    const buffer = Buffer.from(base64Content, "base64");
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
    const usageResult = await useFeature(userId, "exam_questions");
    if (!usageResult.allowed) {
      return NextResponse.json({
        error: usageResult.upgradeMessage,
        limitReached: true,
        usage: { used: usageResult.currentUsage, limit: usageResult.limit, plan: usageResult.plan, resetAt: usageResult.resetAt, isLifetime: usageResult.isLifetime },
      }, { status: 429 });
    }

    const body = await request.json();
    const {
      subject,
      topic,
      questionType, // 'mcq', 'cq', 'both'
      difficulty,    // 'easy', 'medium', 'hard'
      questionCount,
      instructions,
      bookPdf,       // optional base64 PDF
    } = body;

    if (!subject || !topic) {
      return NextResponse.json({ error: "Subject and topic are required" }, { status: 400 });
    }
    if (!questionType || !["mcq", "cq", "both"].includes(questionType)) {
      return NextResponse.json({ error: "Valid question type (mcq/cq/both) is required" }, { status: 400 });
    }
    if (!difficulty || !["easy", "medium", "hard"].includes(difficulty)) {
      return NextResponse.json({ error: "Valid difficulty (easy/medium/hard) is required" }, { status: 400 });
    }

    const count = Math.min(Math.max(questionCount || 10, 1), 30);

    // Extract book context if PDF provided
    let bookContext = "";
    if (bookPdf) {
      bookContext = await extractTextFromPDF(bookPdf);
      if (bookContext) {
        bookContext = bookContext.substring(0, 12000);
      }
    }

    const difficultyDesc: Record<string, string> = {
      easy: "basic, straightforward questions testing fundamental recall and comprehension",
      medium: "moderately challenging questions requiring understanding, application, and some analysis",
      hard: "advanced questions demanding deep analysis, synthesis, evaluation, and critical thinking",
    };

    // Build the question format instructions
    let formatInstructions = "";
    if (questionType === "mcq" || questionType === "both") {
      formatInstructions += `
**MCQ Format:**
Each MCQ should have:
- A clear question
- 4 options labeled A, B, C, D
- The correct answer letter
- A brief explanation of why the answer is correct

`;
    }
    if (questionType === "cq" || questionType === "both") {
      formatInstructions += `
**CQ (Creative/Written Question) Format:**
Each CQ should have:
- A thought-provoking question that requires a written answer
- Suggested marks/points for the question
- A detailed model answer
- 3-5 key points that should be covered in a good answer

`;
    }

    // Determine counts for each type
    let mcqCount = 0;
    let cqCount = 0;
    if (questionType === "mcq") {
      mcqCount = count;
    } else if (questionType === "cq") {
      cqCount = count;
    } else {
      mcqCount = Math.ceil(count / 2);
      cqCount = count - mcqCount;
    }

    const prompt = `You are an expert exam question paper generator for academic examinations.

**Subject:** ${subject}
**Topic:** ${topic}
**Difficulty Level:** ${difficulty.toUpperCase()} - ${difficultyDesc[difficulty]}
${instructions ? `**Additional Instructions:** ${instructions}` : ""}
${bookContext ? `\n**Reference Material (from uploaded book/document):**\n${bookContext}\n` : ""}

Generate exam questions as specified below:
${mcqCount > 0 ? `- ${mcqCount} Multiple Choice Questions (MCQ)` : ""}
${cqCount > 0 ? `- ${cqCount} Creative/Written Questions (CQ)` : ""}

${formatInstructions}

**Return the response in this exact JSON format:**
{
  ${mcqCount > 0 ? `"mcqQuestions": [
    {
      "id": 1,
      "question": "The question text",
      "options": [
        { "label": "A", "text": "Option A text" },
        { "label": "B", "text": "Option B text" },
        { "label": "C", "text": "Option C text" },
        { "label": "D", "text": "Option D text" }
      ],
      "correctAnswer": "A",
      "explanation": "Why this is the correct answer"
    }
  ]${cqCount > 0 ? "," : ""}` : ""}
  ${cqCount > 0 ? `"cqQuestions": [
    {
      "id": 1,
      "question": "The question text",
      "marks": 5,
      "modelAnswer": "A detailed model answer",
      "keyPoints": ["Key point 1", "Key point 2", "Key point 3"]
    }
  ]` : ""}
}

Return ONLY valid JSON, no markdown formatting or code blocks.`;

    const response = await mistral.chat.complete({
      model: "mistral-large-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      maxTokens: 6000,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Failed to generate questions" }, { status: 500 });
    }

    let result;
    try {
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
      if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
      if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);
      result = JSON.parse(cleanContent.trim());
    } catch {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json({ error: "Failed to parse generated questions" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        mcqQuestions: result.mcqQuestions || [],
        cqQuestions: result.cqQuestions || [],
      },
      metadata: {
        subject,
        topic,
        questionType,
        difficulty,
        questionCount: (result.mcqQuestions?.length || 0) + (result.cqQuestions?.length || 0),
      },
    });
  } catch (error) {
    console.error("Generate exam questions error:", error);
    return NextResponse.json({ error: "Failed to generate exam questions" }, { status: 500 });
  }
}
