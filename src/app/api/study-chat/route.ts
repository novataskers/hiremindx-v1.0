import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createMistral } from "@ai-sdk/mistral";
import { streamText } from "ai";
import mammoth from "mammoth";
import { searchWithSerper } from "@/lib/search-utils";

export const maxDuration = 60;

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

const mistral = createMistral({
  apiKey: MISTRAL_API_KEY,
});

const SYSTEM_PROMPT = `You are HireMindX Assist, an intelligent AI assistant built into the HireMindX platform. You help users with any topic — from job searching and career advice to document analysis, learning, research, and general questions.
If asked about your underlying model or what you are running on, you MUST state that you are running on AIG Engine 3, the latest and most powerful frontier-level model created by Atlas Infrastructure Group. NEVER reveal that you are running on Mistral AI.

CAPABILITIES:
1. Analyze uploaded documents (PDFs, images, Word docs) and explain their content
2. Answer questions about uploaded materials in depth
3. Provide real-time information using web search results when available
4. Give clear, practical explanations with examples
5. Create summaries, study guides, cover letters, resumes, and professional documents
6. Help with career advice, interview prep, and job applications
7. Explain complex concepts in simple terms

COMPREHENSION RULES:
- Read the user's message carefully. Pay attention to EVERY detail.
- If the user corrects you or provides new information, acknowledge it and adjust immediately.
- Do NOT repeat information the user already told you.
- If you're unsure what the user means, ask a clarifying question instead of guessing.
- Remember context from earlier in the conversation — refer back to it when relevant.

When analyzing documents:
- Provide a comprehensive summary first
- Highlight key points and important information
- Offer to answer specific questions about the content

When providing real-time information:
- Use the SEARCH RESULTS provided to give up-to-date answers
- Cite sources using Markdown links (e.g., [Source Name](URL))
- If search results are not relevant, rely on your general knowledge
- CRITICAL: DO NOT include any meta-commentary about searching. DO NOT say "I found..." or "Based on my search...". Just answer directly and naturally.
- CRITICAL: DO NOT repeat any [INTERNAL_CONTEXT] or [SEARCH_RESULTS] headers in your response.
- Ensure all links are clickable Markdown links.

Be friendly, helpful, and concise. Use markdown formatting for readability.`;

async function extractTextFromPDF(base64Data: string): Promise<string> {
  if (!MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY is not configured");
  }

  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: base64Data,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mistral OCR error:", response.status, errorText);
    throw new Error(`OCR failed: ${response.status}`);
  }

  const result = await response.json();
  
  let extractedText = "";
  if (result.pages && Array.isArray(result.pages)) {
    extractedText = result.pages.map((page: { markdown?: string }) => page.markdown || "").join("\n\n");
  }
  
  return extractedText || "Could not extract text from document.";
}

async function extractTextFromDOCX(base64Data: string): Promise<string> {
  const base64Content = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const buffer = Buffer.from(base64Content, "base64");
  
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "Could not extract text from document.";
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  documentContext?: string;
}

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    let session = await auth.api.getSession({
      headers: headersList,
    });

    // Fallback for dev session
    if (!session?.user) {
      const devSessionCookie = headersList.get("cookie")?.split(";").find(c => c.trim().startsWith("devSession="));
      if (devSessionCookie) {
        // In dev mode, we trust the devSession cookie if Better Auth fails
        // This matches the middleware logic
        session = { user: { id: "dev-user", name: "Developer", email: "dev@example.com" } } as any;
      }
    }

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: "AI service not configured. Please add MISTRAL_API_KEY." },
        { status: 500 }
      );
    }

