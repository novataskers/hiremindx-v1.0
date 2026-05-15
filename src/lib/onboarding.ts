import { useRouter } from "next/navigation";

export const ONBOARDING_STORAGE_KEY = "hiremindx_onboarding_complete";
export const ONBOARDING_STEP_KEY = "hiremindx_onboarding_step";

export interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string; // CSS selector or data-tour attribute
  position?: "top" | "bottom" | "left" | "right";
  page?: string; // Route to navigate to before showing this step
  action?: string; // Optional hint about what action to take
}

export const tourSteps: TourStep[] = [
  {
    id: "assist-intro",
    title: "Welcome to HireMindX Assist",
    description: "This is your all-in-one AI assistant. Ask anything about jobs, research, coding, market analysis, or outreach — and get intelligent responses instantly.",
    target: '[data-tour="assist-welcome"]',
    position: "bottom",
    page: "/assist",
  },
  {
    id: "assist-attach",
    title: "Attachment Feature",
    description: "Upload CVs, images, PDFs, code files, or documents. The AI will read and analyze them for you.",
    target: '[data-tour="assist-attach"]',
    position: "top",
  },
  {
    id: "assist-voice",
    title: "Voice Input",
    description: "Tap the microphone to speak instead of typing. Perfect for when you're on the go or prefer talking.",
    target: '[data-tour="assist-voice"]',
    position: "top",
  },
  {
    id: "assist-deep-research",
    title: "Deep Research",
    description: "Type something like 'deep research on remote work trends' and Assist will crawl the web, find sources, and give you a detailed intelligence report.",
    target: '[data-tour="assist-input"]',
    position: "top",
  },
  {
    id: "assist-prediction",
    title: "AI Smart Prediction",
    description: "Ask predictive questions like 'What will happen to AI hiring in 2026?' and get data-backed trend forecasts.",
    target: '[data-tour="assist-input"]',
    position: "top",
  },
  {
    id: "assist-market",
    title: "Live Market Analysis",
    description: "Ask about stocks, crypto, or forex — e.g. 'Should I buy Bitcoin?' — and get real-time price data, sentiment analysis, and trading signals.",
    target: '[data-tour="assist-input"]',
    position: "top",
  },
  {
    id: "assist-canvas",
    title: "Canvas Coding",
    description: "Say 'Create a portfolio website' or 'Build a calculator app' and Assist will write the full HTML/CSS/JS code in a live preview panel.",
    target: '[data-tour="assist-input"]',
    position: "top",
  },
  {
    id: "assist-outreach",
    title: "Email Outreach",
    description: "Connect your Gmail or Outlook, then say 'Write a cold outreach email for a software role' and Assist can draft and even send it for you.",
    target: '[data-tour="assist-input"]',
    position: "top",
  },
  {
    id: "match-intro",
    title: "Match — Bulk CV Analysis",
    description: "Upload multiple CVs against a job position. HireMindX scores each candidate on skills, experience, and education — then ranks them automatically.",
    target: '[data-tour="bulkcv-upload"]',
    position: "bottom",
    page: "/bulk-cv",
  },
  {
    id: "match-questions",
    title: "Interview Questions",
    description: "After analyzing a CV, click 'Generate Questions' to create tailored interview questions with suggested answers, difficulty levels, and key areas to probe.",
    target: '[data-tour="bulkcv-questions"]',
    position: "bottom",
  },
  {
    id: "community-intro",
    title: "Community",
    description: "Connect with freelancers, clients, and professionals. Post projects, find talent, browse offers, and build your network — all in one place.",
    target: '[data-tour="community-feed"]',
    position: "bottom",
    page: "/community",
  },
];

export function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
}

export function getSavedStep(): number {
  if (typeof window === "undefined") return 0;
  const saved = localStorage.getItem(ONBOARDING_STEP_KEY);
  return saved ? Math.max(0, parseInt(saved, 10)) : 0;
}

export function saveStep(stepIndex: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDING_STEP_KEY, String(stepIndex));
}

export function completeOnboarding() {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  localStorage.removeItem(ONBOARDING_STEP_KEY);
}

export function resetOnboarding() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  localStorage.removeItem(ONBOARDING_STEP_KEY);
}
