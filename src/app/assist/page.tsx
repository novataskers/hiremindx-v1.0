"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Loader2, Search, Mic, MicOff, Copy, Check, Volume2, X, FileText, Image as ImageIcon, History, Plus, Trash2, Download, Mail, AlertCircle, Code, TrendingUp, Square, ChevronUp, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";
import { useTheme } from "@/components/ThemeProvider";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HeroBackground } from "@/components/HeroBackground";
import { detectDocumentRequest, generateDocument, extractTitleFromContent } from "@/lib/document-generator";
import { authClient } from "@/lib/auth-client";
import { MarketAgentCard } from "@/components/MarketAgentCard";
import { PredictionCard } from "@/components/PredictionCard";
import { WeatherCard } from "@/components/WeatherCard";
import { MapCard } from "@/components/MapCard";
import { DarkResearchCard } from "@/components/DarkResearchCard";
import { DeepResearchCard } from "@/components/DeepResearchCard";
import { AssistCanvas } from "@/components/AssistCanvas";

interface Source {
  title: string;
  url: string;
  favicon: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  files?: UploadedFile[];
  documentContext?: string;
  documentType?: 'pdf' | 'docx' | null;
  isStreaming?: boolean;
  statusText?: string;
  options?: string[];
  sources?: Source[];
  isMarket?: boolean;
  marketPrompt?: string;
  marketHistory?: { role: string; content: string }[];
  isPrediction?: boolean;
  predictionPrompt?: string;
  isDarkResearch?: boolean;
  darkResearchPrompt?: string;
  isCanvas?: boolean;
  isWeather?: boolean;
  weatherPrompt?: string;
  weatherLocation?: { lat: number; lng: number; name?: string };
  isLocationMap?: boolean;
  mapPrompt?: string;
  mapLocation?: { lat: number; lng: number; name?: string };
  mapDestination?: { lat: number; lng: number; name?: string };
}

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  url: string;
}

interface UserLocation {
  lat: number;
  lng: number;
  name?: string;
}

interface ChatSession {
  id: number;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

// Keywords that indicate an outreach/email intent
const OUTREACH_KEYWORDS = [
  'send email', 'send an email', 'email to', 'outreach', 'job outreach',
  'find email', 'find contact', 'gmail', 'outlook', 'email campaign',
  'connect gmail', 'connect email', 'email provider', 'send mail',
  'draft email', 'write email', 'email address', 'recruiter email',
  'contact recruiter', 'reach out', 'reach out to', 'cold email',
  'cold outreach', 'networking email', 'follow up email', 'follow-up email',
  'job application email', 'cover letter email', 'linkedin outreach',
  'email finder', 'find contact info', 'email hunter', 'find recruiter',
  'message recruiter', 'apply via email', 'bulk email',
  'email sequence', 'outreach campaign', 'job search email',
  // Mid-conversation: "send this as an email", "email this to", etc.
  'send this as', 'send this to', 'email this', 'email this to',
  'send it to', 'send it as', 'send it via email', 'mail this',
  'mail this to', 'send as email', 'forward this', 'forward it to',
  'send that as', 'send that to', 'email that', 'email it to',
  'send the above', 'email the above', 'send this paragraph',
  'send this message', 'send this text', 'turn this into an email',
  'convert this to email', 'make this an email', 'draft this as',
  '@gmail.com', '@yahoo.com', '@outlook.com', '@hotmail.com',
];

// Also detect email addresses in the message (user@domain.com pattern)
function containsEmailAddress(text: string): boolean {
  return /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(text);
}

function isOutreachIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return OUTREACH_KEYWORDS.some(kw => lower.includes(kw)) || containsEmailAddress(text);
}

// Market intent detection — fires the Live Market Intelligence agent.
// Matches questions about whether/when to buy, sell, invest in specific assets.
const MARKET_ASSETS = [
  // Crypto
  'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'xrp', 'ripple',
  'bnb', 'binance', 'cardano', 'ada', 'dogecoin', 'doge', 'avalanche', 'avax',
  'polygon', 'matic', 'litecoin', 'ltc', 'chainlink', 'link', 'polkadot', 'dot',
  'shiba', 'pepe', 'crypto', 'cryptocurrency', 'altcoin', 'defi', 'nft', 'token',
  // Stocks
  'tesla', 'tsla', 'apple', 'aapl', 'nvidia', 'nvda', 'microsoft', 'msft',
  'google', 'googl', 'amazon', 'amzn', 'meta', 'netflix', 'nflx', 'amd',
  'intel', 'arm', 'palantir', 'pltr', 'coinbase', 'coin', 'robinhood', 'hood',
  's&p 500', 'sp500', 'nasdaq', 'dow jones', 'spy', 'qqq', 'etf',
  // Commodities & Forex
  'gold', 'silver', 'crude oil', 'oil', 'natural gas', 'wheat', 'corn',
  'usd', 'eur', 'gbp', 'jpy', 'forex', 'currency', 'dollar', 'euro', 'pound',
  // Generic
  'stock', 'stocks', 'share', 'shares', 'market', 'asset',
];

const MARKET_ACTIONS = [
  // Buy/sell intent
  'should i buy', 'should i sell', 'should i invest', 'should i trade',
  'should i hold', 'should i short', 'should i go long',
  'when to buy', 'when to sell', 'when should i buy', 'when should i sell',
  'when should i invest', 'when should i trade',
  'is it good to buy', 'is it a good time to buy', 'is it a good time to sell',
  'good time to buy', 'good time to sell', 'right time to buy', 'right time to sell',
  'best time to buy', 'best time to sell',
  // Analysis/signals
  'buy signal', 'sell signal', 'trade signal', 'trading signal',
  'price prediction', 'price target', 'price analysis',
  'analyze', 'analyse', 'analysis', 'predict', 'forecast',
  'bullish', 'bearish', 'sentiment',
  // Direct trading commands
  'trade on', 'trade for me', 'do the trading', 'start trading',
  'trade gold', 'trade bitcoin', 'trade crypto', 'trade stocks',
  'live market', 'real-time market', 'live trading', 'market intelligence',
  // Investment advice
  'invest in', 'worth investing', 'worth buying', 'profitable',
  'return on investment', 'roi', 'profit from',
  'go up', 'go down', 'will it rise', 'will it fall', 'pump', 'dump',
];

function isMarketIntent(text: string): boolean {
  const lower = text.toLowerCase();
  // Must have both an asset AND an action to avoid false positives
  const hasAsset = MARKET_ASSETS.some(a => lower.includes(a));
  const hasAction = MARKET_ACTIONS.some(a => lower.includes(a));
  // Explicit market commands — no asset required
  const isExplicit =
    lower.includes('do the trading') ||
    lower.includes('live market intelligence') ||
    lower.includes('market analysis for') ||
    lower.includes('trading signal') ||
    lower.includes('start live market');
  return (hasAsset && hasAction) || isExplicit;
}

