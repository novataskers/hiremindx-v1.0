import { Mistral } from "@mistralai/mistralai";
import { getJson } from "serpapi";
// pdf-parse is imported dynamically to avoid its test file loading at build time

// Primary brain: main agent reasoning, search, outreach decisions
const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || "" });
// Secondary brain: CV analysis, email drafting, document understanding — uses dedicated key for parallel power
const mistralSecondary = new Mistral({ apiKey: process.env.MISTRAL_CV_ANALYSIS_API_KEY || process.env.MISTRAL_API_KEY || "" });

export interface UserProfile {
  jobField?: string;
  fullName?: string;
  email?: string;
  portfolio?: string;
  experienceSummary?: string;
  companyCount?: number;
  location?: string;
  skills?: string[];
  education?: string;
  phone?: string;
  cvContent?: string;
}

export interface ConversationState {
  step: "gathering_info" | "searching" | "drafting" | "complete" | "chatting";
  profile: UserProfile;
  companies: CompanyInfo[];
  emails: EmailDraft[];
  sentEmails?: EmailDraft[];
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  pendingAttachments?: EmailAttachment[];
  previouslyFoundCompanies?: string[];
  customEmailDraft?: { to?: string; subject?: string; body?: string };
}

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: string;
  contactEmail?: string;
  description?: string;
}

export interface EmailDraft {
  company: string;
  contact_email: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  name: string;
  type: string;
  base64: string;
}

export interface CustomEmailRequest {
  to: string;
  subject: string;
  body: string;
}

const AGENT_SYSTEM_PROMPT = `You are HireMindX, an elite AI career assistant that helps users find companies and send highly personalized cold emails for job outreach.

CRITICAL MEMORY RULES:
- You have COMPLETE MEMORY of this entire conversation and all user data shown below.
- NEVER ask for information that is already provided in USER PROFILE or CV CONTENT.
- If the user attached a CV/resume, ALL their details are extracted below in CV/RESUME CONTENT. USE THEM directly — name, skills, experience, education, etc.
- When the user says "take info from my CV" or "use my CV", respond by summarizing what you found: their name, key skills, experience level, and field. Do NOT ask for info that is already in the CV.
- If CV CONTENT contains skills like "Python, JavaScript, React" etc., INFER their job field automatically (e.g. "Software Engineer/Developer"). Do NOT ask "What is your field?" if the CV already shows it.
- If CV CONTENT is available and shows the user's skills/experience, skip asking for field/role and move directly to asking what they need (outreach type, how many companies, location preference, etc.)
- If asked to "list emails sent" or "show sent emails", refer to EMAILS ALREADY SENT section.

CRITICAL NAME & SIGNATURE RULES:
- The user's name from profile is: "{{NAME}}"
- If that shows "[UNKNOWN", you MUST ask the user for their real name BEFORE drafting or sending ANY emails.
- EVERY email MUST end with "Best regards,\n[user's actual first+last name from profile]"
- NEVER sign emails as "the user", "Job Seeker", "[Your Name]", "[Name]", or any placeholder.
- NEVER use "Dear Recipient" or "Dear Sir/Madam". Always use the company name.
- If the user says "Yes", "Proceed", "Send it", or "Go ahead" after you've drafted an email, you MUST include [ACTION:SEND_EMAILS] at the end of your response.
- If you are unsure about the subject or body for a custom email, ASK the user to provide or confirm them first.

COMPREHENSION RULES:
- Read the user's message carefully. Understand what they are ASKING before responding.
- If the user reports a problem or gives feedback, acknowledge it and address it directly.
- If the user corrects you or says something is wrong, apologize briefly and fix it.
- Pay close attention to the FULL conversation history to understand context.
- If the user refers to something said earlier, look it up in the conversation history.
- Do not repeat information the user already knows. Be concise and action-oriented.

CROSS-CONTEXT EMAIL RULES (VERY IMPORTANT):
- The user may have been researching or chatting BEFORE asking you to send an email.
- If the user says things like "send this as an email to X", "email this to X@gmail.com", "send the above to X", "email that paragraph to X", "send this to my friend at X" — you MUST:
  1. Look back through the CONVERSATION HISTORY to find the content they are referring to (the paragraph, text, article, summary, etc.)
  2. Use that content as the EMAIL BODY, structuring it professionally with a greeting and signature
  3. Draft the full email and show it to the user for confirmation BEFORE sending
  4. Include [ACTION:CUSTOM_EMAIL:{"to":"X","subject":"...","body":"..."}] when ready to send
- If the user provides a recipient email address (e.g. "friend@gmail.com"), ALWAYS extract it and use it as the "to" field.
- If the user says "send it" or "yes" after you show them a draft, include [ACTION:SEND_EMAILS] to actually send.
- NEVER say you can't access previous messages. The full conversation history is provided above. USE IT.


CURRENT USER PROFILE:
{{USER_PROFILE}}

CV/RESUME CONTENT (Extracted from uploaded file):
{{CV_CONTENT}}

COMPANIES FOUND SO FAR:
{{COMPANIES}}

DRAFTED EMAILS (Ready to send):
{{DRAFTED_EMAILS}}

  EMAILS ALREADY SENT (History - Use this when user asks about sent emails):
  {{SENT_EMAILS}}
  
  CRITICAL EMAIL DRAFTING RULES:
  - DO NOT include ANY part of the CONVERSATION HISTORY inside the email body.
  - The email body must ONLY contain the message intended for the recipient.
  - DO NOT include internal reasoning, thought process, or previous chat messages in the [ACTION:CUSTOM_EMAIL] body.
  - If the user provides a message for a custom email, use it EXACTLY as provided, only adding a professional greeting and signature if missing.

  CONVERSATION HISTORY (Last 20 messages):
  {{HISTORY}}

ATTACHED FILES FOR CURRENT SESSION:
{{ATTACHMENTS}}

PARTIAL CUSTOM EMAIL DRAFT (If any):
{{CUSTOM_EMAIL_DRAFT}}

YOUR CAPABILITIES:
1. Find companies in the user's field using real search data (Google Maps + Serper + SerpAPI)
2. Gather contact information automatically — including verified emails and phone numbers via ContactOut AND RocketReach
3. Draft and send HIGHLY PERSONALIZED cold emails via Gmail
4. Send custom emails to ANY recipient - businesses, friends, colleagues, or anyone else
5. Handle file attachments (CVs, portfolios, images, PDFs) - When a user attaches a CV, EXTRACT and REMEMBER all their info
6. Answer questions about companies found, emails sent, or the user's profile from the data above
7. Search for companies in SPECIFIC LOCATIONS when the user mentions a city, country, or region
8. Look up a person's verified email, phone number, and professional info by their LinkedIn profile URL — uses both ContactOut and RocketReach — just say "find contact info for linkedin.com/in/..."
9. Find decision-makers (founders, hiring managers, CTOs, HR) at any company domain — uses both ContactOut and RocketReach
10. Look up contact info for ANY individual person by name (and optionally their company) — uses RocketReach + ContactOut. Say "find email for John Smith at Google" or "get contact info for Jane Doe"
11. Google Maps is used to find real local business addresses, phone numbers, ratings, and websites during company searches

PERSONALIZED EMAIL REQUIREMENTS:
1. RESEARCH each company - mention specific things about them (their industry focus, notable projects, company culture if available)
2. Use the company's actual name in the greeting (e.g., "Dear [Company Name] Team" or "Dear Hiring Team at [Company Name]")
3. Reference the company's specific business area in the email body
4. Tailor the pitch to match what the company does
5. ALWAYS sign with the user's ACTUAL NAME from profile: "{{NAME}}"
6. NEVER use generic phrases like "Dear Recipient", "Dear Sir/Madam", or "[Company]"

IMPORTANT RULES:
1. If the user provides a CV/resume, immediately extract: name, email, phone, skills, experience, education. Store and use this data.
2. NEVER ask for information that is already in the USER PROFILE or CV CONTENT sections above.
3. If asked about sent emails, refer ONLY to the EMAILS ALREADY SENT section - list them clearly.
4. If asked to "send to all emails in the list" or similar, use the email addresses from EMAILS ALREADY SENT.
5. Be conversational, sophisticated, and helpful - never robotic or repetitive.
6. When drafting emails, use SPECIFIC company details to make each email unique and personalized.
7. If you don't have enough information to help, politely ask for ONLY the missing pieces.
8. MANDATORY: You MUST have the user's FULL NAME and a BRIEF WORK SUMMARY before searching or drafting. Check CV CONTENT first!
9. For custom emails, the user must provide: email address, subject, AND message content. Custom emails can be sent to ANYONE — not just businesses. Friends, colleagues, personal contacts, etc.
10. If the user mentions they have attached a file, confirm you've extracted their information from it.
11. NEVER say you cannot send emails or access documents. You have these capabilities.
12. When user specifies a location (e.g. "London", "Dubai"), ALWAYS include it in the SEARCH action.
13. When user specifies a number of companies, use that exact number in the SEARCH action.

RESPONSE FORMAT:
- Be sophisticated and professional
- Keep responses SHORT and CONCISE - 2-4 sentences max for conversational replies
- Do NOT write long paragraphs or over-explain. Get to the point quickly.
- Use markdown formatting when appropriate
- If the user confirms with "yes", "proceed", "send", "okay", "go ahead" for drafted emails, just acknowledge it briefly - the system will handle sending
- NEVER include internal thoughts or reasoning

INTERACTIVE OPTIONS (Use these to make the conversation smarter):
- When asking the user to choose between types of outreach, add: [OPTIONS:Job Outreach|Client Outreach|Business Outreach|Send an Email]
- When asking how many emails to send, add: [OPTIONS:5 emails|10 emails|15 emails|20 emails]
- When the user says their field/role and you can suggest sub-specializations, add options. Example: user says "developer" → [OPTIONS:Web Developer|Mobile App Developer|Backend Developer|Full Stack Developer|Data Engineer]
- When the user says "designer" → [OPTIONS:UI/UX Designer|Graphic Designer|Product Designer|Web Designer]
- When asking for confirmation, add: [OPTIONS:Yes, send them|No, let me review first]
- When asking what to do next, add: [OPTIONS:Search for companies|Send custom email|View sent emails]
- Be SMART about when to show options. Show them whenever there's a natural choice point.
- The [OPTIONS:...] marker must be at the END of your response, after your text message.
- Use pipe | to separate options. Keep each option short (2-5 words).
- Do NOT show options for open-ended questions like "what's your name?" or "describe your experience"

MISSING INFORMATION CHECKING:
- Before searching or drafting, check if you have: name, job field, and a brief work summary.
- If ANY of these are missing, ask for ONLY the missing ones. Do not re-ask what you already know.
- Be direct: "I just need your name to get started." not "Before we proceed, I'd like to gather some information..."
- If the user provides partial info, acknowledge what you have and ask only for what's missing.

ACTION MARKERS (At the END of your response):
- [ACTION:SEARCH|job_field|count|location] - To search for companies (e.g., [ACTION:SEARCH|web development|10|London])
- [ACTION:CUSTOM_EMAIL|recipient_email|email_subject|email_body] - To draft a custom email for review. Use PIPE separators ONLY. Example: [ACTION:CUSTOM_EMAIL|john@example.com|Meeting Request|Hello John, I wanted to reach out...]
- [ACTION:SEND_EMAILS] - To send emails that are already drafted and confirmed by the user
- [ACTION:LOOKUP_LINKEDIN|linkedin_url] - To look up a person's verified email + phone by their LinkedIn URL via ContactOut + RocketReach (e.g., [ACTION:LOOKUP_LINKEDIN|https://linkedin.com/in/johndoe])
- [ACTION:LOOKUP_PERSON|full_name|company_name] - To look up contact info for an individual person by name and optional company via RocketReach + ContactOut (e.g., [ACTION:LOOKUP_PERSON|John Smith|Google] or [ACTION:LOOKUP_PERSON|Jane Doe|]). Use this whenever a user asks for someone's email, phone, or contact information by name.
- [ACTION:FIND_DECISION_MAKERS|company_domain] - To find decision-makers (CEO, CTO, HR, hiring managers) at a company domain via ContactOut + RocketReach (e.g., [ACTION:FIND_DECISION_MAKERS|acmecorp.com])

CRITICAL EMAIL WORKFLOW:
1. When user asks to write/draft/compose an email: Show the draft clearly, then ALWAYS end with "Would you like me to send this email?" or similar confirmation question
2. When user confirms with "yes", "send", "proceed", "go ahead": Do NOT use any action marker - just acknowledge. The system will send automatically.
3. NEVER use [ACTION:CUSTOM_EMAIL] when user is confirming - just say "Sending your email now..." with NO action marker
4. For CUSTOM_EMAIL: Use pipe (|) separators ONLY. NEVER use "to=", "subject=", "body=" prefixes.
5. CORRECT: [ACTION:CUSTOM_EMAIL|john@example.com|Hello|Dear John, ...]
6. WRONG: [ACTION:CUSTOM_EMAIL|to=john@example.com|subject=Hello|body=Dear John, ...]
7. Use the user's actual name "{{NAME}}" in all email signatures, NEVER placeholders
8. ALWAYS ask for confirmation after showing a draft - never assume the user wants to send immediately

WHEN SHOWING EMAIL DRAFTS:
- Show the full email content clearly formatted
- Keep email bodies CONCISE (3-5 short paragraphs max) to avoid truncation
- End your response with: "Would you like me to send this email?" or "Ready to send - just say 'send it' to confirm!"
- DO NOT say "Sending now" until user explicitly confirms
- ALWAYS complete the full email - never leave it unfinished

WHEN USER CONFIRMS (says "yes", "proceed", "send it", "go ahead"):
- Simply respond: "Sending your email now..." 
- Do NOT include any [ACTION:...] marker
- Do NOT re-draft the email
- Do NOT echo the email content back
- The system handles the actual sending automatically

Respond naturally to the user's message:`;

