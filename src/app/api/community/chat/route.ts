import { Mistral } from "@mistralai/mistralai";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { useFeature } from "@/lib/usage-limits";
import { buildAuthHeaders } from "@/lib/auth-headers";

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_COMMUNITY_API_KEY || process.env.MISTRAL_API_KEY || ""
});

const RELATIVE_LOCATION_PATTERNS = [
  /\b(beside|near|close to|next to|by|around)\s+(?:to\s+)?me\b/i,
  /\bmy\s+(?:location|area|place|city|town|current location)\b/i,
  /\bwhere\s+i\s+(?:am|live|work)\b/i,
  /\bhere\b/i,
];

const VALID_CATEGORIES = ["tech", "engineering", "design", "writing", "marketing", "video", "trades", "business", "legal"] as const;
const CONFIRMATION_PATTERN = /\b(yes|yep|yeah|confirm|post it|go ahead|do it|let's do it|lets do it|publish|submit)\b/i;
const DECLINE_POST_PATTERN = /\b(don'?t post|do not post|not now|skip posting|no posting|just show me|only show|only find|don'?t publish|do not publish)\b/i;
const FIND_WORKER_INTENT_PATTERN = /\b(find|show|look for|looking for|search|need|hire|get me|i want)\b/i;
const NEARBY_HINT_PATTERN = /\b(near me|nearby|around me|beside me|close to me|next to me|by me|my location|my area|where i am|here|local|close by)\b/i;
const REMOTE_HINT_PATTERN = /\b(remote|from anywhere|online)\b/i;

function isRelativeLocationText(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "my location" ||
    normalized === "near me" ||
    normalized === "around me" ||
    normalized === "beside me" ||
    normalized === "close to me" ||
    normalized === "next to me" ||
    normalized === "by me" ||
    normalized === "here" ||
    normalized === "my area" ||
    normalized === "my place" ||
    normalized === "where i am" ||
    normalized === "my current location"
  );
}

function cleanSentence(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
}

