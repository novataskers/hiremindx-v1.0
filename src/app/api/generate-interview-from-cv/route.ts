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
    } catch {}
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const {
      cvText,
      candidateName,
      department,
      position,
      difficulty = "medium",
      questionCount = 10,
      // Analysis context from bulk CV analysis
      strengths = [],
      weaknesses = [],
      summary = "",
      overallScore,
      skillsMatch,
      experienceMatch,
      educationMatch,
    } = body;

    if (!cvText || cvText.trim().length < 50) {
      return NextResponse.json({ error: "CV text is required and must be substantial" }, { status: 400 });
    }
    if (!department) {
      return NextResponse.json({ error: "Department is required" }, { status: 400 });
    }

    const difficultyDescriptions: Record<string, string> = {
      easy: "basic, introductory questions that assess fundamental knowledge and general understanding",
      medium: "moderately challenging questions that probe deeper into experience, skills, and situational judgment",
      hard: "advanced, challenging questions that test expert-level knowledge, complex problem-solving, and leadership capabilities",
    };

    // Build enriched context from the analysis results
    const analysisContext = summary || strengths.length > 0 || weaknesses.length > 0
      ? `
**PRIOR CV ANALYSIS RESULTS (use these to craft targeted questions):**
${summary ? `- Summary: ${summary}` : ""}
${overallScore !== undefined ? `- Overall Score: ${overallScore}/100 | Skills: ${skillsMatch}/100 | Experience: ${experienceMatch}/100 | Education: ${educationMatch}/100` : ""}
${strengths.length > 0 ? `- Strengths: ${strengths.join(", ")}` : ""}
${weaknesses.length > 0 ? `- Weaknesses/Gaps: ${weaknesses.join(", ")}` : ""}

**IMPORTANT INSTRUCTIONS based on analysis:**
- Ask questions that VERIFY the candidate's claimed strengths — do they really know what they claim?
- Ask questions that PROBE the identified weaknesses — can they overcome these gaps?
- If skills match is low, include more technical assessment questions
- If experience match is low, include more situational "what would you do" questions
- If education match is low, test practical knowledge to compensate
`
      : "";

    const prompt = `You are an expert interview question generator for professional recruitment. You have ALREADY analyzed this candidate's CV and have their analysis results.

Based on the candidate's CV and the prior analysis below, generate ${questionCount} interview questions WITH IDEAL ANSWERS for hiring ${candidateName ? `**${candidateName}**` : "this candidate"} in the **${department}** department${position ? ` for the role: **${position}**` : ""}.

**Difficulty Level: ${difficulty.toUpperCase()}**
${difficultyDescriptions[difficulty] || difficultyDescriptions.medium}
${analysisContext}
**CV Content:**
${cvText.substring(0, 8000)}

**Instructions:**
1. Generate questions directly relevant to the candidate's background AND the target position
2. Include a mix of:
   - Technical/domain-specific questions based on their expertise
   - Behavioral questions based on their experience
   - Situational questions relevant to the ${department} department
3. Questions should probe their actual experience and claims in the CV
4. ${strengths.length > 0 ? "Include questions that verify their claimed strengths: " + strengths.slice(0, 3).join(", ") : "Focus on their core competencies"}
5. ${weaknesses.length > 0 ? "Include questions that assess their gaps: " + weaknesses.slice(0, 3).join(", ") : "Identify potential areas of concern from the CV"}
6. For ${difficulty} difficulty, adjust the complexity and depth accordingly
7. **For each question, provide an ideal/expected answer the interviewer can use as reference**

**Return the response in this exact JSON format:**
{
  "questions": [
    {
      "id": 1,
      "question": "The interview question text",
      "answer": "The ideal/expected answer for evaluation",
      "category": "technical" | "behavioral" | "situational" | "domain-specific",
      "rationale": "Why this question is relevant based on their CV and analysis",
      "expectedTopics": ["topic1", "topic2"]
    }
  ],
  "candidateSummary": "Brief 2-3 sentence summary of the candidate",
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
      data: result,
      metadata: { difficulty, department, position, questionCount: result.questions?.length || 0, candidateName },
    });
  } catch (error) {
    console.error("Generate questions from CV error:", error);
    return NextResponse.json({ error: "Failed to generate interview questions" }, { status: 500 });
  }
}