function buildContextualPrompt(state: ConversationState): string {
  const profileParts = [];
  if (state.profile.fullName) profileParts.push(`Name: ${state.profile.fullName}`);
  if (state.profile.jobField) profileParts.push(`Job Field: ${state.profile.jobField}`);
  if (state.profile.location) profileParts.push(`Preferred Location: ${state.profile.location}`);
  if (state.profile.portfolio) profileParts.push(`Portfolio: ${state.profile.portfolio}`);
  if (state.profile.experienceSummary) profileParts.push(`Experience: ${state.profile.experienceSummary}`);
  if (state.profile.email) profileParts.push(`Email: ${state.profile.email}`);
  if (state.profile.phone) profileParts.push(`Phone: ${state.profile.phone}`);
  if (state.profile.skills && state.profile.skills.length > 0) profileParts.push(`Skills: ${state.profile.skills.join(", ")}`);
  if (state.profile.education) profileParts.push(`Education: ${state.profile.education}`);
  if (state.profile.companyCount) profileParts.push(`Desired Company Count: ${state.profile.companyCount}`);
  
  const profileStr = profileParts.length > 0 ? profileParts.join("\n") : "None collected yet";

  const cvContentStr = state.profile.cvContent || "No CV uploaded yet";

  let companiesStr = "None found yet";
  if (state.companies.length > 0) {
    companiesStr = state.companies.map((c, i) => 
      `${i + 1}. ${c.name}${c.address ? ` (${c.address})` : ""}${c.contactEmail ? ` - Email: ${c.contactEmail}` : ""}${c.rating ? ` - Rating: ${c.rating}` : ""}${c.description ? ` - About: ${c.description}` : ""}`
    ).join("\n");
  }

  let sentEmailsStr = "None sent yet";
  if (state.sentEmails && state.sentEmails.length > 0) {
    sentEmailsStr = state.sentEmails.map((e, i) => 
      `${i + 1}. To: ${e.contact_email} (${e.company}) - Subject: "${e.subject}"`
    ).join("\n");
  }

  let draftedEmailsStr = "None drafted yet";
  if (state.emails.length > 0) {
    draftedEmailsStr = state.emails.map((e, i) => 
      `${i + 1}. To: ${e.contact_email} (${e.company}) - Subject: "${e.subject}"\n   Preview: ${e.body.substring(0, 150)}...`
    ).join("\n");
  }

  let historyStr = "New conversation";
  if (state.conversationHistory.length > 0) {
    // Keep last 20 messages with more content for better context retention
    historyStr = state.conversationHistory.slice(-20).map(m => 
      `${m.role.toUpperCase()}: ${m.content.substring(0, 600)}`
    ).join("\n\n");
  }

  let attachmentsStr = "None";
  if (state.pendingAttachments && state.pendingAttachments.length > 0) {
    attachmentsStr = state.pendingAttachments.map(f => `${f.name} (${f.type})`).join(", ");
  }

  let customEmailDraftStr = "None";
  if (state.customEmailDraft && state.customEmailDraft.to) {
    const d = state.customEmailDraft;
    customEmailDraftStr = `**IMPORTANT: A draft email is already waiting for user confirmation!**
Recipient: ${d.to}
Subject: ${d.subject || "Not provided"}
Body Preview: ${d.body ? d.body.substring(0, 200) + "..." : "Not provided"}

If user says "yes", "proceed", "send", etc - DO NOT create another draft. Just acknowledge with "Sending your email now..." and let the system handle it.`;
  }

  return AGENT_SYSTEM_PROMPT
    .replace("{{USER_PROFILE}}", profileStr)
    .replace("{{CV_CONTENT}}", cvContentStr)
    .replace("{{COMPANIES}}", companiesStr)
    .replace("{{DRAFTED_EMAILS}}", draftedEmailsStr)
    .replace("{{SENT_EMAILS}}", sentEmailsStr)
    .replace("{{HISTORY}}", historyStr)
    .replace("{{ATTACHMENTS}}", attachmentsStr)
    .replace("{{CUSTOM_EMAIL_DRAFT}}", customEmailDraftStr)
    .replace(/\{\{NAME\}\}/g, state.profile.fullName || "[UNKNOWN - ASK USER FOR THEIR NAME BEFORE SENDING]");
}