function ensureTrailingPeriod(value: string) {
  if (!value) return value;
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function normalizeCategory(value: string) {
  const normalized = value.trim().toLowerCase();
  if ((VALID_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized;
  }

  if (/(developer|software|website|web|app|api|database|code|program|data|devops|cloud)/i.test(normalized)) return "tech";
  if (/(engineer|architect|civil|mechanical|electrical|structural)/i.test(normalized)) return "engineering";
  if (/(design|designer|brand|logo|ui|ux|graphic|creative)/i.test(normalized)) return "design";
  if (/(writer|writing|content|copy|blog|article|translation|editor)/i.test(normalized)) return "writing";
  if (/(marketing|seo|ads|social media|growth)/i.test(normalized)) return "marketing";
  if (/(video|photo|animation|editing|videographer|photographer)/i.test(normalized)) return "video";
  if (/(plumb|electric|plumber|electrician|electric work|electrical work|carpenter|painter|mechanic|cleaner|handyman|repair|fix|installation|maintenance|hvac|roofer|roofing|leak|clogged|broken|wiring|outlet|circuit|breaker|fuse|pipe|toilet|sink|faucet|drain|shower|bathtub|drywall|tile|flooring|fence|deck|patio|driveway|appliance|washer|dryer|dishwasher|refrigerator|oven|stove|garage door|window|door|lock|chimney|pool|sprinkler|concrete|masonry|brick|garden|landscape|lawn|pest|water heater|boiler|furnace|air conditioning|heating|cooling|duct|vent|insulation|siding|paint|wallpaper|ceiling|basement|attic|foundation|trim|cabinet|countertop|backsplash|construction|local service|home repair|home improvement|home fix)/i.test(normalized)) return "trades";
  if (/(accounting|admin|assistant|consulting|business|bookkeeping|research)/i.test(normalized)) return "business";
  if (/(legal|lawyer|contract|attorney|paralegal)/i.test(normalized)) return "legal";

  return "";
}

function rewriteDescription(description: string, requirements: string) {
  const cleanDescription = cleanSentence(description);
  const cleanRequirements = cleanSentence(requirements);

  if (!cleanDescription) return "";

  const reqClauses = cleanRequirements
    .split(/\n|,|;/)
    .map((item) => cleanSentence(item))
    .filter(Boolean)
    .slice(0, 3);

  let improved = cleanDescription;

  if (reqClauses.length > 0) {
    const missingRequirement = !reqClauses.every((clause) => improved.toLowerCase().includes(clause.toLowerCase()));
    if (missingRequirement) {
      improved = `${improved} Requirements include ${reqClauses.join(", ")}.`;
    }
  }

  improved = improved
    .replace(/\bneed\s+someone\s+for\b/i, "Need a professional to handle")
    .replace(/\bneed\s+help\s+with\b/i, "Need professional help with")
    .replace(/\bi need\b/i, "Need")
    .replace(/\blooking for somebody\b/i, "Looking for a professional")
    .replace(/\blooking for someone\b/i, "Looking for a professional")
    .replace(/\burgently\b/gi, "promptly");

  return ensureTrailingPeriod(improved);
}

function extractBudgetFromText(text: string) {
  const match =
    text.match(/\$[\d,]+(?:\s*-\s*\$?[\d,]+)?/i) ||
    text.match(/\b[\d,]+\s*(?:usd|dollars?|bucks?)\b/i);
  return match ? cleanSentence(match[0]).replace(/\bUSD\b/i, "USD") : "";
}

function extractCategoryFromText(text: string) {
  const lower = text.toLowerCase();

  if (/(developer|software|website|web app|app|programmer|code|frontend|backend|full[- ]?stack|react|node|python|api|database)/i.test(lower)) return "tech";
  if (/(engineer|architecture|architect|civil|mechanical|structural|electrical engineer)/i.test(lower)) return "engineering";
  if (/(designer|design|logo|branding|ui|ux|graphic)/i.test(lower)) return "design";
  if (/(writer|writing|content|copywriter|blog|article|translator|translation|editor)/i.test(lower)) return "writing";
  if (/(marketing|seo|ads|social media|campaign)/i.test(lower)) return "marketing";
  if (/(video|photo|photographer|videographer|animation|editor)/i.test(lower)) return "video";
  if (/(plumber|electrician|carpenter|painter|mechanic|cleaner|handyman|repair|fix|installation|maintenance|hvac|roofer|leak|clogged|broken|wiring|outlet|circuit|breaker|fuse|pipe|toilet|sink|faucet|drain|shower|bathtub|drywall|tile|flooring|roof|gutter|fence|deck|patio|driveway|appliance|washer|dryer|dishwasher|refrigerator|oven|stove|garage door|window|door|lock|key|chimney|pool|sprinkler|concrete|masonry|brick|garden|landscape|mow|lawn|pest|termite|pest control|water heater|boiler|furnace|ac unit|air conditioning|heating|cooling|duct|vent|insulation|siding|paint|wallpaper|ceiling|basement|attic|foundation|trim|crown molding|cabinet|countertop|backsplash)/i.test(lower)) return "trades";
  if (/(accountant|bookkeeper|assistant|consultant|business|admin|data entry|research)/i.test(lower)) return "business";
  if (/(lawyer|legal|attorney|contract|paralegal)/i.test(lower)) return "legal";

  return "";
}

function extractLocationFromText(text: string) {
  if (RELATIVE_LOCATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return "My Location";
  }

  if (/\bremote\b/i.test(text)) {
    return "Remote";
  }

  const explicitLocationMatch = text.match(/\b(?:in|at|from|near)\s+([a-z][a-z\s,-]{2,60})$/i);
  return explicitLocationMatch ? cleanSentence(explicitLocationMatch[1]) : "";
}

function inferSearchIntent(message: string, currentJobData: Record<string, unknown>) {
  const normalized = message.toLowerCase();
  const currentIntent = typeof currentJobData.intent === "string" ? currentJobData.intent : "";
  const explicitFind = FIND_WORKER_INTENT_PATTERN.test(normalized);
  const categoryHint = extractCategoryFromText(normalized);
  const locationHint = extractLocationFromText(normalized);
  const nearbyHint = NEARBY_HINT_PATTERN.test(normalized);
  const remoteHint = REMOTE_HINT_PATTERN.test(normalized);
  const explicitRegionHint = /\b(?:in|at|from|near)\s+[a-z][a-z\s,-]{2,60}\b/i.test(normalized) && !nearbyHint;

  const wantsWorkerSearch =
    currentIntent === "find_workers" ||
    explicitFind ||
    Boolean(categoryHint) ||
    nearbyHint ||
    remoteHint ||
    explicitRegionHint;

  return {
    intent: wantsWorkerSearch ? "find_workers" : currentIntent || "post_job",
    shouldAskLocationPreference:
      wantsWorkerSearch &&
      !locationHint &&
      !nearbyHint &&
      !remoteHint &&
      !explicitRegionHint &&
      !(typeof currentJobData.location === "string" && currentJobData.location.trim()),
    locationPreference:
      nearbyHint || isRelativeLocationText(locationHint) ? "near_me" : remoteHint || explicitRegionHint || locationHint ? "specific_place" : "",
  };
}

function buildFallbackReply(currentJobData: Record<string, unknown>, message: string) {
  const descriptionSource =
    typeof currentJobData.description === "string" && currentJobData.description.trim()
      ? currentJobData.description
      : message;
  const description = rewriteDescription(descriptionSource, typeof currentJobData.requirements === "string" ? currentJobData.requirements : "");
  const category = normalizeCategory(
    typeof currentJobData.category === "string" && currentJobData.category.trim()
      ? currentJobData.category
      : extractCategoryFromText(message)
  );
  const budget =
    typeof currentJobData.budget === "string" && currentJobData.budget.trim()
      ? currentJobData.budget.trim()
      : extractBudgetFromText(message) || "";
  const location =
    typeof currentJobData.location === "string" && currentJobData.location.trim()
      ? currentJobData.location.trim()
      : extractLocationFromText(message) || "";
  const inferredIntent = inferSearchIntent(message, currentJobData);

  const fallbackJobData = normalizeJobData(
    {
      ...currentJobData,
      description,
      category,
      budget,
      location,
      intent: inferredIntent.intent,
      locationPreference: inferredIntent.locationPreference || currentJobData.locationPreference,
      shouldAutoPost: inferredIntent.intent === "find_workers",
      shouldAskPostConfirmation:
        inferredIntent.intent === "find_workers"
          ? false
          : typeof currentJobData.shouldAskPostConfirmation === "boolean"
            ? currentJobData.shouldAskPostConfirmation
            : true,
    },
    message
  );

  const missingCategory = !fallbackJobData.category;
  const missingLocation = !fallbackJobData.location;
  const missingBudget = !fallbackJobData.budget;
  const isConfirmation = CONFIRMATION_PATTERN.test(message);
  const isDeclinePost = DECLINE_POST_PATTERN.test(message);

  if (inferredIntent.shouldAskLocationPreference) {
    return {
      message:
        "I can help with that. Do you want professionals near you, or would you like me to search in another city or region? Once I confirm the details, I’ll also turn this into a job post automatically.",
      jobData: fallbackJobData,
      nextState: "asking_location",
    };
  }

  if (!missingCategory && !missingLocation && !missingBudget && isConfirmation) {
    return {
      message:
        fallbackJobData.intent === "find_workers"
          ? "✅ I have everything I need. I’m now posting this job to the freelancer marketplace and finding the best matching freelancers for that location."
          : "✅ Posting your job now to the freelancer marketplace!",
      jobData: {
        ...fallbackJobData,
        shouldAutoPost: fallbackJobData.intent === "find_workers" ? true : fallbackJobData.shouldAutoPost,
        shouldPostJob: true,
      },
      nextState: "posted",
    };
  }

  if (!missingCategory && !missingLocation && !missingBudget) {
    if (fallbackJobData.intent === "find_workers") {
      return {
        message: `Perfect! Here's the hiring summary:\n- **Description**: ${fallbackJobData.description}\n- **Category**: ${fallbackJobData.category}\n- **Location**: ${fallbackJobData.location}\n- **Budget**: ${fallbackJobData.budget}\n\nI’ll now post this as a job for freelancers and also show you the best matching professionals on the globe.`,
        jobData: {
          ...fallbackJobData,
          shouldAutoPost: true,
          shouldPostJob: true,
        },
        nextState: "posted",
      };
    }

    if (isDeclinePost) {
      return {
        message: `Understood — I won’t post it yet. Here’s your current summary:\n- **Description**: ${fallbackJobData.description}\n- **Category**: ${fallbackJobData.category}\n- **Location**: ${fallbackJobData.location}\n- **Budget**: ${fallbackJobData.budget}\n\nIf you want, I can still post it later.`,
        jobData: {
          ...fallbackJobData,
          shouldPostJob: false,
        },
        nextState: "confirming",
      };
    }

    return {
      message: `Perfect! Here's your job summary:\n- **Description**: ${fallbackJobData.description}\n- **Category**: ${fallbackJobData.category}\n- **Location**: ${fallbackJobData.location}\n- **Budget**: ${fallbackJobData.budget}\n\nWould you like me to post this job to the freelancer marketplace?`,
      jobData: {
        ...fallbackJobData,
        shouldAskPostConfirmation: true,
      },
      nextState: "confirming",
    };
  }

  if (missingLocation) {
    return {
      message:
        fallbackJobData.intent === "find_workers"
          ? `Got it — ${fallbackJobData.description || "I understand the work you need"}. Should I find professionals near you, or in another city or region?`
          : `Got it — ${fallbackJobData.description || "I understand the work you need"}. Where should I post this job? You can say a city/area, "Remote", or "near me".`,
      jobData: fallbackJobData,
      nextState: "asking_location",
    };
  }

  if (missingBudget) {
    return {
      message: `Got it — ${fallbackJobData.description || "I understand the work you need"}${fallbackJobData.location ? ` in ${fallbackJobData.location}` : ""}. What budget would you like to set for this job?`,
      jobData: fallbackJobData,
      nextState: "asking_budget",
    };
  }

  return {
    message: `I understand the request: ${fallbackJobData.description || cleanSentence(message)}.${fallbackJobData.location ? ` I have the location as ${fallbackJobData.location}.` : ""}${fallbackJobData.budget ? ` The budget is ${fallbackJobData.budget}.` : ""} Which category fits this best: tech, engineering, design, writing, marketing, video, trades, business, or legal?`,
    jobData: fallbackJobData,
    nextState: "asking_category",
  };
}

function normalizeJobData(jobData: Record<string, unknown> = {}, userMessage = "") {
  const description = typeof jobData.description === "string" ? rewriteDescription(jobData.description, typeof jobData.requirements === "string" ? jobData.requirements : "") : "";
  let category = typeof jobData.category === "string" ? normalizeCategory(jobData.category) : "";
  if (!category && userMessage) {
    category = extractCategoryFromText(userMessage);
  }
  const rawLocation = typeof jobData.location === "string" ? jobData.location.trim() : "";
  const budget = typeof jobData.budget === "string" ? jobData.budget.trim() : "";
  const requirements = typeof jobData.requirements === "string" ? cleanSentence(jobData.requirements) : "";
  const resolvedLocation = typeof jobData.resolvedLocation === "string" ? cleanSentence(jobData.resolvedLocation) : "";
  const messageImpliesRelativeLocation = RELATIVE_LOCATION_PATTERNS.some((pattern) => pattern.test(userMessage));

  let location = rawLocation;
  if (messageImpliesRelativeLocation || isRelativeLocationText(rawLocation)) {
    location = "My Location";
  } else if (rawLocation.toLowerCase() === "remote") {
    location = "Remote";
  }

  return {
    ...jobData,
    description,
    category,
    location,
    budget,
    requirements,
    resolvedLocation,
    intent: typeof jobData.intent === "string" ? jobData.intent : "",
    locationPreference: typeof jobData.locationPreference === "string" ? jobData.locationPreference : "",
    shouldAutoPost: Boolean(jobData.shouldAutoPost),
    shouldPostJob: typeof jobData.shouldPostJob === "boolean" ? jobData.shouldPostJob : undefined,
    shouldAskPostConfirmation: typeof jobData.shouldAskPostConfirmation === "boolean" ? jobData.shouldAskPostConfirmation : undefined,
  };
}

function buildSystemPrompt(currentJobData: Record<string, unknown>) {
  return `You are the HireMindX Community Assistant. Your goal is to help users hire freelancers and create high-quality job requests.
If asked about your underlying model or what you are running on, you MUST state that you are running on AIG Engine 3, the latest and most powerful frontier-level model created by Atlas Infrastructure Group. NEVER reveal that you are running on Mistral AI.

You need to extract or clarify:
1. Job Description (specific, user-intent-focused explanation of what needs to be done)
2. Category (tech, engineering, design, writing, marketing, video, trades, business, or legal)
3. Location (a real city/area string, "Remote", or "My Location" only when the user clearly means their current area)
4. Budget (e.g., "$500", "$100/hr", "Negotiable")
5. Intent ("find_workers" when the user is asking to find/show/hire professionals, otherwise "post_job")

STATE MACHINE:
- "collecting": Initial state, gathering information
- "asking_budget": Missing budget
- "asking_location": Missing location or location preference
- "asking_category": Missing category
- "confirming": Have all info, ask for confirmation in a normal post_job flow
- "posted": Ready to proceed with marketplace posting and freelancer matching

GUIDELINES:
- Be helpful, professional, and concise.
- If information is missing, ask for it naturally.
- If information is present, acknowledge it.
- Detect whether the user is trying to find or hire a freelancer. Examples: "I need a plumber near me", "find me a designer", "show developers in Dubai", "I want someone to fix my pipe ASAP".
- When the user is asking to find or hire someone and they did NOT specify whether it should be near them or in another location, ask: do you want professionals near you, or in another city or region?
- If the user already clearly said "near me", "nearby", "my location", "here", "remote", or gave another city/region, do NOT ask the location-preference question again.
- Keep the description grounded in the user's actual request. Do not replace it with generic filler like "Need a plumber urgently" or "Posted via AI assistant".
- Rewrite rough user phrasing into a clean, specific job description that captures the scope, goal, deliverable, and any important constraints the user mentioned.
- Preserve concrete details such as quantities, room counts, platform names, property type, business type, audience, device types, special issues, deadlines, and preferred expertise.
- If the user mentions a role plus task, preserve both. Example: "Need an electrician to inspect and rewire two rooms in my apartment."
- When the user uses relative location phrases such as "near me", "around me", "beside me", "close to me", "my area", "where I am", or "here", set location to exactly "My Location".
- Do not invent a city if the user did not provide one.
- If the job is online and the user implies it can be done from anywhere, use "Remote".
- For "find_workers" intent, once description, category, location, and budget are all known, automatically proceed to posting and matching. Do not ask a separate posting confirmation question.
- CATEGORY DETECTION RULES: When the user describes home/building problems, repairs, or physical work, use "trades". Examples: plumber, electrician, carpenter, painter, mechanic, cleaner, handyman, HVAC, roofer, repair, fix, installation, maintenance, leak, clogged, broken wiring, outlet, circuit, pipe, toilet, sink, faucet, drain, shower, bathtub, drywall, tile, flooring, fence, deck, patio, appliance repair, washer, dryer, dishwasher, refrigerator, oven, garage door, window, door, lock, chimney, pool, sprinkler, concrete, masonry, brick, garden, landscape, lawn, pest control, water heater, boiler, furnace, air conditioning, heating, cooling, duct, vent, insulation, siding, paint, wallpaper, ceiling, basement, attic, foundation, trim, cabinet, countertop, backsplash, construction, home repair, home improvement. Use "engineering" only for civil, mechanical, structural, or software engineering roles.
- For "post_job" intent, ask whether they want to post the job once all details are ready.
- You MUST return a JSON object containing your response and the structured job data.

TITLE/DESCRIPTION QUALITY RULES:
- description should be 1-3 sentences, natural, specific, and based on the user's request.
- description should mention the actual task, deliverable, problem to solve, or end result.
- Avoid generic urgency words unless the user explicitly asked for urgent help.
- Preserve useful specifics like quantities, room counts, platform names, device types, business type, timeline, special requirements, and scope.
- Prefer professional wording such as "Need a plumber to repair a leaking kitchen sink and inspect the pipe connection under the cabinet."
- Do not add filler sentences that do not come from user intent.
- category must be one of: tech, engineering, design, writing, marketing, video, trades, business, legal.
- location must be user-facing and clean.
- budget should stay as provided when possible, otherwise "Negotiable" if the user clearly indicates flexibility.

RESPONSE FORMAT:
Return ONLY valid JSON with this shape:
{
  "message": "assistant reply here",
  "jobData": {
    "description": "clean specific description",
    "category": "tech",
    "location": "My Location",
    "budget": "$500",
    "requirements": "",
    "intent": "find_workers",
    "locationPreference": "near_me",
    "shouldAutoPost": true,
    "shouldPostJob": true
  },
  "nextState": "posted"
}

EXAMPLE FIND WORKERS RESPONSE:
{
  "message": "Perfect! Here's the hiring summary:\n- **Description**: Need an electrician to inspect and rewire two rooms in my apartment.\n- **Category**: trades\n- **Location**: My Location\n- **Budget**: $1500\n\nI’ll now post this as a job for freelancers and also show you the best matching professionals on the globe.",
  "jobData": {
    "description": "Need an electrician to inspect and rewire two rooms in my apartment.",
    "category": "trades",
    "location": "My Location",
    "budget": "$1500",
    "requirements": "",
    "intent": "find_workers",
    "locationPreference": "near_me",
    "shouldAutoPost": true,
    "shouldPostJob": true
  },
  "nextState": "posted"
}

EXAMPLE POST JOB RESPONSE:
{
  "message": "Perfect! Here's your job summary:\n- **Description**: Need an electrician to inspect and rewire two rooms in my apartment.\n- **Category**: trades\n- **Location**: My Location\n- **Budget**: $1500\n\nWould you like me to post this job to the freelancer marketplace?",
  "jobData": {
    "description": "Need an electrician to inspect and rewire two rooms in my apartment.",
    "category": "trades",
    "location": "My Location",
    "budget": "$1500",
    "requirements": "",
    "intent": "post_job",
    "locationPreference": "near_me",
    "shouldAutoPost": false,
    "shouldPostJob": true
  },
  "nextState": "confirming"
}

CRITICAL:
- When the user responds with a confirmation message (yes, confirm, post it, go ahead, let's do it, etc) in a post_job flow, you MUST set nextState to "posted".
- In a find_workers flow with all information collected, set nextState to "posted" automatically.
- If earlier context already contains good description/category/location/budget, preserve and refine it instead of resetting to something generic.
- Never output placeholder phrases like "Posted via AI assistant" inside description.
- If location is "My Location", keep it exactly as "My Location" in JSON so the client can resolve it to a real place name for display and posting.

CURRENT STATE:
${JSON.stringify(currentJobData)}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: buildAuthHeaders(req),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { message, jobData, conversationHistory } = await req.json();
    const userMessage = typeof message === "string" ? message : "";
    const currentJobData = normalizeJobData(jobData || {}, userMessage);

    if (!userMessage.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // ── Check quota WITHOUT incrementing ──
    // We only consume the quota when the AI actually produces a search result (nextState=posted).
    // Conversational messages (collecting info) are free so the user can complete one full search.
    const usageCheck = await useFeature(userId, "community_ai_agent", 0);
    if (!usageCheck.allowed) {
      return NextResponse.json({
        error: usageCheck.upgradeMessage,
        limitReached: true,
        usage: { used: usageCheck.currentUsage, limit: usageCheck.limit, plan: usageCheck.plan, resetAt: usageCheck.resetAt, isLifetime: usageCheck.isLifetime },
      }, { status: 429 });
    }

    const apiKey = process.env.MISTRAL_COMMUNITY_API_KEY || process.env.MISTRAL_API_KEY || "";
    if (!apiKey) {
      const fallback = buildFallbackReply(currentJobData, userMessage);
      return NextResponse.json(fallback);
    }

    try {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: buildSystemPrompt(currentJobData) },
          ...(Array.isArray(conversationHistory) ? conversationHistory : []),
          { role: "user", content: userMessage }
        ],
        responseFormat: { type: "json_object" }
      });

      const content = response.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("Invalid response from Mistral");
      }

      const result = JSON.parse(content);
      const normalizedJobData = normalizeJobData(
        {
          ...currentJobData,
          ...(result?.jobData || {}),
          intent:
            typeof result?.jobData?.intent === "string"
              ? result.jobData.intent
              : inferSearchIntent(userMessage, currentJobData).intent,
        },
        userMessage
      );

      const nextState = typeof result?.nextState === "string" ? result.nextState : "collecting";

      // ── Only consume the quota when the AI produces a search result ──
      if (nextState === "posted") {
        await useFeature(userId, "community_ai_agent", 1);
      }

      return NextResponse.json({
        message: typeof result?.message === "string" ? result.message : "",
        jobData: normalizedJobData,
        nextState,
      });
    } catch (modelError) {
      console.error("Community Chat Model Error:", modelError);
      const fallback = buildFallbackReply(currentJobData, userMessage);
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error("Community Chat Error:", error);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