// Prediction intent detection — smarter: detects forecasting, trends, predictions, "what will happen"
const PREDICTION_PATTERNS = [
  /\bpredict\b.{0,30}\b(trend|hiring|demand|growth|spike|decline|future|market|industry|salary|job|ai|tech)\b/i,
  /\bwhat\s+(will|would|might|could)\s+happen\b/i,
  /\bwhat\s+happens?\s+next\s+(with|to|in|for)\b/i,
  /\bforecast\b.{0,30}\b(trend|hiring|demand|growth|market|industry|salary)\b/i,
  /\bfuture\s+(of|for|in)\b/i,
  /\bprediction\s+(for|about|on|regarding)\b/i,
  /\bwill\b.{0,25}\b(grow|decline|increase|decrease|rise|fall|spike|drop|boom|crash|change)\b/i,
  /\bexpect(ed)?\s+(trend|growth|decline|change)/i,
  /\btrend\s+(prediction|forecast|analysis|outlook)/i,
  /\bhiring\s+(trend|forecast|prediction|outlook|projection)/i,
  /\bdemand\s+(prediction|forecast|trend|projection)/i,
  /\b(salary|wage|pay)\s+(trend|forecast|prediction|outlook)/i,
  /\bpredict\s+(the|my|next|future|when|how|what|if)\b/i,
  /\b(will|would)\s+(ai|machine learning|crypto|bitcoin|tech|jobs?)\b.{0,20}\b(grow|decline|change|evolve|dominate)/i,
  /\boutlook\s+(for|on)\b/i,
  /\bprojection\s+(for|on|about)\b/i,
  // Bare predict/forecast with any object
  /\b(predict|forecast)\s+(this|that|it)\b/i,
  // Probability / chances / odds
  /\b(chances?|probability|odds)\s+(of|that|this|are)/i,
  /\bhow\s+likely\b/i,
  /\bwhat('s|\s+is)\s+the\s+(probability|likelihood|chance)\b/i,
  // Outcome / performance phrasing
  /\bhow\s+will\b.{0,30}\b(be|look|perform|turn\s+out|end\s+up|play\s+out|do|fare|develop|progress)/i,
  /\bwhat\s+will\b.{0,30}\b(look\s+like|be\s+like|happen|result|become)/i,
  // "What's going to happen" / "What's likely to happen"
  /\bwhat('s|\s+is)\s+(going\s+to|gonna)\s+happen/i,
  /\bwhat('s|\s+is)\s+likely\s+to\b/i,
  // Temporal predictions: "in the next X hours/days"
  /\bin\s+the\s+next\s+\w*\s*(hour|day|week|month|year|quarter)/i,
  // "What will happen to/with/if/when/next"
  /\bwhat\s+(will|would|might|could)\s+happen\s+(to|with|if|when|next)\b/i,
  // "Will X go up/down/improve"
  /\bwill\b.{0,20}\b(go\s+up|go\s+down|improve|worsen|succeed|fail|recover|collapse)/i,
  // Conversational prediction requests
  /\b(can|could)\s+you\s+(predict|forecast)\b/i,
  /\b(give|show)\s+(me\s+)?(a\s+)?(prediction|forecast)/i,
  /\bwhat\s+do\s+you\s+think\s+will\b/i,
  // Estimate/anticipate phrasing
  /\bestimate\b.{0,20}\b(outcome|result|future|likelihood|chance|impact)/i,
  /\banticipate\b/i,
  // Generic standalone prediction words (broad catch-all, placed last)
  /\bpredict\b/i,
  /\bforecast\b/i,
];

function isPredictionIntent(text: string): boolean {
  const lower = text.toLowerCase();
  // If user used explicit prediction language, don't let Deep Research override
  const hasExplicitPredictionWord = /\b(predict|forecast|prediction|probability|chances|odds|outlook|projection|anticipate)\b/i.test(lower);
  if (!hasExplicitPredictionWord && isDeepResearchIntent(text)) return false;
  return PREDICTION_PATTERNS.some(p => p.test(lower));
}

// Deep Research intent detection — smarter: auto-detects when deep research is needed
function isDeepResearchIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    // Explicit deep research commands
    /\bdeep\s*research\s*(mode)?\s*:?/i.test(lower) ||
    /\bfind\s+unfiltered\b/i.test(lower) ||
    /\bintelligence\s*report\s*(on|about|for)\b/i.test(lower) ||
    // Document/file finding
    /\bfind\s+(me\s+)?(the|a|any)?\s*(document|file|pdf|report|record|transcript|filing|email|letter|memo|evidence|data|dataset|log)s?\b/i.test(lower) ||
    /\b(document|file|pdf|report|record|transcript|filing|court\s*filing|evidence|leaked|classified|declassified|unsealed|redacted|unredacted)\s+(of|about|from|on|for|related|that|where|which|containing|with)\b/i.test(lower) ||
    /\b(search|look|dig)\s+(through|into|for|in)\s+.{0,30}(files?|documents?|records?|database|archive|repository)/i.test(lower) ||
    // Website crawling requests
    /\bgo\s+(into|to|through)\s+(the\s+)?\w+\.(org|gov|com|net|edu)/i.test(lower) ||
    /\b(crawl|scrape|scan|check|search)\s+(the\s+)?\w+\.(org|gov|com|net|edu)/i.test(lower) ||
    // Specific data investigation
    /\bfind\s+(me\s+)?(the|a|any)?\s*(data|info|information|details)\s+(on|about|of|for|from|related|regarding)\b/i.test(lower) ||
    /\b(action|case|court|legal|justice|government)\s+(file|document|record|report|filing)s?\b/i.test(lower) ||
    /\b(epstein|court\s*case|lawsuit|indictment|subpoena|warrant|deposition)/i.test(lower) ||
    // Archive / public records
    /\b(public\s+record|foia|freedom\s+of\s+information|archived|declassified)/i.test(lower) ||
    /\b(investigate|investigation|probe|inquiry)\s+(into|about|on|regarding)/i.test(lower) ||
    // Natural language deep research triggers
    /\b(research|look\s+up|look\s+into|dig\s+into|deep\s+dive)\s+(on|into|about|for)\b/i.test(lower) ||
    /\bwhat\s+(is|are|was|were)\s+the\s+(document|file|record|evidence|report)s?\b/i.test(lower) ||
    /\b(where|how)\s+(can|do)\s+(i|we)\s+find\b/i.test(lower) ||
    /\buncover\b.{0,20}\b(truth|facts?|evidence|data|details|secrets?)/i.test(lower) ||
    /\b(expose|reveal|discover)\s+(the|any)?\s*(truth|facts?|evidence|corruption|fraud|scandal)/i.test(lower) ||
    // Comprehensive / detailed / extensive analysis requests
    /\b(comprehensive|detailed|extensive|exhaustive|thorough|in-?depth)\s+(analysis|breakdown|review|examination|study|overview|exploration|report|research)\b/i.test(lower) ||
    /\bdeep\s+(breakdown|analysis|exploration|examination|study)\b/i.test(lower) ||
    // Multi-source / cross-reference research
    /\b(multi-?source|cross-?reference|cross-?check)\s+(analysis|research|investigation|study)\b/i.test(lower) ||
    // Advanced / intensive / rigorous research
    /\b(advanced|intensive|rigorous)\s+(research|analysis|investigation|study|examination)\b/i.test(lower) ||
    // Long-form / detailed reasoning
    /\b(long-?form|detailed)\s+(reasoning|explanation|research|analysis|exploration)\b/i.test(lower) ||
    // "Analyze in depth / deeply / thoroughly"
    /\b(analyze|analyse)\s+(in\s+depth|deeply|thoroughly|extensively|comprehensively)\b/i.test(lower) ||
    // "I need research/analysis on"
    /\bi\s+need\s+(detailed\s+|comprehensive\s+|extensive\s+|thorough\s+)?(research|analysis|information|breakdown)\s+(on|about|for|regarding)\b/i.test(lower) ||
    // "Give me everything on"
    /\b(give|show|tell)\s+me\s+everything\s+(on|about|regarding)\b/i.test(lower) ||
    // "Extensively / thoroughly / comprehensively research/analyze"
    /\b(extensively|thoroughly|comprehensively)\s+(research|analyze|analyse|investigate|examine|study|explore)\b/i.test(lower) ||
    // "Do a full/complete analysis"
    /\b(do|perform|conduct|run)\s+(a\s+)?(full|complete|thorough|deep|comprehensive)\s+(analysis|research|investigation|study|review|breakdown)\b/i.test(lower)
  );
}

// Canvas intent detection — infographics, flashcards, quizzes, websites, games, coding
function isCanvasIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    // Direct creation patterns: "create/make/build X"
    /\b(create|make|build|design|generate|develop|code|write|program)\b.{0,60}\b(infographic|flashcard|quiz|website|webpage|homepage|landing\s*page|portfolio|game|e-?commerce|commerce|dashboard|form|survey|resume|cv\s+template|card|poster|flyer|banner|brochure|menu|certificate|diagram|chart|timeline|bot|api|webhook|app|application|page|site|calculator|clock|timer|counter|todo|to-?do|list|tool|widget|component|animation|interface|ui|layout|template|mockup|prototype|store|shop|marketplace|boutique|fashion|clothing|catalog|product\s*page|booking|reservation|forum|social\s*network|gallery|directory|wiki|docs|documentation|admin\s*panel|control\s*panel|crm|erp|saas|platform|portal|blog|cms|invoice|payment|checkout|cart|wishlist|subscription|membership|landing|squeeze\s*page|sales\s*page|funnel|lead\s*page|optin|newsletter|campaign)/i.test(lower) ||
    // "X for/about Y" patterns
    /\b(infographic|flashcard|quiz|website|webpage|homepage|landing\s*page|game|app|page|dashboard|store|shop|marketplace|commerce|boutique|catalog|blog|forum|gallery|portal|platform|saas)\b.{0,20}\b(for|about|on|of|with|featuring|showcasing|selling|buying)\b/i.test(lower) ||
    // "make me a X" pattern — widened with commerce/store/shop keywords
    /\b(make|build|create|give)\s+(me\s+)?(a|an)\s+\w*\s*(game|website|page|app|site|quiz|flashcard|infographic|bot|api|calculator|clock|timer|counter|todo|dashboard|form|tool|widget|animation|landing|portfolio|template|mockup|store|shop|commerce|marketplace|boutique|catalog|blog|cms|crm|erp|platform|portal|saas|gallery|forum|wiki|docs)/i.test(lower) ||
    // HTML/CSS/JS explicit patterns
    /\b(html|css|javascript)\s+(page|site|app|code|project|file)/i.test(lower) ||
    // Adjective + canvas noun — vastly expanded adjective list
    /\b(simple|basic|cool|interactive|fun|responsive|modern|animated|beautiful|nice|quick|small|female|male|elegant|luxury|luxurious|premium|minimal|clean|sleek|stylish|fashion|trendy|vintage|retro|classic|professional|corporate|startup|personal|artistic|creative|bold|vibrant|colorful|monochrome|neon|cyberpunk|futuristic|pastel|gradient|glassmorphism|neumorphism|minimalist|organic|warm|cool|dark|light|pink|blue|red|green|purple|gold|silver|black|white|orange|yellow|teal|indigo|rose|amber|emerald|cyan|magenta|lime|brown|gray|grey|navy|maroon|olive|coral|salmon|khaki|lavender|beige|ivory|mint|peach|periwinkle|plum|sienna|slate|stone|zinc|neutral|brutalist|swiss|bauhaus|art\s*deco|art\s*nouveau|gothic|industrial|rustic|coastal|tropical|bohemian|scandinavian|japanese|zen|korean|chinese|indian|arabic|mexican|french|italian|spanish|german|british|american|nordic|mediterranean)\s+(game|website|page|app|calculator|clock|timer|counter|todo|bot|dashboard|form|landing|portfolio|store|shop|commerce|marketplace|boutique|catalog|blog|cms|gallery|forum|wiki|portal|platform|saas|template|mockup|prototype)/i.test(lower) ||
    // Bot/integration patterns
    /\b(whatsapp|discord|telegram|slack)\s*(bot|integration)\b/i.test(lower) ||
    /\bcreate\s+(an?\s+)?api\s+(for|that)\b/i.test(lower) ||
    // Canvas-specific triggers
    /\b(make|write|do|code|build)\s+(this|that|it)\s+in\s+(html|css|javascript|code)/i.test(lower) ||
    /\bopen\s+(the\s+)?canvas\b/i.test(lower) ||
    /\bturn\s+on\s+(the\s+)?canvas\b/i.test(lower) ||
    /\bcanvas\s*(mode|view|page|panel)/i.test(lower) ||
    /\bshow\s+(me\s+)?(a\s+)?(live\s+)?preview/i.test(lower) ||
    /\bcode\s+(this|that|it)\s+(for|in)\s+(me|html|a\s+page)/i.test(lower) ||
    // Game-specific patterns: "flappy bird", "snake game", "tic tac toe" etc.
    /\b(flappy\s*bird|snake|tic\s*tac\s*toe|pong|tetris|breakout|pac\s*man|space\s*invader|minesweeper|2048|wordle|hangman|chess|checkers|sudoku|memory\s*(game|card)|platformer|shooter|rpg|racing\s*game|puzzle\s*game|typing\s*(game|test)|simon\s*(says)?|rock\s*paper\s*scissors)/i.test(lower) ||
    // "in HTML" or "as a webpage" patterns at end
    /\b(in|as|using)\s+(html|a\s+webpage?|a\s+website|a\s+page|code|a\s+web\s*app)\s*$/i.test(lower) ||
    // "convert/turn this into a website/page"
    /\b(convert|turn|transform)\s+(this|that|it)\s+(into|to)\s+(a\s+)?(website|webpage|page|html|app|web\s*app)/i.test(lower) ||
    // "I want/need a website/app/game"
    /\b(i\s+want|i\s+need|i\s+would\s+like|can\s+you\s+(make|create|build)|could\s+you\s+(make|create|build))\s+.{0,30}\b(website|app|game|page|dashboard|form|quiz|infographic|flashcard|bot|landing|portfolio|calculator|store|shop|commerce|marketplace|boutique|catalog|blog|cms|gallery|forum|wiki|portal|platform|saas|template|mockup|prototype)/i.test(lower)
  );
}