function extractProfileInfo(message: string, currentProfile: UserProfile): UserProfile {
  const profile = { ...currentProfile };
  const lowerMsg = message.toLowerCase();

  // Name extraction - expanded patterns
  const namePatterns = [
    /(?:my name is|i'm|i am|call me|this is|it's|it is)\s+([A-Za-z][\w'.]+(?:\s+[A-Za-z][\w'.]+){0,3})/i,
    /(?:name(?:\s+is)?)\s*[:=]\s*([A-Za-z][\w'.]+(?:\s+[A-Za-z][\w'.]+){0,3})/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/m, // Full name on its own line (e.g. "Jihan Ahmed")
  ];
  
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && match[1].length > 2 && match[1].length < 50) {
      const potentialName = match[1].trim();
      const lowerName = potentialName.toLowerCase();
      // Avoid common non-name words and confirmation phrases
      const stopWords = ["send", "email", "search", "this", "that", "london", "dubai", "uk", "find", "companies", "results", "work", "job", "good", "okay", "yes", "no", "proceed", "go", "ahead", "sure", "ok", "confirm", "please", "thanks", "thank", "great", "perfect", "done", "stop", "cancel", "hello", "hi", "hey"];
      if (!stopWords.some(word => lowerName.includes(word))) {
        profile.fullName = potentialName;
        break;
      }
    }
  }

  // Field extraction - more strict to avoid capturing non-job text
  const fieldPatterns = [
    /(?:looking for|interested in|work in|field is|expertise is|industry is|specialization is)\s+([a-zA-Z\s\/&-]{3,40}?)(?:\s+(?:roles?|jobs?|positions?|companies|in|at|near)|[.!?,]|$)/i,
    /(?:i'm a|i am a|work as a?|position as a?)\s+([a-zA-Z\s\/&-]{3,40}?)(?:\s+(?:roles?|jobs?|in|at|developer|engineer|designer)|[.!?,]|$)/i,
  ];

  for (const pattern of fieldPatterns) {
    const match = message.match(pattern);
    if (match && match[1].length > 3 && match[1].length < 50) {
      const potentialField = match[1].trim();
      // Avoid capturing sentences or non-job-related text
      const invalidWords = ["attach", "file", "send", "email", "that", "with", "all", "have", "the", "remember"];
      const hasInvalidWord = invalidWords.some(w => potentialField.toLowerCase().includes(w));
      if (!hasInvalidWord) {
        profile.jobField = potentialField;
        break;
      }
    }
  }

    // Location extraction - more robust to avoid false positives and catch more variations
    const locationPatterns = [
      /(?:in|at|based in|located in|from|to|near)\s+([A-Z][\w\s]{2,}(?:,\s*[A-Z][\w\s]+)?)/i,
      /(?:location(?:\s+is)?)\s*[:=]\s*([A-Z][\w\s]{2,})/i,
      /\b(london|dubai|united kingdom|uk|usa|united states|new york|berlin|paris|tokyo|canada|australia|uae|emirates|san francisco|california|texas|florida|austin|seattle|boston|chicago|toronto|vancouver|sydney|melbourne|singapore|hong kong|amsterdam|madrid|rome)\b/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = message.match(pattern);
      if (match) {
        const loc = match[1] || match[0];
        const lowerLoc = loc.toLowerCase().trim();
        const stopWords = ["the", "a", "an", "this", "that", "my", "your", "work", "send", "email", "search", "find", "companies", "experience", "years", "portfolio", "job", "field", "name", "good", "great", "yes", "please"];
        if (loc.length > 2 && !stopWords.includes(lowerLoc)) {
          // Always capitalize the first letter for consistency in search but keep the rest as is
          profile.location = loc.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          break;
        }
      }
    }

  // Count extraction - smarter matching for various ways of saying numbers
  const countWords: { [key: string]: number } = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "fifteen": 15, "twenty": 20
  };

  const countMatch = message.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\s*(?:companies|emails|results|leads|businesses|firms|places|results|leads)\b/i);
  if (countMatch) {
    const val = countMatch[1].toLowerCase();
    profile.companyCount = countWords[val] || parseInt(val);
  }

  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|linkedin\.com\/[^\s]+)/i;
  const urlMatch = message.match(urlPattern);
  if (urlMatch) {
    profile.portfolio = urlMatch[1];
  }

  // Experience/Summary extraction
  if (lowerMsg.includes("experience") || lowerMsg.includes("worked") || lowerMsg.includes("years") || lowerMsg.includes("expert") || lowerMsg.includes("background")) {
    if (message.length > 20 && message.length < 500) {
      profile.experienceSummary = message;
    }
  }

  // Skills extraction
  const skillsPatterns = [
    /(?:skills|expertise|proficient in|experienced with|know|familiar with)[:=]?\s*([^.!?\n]+)/i,
    /(?:i know|i can use|i work with)\s+([^.!?\n]+)/i,
  ];
  
  for (const pattern of skillsPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const skillsText = match[1].trim();
      const extractedSkills = skillsText.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
      if (extractedSkills.length > 0) {
        profile.skills = [...(profile.skills || []), ...extractedSkills];
        // Remove duplicates
        profile.skills = [...new Set(profile.skills)];
      }
    }
  }

  // Phone extraction
  const phonePattern = /(?:phone|mobile|cell|tel|contact)[:=\s]*([+]?[\d\s\-().]{8,20})/i;
  const phoneMatch = message.match(phonePattern);
  if (phoneMatch) {
    profile.phone = phoneMatch[1].trim();
  }

  // Education extraction
  const educationPatterns = [
    /(?:degree in|studied|graduated from|bachelor|master|phd|diploma|university|college)\s+([^.!?\n]{5,100})/i,
  ];
  
  for (const pattern of educationPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      profile.education = match[1].trim();
      break;
    }
  }

  return profile;
}

async function extractCVContent(attachments: EmailAttachment[]): Promise<{ content: string; extractedProfile: Partial<UserProfile> }> {
  let content = "";
  const extractedProfile: Partial<UserProfile> = {};
  
  for (const attachment of attachments) {
    if (attachment.type === 'application/pdf' || 
        attachment.type === 'application/msword' || 
        attachment.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        attachment.type === 'text/plain') {
      
      try {
        // For text files, decode directly
        if (attachment.type === 'text/plain') {
          const base64Data = attachment.base64.includes(',') 
            ? attachment.base64.split(',')[1] 
            : attachment.base64;
          content = Buffer.from(base64Data, 'base64').toString('utf-8');
          } else {
              // For PDFs and docs, use pdf-parse to extract text, then Mistral to structure it
              const base64Data = attachment.base64.includes(',') 
                ? attachment.base64.split(',')[1] 
                : attachment.base64;
              
              let rawText = "";
              
              // Extract raw text from PDF using pdf-parse
              if (attachment.type === 'application/pdf') {
                try {
                    const pdfBuffer = Buffer.from(base64Data, 'base64');
                    const pdfParseMod = await import('pdf-parse/lib/pdf-parse.js');
                    const pdfParseFunc = (pdfParseMod.default || pdfParseMod) as (buffer: Buffer) => Promise<{ text?: string }>;
                    const pdfData = await pdfParseFunc(pdfBuffer);
                  rawText = pdfData.text || "";
                  console.log("PDF text extracted:", rawText.length, "chars");
                } catch (pdfErr) {
                  console.error("pdf-parse failed:", pdfErr);
                }
              }
              
              // If pdf-parse got text, send it to Mistral for structured extraction
              // If not (e.g. scanned PDF or Word doc), fall back to Mistral document understanding
                if (rawText.length > 50) {
                  // Use secondary key for CV parsing so primary key stays free for agent reasoning
                  const response = await mistralSecondary.chat.complete({
                  model: "mistral-small-latest",
                  messages: [
                    { 
                      role: "user", 
                      content: `You are a CV/resume parser. Extract ALL information from this CV text and return it in a structured format. Include:
- Full Name
- Email
- Phone
- Location/Address
- Skills (list ALL technical and soft skills)
- Work Experience (summarize each role)
- Education
- Portfolio/LinkedIn/GitHub links
- Any certifications or achievements

CV TEXT:
${rawText.substring(0, 4000)}

Return the information clearly labeled. Be thorough — extract every detail you can find.`
                    },
                  ],
                  maxTokens: 1500,
                });
                content = (response.choices?.[0]?.message?.content as string) || "";
                } else {
                  // Fallback: try Mistral document understanding for scanned PDFs/Word docs
                  const mimeType = attachment.type || 'application/pdf';
                  const dataUri = `data:${mimeType};base64,${base64Data}`;
                  
                  // Use secondary key for document understanding
                  const response = await mistralSecondary.chat.complete({
                  model: "mistral-small-latest",
                  messages: [
                    { 
                      role: "user", 
                      content: [
                        {
                          type: "text" as const,
                          text: `You are a CV/resume parser. Extract ALL information from this uploaded document and return it in a structured format. Include:
- Full Name
- Email
- Phone
- Location/Address
- Skills (list ALL technical and soft skills)
- Work Experience (summarize each role)
- Education
- Portfolio/LinkedIn/GitHub links
- Any certifications or achievements

Return the information clearly labeled. Be thorough — extract every detail you can find.`
                        },
                        {
                          type: "document_url" as const,
                          document_url: dataUri
                        } as any
                      ]
                    },
                  ],
                  maxTokens: 1500,
                });
                content = (response.choices?.[0]?.message?.content as string) || "";
              }
              console.log("CV extraction result length:", content.length, "chars");
            }
        
        // Extract profile info from CV content
        if (content) {
          // Name extraction from CV - try multiple patterns
          const namePatterns = [
            /(?:full name|name)[:\s]*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/i,
            /^\*?\*?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\*?\*?\s*$/m, // Bold or plain name on its own line
            /^#+ ([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/m, // Markdown heading with name
          ];
          for (const pat of namePatterns) {
            const nameMatch = content.match(pat);
            if (nameMatch && nameMatch[1] && nameMatch[1].length < 50) {
              extractedProfile.fullName = nameMatch[1].trim();
              break;
            }
          }
          
          // Email extraction
          const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) extractedProfile.email = emailMatch[0];
          
          // Phone extraction
          const phoneMatch = content.match(/(?:phone|mobile|tel)[:\s]*([+]?[\d\s\-().]{8,20})/i);
          if (phoneMatch) extractedProfile.phone = phoneMatch[1].trim();
          
          // Skills extraction
          const skillsMatch = content.match(/(?:skills|expertise|technologies)[:\s]*([^\n]+(?:\n[^\n]+)*)/i);
          if (skillsMatch) {
            const skills = skillsMatch[1].split(/[,;|\n]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
            if (skills.length > 0) extractedProfile.skills = skills;
          }
          
          // Experience summary
          const expMatch = content.match(/(?:experience|work history|employment)[:\s]*([^\n]+(?:\n[^\n]+){0,3})/i);
          if (expMatch) extractedProfile.experienceSummary = expMatch[1].trim().substring(0, 300);
          
          // Education
          const eduMatch = content.match(/(?:education|degree|university|college)[:\s]*([^\n]+)/i);
          if (eduMatch) extractedProfile.education = eduMatch[1].trim();
          
          // Portfolio/LinkedIn
          const linkedinMatch = content.match(/linkedin\.com\/[^\s\n]+/i);
          const githubMatch = content.match(/github\.com\/[^\s\n]+/i);
          const portfolioMatch = content.match(/(?:portfolio|website)[:\s]*(https?:\/\/[^\s\n]+)/i);
          
          if (linkedinMatch) extractedProfile.portfolio = linkedinMatch[0];
          else if (githubMatch) extractedProfile.portfolio = githubMatch[0];
          else if (portfolioMatch) extractedProfile.portfolio = portfolioMatch[1];
        }
      } catch (error) {
        console.error("Error extracting CV content:", error);
      }
    }
  }
  
  return { content, extractedProfile };
}