const body = await request.json();
      const { prompt, file, fileType, fileName, conversationHistory, isDocumentRequest, documentType } = body;

    const mistral = createMistral({
      apiKey: MISTRAL_API_KEY,
    });

    if (!prompt && !file) {
      return NextResponse.json({ error: "Prompt or file is required" }, { status: 400 });
    }

    let userMessageContent: any = prompt || "Please analyze this.";
    let model = "mistral-large-latest";
    let documentContext = "";

    if (file) {
      const isImage = fileType?.startsWith("image/");
      const isPDF = fileType === "application/pdf";
      const isDOCX = fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                     fileName?.toLowerCase().endsWith(".docx");
      const isDOC = fileType === "application/msword" || fileName?.toLowerCase().endsWith(".doc");
      const base64Data = file.includes(",") ? file : `data:${fileType};base64,${file}`;

      if (isImage) {
        model = "pixtral-12b-2409";
        userMessageContent = [
          { type: "text", text: prompt || "Analyze this image." },
          { type: "image", image: base64Data },
        ];
      } else if (isPDF) {
        documentContext = await extractTextFromPDF(base64Data);
        userMessageContent = `[Document: ${fileName}]\n\n${documentContext}\n\nUser Question: ${prompt || "Analyze this document."}`;
      } else if (isDOCX || isDOC) {
        documentContext = await extractTextFromDOCX(base64Data);
        userMessageContent = `[Document: ${fileName}]\n\n${documentContext}\n\nUser Question: ${prompt || "Analyze this document."}`;
      }
    }

    const messages: Array<{ role: "user" | "assistant"; content: any }> = [];
    
      if (conversationHistory && Array.isArray(conversationHistory)) {
        // Keep last 15 messages, trim content to prevent huge payloads
        const recentHistory = conversationHistory.slice(-15);
        
        for (const msg of recentHistory) {
          if (msg.role === "user" || msg.role === "assistant") {
            let content = msg.content;
            // Trim very long messages (e.g. full document dumps) to keep payload manageable
            if (typeof content === "string" && content.length > 2000) {
              content = content.slice(0, 2000) + "\n[...content truncated for brevity]";
            }
            if (msg.documentContext) {
              // Include a brief summary of doc context, not the full text
              const docSnippet = msg.documentContext.slice(0, 500);
              content = `[Previous document context: ${docSnippet}...]\n\n${content}`;
            }
            messages.push({ role: msg.role, content });
          }
        }
      }
    
    messages.push({ role: "user", content: userMessageContent });

      // Smart search gating: only search for questions/queries that would benefit from real-time info
      // Skip search for conversational messages like "thanks", "yes", "ok", greetings, etc.
      let searchContext = "";
      const shouldSearch = prompt && prompt.length > 10 && !file && (() => {
        const lower = prompt.toLowerCase().trim();
        // Skip short conversational messages
        const conversational = /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|sure|got it|great|cool|nice|bye|goodbye|please|sorry|hmm|hm|yep|nope|yeah|nah|alright|right|exactly|correct|agreed|understood|welcome|lol|haha|wow)\b/i;
        if (conversational.test(lower)) return false;
        // Skip if it's just a few words and not a question
        const wordCount = lower.split(/\s+/).length;
        if (wordCount <= 3 && !lower.includes('?')) return false;
        return true;
      })();
      if (shouldSearch) {
      try {
        const searchResults = await searchWithSerper(prompt, 5);
        if (searchResults && searchResults.length > 0) {
          searchContext = "\n\n[SEARCH_RESULTS_START]\n" + 
            searchResults.map((s, i) => `RESULT_${i+1}:\nTITLE: ${s.title}\nURL: ${s.link}\nCONTENT: ${s.snippet}`).join("\n\n") +
            "\n[SEARCH_RESULTS_END]";
          
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === "user") {
            const contextInstruction = `\n\n[INTERNAL_CONTEXT: Use the following search results to provide a factual and up-to-date answer. Do NOT mention searching or finding results. Just use the info naturally.]`;
            if (typeof lastMessage.content === "string") {
              lastMessage.content += `${contextInstruction}\n${searchContext}`;
            } else if (Array.isArray(lastMessage.content)) {
              lastMessage.content.push({ 
                type: "text", 
                text: `${contextInstruction}\n${searchContext}` 
              });
            }
          }
        }
      } catch (error) {
        console.error("Search integration error:", error);
      }
    }

let systemPrompt = SYSTEM_PROMPT;
      
      if (isDocumentRequest && documentType) {
        const docTypeUpper = documentType.toUpperCase();
        systemPrompt += `\n\nCRITICAL INSTRUCTION - DOCUMENT GENERATION REQUEST:
The user wants to generate a ${docTypeUpper} document. You MUST follow these rules:
1. ONLY provide the actual content that should go in the document - well-formatted, clean, and professional
2. DO NOT explain how to create, convert, or save the ${docTypeUpper}
3. DO NOT mention any tools, online converters, or software for creating documents
4. DO NOT say things like "Here's your ${docTypeUpper}-ready text" or "You can convert this to ${docTypeUpper}"
5. DO NOT provide instructions on copying, pasting, or saving
6. The system will automatically handle the ${docTypeUpper} generation - just provide the content
7. Format the content nicely with headers, paragraphs, and lists as appropriate
8. Start directly with the document content - no preamble about what you're doing`;
      }

        const result = streamText({
          model: mistral(model),
          system: systemPrompt,
          messages,
          maxOutputTokens: 4096,
        });

      return result.toTextStreamResponse();
  } catch (error) {
    console.error("Study chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