// Detect if a message is asking to modify/edit existing canvas code
function isCanvasEditIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    // Change/modify/replace/update/fix patterns
    /\b(change|modify|update|edit|fix|tweak|adjust|refactor|rewrite|rework|revise|redesign|restyle|rearrange|reorder|restructure|transform|convert|switch|swap|replace|substitute)\b/i.test(lower) ||
    // Add/insert patterns
    /\b(add|insert|include|append|attach|put in|throw in|stick in|drop in|slot in|work in|bring in|add a|add an|add some|add more)\b/i.test(lower) ||
    // Remove/delete patterns
    /\b(remove|delete|drop|get rid of|take out|cut out|eliminate|exclude|omit|clear|hide|disable|turn off|get rid|take away)\b/i.test(lower) ||
    // Make/turn/set patterns (e.g. "make the cars rounder", "turn this into a button")
    /\b(make|turn|set)\s+(the|this|that|it|them|those|these|all|every)?\s*\w+/i.test(lower) ||
    // Color/style/size/layout patterns
    /\b(color|colour|style|size|font|background|border|shadow|margin|padding|width|height|layout|position|align|center|left|right|top|bottom|opacity|gradient|spacing|gap|radius|round|square)\b/i.test(lower) ||
    // "Why is / how come / what's wrong / can you make" patterns implying dissatisfaction
    /\b(why|how come|what's wrong|this looks|it looks|that looks|the \w+ looks|can you make|can you change|can you fix|can you add|can you remove|can you update|could you make|could you change|could you fix|could you add|could you remove|could you update|please make|please change|please fix|please add|please remove|please update)\b/i.test(lower) ||
    // Visual quality complaints
    /\b(round|square|boxy|ugly|weird|broken|not working|doesn't work|won't work|glitch|bug|error|too big|too small|too wide|too narrow|too tall|too short|cropped|cut off|overlapping|misaligned|off center|blurry|pixelated|faded|too dark|too bright|too colorful|boring|plain|simple|basic|cheap|outdated|old|clunky)\b/i.test(lower) ||
    // Interactive/visual element requests
    /\b(animate|animation|hover|click|scroll|swipe|drag|sound|music|audio|video|image|photo|picture|icon|logo|banner|hero|navbar|footer|sidebar|modal|popup|tooltip|dropdown|accordion|carousel|slider|gallery|grid|list|table|form|input|button|link|menu|tab|badge|tag|chip|avatar|card|tile|panel|section|divider|spacer|wrapper|container)\b/i.test(lower)
  );
}



// Detect if AI response is about a financial topic but user didn't trigger the market agent
// Weather intent detection — triggers rich weather card
function isWeatherIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    // Direct weather queries
    /\bweather\b/i.test(lower) ||
    /\btemperature\b/i.test(lower) ||
    /\bforecast\b/i.test(lower) ||
    /\bwhat's the weather/i.test(lower) ||
    /\bhow's the weather/i.test(lower) ||
    /\bshow me.*weather/i.test(lower) ||
    /\bweather today/i.test(lower) ||
    /\bweather outside/i.test(lower) ||
    /\bcurrent weather/i.test(lower) ||
    // Implicit weather-related queries
    /\bshould i take an umbrella/i.test(lower) ||
    /\bdo i need a jacket/i.test(lower) ||
    /\bshould i wear a jacket/i.test(lower) ||
    /\bis it safe to go (outside|for a walk|walking)/i.test(lower) ||
    /\bwill it rain/i.test(lower) ||
    /\bis it (going to|gonna) rain/i.test(lower) ||
    /\bcan i go (jogging|running|outside)/i.test(lower) ||
    /\bshould i go outside/i.test(lower) ||
    /\bis it (hot|cold|warm|freezing)/i.test(lower) ||
    /\bhow hot is it/i.test(lower) ||
    /\bhow cold is it/i.test(lower)
  );
}