function detectEmailDraftInText(response: string, state: ConversationState): { to?: string; subject?: string; body?: string } | null {
  const draft: { to?: string; subject?: string; body?: string } = {};
  
  // Look for subject line
  const subjectMatch = response.match(/(?:\*\*)?Subject(?:\*\*)?:\s*([^\n]+)/i);
  if (subjectMatch) {
    draft.subject = subjectMatch[1].replace(/[\*\n]/g, '').trim();
  }
  
  // Find recipient email in the response itself
  const emailInResponse = response.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailInResponse) {
    draft.to = emailInResponse[1];
  } else {
    // Search USER messages in reverse order for email addresses
    const userMessages = state.conversationHistory.filter(m => m.role === "user").reverse();
    for (const msg of userMessages) {
      const emailInMsg = msg.content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailInMsg) {
        draft.to = emailInMsg[1];
        break;
      }
    }
  }
  
  // Look for email body - text starting with a greeting until a signature or end
  const fullBodyMatch = response.match(/(?:Dear|Hi|Hello)\s+[^,:]+[,:\s]+[\s\S]+?(?:(?:Best regards|Warm regards|Sincerely|Cheers|Kind regards|Thanks)[,\s]*[\s\n]*(?:[A-Z][a-zA-Z\s]*)?(?:\n|$)|$)/i);
  
  const altBodyMatch = response.match(/---[\s\n]+([\s\S]+?)(?:---|\[ATTACHMENT|$)/i);
  
  if (fullBodyMatch && fullBodyMatch[0]) {
    draft.body = fullBodyMatch[0].replace(/\*\*/g, '').replace(/\*/g, '').trim();
  } else if (altBodyMatch && altBodyMatch[1]) {
    draft.body = altBodyMatch[1].replace(/\*\*/g, '').replace(/\*/g, '').replace(/\[ATTACHMENT:.*?\]/gi, '').trim();
  } else if (draft.subject) {
    // If we have a subject but no explicit greeting, treat the text after the subject as the body
    const textAfterSubject = response.split(subjectMatch![0])[1];
    if (textAfterSubject && textAfterSubject.trim().length > 20) {
      draft.body = textAfterSubject.replace(/\*\*/g, '').replace(/\*/g, '').trim();
    }
  }
  
  // Only return if we have at least subject and body
  if (draft.subject && draft.body && draft.body.length > 20) {
    return draft;
  }
  
  return null;
}

function parseActionFromResponse(response: string): { cleanResponse: string; action?: { type: string; params: string[] } } {
  let processedResponse = response
    .replace(/\[?Internal message:?[\s\S]*?(?=\[?ACTION:|$)/gi, "")
    .replace(/\[?Reasoning:?[\s\S]*?(?=\[?ACTION:|$)/gi, "")
    .replace(/\[?Thought:?[\s\S]*?(?=\[?ACTION:|$)/gi, "")
    .replace(/\[?Reasoning thought:?[\s\S]*?(?=\[?ACTION:|$)/gi, "")
    .replace(/\[?Internal reasoning:?[\s\S]*?(?=\[?ACTION:|$)/gi, "")
    .replace(/\[?Analysis:?[\s\S]*?(?=\[?ACTION:|$)/gi, "")
    .trim();

  const actionMatch = processedResponse.match(/\[ACTION:([^\]]+(?:\[[^\]]*\][^\]]*)*)\]/i);
  
  if (actionMatch) {
    const rawAction = actionMatch[1];
    const fullMatch = actionMatch[0];
    const actionStartIndex = processedResponse.indexOf(fullMatch);
    const cleanResponse = (processedResponse.substring(0, actionStartIndex) + processedResponse.substring(actionStartIndex + fullMatch.length)).trim();
    
    return processAction(rawAction, cleanResponse);
  }

  const looseActionMatch = processedResponse.match(/ACTION\s*:\s*(SEARCH|SEND_EMAILS|CUSTOM_EMAIL)[^.\n\r]*/i);
  if (looseActionMatch) {
    const fullActionText = looseActionMatch[0];
    const rawAction = fullActionText.replace(/ACTION\s*:\s*/i, "").trim();
    const cleanResponse = processedResponse.replace(fullActionText, "").trim();
    const finalCleanResponse = cleanResponse.replace(/^\]|\]$/, "").trim();
    return processAction(rawAction, finalCleanResponse);
  }

  const actionStartIndex = processedResponse.lastIndexOf("[ACTION:");
  const lastBracketIndex = processedResponse.lastIndexOf("]");
  if (actionStartIndex !== -1 && lastBracketIndex !== -1 && lastBracketIndex > actionStartIndex) {
    const rawAction = processedResponse.substring(actionStartIndex + 8, lastBracketIndex);
    const cleanResponse = (processedResponse.substring(0, actionStartIndex) + processedResponse.substring(lastBracketIndex + 1)).trim();
    return processAction(rawAction, cleanResponse);
  }
  
  return { cleanResponse: processedResponse };
}

function processAction(rawAction: string, cleanResponse: string): { cleanResponse: string; action?: { type: string; params: string[] } } {
  const firstDelimIndex = rawAction.search(/[|:]/);
  const actionType = firstDelimIndex === -1 ? rawAction.trim() : rawAction.substring(0, firstDelimIndex).trim();
  
  if (actionType === "CUSTOM_EMAIL") {
    const afterType = rawAction.substring(actionType.length + 1);
    const params: string[] = [];
    
    // Handle multiple formats the AI might use:
    // Format 1: to|subject|body (pipe-separated, correct)
    // Format 2: to=email|subject=...|body=... (equals-prefixed, malformed)
    // Format 3: jihanahmed486@gmail.com|Birthday Wishes|... (values directly)
    
    // First, clean up any "to=", "subject=", "body=" prefixes the AI might add
    let cleanedAction = afterType;
    
    // Check if using equals format: to=value|subject=value|body=value
    if (/(?:to|recipient|email)\s*=/i.test(cleanedAction)) {
      // Parse equals-format: extract actual values
      const toMatch = cleanedAction.match(/(?:to|recipient|email)\s*=\s*([^|]+)/i);
      const subjectMatch = cleanedAction.match(/subject\s*=\s*([^|]+)/i);
      // Body is everything after body=
      const bodyMatch = cleanedAction.match(/body\s*=\s*([\s\S]+)$/i);
      
      const to = toMatch ? toMatch[1].trim() : "";
      const subject = subjectMatch ? subjectMatch[1].trim() : "";
      const body = bodyMatch ? bodyMatch[1].trim() : "";
      
      params.push(to, subject, body);
    } else {
      // Standard pipe-separated format
      const firstPipe = afterType.indexOf("|");
      const secondPipe = afterType.indexOf("|", firstPipe + 1);
      
      if (firstPipe !== -1 && secondPipe !== -1) {
        let to = afterType.substring(0, firstPipe).trim();
        // Clean up common AI prefixing in 'to' field
        to = to.replace(/^(to|recipient|email|target):\s*/i, "").trim();
        
        let subject = afterType.substring(firstPipe + 1, secondPipe).trim();
        subject = subject.replace(/^subject:\s*/i, "").trim();
        
        let body = afterType.substring(secondPipe + 1).trim();
        body = body.replace(/^body:\s*/i, "").trim();
        
        params.push(to, subject, body);
      } else {
        const parts = afterType.split("|");
        let to = parts[0]?.trim() || "";
        to = to.replace(/^(to|recipient|email|target):\s*/i, "").trim();
        
        let subject = parts[1]?.trim() || "";
        subject = subject.replace(/^subject:\s*/i, "").trim();
        
        let body = parts.slice(2).join("|").trim();
        body = body.replace(/^body:\s*/i, "").trim();
        
        params.push(to, subject, body);
      }
    }
    return { cleanResponse, action: { type: actionType, params } };
  }
  
  if (actionType === "SEARCH") {
    const afterType = rawAction.substring(actionType.length + 1);
    const parts = afterType.split("|");
    
    // Improved SEARCH parsing: [ACTION:SEARCH|field|count|location]
    // Handle cases where count might be missing but location is there, or vice versa
    let jobField = "";
    let count = "10";
    let location = "";

    if (parts.length >= 3) {
      jobField = parts[0].trim();
      // Check if second part is a number
      if (/^\d+$/.test(parts[1].trim())) {
        count = parts[1].trim();
        location = parts.slice(2).join("|").trim();
      } else {
        // Second part is likely location, count is missing
        count = "10";
        location = parts.slice(1).join("|").trim();
      }
    } else if (parts.length === 2) {
      jobField = parts[0].trim();
      const secondPart = parts[1].trim();
      if (/^\d+$/.test(secondPart)) {
        count = secondPart;
      } else {
        location = secondPart;
      }
    } else if (parts.length === 1) {
      jobField = parts[0].trim();
    }

    return { cleanResponse, action: { type: actionType, params: [jobField, count, location] } };
  }
  
  const delimiter = rawAction.includes("|") ? "|" : ":";
  const parts = rawAction.split(delimiter);
  const params = parts.slice(1).map(p => p.trim());
  return { cleanResponse, action: { type: actionType, params } };
}

// ─── ContactOut helpers ───────────────────────────────────────────────────────

/**
 * Look up a person's contact info by their LinkedIn profile URL.
 * Returns the first verified email + phone found, or null.
 */
async function contactOutByLinkedIn(linkedinUrl: string): Promise<{ email?: string; phone?: string; name?: string } | null> {
  const apiKey = process.env.CONTACTOUT_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.contactout.com/v1/linkedin/enrich?profile=${encodeURIComponent(linkedinUrl)}`;
    const res = await fetch(url, {
      headers: { token: apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const profile = data.profile || data;
    const emails: string[] = profile.emails || [];
    const phones: string[] = profile.phones || [];
    const name: string = profile.name || "";
    return {
      email: emails[0],
      phone: phones[0],
      name: name || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Enrich a person by name + company domain.
 * Useful when we have a contact name but no LinkedIn URL.
 */
async function contactOutEnrichPerson(fullName: string, domain: string): Promise<{ email?: string; phone?: string } | null> {
  const apiKey = process.env.CONTACTOUT_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.contactout.com/v1/people/search", {
      method: "POST",
      headers: { token: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ name: fullName, company_domain: domain, reveal_info: true }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const profile = data.profile || data;
    const emails: string[] = profile.emails || [];
    const phones: string[] = profile.phones || [];
    return { email: emails[0], phone: phones[0] };
  } catch {
    return null;
  }
}

/**
 * Find decision-maker emails for a company domain.
 * Returns up to 3 contacts (name + email) sorted by seniority.
 */
async function contactOutDecisionMakers(domain: string): Promise<{ name: string; email: string; title?: string }[]> {
  const apiKey = process.env.CONTACTOUT_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.contactout.com/v1/people/search", {
      method: "POST",
      headers: { token: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ company_domain: domain, reveal_info: true }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Response has profiles as an object keyed by linkedin URL
    const profilesObj: Record<string, any> = data.profiles || {};
    const people = Object.values(profilesObj);
    return people
      .filter((p: any) => p.email || (p.emails && p.emails.length > 0))
      .slice(0, 3)
      .map((p: any) => ({
        name: p.full_name || p.name || "",
        email: p.email || (p.emails && p.emails[0]) || "",
        title: p.title || p.job_title || undefined,
      }));
  } catch {
    return [];
  }
}

// ─── RocketReach helpers ──────────────────────────────────────────────────────

const RR_BASE = "https://api.rocketreach.co/api/v2";

interface RRContact {
  name?: string;
  title?: string;
  current_employer?: string;
  emails?: { email: string; type?: string; grade?: string }[];
  phones?: { number: string; type?: string }[];
  linkedin_url?: string;
  status?: string;
}

/**
 * Look up a person by LinkedIn URL (or name + employer) via RocketReach.
 * Polls up to 3 times if the initial status is "searching".
 */
async function rocketReachLookup(
  opts: { linkedin_url?: string; name?: string; current_employer?: string }
): Promise<{ name?: string; title?: string; email?: string; phone?: string } | null> {
  const apiKey = process.env.ROCKETREACH_API_KEY;
  if (!apiKey) return null;
  try {
    const params = new URLSearchParams();
    if (opts.linkedin_url) params.set("linkedin_url", opts.linkedin_url);
    if (opts.name) params.set("name", opts.name);
    if (opts.current_employer) params.set("current_employer", opts.current_employer);

    const url = `${RR_BASE}/person/lookup?${params.toString()}`;
    const res = await fetch(url, { headers: { "Api-Key": apiKey, "Content-Type": "application/json" } });
    if (!res.ok) return null;
    let data: RRContact = await res.json();

    // Poll up to 3x if async lookup is still searching
    if (data.status === "searching") {
      for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const poll = await fetch(url, { headers: { "Api-Key": apiKey, "Content-Type": "application/json" } });
        if (!poll.ok) break;
        data = await poll.json();
        if (data.status === "complete") break;
      }
    }

    const bestEmail = (data.emails || []).sort((a, b) => {
      // Prefer grade A > B > others, and professional > personal
      const gradeScore = (g?: string) => g === "A" ? 2 : g === "B" ? 1 : 0;
      return gradeScore(b.grade) - gradeScore(a.grade);
    })[0]?.email;

    const bestPhone = (data.phones || [])[0]?.number;

    if (!bestEmail && !bestPhone) return null;
    return { name: data.name, title: data.title, email: bestEmail, phone: bestPhone };
  } catch {
    return null;
  }
}

/**
 * Search for people at a company domain via RocketReach person/search.
 * Returns up to 3 results with IDs so we can do a targeted lookup.
 */
async function rocketReachSearchAtDomain(domain: string): Promise<{ name?: string; title?: string; email?: string; phone?: string }[]> {
  const apiKey = process.env.ROCKETREACH_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`${RR_BASE}/person/search`, {
      method: "POST",
      headers: { "Api-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: {
            company_domain: [domain],
            current_title: ["CEO", "CTO", "Founder", "Co-Founder", "Hiring Manager", "Head of Engineering", "HR Manager"],
          },
          start: 1,
          page_size: 3,
        }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const profiles: any[] = data.profiles || data.results || [];

    // For each profile returned by search, do a targeted lookup to get actual emails
    const results: { name?: string; title?: string; email?: string; phone?: string }[] = [];
    for (const p of profiles.slice(0, 3)) {
      const linkedinUrl: string | undefined = p.linkedin_url;
      const name: string | undefined = p.name;
      const employer: string | undefined = p.current_employer;

      const contact = await rocketReachLookup(
        linkedinUrl ? { linkedin_url: linkedinUrl } : { name, current_employer: employer }
      );
      if (contact?.email) {
        results.push({ name: contact.name || name, title: contact.title || p.current_title, email: contact.email, phone: contact.phone });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function extractEmailWithApify(websiteUrl: string): Promise<string | null> {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) return null;

  try {
    const actorId = "vdrmota/contact-info-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;
    const response = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: websiteUrl }],
        maxDepth: 1,
        maxPagesPerStartUrl: 3,
      }),
    });
    if (!response.ok) return null;
    const results = await response.json();
    if (Array.isArray(results) && results.length > 0) {
      for (const result of results) {
        if (result.emails && result.emails.length > 0) {
          return result.emails[0];
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function searchWithSerper(query: string, count: number): Promise<CompanyInfo[]> {
  const serperApiKey = process.env.SERPER_API_KEY;
  if (!serperApiKey) return [];
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: count }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    
    // Filter out job board results and extract real company names
    const jobBoardDomains = ["indeed.com", "linkedin.com", "glassdoor.com", "ziprecruiter.com", "monster.com", "careerbuilder.com", "simplyhired.com"];
    
    return (data.organic || [])
      .filter((item: any) => {
        const link = (item.link || "").toLowerCase();
        return !jobBoardDomains.some(d => link.includes(d));
      })
      .map((item: any) => {
        const snippet = item.snippet || "";
        const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        // Extract company name: take first segment before common delimiters, clean up
        let name = item.title.split(/\s*[-|–—:]\s*/)[0].trim();
        // Remove common suffixes like "Jobs", "Careers", "Hiring", etc.
        name = name.replace(/\s+(Jobs|Careers|Hiring|Employment|Recruitment|Vacancies|Openings)\s*$/i, "").trim();
        return {
          name,
          website: item.link,
          contactEmail: emailMatch ? emailMatch[0] : undefined,
          description: snippet,
        };
      });
  } catch {
    return [];
  }
}

async function searchCompanies(query: string, count: number, location?: string, excludeCompanies?: string[]): Promise<CompanyInfo[]> {
  const serpApiKey = process.env.SERPAPI_KEY;
  const serperApiKey = process.env.SERPER_API_KEY;
  const companies: CompanyInfo[] = [];
  const excludeSet = new Set((excludeCompanies || []).map(c => c.toLowerCase()));

  // Ensure location is part of the query for better accuracy
  const searchQuery = location ? `${query} in ${location}` : query;

  try {
    if (serpApiKey) {
      console.log(`Searching Google Maps for: ${searchQuery}`);
      const mapsParams: any = {
        engine: "google_maps",
        api_key: serpApiKey,
        q: searchQuery,
        type: "search",
      };
      
      const mapsResult = await getJson(mapsParams);

      for (const place of mapsResult.local_results || []) {
        if (companies.length >= count) break;
        const companyName = place.title || "Unknown Business";
        if (excludeSet.has(companyName.toLowerCase())) continue;
        
        companies.push({
          name: companyName,
          address: place.address,
          phone: place.phone,
          website: place.website,
          rating: place.rating ? `${place.rating} stars (${place.reviews || 0} reviews)` : undefined,
          description: place.type || place.types?.join(", "),
        });
      }
    }

    if (companies.length < count && serperApiKey) {
      const serperResults = await searchWithSerper(`${searchQuery} companies hiring`, count - companies.length);
      for (const company of serperResults) {
        if (companies.length >= count) break;
        if (excludeSet.has(company.name.toLowerCase())) continue;
        if (!companies.some(c => c.name.toLowerCase() === company.name.toLowerCase())) {
          companies.push(company);
        }
      }
    }

    if (companies.length < count && serpApiKey) {
      const result = await getJson({
        engine: "google",
        api_key: serpApiKey,
        q: `${searchQuery} companies email contact -site:linkedin.com -site:indeed.com`,
        num: Math.min(count * 2, 20),
      });

      const jobBoardDomains = ["indeed.com", "linkedin.com", "glassdoor.com", "ziprecruiter.com", "monster.com", "careerbuilder.com", "simplyhired.com"];
      for (const item of result.organic_results || []) {
        if (companies.length >= count) break;
        const link = (item.link || "").toLowerCase();
        if (jobBoardDomains.some(d => link.includes(d))) continue;
        const snippet = item.snippet || "";
        const title = item.title || "";
        const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        let companyName = title.split(/\s*[-|–—:]\s*/)[0].trim();
        companyName = companyName.replace(/\s+(Jobs|Careers|Hiring|Employment|Recruitment|Vacancies|Openings)\s*$/i, "").trim();
        
        if (companyName && companyName.length > 2 && 
            !excludeSet.has(companyName.toLowerCase()) &&
            !companies.some(c => c.name.toLowerCase() === companyName.toLowerCase())) {
          companies.push({
            name: companyName,
            website: item.link,
            contactEmail: emailMatch ? emailMatch[0] : undefined,
            description: snippet.substring(0, 200),
          });
        }
      }
    }
  } catch (error) {
    console.error("Search error:", error);
  }

  return companies;
}

async function findCompanyEmail(company: CompanyInfo): Promise<string | undefined> {
  if (company.contactEmail) return company.contactEmail;
  if (!company.website) return undefined;
  const serpApiKey = process.env.SERPAPI_KEY;
  const serperApiKey = process.env.SERPER_API_KEY;
  try {
    const domain = new URL(company.website).hostname.replace("www.", "");

    // 1️⃣ ContactOut: decision-makers (highest quality — real verified contacts)
    const decisionMakers = await contactOutDecisionMakers(domain);
    if (decisionMakers.length > 0 && decisionMakers[0].email) {
      console.log(`ContactOut decision-maker found for ${domain}: ${decisionMakers[0].email}`);
      // Attach all found contacts to the company for richer email targeting
        company.contactEmail = decisionMakers[0].email;
        if (decisionMakers[0].name) {
          company.description = (company.description ? company.description + " | " : "") +
            `Contact: ${decisionMakers[0].name}${decisionMakers[0].title ? ` (${decisionMakers[0].title})` : ""}`;
        }
        return decisionMakers[0].email;
      }

      // 2️⃣ RocketReach: search for decision-makers at domain
      const rrContacts = await rocketReachSearchAtDomain(domain);
      if (rrContacts.length > 0 && rrContacts[0].email) {
        console.log(`RocketReach found contact for ${domain}: ${rrContacts[0].email}`);
        company.contactEmail = rrContacts[0].email;
        if (rrContacts[0].name) {
          company.description = (company.description ? company.description + " | " : "") +
            `Contact: ${rrContacts[0].name}${rrContacts[0].title ? ` (${rrContacts[0].title})` : ""}`;
        }
        return rrContacts[0].email;
      }

      // 3️⃣ Apify scraper
    const apifyEmail = await extractEmailWithApify(company.website);
    if (apifyEmail) return apifyEmail;

    // 4️⃣ Serper site search
    if (serperApiKey) {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `site:${domain} email contact`, num: 5 }),
      });
      if (response.ok) {
        const data = await response.json();
        for (const item of data.organic || []) {
          const snippet = (item.snippet || "") + " " + (item.title || "");
          const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) return emailMatch[0];
        }
      }
    }

      // 5️⃣ SerpAPI site search
    if (serpApiKey) {
      const result = await getJson({
        engine: "google",
        api_key: serpApiKey,
        q: `site:${domain} email contact`,
        num: 5,
      });
      for (const item of result.organic_results || []) {
        const snippet = (item.snippet || "") + " " + (item.title || "");
        const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) return emailMatch[0];
      }
    }

    // 5️⃣ Fallback: generic info@ address
    return `info@${domain}`;
  } catch {
    return undefined;
  }
}

async function generateEmailDraft(profile: UserProfile, company: CompanyInfo): Promise<EmailDraft | null> {
  // Block email generation if we don't have the user's real name
  if (!profile.fullName) {
    console.warn("Cannot generate email draft: user's full name is unknown");
    return null;
  }
  
  try {
    const skillsStr = profile.skills && profile.skills.length > 0 ? profile.skills.join(", ") : "";
    
    const prompt = `Write a highly personalized cold email for a job seeker applying to a SPECIFIC company.

CRITICAL REQUIREMENTS:
1. Start with "Dear ${company.name} Team" or "Dear Hiring Team at ${company.name}" - NEVER use "Dear Recipient" or generic greetings
2. Reference something SPECIFIC about the company in the first paragraph (use the company info below)
3. Tailor the pitch to match what the company does
4. Return ONLY the email body text - NO preamble
5. Use plain text only, max 120 words
6. MANDATORY: End with "Best regards,\n${profile.fullName}" - use this EXACT name, no substitutions
7. NEVER use placeholders like "[Your Name]", "[Name]", "[Company]", "[specific project/tech stack]", "[mention some work]", or ANY text in square brackets
8. Use REAL, SPECIFIC details from the company info and job seeker profile — NO generic filler text

JOB SEEKER PROFILE:
- Name: ${profile.fullName}
- Field: ${profile.jobField || "Professional"}
- Experience: ${profile.experienceSummary || "Experienced professional"}
- Skills: ${skillsStr || "Various professional skills"}
- Portfolio: ${profile.portfolio || "Available upon request"}

COMPANY INFORMATION (USE THIS TO PERSONALIZE):
- Company Name: ${company.name}
- Location: ${company.address || "Not specified"}
- Industry/Type: ${company.description || "Business services"}
- Rating: ${company.rating || "Not available"}
- Website: ${company.website || "Not available"}

Write an email that shows genuine interest in THIS specific company, not a generic template.`;

      // Use secondary key for email drafting — frees primary key for agent reasoning simultaneously
      const response = await mistralSecondary.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: "You are an expert career consultant who writes highly personalized cold emails. Each email must be unique and reference specific details about the target company. NEVER use generic greetings like 'Dear Recipient' - always use the company name." },
          { role: "user", content: prompt },
        ],
        maxTokens: 600,
        temperature: 0.75,
      });
    let emailBody = (response.choices?.[0]?.message?.content as string) || "";
    emailBody = emailBody.replace(/^Here is your email:|^Subject:.*?\n/i, "").trim();
    if (emailBody.includes("Subject:")) {
      emailBody = emailBody.split("\n").filter(line => !line.startsWith("Subject:")).join("\n").trim();
    }
    
    // Ensure proper greeting - replace any generic greetings
    emailBody = emailBody.replace(/Dear Recipient,?/gi, `Dear ${company.name} Team,`);
    emailBody = emailBody.replace(/Dear Sir\/Madam,?/gi, `Dear ${company.name} Team,`);
    emailBody = emailBody.replace(/Dear Hiring Manager,?/gi, `Dear Hiring Team at ${company.name},`);
    emailBody = emailBody.replace(/\[Company\]/gi, company.name);
    emailBody = emailBody.replace(/\[Company Name\]/gi, company.name);
    
      // Ensure signature has user's name
      if (profile.fullName) {
        emailBody = emailBody.replace(/\[Your Name\]/gi, profile.fullName);
        emailBody = emailBody.replace(/\[Name\]/gi, profile.fullName);
        emailBody = emailBody.replace(/\[Insert Name\]/gi, profile.fullName);
      }
      
      // Clean ALL remaining bracketed placeholders that the AI failed to fill
      // Replace common placeholder patterns with actual data or remove them
      emailBody = emailBody.replace(/\[specific project\/tech stack\]/gi, profile.skills?.slice(0, 3).join(", ") || profile.jobField || "your projects");
      emailBody = emailBody.replace(/\[mention some work\]/gi, company.description ? `your work in ${company.description.substring(0, 60)}` : "your impressive work");
      emailBody = emailBody.replace(/\[specific aspect[^\]]*\]/gi, company.description ? company.description.substring(0, 60) : "your innovative approach");
      emailBody = emailBody.replace(/\[specific[^\]]*\]/gi, company.description ? company.description.substring(0, 50) : "your work");
      emailBody = emailBody.replace(/\[mention[^\]]*\]/gi, "your notable work");
      emailBody = emailBody.replace(/\[insert[^\]]*\]/gi, "");
      emailBody = emailBody.replace(/\[your[^\]]*\]/gi, "");
      // Catch any remaining [...] placeholders as a final safety net
      emailBody = emailBody.replace(/\[[A-Z][a-zA-Z\s\/]{2,30}\]/g, (match) => {
        // Don't remove things that look like intentional brackets (e.g., [1], [a])
        const inner = match.slice(1, -1);
        if (inner === "Company Name") return company.name;
        if (inner === "Your Name") return profile.fullName || "";
        // For anything else, just remove the brackets
        return inner;
      });
    
    const subjectResponse = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "user", content: `Write a personalized email subject line (max 8 words) for a cold email to "${company.name}" about ${profile.jobField} opportunities. Include the company name or reference to make it specific. Use only plain ASCII characters - NO em dashes, curly quotes, or special symbols. Use hyphens (-) instead of dashes. Return ONLY the subject line text.` },
      ],
      maxTokens: 50,
      temperature: 0.7,
    });
    let subject = (subjectResponse.choices?.[0]?.message?.content as string) || `${profile.jobField} Opportunity at ${company.name}`;
    subject = subject.trim().replace(/^["']|["']$/g, "");
    // Sanitize special characters that cause encoding issues in email subjects
    subject = subject.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    
    return {
      company: company.name,
      contact_email: company.contactEmail || "",
      subject: subject,
      body: emailBody,
    };
  } catch {
    return null;
  }
}

export async function processMessage(
  state: ConversationState,
  userMessage: string,
  userEmail?: string,
  attachments?: EmailAttachment[]
): Promise<{ response: string; state: ConversationState; emails?: EmailDraft[] }> {
  const lowerMsg = userMessage.toLowerCase();
  
  // Ensure state is initialized correctly
  if (!state.sentEmails) state.sentEmails = [];
  if (!state.previouslyFoundCompanies) state.previouslyFoundCompanies = [];

  // Process CV/document attachments to extract user info
  if (attachments && attachments.length > 0) {
    state.pendingAttachments = attachments;
    
    // Check if any attachment is a CV/resume type
    const cvAttachments = attachments.filter(a => 
      a.type === 'application/pdf' || 
      a.type === 'application/msword' || 
      a.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      a.type === 'text/plain' ||
      a.name.toLowerCase().includes('cv') ||
      a.name.toLowerCase().includes('resume')
    );
    
    if (cvAttachments.length > 0) {
      console.log("Processing CV attachments...");
      const { content, extractedProfile } = await extractCVContent(cvAttachments);
      
      // Store CV content for context
      if (content) {
        state.profile.cvContent = content.substring(0, 2000); // Limit size
      }
      
      // Merge extracted profile info (only if not already set)
      if (extractedProfile.fullName && !state.profile.fullName) {
        state.profile.fullName = extractedProfile.fullName;
      }
      if (extractedProfile.email && !state.profile.email) {
        state.profile.email = extractedProfile.email;
      }
      if (extractedProfile.phone && !state.profile.phone) {
        state.profile.phone = extractedProfile.phone;
      }
      if (extractedProfile.skills && extractedProfile.skills.length > 0) {
        state.profile.skills = [...new Set([...(state.profile.skills || []), ...extractedProfile.skills])];
      }
      if (extractedProfile.experienceSummary && !state.profile.experienceSummary) {
        state.profile.experienceSummary = extractedProfile.experienceSummary;
      }
      if (extractedProfile.education && !state.profile.education) {
        state.profile.education = extractedProfile.education;
      }
      if (extractedProfile.portfolio && !state.profile.portfolio) {
          state.profile.portfolio = extractedProfile.portfolio;
        }
        
        // Auto-infer job field from skills if not already set
        if (!state.profile.jobField && state.profile.skills && state.profile.skills.length > 0) {
          const skillsLower = state.profile.skills.map(s => s.toLowerCase()).join(", ");
          if (/python|javascript|react|node|java|typescript|angular|vue|php|ruby|swift|kotlin|flutter|c\+\+|c#|\.net|django|flask|spring|sql/i.test(skillsLower)) {
            state.profile.jobField = "Software Engineer/Developer";
          } else if (/figma|sketch|adobe|ui\/ux|wireframe|prototype|design system/i.test(skillsLower)) {
            state.profile.jobField = "UX/UI Designer";
          } else if (/marketing|seo|sem|analytics|content|social media|campaign/i.test(skillsLower)) {
            state.profile.jobField = "Digital Marketer";
          } else if (/data.*analy|tableau|power bi|excel|statistics|pandas|numpy/i.test(skillsLower)) {
            state.profile.jobField = "Data Analyst";
          }
        }
      }
    }

  // Improved shortcut: Handle affirmative confirmation and "send" commands more robustly
  const proceedIntents = [
    "yes", "proceed", "send", "go ahead", "do it", "send emails", "send them", 
    "okay", "ok", "sure", "yep", "yes please", "please send", "send now", 
    "do that", "perfect", "looks good", "send it", "confirm", "make it happen",
    "all good", "looks great", "do the search", "find them", "search now",
    "yes go ahead", "yes proceed"
  ];
  
  const negationWords = ["but", "wait", "actually", "stop", "don't", "dont", "no", "not", "change", "instead"];
  
  const cleanMsg = lowerMsg.replace(/[?.!,]/g, "").trim();
  const words = cleanMsg.split(/\s+/);
  
  // Check if this is a confirmation message (short message with proceed intent)
  const isConfirmation = words.length <= 10 && 
    proceedIntents.some(intent => cleanMsg.includes(intent)) &&
    !negationWords.some(neg => words.includes(neg));
  
  // If we have a custom email draft ready and user confirms, send it immediately
  if (isConfirmation && state.customEmailDraft && state.customEmailDraft.to && state.customEmailDraft.body) {
    const d = state.customEmailDraft;
    
    // Final safety check: verify the "to" email matches what user actually provided
    const userEmails: string[] = [];
    for (const msg of [...state.conversationHistory].reverse()) {
      if (msg.role === "user") {
        const found = msg.content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
        if (found) userEmails.push(...found);
      }
    }
    if (userEmails.length > 0 && !userEmails.some(e => e.toLowerCase() === (d.to || "").toLowerCase())) {
      d.to = userEmails[0]; // Override with user's actual email
    }
    
    let finalBody = d.body ?? "";
    try { if (finalBody.includes("%")) finalBody = decodeURIComponent(finalBody); } catch {}
    
    // Only add signature if not already present
    if (state.profile.fullName && !finalBody.toLowerCase().includes(state.profile.fullName.toLowerCase())) {
      finalBody += `\n\nBest regards,\n${state.profile.fullName}`;
    }

    const attachmentInfo = state.pendingAttachments && state.pendingAttachments.length > 0 
      ? ` with ${state.pendingAttachments.length} attachment(s): ${state.pendingAttachments.map(a => a.name).join(', ')}`
      : '';
    const response = `📧 Sending your email to ${d.to}${attachmentInfo}...`;
    state.conversationHistory.push({ role: "user", content: userMessage });
    state.conversationHistory.push({ role: "assistant", content: response });
    
    const customEmail: EmailDraft = { 
      company: "Custom Recipient", 
      contact_email: d.to ?? "", 
      subject: d.subject || "No Subject", 
      body: finalBody,
      attachments: state.pendingAttachments
    };
    
    // Clear the draft after sending
    delete state.customEmailDraft;
    return { response, state, emails: [customEmail] };
  }
  
  // If we have bulk emails ready and user confirms, send them
  if (isConfirmation && state.emails && state.emails.length > 0) {
    const attachmentInfo = state.pendingAttachments && state.pendingAttachments.length > 0 
      ? `\n\n📎 **Attachments to include:** ${state.pendingAttachments.map(a => a.name).join(', ')}`
      : '';
    const response = `📧 Sending ${state.emails.length} drafted emails now...${attachmentInfo}`;
    state.conversationHistory.push({ role: "user", content: userMessage });
    state.conversationHistory.push({ role: "assistant", content: response });
    
    // Attach pending attachments to all emails being sent
    if (state.pendingAttachments && state.pendingAttachments.length > 0) {
      state.emails = state.emails.map(email => ({
        ...email,
        attachments: state.pendingAttachments
      }));
    }
    
    return { response, state, emails: state.emails };
  }

  // Extract any email address the user explicitly mentions in this message
  // Store it so we can override AI hallucinations later
  const userMentionedEmail = userMessage.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  
  // Profile extraction from message
  state.profile = extractProfileInfo(userMessage, state.profile);
  if (userEmail && !state.profile.email) {
    state.profile.email = userEmail;
  }

  state.conversationHistory.push({ role: "user", content: userMessage });
  const systemPrompt = buildContextualPrompt(state);
  
  let aiResponse = "";
  try {
    const response = await mistral.chat.complete({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        maxTokens: 2000,
        temperature: 0.3,
      });
    aiResponse = (response.choices?.[0]?.message?.content as string) || "";
    
    // Log response details for debugging
    const finishReason = response.choices?.[0]?.finishReason;
    console.log(`AI Response length: ${aiResponse.length} chars, finish_reason: ${finishReason}`);
    if (finishReason === "length") {
      console.warn("AI response was truncated due to token limit!");
      console.log("System prompt length:", systemPrompt.length, "chars");
    }
  } catch (error) {
    console.error("AI response error:", error);
    aiResponse = "I'm having trouble processing that. Could you try rephrasing?";
  }

  const { cleanResponse, action } = parseActionFromResponse(aiResponse);
  let finalResponse = cleanResponse;
  let emails: EmailDraft[] | undefined;

  // IMPORTANT: Detect if AI drafted an email in text format without using [ACTION:CUSTOM_EMAIL]
  // This happens when AI shows "Subject: X" and email body but doesn't use the action marker
    if (!action) {
      const draftDetection = detectEmailDraftInText(cleanResponse, state);
      if (draftDetection) {
        // Override with user's explicitly mentioned email if available
        if (userMentionedEmail && draftDetection.to !== userMentionedEmail[1]) {
          draftDetection.to = userMentionedEmail[1];
        }
        
        // Preserve previous recipient if AI dropped it in revision
        if (state.customEmailDraft?.to && !draftDetection.to) {
          draftDetection.to = state.customEmailDraft.to;
        }
        
        state.customEmailDraft = draftDetection;
        console.log("Detected email draft from text:", draftDetection);
        
        if (!finalResponse.includes("[OPTIONS:")) {
          finalResponse += "\n\n[OPTIONS:Yes, send it|No, let me review]";
        }
      }
    }

  if (action) {
    switch (action.type) {
      case "SEARCH": {
        const jobField = action.params[0] || state.profile.jobField;
        const count = parseInt(action.params[1]) || state.profile.companyCount || 10;
        const location = action.params[2] || state.profile.location;
        
        if (!jobField) {
          finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + "I'd be happy to search for companies! What field or industry are you looking for opportunities in?";
          break;
        }

        state.profile.jobField = jobField;
        if (location) state.profile.location = location;
        if (parseInt(action.params[1])) state.profile.companyCount = parseInt(action.params[1]);

        if (!state.profile.fullName || !state.profile.experienceSummary) {
          const missing = [];
          if (!state.profile.fullName) missing.push("your name");
          if (!state.profile.experienceSummary) missing.push("a brief summary of your work experience");
          
          finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + 
            `I'd love to help you with that search! Before I dive in, could you please provide ${missing.join(" and ")}? This helps me personalize the outreach for you.`;
          break;
        }

        const locationDisplay = location ? ` in ${location}` : "";
        if (!state.previouslyFoundCompanies) state.previouslyFoundCompanies = [];
        
        const companies = await searchCompanies(jobField, count, location, state.previouslyFoundCompanies);
        
        if (companies.length === 0) {
          finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + `⚠️ I couldn't find companies with that search${locationDisplay}. Try being more specific or try a different location.`;
          break;
        }

        for (const company of companies) {
          if (!state.previouslyFoundCompanies.includes(company.name.toLowerCase())) {
            state.previouslyFoundCompanies.push(company.name.toLowerCase());
          }
        }

        state.companies = companies;
        let resultsText = `✅ **Found ${companies.length} companies** in ${jobField}${locationDisplay}!\n\n`;
        resultsText += companies.map((c, i) => 
          `${i + 1}. **${c.name}**${c.address ? ` - ${c.address}` : ""}${c.rating ? ` (${c.rating})` : ""}`
        ).join("\n");

        const emailDrafts: EmailDraft[] = [];
        for (const company of companies) {
          if (!company.contactEmail) {
            company.contactEmail = await findCompanyEmail(company);
          }
          if (company.contactEmail) {
            const draft = await generateEmailDraft(state.profile, company);
            if (draft) {
              draft.contact_email = company.contactEmail;
              emailDrafts.push(draft);
            }
          }
        }

        state.emails = emailDrafts;
        state.step = "complete";
        finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + resultsText;
        
        if (emailDrafts.length > 0) {
          finalResponse += `\n\n📧 **${emailDrafts.length} personalized emails ready!** Should I go ahead and send them?`;
        } else {
          finalResponse += `\n\n⚠️ Couldn't find contact emails for these companies automatically. You can provide an email address and I'll send a custom message!`;
        }
        break;
      }

        case "CUSTOM_EMAIL": {
          let [to, subject, body] = action.params;
          
          // CRITICAL: Override AI's recipient with the email the USER actually provided
          // Priority: 1) Email in current message, 2) Most recent email from user in history
          if (userMentionedEmail) {
            // User mentioned an email in THIS message — always use it
            if (to?.toLowerCase() !== userMentionedEmail[1].toLowerCase()) {
              console.warn(`AI used email "${to}" but user said "${userMentionedEmail[1]}". Overriding.`);
              to = userMentionedEmail[1];
            }
          } else {
            // Search user messages (most recent first) for the actual email they mentioned
            const userProvidedEmails: string[] = [];
            for (const msg of [...state.conversationHistory].reverse()) {
              if (msg.role === "user") {
                const emailsInMsg = msg.content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
                if (emailsInMsg) {
                  userProvidedEmails.push(...emailsInMsg);
                }
              }
            }
            
            if (userProvidedEmails.length > 0) {
              const aiTo = (to || "").toLowerCase();
              const userHasThisEmail = userProvidedEmails.some(e => e.toLowerCase() === aiTo);
              if (!userHasThisEmail) {
                console.warn(`AI used email "${to}" but user provided "${userProvidedEmails[0]}". Overriding.`);
                to = userProvidedEmails[0];
              }
            }
          }
          
          // Update partial draft in state
          if (!state.customEmailDraft) state.customEmailDraft = {};
          if (to) state.customEmailDraft.to = to;
          if (subject) state.customEmailDraft.subject = subject;
          if (body) state.customEmailDraft.body = body;

          const d = state.customEmailDraft;

          if (d.to && d.subject && d.body) {
            let finalBody = d.body ?? "";
            try { if (finalBody.includes("%")) finalBody = decodeURIComponent(finalBody); } catch {}
            
            // Ensure name is in signature
            if (state.profile.fullName && !finalBody.toLowerCase().includes(state.profile.fullName.toLowerCase())) {
              finalBody += `\n\nBest regards,\n${state.profile.fullName}`;
            }
            
            // Update the draft body with signature
            state.customEmailDraft.body = finalBody;

            const attachmentInfo = state.pendingAttachments && state.pendingAttachments.length > 0 
              ? `\n\n📎 **Attachments:** ${state.pendingAttachments.map(a => a.name).join(', ')}`
              : '';
            
            // DO NOT SEND YET - just show preview and ask for confirmation
            finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + `📧 **Email Draft Ready:**\n\n**To:** ${d.to}\n**Subject:** ${d.subject}\n**Message:**\n${finalBody}${attachmentInfo}\n\nWould you like me to send this email? Say **"Send it"** or **"Go ahead"** to confirm.`;
            
            // DO NOT clear draft or send - wait for confirmation
            // emails will be set when user confirms with SEND_EMAILS action
          } else {
            const missing = [];
            if (!d.to) missing.push("recipient email");
            if (!d.subject) missing.push("subject");
            if (!d.body) missing.push("message content");
            
            finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + `I'd be happy to send that custom email! I just need the ${missing.join(", ")} to proceed.`;
          }
          break;
        }

          case "LOOKUP_LINKEDIN": {
              const linkedinUrl = action.params[0]?.trim();
              if (!linkedinUrl || !linkedinUrl.includes("linkedin.com")) {
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + "Please provide a valid LinkedIn profile URL (e.g. linkedin.com/in/johndoe).";
                break;
              }

              // Try ContactOut first, then RocketReach as fallback
              let liContact: { name?: string; title?: string; email?: string; phone?: string } | null = null;
              let liSource = "";

              const coResult = await contactOutByLinkedIn(linkedinUrl);
              if (coResult?.email || coResult?.phone) {
                liContact = coResult;
                liSource = "ContactOut";
              }

              if (!liContact?.email) {
                const rrResult = await rocketReachLookup({ linkedin_url: linkedinUrl });
                if (rrResult?.email || rrResult?.phone) {
                  liContact = rrResult;
                  liSource = "RocketReach";
                }
              }

              if (!liContact || (!liContact.email && !liContact.phone)) {
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + `⚠️ Neither ContactOut nor RocketReach could find verified contact info for that LinkedIn profile. They may not be in the database yet.`;
              } else {
                let result = `✅ **Contact info found via ${liSource}:**\n`;
                if (liContact.name) result += `\n👤 **Name:** ${liContact.name}`;
                if (liContact.title) result += `\n💼 **Title:** ${liContact.title}`;
                if (liContact.email) result += `\n📧 **Email:** ${liContact.email}`;
                if (liContact.phone) result += `\n📞 **Phone:** ${liContact.phone}`;
                result += `\n\nWould you like me to draft an email to ${liContact.email || "this person"}?`;
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + result;
              }
              break;
            }

            case "LOOKUP_PERSON": {
              // Find contact info for an individual person by name (+ optional company)
              const personName = action.params[0]?.trim();
              const personCompany = action.params[1]?.trim();

              if (!personName) {
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + "Please provide the person's full name to look them up.";
                break;
              }

              let personContact: { name?: string; title?: string; email?: string; phone?: string } | null = null;
              let personSource = "";

              // Try RocketReach first (better for name+company lookups)
              const rrPerson = await rocketReachLookup({ name: personName, current_employer: personCompany });
              if (rrPerson?.email || rrPerson?.phone) {
                personContact = rrPerson;
                personSource = "RocketReach";
              }

              // Fallback: ContactOut enrich by name + domain
              if (!personContact?.email && personCompany) {
                // Try to derive domain from company name (best-effort)
                const guessDomain = personCompany.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "") + ".com";
                const coEnrich = await contactOutEnrichPerson(personName, guessDomain);
                if (coEnrich?.email || coEnrich?.phone) {
                  personContact = { ...coEnrich, name: personName };
                  personSource = "ContactOut";
                }
              }

              if (!personContact || (!personContact.email && !personContact.phone)) {
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") +
                  `⚠️ I couldn't find verified contact info for **${personName}**${personCompany ? ` at ${personCompany}` : ""}. ` +
                  `Try providing their LinkedIn URL for a more accurate lookup.`;
              } else {
                let result = `✅ **Contact info found for ${personName} via ${personSource}:**\n`;
                if (personContact.name && personContact.name !== personName) result += `\n👤 **Name:** ${personContact.name}`;
                if (personContact.title) result += `\n💼 **Title:** ${personContact.title}`;
                if (personContact.email) result += `\n📧 **Email:** ${personContact.email}`;
                if (personContact.phone) result += `\n📞 **Phone:** ${personContact.phone}`;
                if (personCompany) result += `\n🏢 **Company:** ${personCompany}`;
                result += `\n\nWould you like me to draft an email to ${personContact.email || "this person"}?`;
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + result;
              }
              break;
            }

            case "FIND_DECISION_MAKERS": {
              const domain = action.params[0]?.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
              if (!domain) {
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + "Please provide a company domain (e.g. acmecorp.com).";
                break;
              }

              // Try ContactOut first, then RocketReach as fallback
              let allMakers: { name?: string; title?: string; email?: string; phone?: string }[] = [];
              let dmSource = "";

              const coMakers = await contactOutDecisionMakers(domain);
              if (coMakers.length > 0) {
                allMakers = coMakers;
                dmSource = "ContactOut";
              }

              if (allMakers.length === 0) {
                const rrMakers = await rocketReachSearchAtDomain(domain);
                if (rrMakers.length > 0) {
                  allMakers = rrMakers;
                  dmSource = "RocketReach";
                }
              }

              if (allMakers.length === 0) {
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + `⚠️ Neither ContactOut nor RocketReach found decision-makers for **${domain}**. Try the company search instead.`;
              } else {
                let result = `✅ **Decision-makers found at ${domain} via ${dmSource}:**\n`;
                allMakers.forEach((m, i) => {
                  result += `\n${i + 1}. **${m.name || "Unknown"}**${m.title ? ` — ${m.title}` : ""}`;
                  if (m.email) result += `\n   📧 ${m.email}`;
                  if (m.phone) result += `\n   📞 ${m.phone}`;
                });
                result += `\n\nWould you like me to draft a personalized email to any of these contacts?`;
                finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + result;
              }
              break;
            }

          case "SEND_EMAILS": {
          if (state.customEmailDraft && state.customEmailDraft.to && state.customEmailDraft.body) {
            const d = state.customEmailDraft;
            let finalBody = d.body ?? "";
            try { if (finalBody.includes("%")) finalBody = decodeURIComponent(finalBody); } catch {}
            
            if (state.profile.fullName && !finalBody.toLowerCase().includes(state.profile.fullName.toLowerCase())) {
              finalBody += `\n\nBest regards,\n${state.profile.fullName}`;
            }

            const attachmentInfo = state.pendingAttachments && state.pendingAttachments.length > 0 
              ? ` with ${state.pendingAttachments.length} attachment(s)`
              : '';
            emails = [{ 
              company: "Custom Recipient", 
              contact_email: d.to ?? "", 
              subject: d.subject || "No Subject", 
              body: finalBody,
              attachments: state.pendingAttachments
            }];
            finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + `📧 Sending custom email to ${d.to}${attachmentInfo} now...`;
            delete state.customEmailDraft;
          } else if (state.emails && state.emails.length > 0) {
            // Attach pending attachments to all emails being sent
            if (state.pendingAttachments && state.pendingAttachments.length > 0) {
              emails = state.emails.map(email => ({
                ...email,
                attachments: state.pendingAttachments
              }));
              const attachmentInfo = `\n\n📎 **Attachments included:** ${state.pendingAttachments.map(a => a.name).join(', ')}`;
              finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + `📧 Sending ${state.emails.length} drafted emails now...${attachmentInfo}`;
            } else {
              emails = state.emails;
              finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + `📧 Sending ${state.emails.length} drafted emails now...`;
            }
          } else {
            finalResponse = (cleanResponse ? cleanResponse + "\n\n" : "") + "I don't have any drafted emails to send yet. Would you like me to search for companies first?";
          }
          break;
        }

    }
  }

  state.conversationHistory.push({ role: "assistant", content: finalResponse });
  return { response: finalResponse, state, emails };
}

export function getWelcomeMessage(): string {
  return `**Welcome to HireMindX!**

I can help you find companies and send personalized cold emails, or send any email to anyone. What would you like to do?

[OPTIONS:Job Outreach|Client Outreach|Business Outreach|Send an Email]`;
}

export function createInitialState(): ConversationState {
  return {
    step: "gathering_info",
    profile: {},
    companies: [],
    emails: [],
    sentEmails: [],
    conversationHistory: [],
    previouslyFoundCompanies: [],
  };
}

export function serializeState(state: ConversationState): string {
  return JSON.stringify(state);
}

export function deserializeState(data: string): ConversationState {
  try {
    return JSON.parse(data);
  } catch {
    return createInitialState();
  }
}