// Used to suggest the live agent at the end of a normal chat response
// Only checks the user message, not the AI response — to avoid false positives
// from generic words that appear in any AI response ("market", "buy", "price", etc.)
// Location intent detection — triggers rich map card
function isLocationIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    // Direct location queries
    /\bwhere\s+am\s+i\b/i.test(lower) ||
    /\bwhere\s+is\s+my\s+(current\s+)?location\b/i.test(lower) ||
    /\bshow\s+me\s+my\s+location\b/i.test(lower) ||
    /\bshow\s+my\s+location\b/i.test(lower) ||
    /\bwhat['\s]+s\s+my\s+location\b/i.test(lower) ||
    /\bwhat['\s]+s\s+near\s+me\b/i.test(lower) ||
    /\bwhat['\s]+s\s+around\s+(me|here)\b/i.test(lower) ||
    // Directions / route
    /\bdirections?\s+(?:to\s+)?/i.test(lower) ||
    /\bhow\s+(?:do\s+i|to)\s+(?:get|go)\s+(?:to\s+)?/i.test(lower) ||
    /\bnavigate\s+(?:to\s+)?/i.test(lower) ||
    /\broute\s+(?:to\s+)?/i.test(lower) ||
    /\bshow\s+me\s+the\s+way\s+(?:to\s+)?/i.test(lower) ||
    // Distance
    /\bhow\s+far\s+(?:is|am\s+i)\s+(?:from\s+)?/i.test(lower) ||
    /\bdistance\s+(?:to|from)\s+/i.test(lower) ||
    // Nearby / nearest
    /\bnearest\b/i.test(lower) ||
    /\bclosest\b/i.test(lower) ||
    /\bnearby\b/i.test(lower) ||
    /\bfind\s+nearby\b/i.test(lower) ||
    /\bnear\s+me\b/i.test(lower) ||
    /\bis\s+there\s+a\s+\w+\s+nearby\b/i.test(lower) ||
    /\bwhere['\s]+s\s+the\s+nearest\b/i.test(lower) ||
    // Travel time / mode follow-ups
    /\bcan\s+i\s+walk\s+(?:there|to\s+it)\b/i.test(lower) ||
    /\bhow\s+long\s+will\s+it\s+take\b/i.test(lower) ||
    /\bhow\s+long\s+to\s+(?:get|go)\b/i.test(lower) ||
    /\bwalking\s+(?:distance|time)\b/i.test(lower) ||
    /\bdriving\s+(?:distance|time)\b/i.test(lower) ||
    // Generic map trigger
    /\bshow\s+me\s+on\s+a\s+map\b/i.test(lower) ||
    /\bmap\s+(?:of|showing)\b/i.test(lower)
  );
}

function isMarketRelatedResponse(userMsg: string, _aiResponse: string): boolean {
  const lower = userMsg.toLowerCase();
  // Must mention a specific named asset
  const hasNamedAsset = [
    'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'xrp', 'ripple',
    'bnb', 'cardano', 'ada', 'dogecoin', 'doge', 'avalanche', 'avax',
    'polygon', 'matic', 'litecoin', 'ltc', 'chainlink', 'link', 'polkadot',
    'shiba', 'pepe', 'crypto', 'cryptocurrency',
    'tesla', 'tsla', 'apple', 'aapl', 'nvidia', 'nvda', 'microsoft', 'msft',
    'google', 'googl', 'amazon', 'amzn', 'meta', 'netflix', 'nflx', 'amd',
    'intel', 'palantir', 'pltr', 'coinbase', 's&p 500', 'sp500', 'nasdaq',
    'gold', 'silver', 'crude oil', 'natural gas',
    'usd', 'eur', 'gbp', 'jpy', 'forex',
  ].some(a => lower.includes(a));
  // Must ask a financial question (not just mention the asset)
  const hasFinancialQuestion = [
    'price', 'worth', 'value', 'invest', 'profitable',
    'go up', 'go down', 'rise', 'fall', 'pump', 'dump',
    'bullish', 'bearish', 'buy', 'sell', 'hold', 'trade',
    'roi', 'return', 'profit',
  ].some(w => lower.includes(w));
  // Must also be framed as a question or advice request
  const isQuestion = lower.includes('?') ||
    lower.startsWith('what') || lower.startsWith('when') ||
    lower.startsWith('should') || lower.startsWith('is it') ||
    lower.startsWith('will') || lower.startsWith('how much') ||
    lower.startsWith('tell me') || lower.startsWith('what is the');
  return hasNamedAsset && hasFinancialQuestion && isQuestion;
}

function parseOptionsFromResponse(text: string): { cleanText: string; options: string[] } {
  const optionsMatch = text.match(/\[OPTIONS:(.*?)\]/);
  if (optionsMatch) {
    const options = optionsMatch[1].split('|').map(o => o.trim()).filter(o => o.length > 0);
    const cleanText = text.replace(optionsMatch[0], '').trim();
    return { cleanText, options };
  }
  return { cleanText: text, options: [] };
}

// Code block component with language label + copy button
function CodeBlock({ children, className, isDark }: { children: React.ReactNode; className?: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  const codeString = typeof children === 'string' ? children : String(children ?? '');
  const language = (className?.replace('language-', '') || '').toUpperCase();

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString.replace(/\n$/, '')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`relative group my-3 rounded-xl overflow-hidden border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-900 border-gray-700'}`}>
      {/* Header bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-gray-700 bg-gray-800'}`}>
        <div className="flex items-center gap-2">
          <Code className="w-3.5 h-3.5 text-zinc-500" />
          {language && <span className="text-xs font-mono text-zinc-400">{language}</span>}
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
            copied
              ? 'text-green-400 bg-green-400/10'
              : isDark
              ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
          }`}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      {/* Code content */}
      <div className="overflow-x-auto">
        <pre className="p-4 text-sm leading-relaxed m-0 bg-transparent" style={{ whiteSpace: 'pre', wordBreak: 'normal', overflowWrap: 'normal' }}>
          <code className={`font-mono text-sm ${isDark ? 'text-zinc-100' : 'text-gray-100'} ${className || ''}`}>
            {children}
          </code>
        </pre>
      </div>

    </div>
  );
}

// Detect if the AI response is a real exportable document (CV, cover letter, report, etc.)
// ONLY fires when user explicitly asked to create a document OR response is clearly a structured doc.
// Does NOT fire for code, research answers, general chat.
function detectDocumentInResponse(response: string, userMessage: string): 'pdf' | 'docx' | null {
  const lower = userMessage.toLowerCase();

  // User explicitly asked for a CV/resume/cover letter/report by name
  const explicitDocRequest = /\b(make|create|write|generate|build|draft|give me)\b.{0,40}\b(cv|resume|cover letter|cover-letter|report|proposal|letter of recommendation|reference letter|personal statement)\b/i.test(lower);
  if (explicitDocRequest && response.length > 400) return 'pdf';

  // Response looks like a proper CV/resume (must have MULTIPLE document-specific sections, not just one ##)
  const cvSectionCount = [
    /\b(professional summary|career objective|personal statement)\b/i,
    /\b(work experience|experience|employment history)\b/i,
    /\b(education|academic background|qualifications)\b/i,
    /\b(skills|technical skills|core competencies)\b/i,
    /\b(certifications?|awards?|achievements?)\b/i,
  ].filter(p => p.test(response)).length;

  // Only treat as a document if it has 3+ CV sections AND is long enough
  if (cvSectionCount >= 3 && response.length > 600) return 'pdf';

  return null;
}

export default function AssistPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const { theme } = useTheme();
  const [devSession, setDevSession] = useState<{ user: { id: string; name: string; email: string } } | null>(null);
  const [checkingDevSession, setCheckingDevSession] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("devSession");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setDevSession(parsed);
        // Sync to cookie so API routes can read it (server-side)
        document.cookie = `devSession=${encodeURIComponent(stored)}; path=/; max-age=86400; SameSite=Lax`;
        // Ensure the dev-user row exists in the DB (needed for FK on chat_sessions)
        fetch('/api/seed-dev-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      } catch {}
    }
    setCheckingDevSession(false);
  }, []);

  const [showWelcome, setShowWelcome] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [generatingDocId, setGeneratingDocId] = useState<string | null>(null);
  const [lastMessageSent, setLastMessageSent] = useState<string | null>(null);
  const [isStartingNewChat, setIsStartingNewChat] = useState(false);

  // Location state
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  // Canvas state (Gemini-style right panel)
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasCode, setCanvasCode] = useState("");
  const [canvasStreaming, setCanvasStreaming] = useState(false);

  // Email/outreach state
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [hasGmailAccess, setHasGmailAccess] = useState<boolean | null>(null);
  const [emailProvider, setEmailProvider] = useState<"google" | "microsoft" | null>(null);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSavingRef = useRef(false);
  const isStartingNewChatRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const currentSessionIdRef = useRef<number | null>(null);
  const savedMessageIdsRef = useRef<Set<string>>(new Set());
  const sessionCreationPromiseRef = useRef<Promise<number | null> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadedFilesRef = useRef<UploadedFile[]>([]);

  useEffect(() => { uploadedFilesRef.current = uploadedFiles; }, [uploadedFiles]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { savedMessageIdsRef.current = savedMessageIds; }, [savedMessageIds]);

  useEffect(() => {
    if (session?.user?.id) {
      localStorage.setItem('hiremind_assist_session_id', session.user.id);
    }
  }, [session]);

  // Restore saved location on mount
  useEffect(() => {
    const stored = localStorage.getItem('hiremindx_user_location');
    const permission = localStorage.getItem('hiremindx_location_permission');
    if (permission === 'granted' && stored) {
      try { setUserLocation(JSON.parse(stored)); } catch {}
    }
  }, []);

  // Fetch email token
  useEffect(() => {
    const fetchEmailToken = async () => {
      try {
        const response = await fetch('/api/gmail-token');
        const data = await response.json();
        if (data.accessToken) {
          setGmailToken(data.accessToken);
          setHasGmailAccess(true);
          setEmailProvider(data.provider || "google");
        } else {
          setHasGmailAccess(false);
        }
      } catch {
        setHasGmailAccess(false);
      }
    };
    if (session?.user) fetchEmailToken();
  }, [session]);

  // Re-fetch email token on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (session?.user) {
        fetch('/api/gmail-token').then(r => r.json()).then(data => {
          if (data.accessToken) {
            setGmailToken(data.accessToken);
            setHasGmailAccess(true);
            setEmailProvider(data.provider || "google");
          } else {
            setHasGmailAccess(false);
          }
        }).catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [session]);

  const isListeningRef = useRef(false);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

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
              if (textareaRef.current) {
                const start = textareaRef.current.selectionStart;
                const end = textareaRef.current.selectionEnd;
                const text = textareaRef.current.value;
                const before = text.substring(0, start);
                const after = text.substring(end);
                const spaceBefore = before.length > 0 && !before.endsWith(" ") ? " " : "";
                const newValue = before + spaceBefore + transcript + after;
                setInput(newValue);
              } else {
                setInput(prev => prev + (prev ? " " : "") + transcript);
              }
            }
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          setIsListening(false);
        }
      };

      recognitionRef.current.onend = () => {
        if (isListeningRef.current) {
          try { recognitionRef.current?.start(); } catch { setIsListening(false); }
        }
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (!recognitionRef.current) { toast.error("Speech recognition is not supported in your browser."); return; }
      try { recognitionRef.current.start(); setIsListening(true); } catch (e) { console.error(e); }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const allowedTypes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'text/plain',
      'text/html',
      'text/css',
      'text/csv',
      'text/markdown',
      'application/json',
      'application/xml',
      'text/xml',
      'application/javascript',
      'text/javascript',
    ]);
    const allowedExtensions = ['.txt', '.md', '.markdown', '.html', '.htm', '.css', '.js', '.ts', '.tsx', '.jsx', '.json', '.xml', '.csv', '.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerName = file.name.toLowerCase();
      const isAllowed = allowedTypes.has(file.type) || allowedExtensions.some(ext => lowerName.endsWith(ext));
      if (!isAllowed) { toast.error(`File type not supported: ${file.name}`); continue; }
      if (file.size > 20 * 1024 * 1024) { toast.error(`File too large (max 20MB): ${file.name}`); continue; }
      try {
        let uploadFile = file;
        let finalType = file.type;
        if (file.type.startsWith('image/') && !file.type.includes('svg')) {
          const blob = await resizeImage(file);
          uploadFile = new File([blob], file.name, { type: 'image/jpeg' });
          finalType = 'image/jpeg';
        }
        const formData = new FormData();
        formData.append('file', uploadFile);
        const response = await fetch('/api/assist/upload', {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Upload failed: ${response.status}`);
        }
        const data = await response.json();
        setUploadedFiles(prev => [...prev, { name: data.name, type: finalType, size: data.size, url: data.url }]);
      } catch (err: any) {
        toast.error(err.message || `Failed to upload file: ${file.name}`);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resizeImage = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxSize = 1024;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob from canvas'));
          }, 'image/jpeg', 0.8);
        } else {
          reject(new Error('Failed to get canvas context'));
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = result;
    };
    reader.onerror = error => reject(error);
  });

  const deleteR2Files = (urls: string[]) => {
    if (urls.length === 0) return;
    fetch('/api/assist/upload/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    }).catch(() => {});
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => {
      const removed = prev[index];
      if (removed?.url) deleteR2Files([removed.url]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const getFileIcon = (type: string) => type.startsWith('image/') ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  useEffect(() => {
    if (!isPending && !checkingDevSession && !session?.user && !devSession) router.push("/");
  }, [session, isPending, router, devSession, checkingDevSession]);

  useEffect(() => {
    const cleanup = () => {
      const pending = uploadedFilesRef.current;
      if (pending.length > 0) {
        const urls = pending.map(f => f.url);
        navigator.sendBeacon('/api/assist/upload/delete', JSON.stringify({ urls }));
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, []);

  useEffect(() => {
    if (autoScroll) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, autoScroll]);

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  };

  useEffect(() => { adjustTextareaHeight(); }, [input]);

  const connectGmail = async () => {
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/assist",
        scopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/contacts.readonly",
          "https://www.googleapis.com/auth/tasks",
          "https://www.googleapis.com/auth/tasks.readonly",
        ],
      });
    } catch {
      toast.error("Failed to connect Gmail. Please try again.");
    }
  };

  const connectOutlook = async () => {
    try {
      await authClient.signIn.social({
        provider: "microsoft",
        callbackURL: "/assist",
        scopes: [
          "openid",
          "profile",
          "email",
          "offline_access",
          "https://graph.microsoft.com/Mail.Send",
          "https://graph.microsoft.com/Mail.Read",
          "https://graph.microsoft.com/Mail.ReadWrite",
          "https://graph.microsoft.com/Calendars.ReadWrite",
          "https://graph.microsoft.com/Contacts.Read",
          "https://graph.microsoft.com/Tasks.ReadWrite",
        ],
      });
    } catch {
      toast.error("Failed to connect Outlook. Please try again.");
    }
  };

  const sendMessage = async (userMessage: string) => {
    if ((!userMessage.trim() && uploadedFiles.length === 0) || isLoading) return;

    const documentRequest = detectDocumentRequest(userMessage);
    const currentFiles = [...uploadedFiles];

    const userMsg: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      role: "user",
      content: userMessage || (currentFiles.length > 0 ? `Uploaded ${currentFiles.length} file(s)` : ''),
      timestamp: new Date(),
      files: currentFiles.length > 0 ? currentFiles : undefined,
      documentType: documentRequest.type,
    };

    const assistantMsgId = `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    // Check if this is a market/trading question — use MarketAgentCard inline
    const conversationHistoryForMarket = messages
      .filter(m => m.id !== "initial" && !m.isStreaming && m.content.trim() !== "")
      .map(m => ({ role: m.role, content: m.content }));

      // Canvas intent — open the side panel for visual/code creation
      // Also check if canvas is already open or if user is editing existing canvas code
      const isCanvasRequest = isCanvasIntent(userMessage) && !isOutreachIntent(userMessage);
      const hasCanvasHistory = messages.some(m => m.role === "assistant" && m.isCanvas);
      const isCanvasEdit = hasCanvasHistory && isCanvasEditIntent(userMessage) && !isOutreachIntent(userMessage) && !isDeepResearchIntent(userMessage) && !isPredictionIntent(userMessage) && !isMarketIntent(userMessage);
      const isCanvasFollowUp = (canvasOpen || isCanvasEdit) && !isOutreachIntent(userMessage) && !isDeepResearchIntent(userMessage) && !isPredictionIntent(userMessage) && !isMarketIntent(userMessage);
      const shouldUseCanvas = isCanvasRequest || isCanvasFollowUp;
      if (shouldUseCanvas) {
        setCanvasStreaming(true);
      }

      // Prediction Engine — fires for "predict trend", "what happens next", etc.
      if (isPredictionIntent(userMessage) && !isOutreachIntent(userMessage) && !isMarketIntent(userMessage) && !shouldUseCanvas) {
        const predictionMsg: Message = {
          id: assistantMsgId,
          role: "assistant",
          content: `[Prediction] ${userMessage}`,
          timestamp: new Date(),
          isStreaming: false,
          isPrediction: true,
          predictionPrompt: userMessage,
        };
        setMessages(prev => {
          const next = [...prev, userMsg, predictionMsg];
          setTimeout(() => saveCurrentSession(), 2000);
          return next;
        });
        setInput("");
        if (currentFiles.length > 0) deleteR2Files(currentFiles.map(f => f.url));
        setUploadedFiles([]);
        setAutoScroll(true);
        setLastMessageSent(null);
        setShowWelcome(false);
        return;
      }

      // Deep Research Mode (skip if canvas request)
      if (isDeepResearchIntent(userMessage) && !isOutreachIntent(userMessage) && !shouldUseCanvas) {
        const deepMsg: Message = {
          id: assistantMsgId,
          role: "assistant",
          content: `[Deep Research] ${userMessage}`,
          timestamp: new Date(),
          isStreaming: false,
          isDarkResearch: true,
          darkResearchPrompt: userMessage,
        };
        setMessages(prev => {
          const next = [...prev, userMsg, deepMsg];
          setTimeout(() => saveCurrentSession(), 2000);
          return next;
        });
        setInput("");
        if (currentFiles.length > 0) deleteR2Files(currentFiles.map(f => f.url));
        setUploadedFiles([]);
        setAutoScroll(true);
        setLastMessageSent(null);
        setShowWelcome(false);
        return;
      }

      if (isMarketIntent(userMessage) && !isOutreachIntent(userMessage)) {
        const marketMsg: Message = {
          id: assistantMsgId,
          role: "assistant",
          content: `[Market Analysis] ${userMessage}`,
          timestamp: new Date(),
          isStreaming: false,
          isMarket: true,
          marketPrompt: userMessage,
          marketHistory: conversationHistoryForMarket,
        };
        setMessages(prev => {
          const next = [...prev, userMsg, marketMsg];
          // Explicitly schedule save after state settles
          setTimeout(() => saveCurrentSession(), 2000);
          return next;
        });
        setInput("");
        if (currentFiles.length > 0) deleteR2Files(currentFiles.map(f => f.url));
        setUploadedFiles([]);
        setAutoScroll(true);
        setLastMessageSent(null);
        setShowWelcome(false);
        return;
      }

      // Location / Maps intent — triggers rich map card
      if (isLocationIntent(userMessage) && !isOutreachIntent(userMessage) && !shouldUseCanvas) {
        const mapLoc = await requestUserLocation();
        const mapMsg: Message = {
          id: assistantMsgId,
          role: "assistant",
          content: `[Map] ${userMessage}`,
          timestamp: new Date(),
          isStreaming: false,
          isLocationMap: true,
          mapPrompt: userMessage,
          mapLocation: mapLoc || undefined,
        };
        setMessages(prev => {
          const next = [...prev, userMsg, mapMsg];
          setTimeout(() => saveCurrentSession(), 2000);
          return next;
        });
        setInput("");
        if (currentFiles.length > 0) deleteR2Files(currentFiles.map(f => f.url));
        setUploadedFiles([]);
        setAutoScroll(true);
        setLastMessageSent(null);
        setShowWelcome(false);
        return;
      }

      // Weather intent — triggers rich weather card
      if (isWeatherIntent(userMessage) && !isOutreachIntent(userMessage) && !shouldUseCanvas) {
        const weatherLoc = await requestUserLocation();
        const weatherMsg: Message = {
          id: assistantMsgId,
          role: "assistant",
          content: `[Weather] ${userMessage}`,
          timestamp: new Date(),
          isStreaming: false,
          isWeather: true,
          weatherPrompt: userMessage,
          weatherLocation: weatherLoc || undefined,
        };
        setMessages(prev => {
          const next = [...prev, userMsg, weatherMsg];
          setTimeout(() => saveCurrentSession(), 2000);
          return next;
        });
        setInput("");
        if (currentFiles.length > 0) deleteR2Files(currentFiles.map(f => f.url));
        setUploadedFiles([]);
        setAutoScroll(true);
        setLastMessageSent(null);
        setShowWelcome(false);
        return;
      }

    setMessages(prev => [...prev, userMsg, {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
      isCanvas: shouldUseCanvas,
    }]);

    setInput("");
    setUploadedFiles([]);
    setIsLoading(true);
    setAutoScroll(true);
    setLastMessageSent(userMessage);
    setShowWelcome(false);

    try {
        // ── Single unified brain: /api/assist/chat handles everything ──────
        // Research, documents, emails, outreach, company search — all in one place.
        // The backend intelligently routes based on message intent + conversation context.
          const conversationHistory = messages
            .filter(m => m.id !== "initial" && !m.isStreaming && m.content.trim() !== "")
            .map(m => ({ role: m.role, content: m.content }));

        const attachments = currentFiles.map(f => ({ name: f.name, type: f.type, url: f.url }));

        const payload: Record<string, any> = {
          prompt: userMessage || (currentFiles.length > 0 ? 'Please analyze the uploaded file(s)' : ''),
          conversationHistory,
          isDocumentRequest: documentRequest.isDocumentRequest,
          documentType: documentRequest.type,
          attachments: attachments.length > 0 ? attachments : undefined,
          isCanvasRequest: shouldUseCanvas,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        // Pass existing canvas code when editing so the AI has the full code to modify
        if (isCanvasEdit && canvasCode) {
          payload.existingCanvasCode = canvasCode;
        }

        // Files are sent via attachments only — no duplicate payload fields

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const timeout = setTimeout(() => controller.abort(), 120000);

        let response: Response;
        try {
          response = await fetch('/api/assist/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        } catch (fetchErr: any) {
          clearTimeout(timeout);
          if (fetchErr.name === 'AbortError') throw new Error('Request timed out. Please try again.');
          throw fetchErr;
        }
        clearTimeout(timeout);

        if (controller.signal.aborted) throw new Error('Generation stopped by user.');
        if (response.status === 401) throw new Error("Session expired. Please sign in again.");
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 429 && errorData?.limitReached) {
            const usage = errorData.usage || {};
            window.dispatchEvent(new CustomEvent("usage-limit-reached", { detail: { message: errorData.error, resetAt: usage.resetAt || null, isLifetime: usage.isLifetime !== undefined ? usage.isLifetime : true } }));
            throw new Error("LIMIT_REACHED_SILENT");
          }
          // R2 upload handles size limits; 413 no longer applicable here
          throw new Error(errorData.error || `Error ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          // Outreach/email mode — JSON response with possible email sending
          const data = await response.json();

          if (data.reason === "no_email_token") {
            setHasGmailAccess(false);
            toast.error("Email not connected. Connect Gmail or Outlook to send emails.", {
              action: emailProvider === "microsoft"
                ? { label: "Connect Outlook", onClick: connectOutlook }
                : { label: "Connect Gmail", onClick: connectGmail }
            });
          } else if (data.emailsSent) {
            setHasGmailAccess(true);
            toast.success("Emails sent successfully!");
          }

          const aiResponse = data.output || data.message || (data.error ? `⚠️ ${data.error}` : "I'm having trouble processing your request.");
          const { cleanText, options } = parseOptionsFromResponse(aiResponse);

          // Typewriter effect for outreach responses
          const chars = cleanText.split('');
          let displayed = '';
          const chunkSize = Math.max(1, Math.floor(chars.length / 120));
          for (let i = 0; i < chars.length; i += chunkSize) {
            displayed += chars.slice(i, i + chunkSize).join('');
            const snap = displayed;
            setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: snap } : m));
            await new Promise(r => setTimeout(r, 8));
          }

          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: cleanText, isStreaming: false, options: options.length > 0 ? options : undefined }
              : m
          ));
          } else {
            // Research/document mode — streaming text response
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let accumulatedResponse = "";
            let parsedSources: Source[] = [];
            let sourcesExtracted = false;
            let statusExtracted = false;
            let connectorStatus = "";

            while (true) {
              if (controller.signal.aborted) break;
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              accumulatedResponse += chunk;

              // Extract status header (sent before sources and AI text)
              if (!statusExtracted && accumulatedResponse.includes('\x00STATUS:')) {
                const statusIdx = accumulatedResponse.indexOf('\x00STATUS:');
                const statusEnd = accumulatedResponse.indexOf('\x00\n', statusIdx + 1);
                if (statusEnd !== -1) {
                  connectorStatus = accumulatedResponse.slice(statusIdx + '\x00STATUS:'.length, statusEnd);
                  accumulatedResponse = accumulatedResponse.slice(0, statusIdx) + accumulatedResponse.slice(statusEnd + 2);
                  statusExtracted = true;
                  setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, statusText: connectorStatus } : m));
                }
              }

              // Extract sources header from the first chunk (sent before any AI text)
              if (!sourcesExtracted && accumulatedResponse.includes('\x00SOURCES:')) {
                const nullIdx = accumulatedResponse.indexOf('\x00SOURCES:');
                const endIdx = accumulatedResponse.indexOf('\x00\n', nullIdx + 1);
                if (endIdx !== -1) {
                  const jsonStr = accumulatedResponse.slice(nullIdx + '\x00SOURCES:'.length, endIdx);
                  try { parsedSources = JSON.parse(jsonStr); } catch {}
                  accumulatedResponse = accumulatedResponse.slice(0, nullIdx) + accumulatedResponse.slice(endIdx + 2);
                  sourcesExtracted = true;
                }
              }

              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: accumulatedResponse } : m));

              // Feed HTML to canvas if this is a canvas request
              if (shouldUseCanvas) {
                setCanvasCode(accumulatedResponse);
              }
            }

            if (!accumulatedResponse.trim()) throw new Error("Empty response from AI. The image might be too complex or the API rate limit was reached.");

            // Assign documentType to the ASSISTANT message (not user message) so download button appears
            // Also detect if the AI's response itself looks like a document (CV, cover letter, etc.)
            const responseDocType = documentRequest.type || detectDocumentInResponse(accumulatedResponse, userMessage);

              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: accumulatedResponse, isStreaming: false, statusText: undefined, documentType: responseDocType, sources: parsedSources.length > 0 ? parsedSources : m.sources }
                  : m
              ));

              // Finalize canvas
              if (shouldUseCanvas) {
                setCanvasCode(accumulatedResponse);
                setCanvasStreaming(false);
              }

              // Smart market agent suggestion: if response was about a financial topic,
              // append a suggestion card nudging the user to launch the live market agent
              if (isMarketRelatedResponse(userMessage, accumulatedResponse)) {
                const suggestionId = `market-suggestion-${Date.now()}`;
                setMessages(prev => [...prev, {
                  id: suggestionId,
                  role: 'assistant',
                  content: '__MARKET_SUGGESTION__',
                  timestamp: new Date(),
                  isStreaming: false,
                  marketPrompt: userMessage,
                }]);
              }
          }

      setLastMessageSent(null);
    } catch (error: any) {
      console.error('Error sending message:', error);
      const isAbort = error?.name === 'AbortError' || error?.message === 'Generation stopped by user.';
      if (isAbort) {
        // Keep the partially generated message and mark it as stopped
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, isStreaming: false, content: m.content + '\n\n_Stopped by user._' }
            : m
        ));
        if (shouldUseCanvas) {
          setCanvasStreaming(false);
        }
        setIsLoading(false);
        abortControllerRef.current = null;
        return;
      }
      setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
      const isTimeout = error?.name === 'AbortError';
      const isSilent = error instanceof Error && error.message === "LIMIT_REACHED_SILENT";
      
      if (!isSilent) {
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: isTimeout
            ? "The request timed out. Please try again with a shorter message."
            : (error instanceof Error ? error.message : "Failed to send message. Please try again."),
          timestamp: new Date(),
        }]);
        toast.error(error instanceof Error ? error.message : "Failed to send message.");
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const stopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const retryLastMessage = () => {
    if (lastMessageSent) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.id.startsWith('error-')) return prev.slice(0, -1);
        return prev;
      });
      sendMessage(lastMessageSent);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  const requestUserLocation = () => {
    if (!navigator.geolocation) {
      localStorage.setItem('hiremindx_location_permission', 'denied');
      return Promise.resolve(null);
    }
    return new Promise<UserLocation | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(loc);
          localStorage.setItem('hiremindx_user_location', JSON.stringify(loc));
          localStorage.setItem('hiremindx_location_permission', 'granted');
          resolve(loc);
        },
        () => {
          localStorage.setItem('hiremindx_location_permission', 'denied');
          resolve(null);
        }
      );
    });
  };

  const handleDownloadDocument = async (content: string, type: 'pdf' | 'docx', messageId: string) => {
    setGeneratingDocId(messageId);
    try {
      const title = extractTitleFromContent(content);
      await generateDocument(title, content, type);
      toast.success(`${type.toUpperCase()} downloaded successfully!`);
    } catch {
      toast.error(`Failed to generate ${type.toUpperCase()}`);
    } finally {
      setGeneratingDocId(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("Copied to clipboard");
    });
  };

  const speak = (text: string, id: string) => {
    const synth = window.speechSynthesis;
    if (speakingId === id) { synth.cancel(); setSpeakingId(null); return; }
    synth.cancel();
    const cleanText = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_~`#]/g, '').replace(/\n{2,}/g, '. ').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!cleanText) return;
    setSpeakingId(id);
    const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
    const queue = [...sentences];
    const speakNext = () => {
      if (queue.length === 0) { setSpeakingId(null); return; }
      const chunk = queue.shift()!.trim();
      if (!chunk) { speakNext(); return; }
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = 1; utterance.pitch = 1;
      const voices = synth.getVoices();
      const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en') && v.localService);
      if (preferred) utterance.voice = preferred;
      utterance.onend = () => speakNext();
      utterance.onerror = (e) => { if (e.error !== 'canceled') console.error(e.error); setSpeakingId(null); };
      synth.speak(utterance);
    };
    speakNext();
  };

  const fetchChatHistory = useCallback(async () => {
    try {
      const u = session?.user || devSession?.user;
      const extraHeaders: Record<string, string> = {};
      if (u && !session?.user) {
        extraHeaders['x-dev-user-id'] = u.id;
        extraHeaders['x-dev-user-email'] = u.email || '';
      }
      const response = await fetch('/api/chat-history?chatType=assist', { headers: extraHeaders });
      const data = await response.json();
      if (data.sessions) setChatHistory(data.sessions);
    } catch { /* silent */ }
  }, [session, devSession]);

  useEffect(() => {
    if (session?.user || devSession?.user) fetchChatHistory();
  }, [session, devSession, fetchChatHistory]);

  const saveCurrentSession = useCallback(async () => {
    const currentMessages = messagesRef.current;
    const currentUser = session?.user || devSession?.user;
    // Skip if still starting a new chat, already saving, no user, or no real messages
    if (isStartingNewChatRef.current || isSavingRef.current || !currentUser) return;
    const realMessages = currentMessages.filter(m => m.id !== 'initial' && !m.isStreaming && m.content.trim() !== '');
    if (realMessages.length === 0) return;
    isSavingRef.current = true;

    // Dev identity headers
    const idHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!session?.user && devSession?.user) {
      idHeaders['x-dev-user-id'] = devSession.user.id;
      idHeaders['x-dev-user-email'] = devSession.user.email || '';
    }

    try {
      // Wait if a session creation is in flight
      if (sessionCreationPromiseRef.current) await sessionCreationPromiseRef.current;

      const latestSessionId = currentSessionIdRef.current;

      if (latestSessionId) {
        // Session exists — only save unsaved messages
        const newMessages = realMessages.filter(m => !savedMessageIdsRef.current.has(m.id));
        if (newMessages.length > 0) {
          const response = await fetch(`/api/chat-history/${latestSessionId}`, {
            method: 'PUT',
            headers: idHeaders,
            body: JSON.stringify({
              messages: newMessages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp.toISOString() })),
            }),
          });
          if (response.ok) {
            const newSet = new Set(savedMessageIdsRef.current);
            newMessages.forEach(m => newSet.add(m.id));
            setSavedMessageIds(newSet);
            savedMessageIdsRef.current = newSet;
          }
        }
      } else if (!sessionCreationPromiseRef.current) {
        // No session yet — create one with all real messages
        const firstUserMessage = realMessages.find(m => m.role === 'user');
        const title = firstUserMessage?.content.slice(0, 50) || 'New Assist Chat';
        const createPromise = (async () => {
          try {
            const response = await fetch('/api/chat-history', {
              method: 'POST',
              headers: idHeaders,
              body: JSON.stringify({
                chatType: 'assist',
                title,
                messages: realMessages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp.toISOString() })),
              }),
            });
            if (response.ok) {
              const data = await response.json();
              if (data.session) {
                setCurrentSessionId(data.session.id);
                currentSessionIdRef.current = data.session.id;
                const newSet = new Set(realMessages.map(m => m.id));
                setSavedMessageIds(newSet);
                savedMessageIdsRef.current = newSet;
                return data.session.id as number;
              }
            }
            return null;
          } finally {
            sessionCreationPromiseRef.current = null;
          }
        })();
        sessionCreationPromiseRef.current = createPromise;
        await createPromise;
      }
      fetchChatHistory();
    } catch (e) {
      console.error('Error saving session:', e);
    } finally {
      isSavingRef.current = false;
    }
  }, [session, devSession, fetchChatHistory]);

  useEffect(() => {
    const hasUser = !!(session?.user || devSession?.user);
    const isStreaming = messages.some(m => m.isStreaming);
    const hasRealMessages = messages.some(m => m.id !== 'initial' && !m.isStreaming && m.content.trim() !== '');
    if (!hasRealMessages || !hasUser || isStreaming) return;
    const debounce = setTimeout(() => saveCurrentSession(), 1500);
    return () => clearTimeout(debounce);
  }, [messages, session?.user?.id, devSession?.user?.id, saveCurrentSession]);

  const loadSession = async (historySessionId: number) => {
    setLoadingHistory(true);
    try {
      const extraHeaders: Record<string, string> = {};
      if (!session?.user && devSession?.user) {
        extraHeaders['x-dev-user-id'] = devSession.user.id;
        extraHeaders['x-dev-user-email'] = devSession.user.email || '';
      }
      const response = await fetch(`/api/chat-history/${historySessionId}`, { headers: extraHeaders });
      const data = await response.json();
      if (data.messages && data.messages.length > 0) {
        const loadedMessages: Message[] = data.messages.map((m: any, index: number) => {
            const isMarketMsg = m.role === 'assistant' && m.content?.startsWith('[Market Analysis] ');
            const marketPrompt = isMarketMsg ? m.content.replace('[Market Analysis] ', '') : undefined;
            const isPredictionMsg = m.role === 'assistant' && m.content?.startsWith('[Prediction] ');
            const predictionPrompt = isPredictionMsg ? m.content.replace('[Prediction] ', '') : undefined;
            const isDeepResearchMsg = m.role === 'assistant' && (m.content?.startsWith('[Deep Research] ') || m.content?.startsWith('[Dark Research] '));
            const deepResearchPrompt = isDeepResearchMsg ? m.content.replace(/^\[(Deep|Dark) Research\] /, '') : undefined;
            const isAPICreatorMsg = m.role === 'assistant' && m.content?.startsWith('[API Creator] ');
            const apiCreatorPrompt = isAPICreatorMsg ? m.content.replace('[API Creator] ', '') : undefined;
            const isCanvasMsg = m.role === 'assistant' && m.content && (m.content.includes('```html') || m.content.includes('<!DOCTYPE') || m.content.includes('```javascript') || m.content.includes('```css') || m.content.includes('```jsx') || m.content.includes('```tsx'));
            return {
              id: `loaded-${m.id || index}-${Date.now()}`,
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.createdAt),
              isMarket: isMarketMsg || undefined,
              marketPrompt,
              isPrediction: isPredictionMsg || undefined,
              predictionPrompt,
              isDarkResearch: isDeepResearchMsg || undefined,
              darkResearchPrompt: deepResearchPrompt,
              isAPICreator: isAPICreatorMsg || undefined,
              apiCreatorPrompt,
              isCanvas: isCanvasMsg || undefined,
            };
          });
        const loadedIds = new Set(loadedMessages.map(m => m.id));
        setMessages(loadedMessages);
        setCurrentSessionId(historySessionId);
        currentSessionIdRef.current = historySessionId;
        setSavedMessageIds(loadedIds);
        savedMessageIdsRef.current = loadedIds;
        sessionCreationPromiseRef.current = null;
        setShowHistory(false);
        setShowWelcome(false);
        setAutoScroll(true);

        // Restore canvas if any message was a canvas response (contains HTML code)
        const canvasMsg = [...loadedMessages].reverse().find(m => m.isCanvas);
        if (canvasMsg) {
          setCanvasCode(canvasMsg.content);
          setCanvasStreaming(false);
        } else {
          setCanvasCode("");
        }
        setCanvasOpen(false);
      } else {
        toast.error('No messages found in this chat');
      }
    } catch {
      toast.error('Failed to load chat session');
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteSession = async (historySessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const extraHeaders: Record<string, string> = {};
      if (!session?.user && devSession?.user) {
        extraHeaders['x-dev-user-id'] = devSession.user.id;
        extraHeaders['x-dev-user-email'] = devSession.user.email || '';
      }
      await fetch(`/api/chat-history/${historySessionId}`, { method: 'DELETE', headers: extraHeaders });
      fetchChatHistory();
      if (currentSessionId === historySessionId) startNewChat();
      toast.success('Chat deleted');
    } catch {
      toast.error('Failed to delete chat');
    }
  };

  const startNewChat = async () => {
    if (isStartingNewChatRef.current) return;
    isStartingNewChatRef.current = true;
    setIsStartingNewChat(true);
    // Clean up any pending R2 uploads
    if (uploadedFiles.length > 0) {
      deleteR2Files(uploadedFiles.map(f => f.url));
      setUploadedFiles([]);
    }
    // Reset all session tracking refs immediately
    currentSessionIdRef.current = null;
    savedMessageIdsRef.current = new Set();
    sessionCreationPromiseRef.current = null;
    isSavingRef.current = false;
    setMessages([]);
    setShowWelcome(true);
    setCurrentSessionId(null);
    setSavedMessageIds(new Set());
    setShowHistory(false);
    setHistorySearch("");
    // Reset agent state on server so next conversation starts fresh
    try {
      await fetch('/api/assist/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
    } catch { /* silent */ }
    isStartingNewChatRef.current = false;
    setIsStartingNewChat(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  if (isPending || checkingDevSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentUser = session?.user || devSession?.user;
  if (!currentUser) return null;

  const isDark = theme === 'dark';

  return (
    <div className="relative flex flex-col overflow-hidden"
      style={{ height: '100dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <HeroBackground />
      <div className={`relative z-10 flex h-full ${isDark ? 'text-white' : 'text-gray-900'}`}>
        {showHistory && (
          <div className="fixed inset-0 z-50 flex md:relative md:inset-auto">
            <div
              className={`absolute inset-0 ${isDark ? 'bg-black/80' : 'bg-black/30'} md:hidden`}
              onClick={() => setShowHistory(false)}
            />
            <div className={`relative w-72 max-w-[85vw] md:w-64 ${isDark ? 'bg-black border-zinc-800' : 'bg-white/40 backdrop-blur-xl border-white/40'} border-r h-full flex flex-col z-10`}>
              <div className={`p-3 ${isDark ? 'border-zinc-800' : 'border-black/5'} border-b flex items-center gap-2`}>
                <Search className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className={`flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500 ${isDark ? 'text-white' : 'text-gray-900'}`}
                />
                {historySearch && (
                  <button onClick={() => setHistorySearch("")} className="p-0.5">
                    <X className={`w-3.5 h-3.5 ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'}`} />
                  </button>
                )}
                <Button variant="ghost" size="icon" className={`h-8 w-8 md:hidden flex-shrink-0 ${isDark ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`} onClick={() => { setShowHistory(false); setHistorySearch(""); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-2">
                <Button
                  onClick={startNewChat}
                  variant="outline"
                  className={`w-full flex items-center gap-2 h-9 text-sm ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-white' : 'bg-white/60 border-black/10 hover:bg-white/80 text-gray-900'}`}
                >
                  <Plus className="w-4 h-4" />
                  New Chat
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {(() => {
                  const filteredHistory = chatHistory.filter(s =>
                    s.title.toLowerCase().includes(historySearch.toLowerCase())
                  );
                  if (chatHistory.length === 0) return (
                    <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'} text-center py-8`}>No chat history yet</p>
                  );
                  if (filteredHistory.length === 0) return (
                    <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'} text-center py-8`}>No chats found</p>
                  );
                  return filteredHistory.map((chatSession) => (
                    <div
                      key={chatSession.id}
                      onClick={() => loadSession(chatSession.id)}
                      className={`p-2.5 rounded-lg cursor-pointer transition-all flex items-center gap-2 ${
                        currentSessionId === chatSession.id
                          ? isDark ? 'bg-zinc-900' : 'bg-black/5'
                          : isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-black/5'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{chatSession.title}</p>
                        <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{formatDate(chatSession.lastMessageAt)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 flex-shrink-0 ${isDark ? 'text-zinc-500 hover:text-red-400 hover:bg-red-400/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                        onClick={(e) => deleteSession(chatSession.id, e)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        <div className={`flex-1 flex min-w-0 ${canvasOpen ? '' : ''}`}>
        {/* Chat area — shrinks when canvas is open */}
        <div className={`flex flex-col min-w-0 transition-all duration-300 ${canvasOpen ? 'hidden md:flex md:w-1/2' : 'flex-1'}`}>
          <header className={`h-12 flex items-center px-4 gap-3 flex-shrink-0 border-b ${isDark ? 'bg-black border-zinc-800' : 'bg-white/40 border-black/5 backdrop-blur-md'}`}>
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Search className="w-5 h-5 text-primary" />
              <span className="font-semibold">Assist</span>
            </Link>
            <div className="flex-1" />
            {/* Email connection indicator */}
            {hasGmailAccess === false && (
              <Button
                variant="outline"
                size="sm"
                onClick={connectGmail}
                className={`flex items-center gap-2 h-8 text-xs ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white/60 border-black/10 hover:bg-white/80'}`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Connect Email</span>
              </Button>
            )}
            {hasGmailAccess === true && (
              <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{emailProvider === "microsoft" ? "Outlook" : "Gmail"}</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewChat}
              className={`gap-1.5 ${isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-900' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-900' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-4 h-4" />
            </Button>
          </header>

          {/* Email not connected warning — only shown when outreach context arises */}
          {hasGmailAccess === false && messages.some(m => m.role === 'user' && isOutreachIntent(m.content)) && (
            <div className={`flex-shrink-0 px-4 py-2 flex items-center gap-2 text-xs ${isDark ? 'bg-amber-900/20 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p>
                Connect Gmail or Outlook to let Assist send emails on your behalf.{" "}
                <button onClick={connectGmail} className="underline font-medium hover:no-underline">Connect now</button>
              </p>
            </div>
          )}

          {loadingHistory ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
            ) : showWelcome ? (
              /* Welcome screen */
              <div data-tour="assist-welcome" className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-3 sm:px-4 py-4 sm:py-12">
                <div className="max-w-2xl w-full text-center space-y-4 sm:space-y-8">
                  {/* Icon + Title */}
                  <div className="flex flex-col items-center gap-2 sm:gap-4" style={{ animation: 'fadeInUp 0.5s ease forwards' }}>
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl">
                      <Search className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                    </div>
                    <div className="space-y-1">
                      <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-white" style={{ animation: 'fadeInUp 0.5s ease 0.1s both' }}>HireMindX Assist</h1>
                      <p className="text-zinc-400 text-xs sm:text-sm max-w-xs sm:max-w-md mx-auto leading-relaxed" style={{ animation: 'fadeInUp 0.5s ease 0.2s both' }}>
                        Your all-in-one professional AI for research, job outreach, and email automation.
                      </p>
                    </div>
                  </div>

                    {/* Quick action buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto" style={{ animation: 'fadeInUp 0.5s ease 0.3s both' }}>
                      {[
                        { label: "Deep research: Find Epstein case court documents", icon: Search },
                        { label: "Predict hiring trends in AI and machine learning", icon: Search },
                        { label: "Live market analysis on Tesla stock", icon: TrendingUp },
                        { label: "Make me a simple portfolio website", icon: Code },
                        { label: "Write a cold outreach email for a software role", icon: Mail },
                        { label: "What's the weather today?", icon: MapPin },
                        { label: "Where am I?", icon: MapPin },
                      ].map((action) => (
                      <button
                        key={action.label}
                        onClick={() => sendMessage(action.label)}
                        className="flex items-center gap-2.5 p-3 rounded-xl border transition-all duration-200 group bg-zinc-900/40 border-white/[0.06] text-zinc-300 hover:border-white/20 hover:bg-zinc-900/60 hover:shadow-xl text-left"
                      >
                        <div className="p-1.5 rounded-lg bg-white/5 border border-white/5 group-hover:bg-white/10 group-hover:border-white/10 transition-colors shrink-0">
                          <action.icon className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200" />
                        </div>
                        <span className="text-xs font-medium leading-snug">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
            <div
              ref={scrollViewportRef}
              className="flex-1 overflow-y-auto"
              onScroll={(e) => {
                const target = e.currentTarget;
                const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
                setAutoScroll(isAtBottom);
              }}
            >
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {messages.map((message) => (
                  <div key={message.id}>
                    {message.role === "assistant" ? (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                          <Search className="w-4 h-4 text-primary-foreground" />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          {/* Market Agent Card — inline expanding panel */}
                          {/* Prediction Engine Card */}
                          {message.isLocationMap && message.mapPrompt ? (
                            <MapCard prompt={message.mapPrompt} location={message.mapLocation} destination={message.mapDestination} />
                          ) : message.isWeather && message.weatherPrompt ? (
                            <WeatherCard prompt={message.weatherPrompt} location={message.weatherLocation} />
                          ) : message.isPrediction && message.predictionPrompt ? (
                            <PredictionCard prompt={message.predictionPrompt} />
                          ) : message.isDarkResearch && message.darkResearchPrompt ? (
                            <DeepResearchCard prompt={message.darkResearchPrompt} />
                          ) : message.isMarket && message.marketPrompt ? (
                            <MarketAgentCard
                              prompt={message.marketPrompt}
                              conversationHistory={message.marketHistory}
                            />
                          ) : message.content === '__MARKET_SUGGESTION__' ? (
                            /* Smart market agent suggestion banner */
                            <div className="sources-fade-in">
                              <div className={`mt-2 rounded-xl border p-4 ${isDark ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-yellow-400/40 bg-yellow-50'}`}>
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-yellow-400 text-base">📈</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold mb-1 ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                                      Want live trade signals?
                                    </p>
                                    <p className={`text-xs mb-3 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                      Launch the Live Market Intelligence agent to get real-time prices, sentiment analysis, and specific BUY / SELL / HOLD signals for this query.
                                    </p>
                                    <button
                                      onClick={() => sendMessage(`Live market analysis: ${message.marketPrompt || 'market analysis'}`)}
                                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500 hover:bg-yellow-400 text-black transition-colors"
                                    >
                                      <span>Launch Live Market Agent</span>
                                      <span>→</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Perplexity-style connector status indicator */}
                              {message.isStreaming && message.statusText && !message.content && (
                                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs font-medium ${isDark ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  {message.statusText}
                                </div>
                              )}
                              <div className={`prose max-w-none ${isDark ? 'prose-invert text-zinc-200' : 'text-gray-800'} ${message.isStreaming ? 'streaming-cursor' : ''}`}>
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                    components={{
                                      a: ({ node, ...props }) => (
                                        <a
                                          {...props}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 font-bold underline decoration-2 underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 transition-all break-all"
                                        />
                                      ),
                                      pre: ({ node, children, ...props }) => (
                                        <>{children}</>
                                      ),
                                      code: ({ node, className, children, ...props }: any) => {
                                        const isBlock = !!(props as any).inline === false && className?.startsWith('language-');
                                        const isInline = (props as any).inline;
                                        if (isInline) {
                                          return (
                                            <code className={`${isDark ? 'bg-zinc-800 text-pink-300' : 'bg-gray-100 text-pink-600'} rounded px-1.5 py-0.5 text-xs font-mono`}>
                                              {children}
                                            </code>
                                          );
                                        }
                                        return (
                                          <CodeBlock className={className} isDark={isDark}>
                                            {children}
                                          </CodeBlock>
                                        );
                                      },
                                    }}
                                >
                                  {message.content || (message.isStreaming ? "\u200b" : "")}
                                </ReactMarkdown>
                              </div>

                              {message.isCanvas && (
                                <div className={`mt-3 p-4 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-50 border-gray-200'} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary'}`}>
                                      {message.isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Code className="w-5 h-5" />}
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold">{message.isStreaming ? 'Generating Canvas...' : 'Canvas Ready'}</p>
                                      <p className="text-xs opacity-70">Click to view preview and source code</p>
                                    </div>
                                  </div>
                                  <Button 
                                    onClick={() => {
                                      setCanvasCode(message.content); 
                                      setCanvasOpen(true);
                                    }}
                                    className="gap-2 sm:w-auto w-full"
                                  >
                                    <Code className="w-4 h-4" />
                                    {message.isStreaming ? 'View Progress' : 'Open Canvas'}
                                  </Button>
                                </div>
                              )}

                              {/* Sources — Perplexity-style banners, fade in after streaming */}
                              {message.sources && message.sources.length > 0 && !message.isStreaming && (
                                <div className="mt-4 mb-1 sources-fade-in">
                                  <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Sources</p>
                                  <div className="flex flex-wrap gap-2">
                                    {message.sources.map((src, idx) => (
                                      <a
                                        key={idx}
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all hover:scale-[1.02] max-w-[200px] ${
                                          isDark
                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800'
                                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 shadow-sm'
                                        }`}
                                      >
                                        <img
                                          src={src.favicon}
                                          alt=""
                                          className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        <span className="truncate">{src.title}</span>
                                        <span className={`text-[10px] flex-shrink-0 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>{idx + 1}</span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Retry button for error messages */}
                              {message.id.startsWith('error-') && (
                                <Button variant="outline" size="sm" onClick={retryLastMessage} className="mt-2 text-xs h-7 gap-1.5">
                                  <Plus className="w-3 h-3 rotate-45" />
                                  Retry
                                </Button>
                              )}

                              {/* Action buttons */}
                              {message.id !== "initial" && !message.id.startsWith('error-') && !message.isStreaming && (
                                <div className="flex items-center gap-1 mt-3 flex-wrap">
                                  <button
                                    onClick={() => copyToClipboard(message.content, message.id)}
                                    className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                                    title="Copy"
                                  >
                                    {copiedId === message.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                  <button
                                    onClick={() => speak(message.content, message.id)}
                                    className={`p-1.5 rounded-md transition-colors ${speakingId === message.id ? 'text-primary' : isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                                    title="Listen"
                                  >
                                    <Volume2 className="w-4 h-4" />
                                  </button>
                                  {message.documentType && (
                                    <button
                                      onClick={() => handleDownloadDocument(message.content, message.documentType!, message.id)}
                                      disabled={generatingDocId === message.id}
                                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${isDark ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'} ${generatingDocId === message.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      title={`Download as ${message.documentType.toUpperCase()}`}
                                    >
                                      {generatingDocId === message.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                      <span>Download {message.documentType.toUpperCase()}</span>
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Outreach option buttons */}
                              {message.options && message.options.length > 0 && !isLoading && !message.isStreaming && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {message.options.map((opt, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => { setInput(''); sendMessage(opt); }}
                                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:scale-[1.02] ${
                                        isDark
                                          ? "bg-white/5 border-white/10 text-zinc-200 hover:border-primary/50 hover:bg-white/10"
                                          : "bg-white border-black/10 text-gray-700 hover:border-primary/50 hover:bg-primary/5 shadow-sm"
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      ) : (
                        <div className="flex justify-end gap-3">
                        <div className={`${isDark ? 'bg-zinc-900 text-zinc-100 border border-zinc-800' : 'bg-primary text-primary-foreground'} rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%]`}>
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          {message.files && message.files.length > 0 && (
                            <div className={`mt-2 pt-2 border-t ${isDark ? 'border-zinc-800' : 'border-primary-foreground/20'} flex flex-wrap gap-2`}>
                              {message.files.map((file, idx) => (
                                <div key={idx} className={`flex items-center gap-1.5 ${isDark ? 'bg-zinc-800' : 'bg-primary-foreground/10'} rounded-lg px-2 py-1 text-xs`}>
                                  {getFileIcon(file.type)}
                                  <span className="max-w-[100px] truncate">{file.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium ${isDark ? 'bg-zinc-800 text-white' : 'bg-gray-300 text-gray-700'}`}>
                          {currentUser.name?.charAt(0).toUpperCase() || "U"}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && !messages.some(m => m.isStreaming) && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                      <Search className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <div className={`flex items-center gap-2 pt-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

            <div className="flex-shrink-0 px-2 sm:px-4 pb-2 sm:pb-4 pt-1 sm:pt-2">
              <div className="max-w-3xl mx-auto">
                {uploadedFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${isDark ? 'bg-zinc-900 border border-zinc-800 text-zinc-200' : 'bg-white/40 backdrop-blur-xl border border-black/5 text-gray-700'}`}
                      >
                        {getFileIcon(file.type)}
                        <span className="max-w-[80px] truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className={`p-0.5 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-red-400' : 'hover:bg-gray-200 text-gray-400 hover:text-red-500'}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.md,.markdown,.html,.htm,.css,.js,.ts,.tsx,.jsx,.json,.xml,.csv,text/plain,text/html,text/css,text/csv,text/markdown,application/json,application/xml,text/xml,application/javascript,text/javascript,image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                    <div className="relative flex items-end rounded-3xl border transition-all duration-300 bg-[#0a0a0a] border-zinc-800 focus-within:border-zinc-700">
                        <button
                          data-tour="assist-attach"
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isLoading || isUploading}
                          className="p-3 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                          title="Attach image, PDF, DOC, TXT, HTML, JSON, code, or other supported file"
                        >
                          {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        </button>

                        <textarea
                          data-tour="assist-input"
                          ref={textareaRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyPress}
                          placeholder={uploadedFiles.length > 0 ? "Add a message or send files..." : "Type your message..."}
                          disabled={isLoading}
                          rows={1}
                          className="flex-1 bg-transparent resize-none py-3 text-sm focus:outline-none max-h-[200px] text-white placeholder:text-zinc-600"
                          style={{ minHeight: '24px' }}
                        />

                        <div className="flex items-center gap-0.5 p-2">
                          <button
                            data-tour="assist-voice"
                            type="button"
                            onClick={toggleListening}
                            disabled={isLoading}
                            className={`p-2 rounded-full transition-colors ${isListening ? "bg-red-500 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"}`}
                            title={isListening ? "Stop listening" : "Voice input"}
                          >
                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                          </button>

                          <button
                            type="button"
                            onClick={isLoading ? stopGenerating : () => sendMessage(input)}
                            disabled={!isLoading && !input.trim() && uploadedFiles.length === 0}
                            className={`p-2 rounded-full bg-zinc-100 text-black hover:bg-white transition-colors ${!isLoading ? 'disabled:opacity-30 disabled:cursor-not-allowed' : ''}`}
                            title={isLoading ? 'Stop generating' : 'Send message'}
                          >
                            {isLoading ? <Square className="w-4 h-4 fill-current" /> : <ChevronUp className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                </form>
              </div>
             </div>
         </div>

         {/* Canvas panel — slides in from right */}
         {canvasOpen && (
           <div className="w-full md:w-1/2 h-full flex-shrink-0 relative z-20 shadow-2xl">
             <AssistCanvas
               code={canvasCode}
               isStreaming={canvasStreaming}
               onClose={() => { setCanvasOpen(false); setCanvasStreaming(false); }}
             />
           </div>
         )}
         </div>

       </div>
     </div>
  );
}
