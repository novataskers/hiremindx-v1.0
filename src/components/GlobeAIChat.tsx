"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Loader2 } from "lucide-react";
import { GlobeHandle, GlobeMarker } from "./InteractiveGlobe";
import { toast } from "sonner";

interface Worker {
  id: string;
  name: string;
  headline: string;
  category: string;
  location: string;
  lat: number;
  lng: number;
  rating?: number;
  skills?: string[];
  contact?: string;
  image?: string;
  userId?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  workers?: Worker[];
}

interface JobData {
  description: string;
  category: string;
  location: string;
  budget: string;
  requirements: string;
  userLocation: { lat: number; lng: number } | null;
  resolvedLocation?: string;
  intent?: "find_workers" | "post_job" | "";
  locationPreference?: "near_me" | "specific_place" | "";
  shouldAutoPost?: boolean;
  shouldPostJob?: boolean;
  shouldAskPostConfirmation?: boolean;
  categoryConfirmed?: boolean;
  budgetConfirmed?: boolean;
}

function renderFormattedMessage(text: string) {
  const lines = text.split("\n");

  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);

    return (
      <span key={`line-${lineIndex}`} className="block">
        {parts.map((part, partIndex) => {
          const isHighlighted = part.startsWith("**") && part.endsWith("**");
          if (!isHighlighted) {
            return <span key={`part-${lineIndex}-${partIndex}`}>{part}</span>;
          }

          const content = part.slice(2, -2);
          return (
            <span
              key={`part-${lineIndex}-${partIndex}`}
              className="font-semibold text-white inline"
            >
              {content}
            </span>
          );
        })}
      </span>
    );
  });
}

interface Props {
  globeRef: React.RefObject<GlobeHandle | null>;
  onWorkersFound?: (workers: Worker[]) => void;
  onMarkerAdd?: (marker: GlobeMarker) => void;
  onMarkersClear?: () => void;
  className?: string;
}

const CATEGORIES = [
  { id: "tech", name: "Technology & Programming", keywords: ["developer", "programmer", "coder", "web", "app", "software", "engineer", "data", "backend", "frontend", "fullstack", "mobile", "react", "node", "python", "java", "javascript", "typescript", "database", "api", "cloud", "devops"] },
  { id: "design", name: "Design & Creative", keywords: ["designer", "graphic", "ui", "ux", "illustrator", "logo", "branding", "web design", "creative", "artist", "photoshop", "figma", "adobe"] },
  { id: "writing", name: "Writing & Translation", keywords: ["writer", "content", "copywriter", "blog", "article", "translator", "editor", "proofreader", "seo writing", "technical writer"] },
  { id: "marketing", name: "Digital Marketing", keywords: ["marketing", "seo", "social media", "ads", "facebook", "google ads", "email marketing", "growth", "digital marketer", "content marketing"] },
  { id: "video", name: "Video & Photo", keywords: ["video", "photo", "photographer", "videographer", "video editor", "motion", "animation", "filmmaker", "youtube", "reels", "tiktok"] },
  { id: "trades", name: "Trades & Local Services", keywords: ["plumber", "electrician", "carpenter", "painter", "welder", "mechanic", "cleaner", "locksmith", "hvac", "roofer", "handyman", "repair", "fix", "installation", "construction", "maintenance", "leak", "clogged", "broken", "wiring", "outlet", "circuit", "breaker", "pipe", "toilet", "sink", "faucet", "drain", "shower", "bathtub", "drywall", "tile", "flooring", "roof", "gutter", "fence", "deck", "patio", "driveway", "appliance", "washer", "dryer", "dishwasher", "refrigerator", "oven", "stove", "garage door", "window", "door", "lock", "chimney", "pool", "sprinkler", "concrete", "masonry", "brick", "garden", "landscape", "mow", "lawn", "pest", "termite", "pest control", "water heater", "boiler", "furnace", "ac unit", "air conditioning", "heating", "cooling", "duct", "vent", "insulation", "siding", "paint", "wallpaper", "ceiling", "basement", "attic", "foundation", "trim", "cabinet", "countertop", "backsplash", "home repair", "home improvement"] },
  { id: "business", name: "Business & Support", keywords: ["accountant", "bookkeeper", "virtual assistant", "consultant", "business", "strategy", "admin", "data entry", "research"] },
  { id: "legal", name: "Legal & Consulting", keywords: ["lawyer", "attorney", "legal", "contract", "paralegal", "consultant", "advisor"] },
];

const CITY_COORDS: Record<string, [number, number]> = {
  "new york": [40.71, -74.01], "london": [51.51, -0.13], "paris": [48.85, 2.35],
  "berlin": [52.52, 13.41], "tokyo": [35.68, 139.69], "sydney": [-33.87, 151.21],
  "dubai": [25.20, 55.27], "mumbai": [19.08, 72.88], "beijing": [39.91, 116.39],
  "toronto": [43.65, -79.38], "chicago": [41.88, -87.63], "los angeles": [34.05, -118.24],
  "san francisco": [37.77, -122.42], "singapore": [1.35, 103.82], "seoul": [37.57, 126.98],
  "amsterdam": [52.37, 4.90], "madrid": [40.42, -3.70], "rome": [41.90, 12.50],
  "cairo": [30.04, 31.24], "lagos": [6.52, 3.38], "nairobi": [1.29, 36.82],
  "karachi": [24.86, 67.01], "istanbul": [41.01, 28.95], "moscow": [55.75, 37.62],
  "bangkok": [13.76, 100.50], "jakarta": [-6.21, 106.85], "mexico": [19.43, -99.13],
  "buenos aires": [-34.60, -58.38], "johannesburg": [-26.20, 28.04],
  "lahore": [31.55, 74.35], "islamabad": [33.72, 73.06], "delhi": [28.61, 77.21],
  "bangalore": [12.97, 77.59], "kyoto": [35.01, 135.77], "shanghai": [31.23, 121.47],
  "cape town": [-33.93, 18.42], "riyadh": [24.69, 46.72], "tehran": [35.69, 51.39],
};

function geocodeCity(city: string): [number, number] | null {
  const lower = city.toLowerCase().trim();
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (lower.includes(name) || name.includes(lower)) {
      return coords;
    }
  }
  const words = lower.split(",").map((w) => w.trim());
  for (const word of words) {
    for (const [name, coords] of Object.entries(CITY_COORDS)) {
      if (word.includes(name) || name.includes(word)) {
        return coords;
      }
    }
  }
  return null;
}

async function geocodingLocationAsync(location: string): Promise<[number, number] | null> {
  try {
    const syncResult = geocodeCity(location);
    if (syncResult) return syncResult;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1&addressdetails=0`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
  } catch (err) {
    console.error("Geocoding error:", err);
  }
  return null;
}

async function reverseGeocodeUserLocation(userLocation: { lat: number; lng: number } | null): Promise<string | null> {
  if (!userLocation) return null;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userLocation.lat}&lon=${userLocation.lng}`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const address = data?.address || {};
    const cityLike =
      address.city ||
      address.town ||
      address.village ||
      address.suburb ||
      address.city_district ||
      address.county ||
      address.state_district ||
      address.state;
    const country = address.country;

    if (cityLike && country) return `${cityLike}, ${country}`;
    if (cityLike) return cityLike;
    if (country) return country;
    if (typeof data?.display_name === "string" && data.display_name.trim()) {
      return data.display_name.split(",").slice(0, 2).join(", ").trim();
    }
  } catch (err) {
    console.error("Reverse geocoding error:", err);
  }

  return null;
}

function extractBudget(text: string): string | null {
  const patterns = [
    /\$([\d,]+(?:\s*-\s*[\d,]+)?)/i,
    /(?:around|about|up to|at least|starting at|from)?\s*\$?([\d,]+)\s*(?:dollars?|bucks?|usd?)/i,
    /budget(?:\s*(?:is|:|of))?\s*\$?([\d,]+)/i,
    /(?:between\s*)?([\d,]+)\s*(?:to|and|-)\s*([\d,]+)/i,
    /(?:price|cost|pay|fee|rate)(?:\s+(?:is|of|:))?\s*\$?([\d,]+)/i,
    /(negotiable|flexible|discuss|open to offers|best offer)/i,
  ];

  const lower = text.toLowerCase();

  if (/(negotiable|flexible|discuss|open to offers|best offer|not sure)/i.test(lower)) {
    return "Negotiable";
  }

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1] && match[2]) {
        return `$${match[1].replace(/,/g, "")} - $${match[2].replace(/,/g, "")}`;
      }
      if (match[1]) {
        const num = match[1].replace(/,/g, "");
        const n = parseInt(num);
        if (n >= 5 && n <= 1000000) {
          return `$${num}`;
        }
      }
    }
  }

  return null;
}

function extractLocation(text: string, userLocation: { lat: number; lng: number } | null): string | null {
  void userLocation;
  const lower = text.toLowerCase();

  const mePatterns = [
    /\b(beside|near|close to|next to|by|around)\s+(?:to\s+)?me\b/i,
    /\bmy\s+(?:location|area|place|city|town)\b/i,
    /\bwhere\s+i\s+(?:am|live|work)\b/i,
    /\bmy\s+(?:current\s+)?location\b/i,
    /\bhere\b/i,
  ];

  for (const pattern of mePatterns) {
    if (pattern.test(lower)) {
      return "My Location";
    }
  }

  const locationPatterns = [
    /(?:in|at|from|near|around|located\s+in|based\s+in)\s+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z][a-zA-Z\s]+)?)/,
    /(?:in|at|from|near)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)(?:\.|\s*$|\s*,)/,
  ];

  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const loc = match[1].trim();
      const falsePositives = ["the", "a", "an", "my", "this", "that", "your", "our", "their"];
      if (!falsePositives.includes(loc.toLowerCase()) && loc.length > 2) {
        return loc;
      }
    }
  }

  return null;
}

function detectCategory(text: string): string | null {
  const lower = text.toLowerCase();

  for (const cat of CATEGORIES) {
    for (const keyword of cat.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return cat.id;
      }
    }
  }

  return null;
}

function hasRequiredPostingSignals(text: string) {
  return /\b(yes|post it|go ahead|confirm|let's do it|do it|please post|submit it|publish it)\b/i.test(text);
}

function cleanGeneratedText(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function generateJobTitle(description: string, category: string): string {
  const cleanDescription = cleanGeneratedText(description);
  const lower = cleanDescription.toLowerCase();
  const catInfo = CATEGORIES.find((c) => c.id === category);
  const fallbackTitle = catInfo ? `${catInfo.name.split(" & ")[0]} Project` : "Project Request";

  const rolePatterns = [
    /(?:need|looking for|seeking|want to hire|want|hire|get|find)\s+(?:an?|the)?\s*([a-z][a-z\s/&-]{2,50}?)(?:\s+(?:to|for|who|that|with)\b|[,.!]|$)/i,
    /(?:need|looking for|seeking)\s+(?:help from|help with)\s+(?:an?|the)?\s*([a-z][a-z\s/&-]{2,50}?)(?:\s+(?:to|for|who|that|with)\b|[,.!]|$)/i,
  ];

  const taskPatterns = [
    /(?:to|for)\s+([a-z][a-z0-9\s/&-]{8,90}?)(?:[.?!]|$)/i,
    /(?:help with|assistance with)\s+([a-z][a-z0-9\s/&-]{8,90}?)(?:[.?!]|$)/i,
  ];

  let role = "";
  for (const pattern of rolePatterns) {
    const match = cleanDescription.match(pattern);
    if (match?.[1]) {
      role = cleanGeneratedText(match[1]).replace(/^(some|a|an|the)\s+/i, "");
      break;
    }
  }

  let task = "";
  for (const pattern of taskPatterns) {
    const match = cleanDescription.match(pattern);
    if (match?.[1]) {
      task = cleanGeneratedText(match[1]).replace(/[.?!,;:]+$/, "");
      break;
    }
  }

  if (role && task) {
    const conciseTask = task.length > 55 ? `${task.slice(0, 52).trim()}...` : task;
    return `${toTitleCase(role)} Needed for ${conciseTask.charAt(0).toLowerCase() + conciseTask.slice(1)}`;
  }

  if (role) {
    if (/(developer|designer|writer|editor|marketer|plumber|electrician|photographer|videographer|accountant|lawyer|consultant|assistant)/i.test(role)) {
      return `${toTitleCase(role)} Needed`;
    }
    return toTitleCase(role);
  }

  if (task) {
    const conciseTask = task.length > 70 ? `${task.slice(0, 67).trim()}...` : task;
    return conciseTask.charAt(0).toUpperCase() + conciseTask.slice(1);
  }

  if (cleanDescription.length > 10) {
    const summary = cleanDescription.replace(/[.?!].*$/, "").slice(0, 70).trim();
    if (summary.length >= 10) {
      return summary.charAt(0).toUpperCase() + summary.slice(1);
    }
  }

  if (lower.includes("website") || lower.includes("e-commerce")) return "Website Development Project";
  if (lower.includes("logo") || lower.includes("brand")) return "Branding and Design Project";
  if (lower.includes("plumb")) return "Plumbing Service Needed";
  if (lower.includes("electric")) return "Electrical Work Needed";

  return fallbackTitle;
}

function buildPostedJobDescription(job: JobData): string {
  const parts: string[] = [];

  if (job.description?.trim()) {
    parts.push(cleanGeneratedText(job.description));
  }

  const details: string[] = [];
  if (job.category?.trim()) details.push(`Category: ${job.category}`);
  if (job.location?.trim()) details.push(`Location: ${job.location}`);
  if (job.budget?.trim()) details.push(`Budget: ${job.budget}`);
  if (job.requirements?.trim()) details.push(`Requirements: ${cleanGeneratedText(job.requirements)}`);

  if (details.length > 0) {
    parts.push(details.join("\n"));
  }

  return parts.join("\n\n").trim();
}

function isRelativeLocationText(location?: string) {
  if (!location) return false;
  const normalized = location.toLowerCase().trim();
  return [
    "my location",
    "near me",
    "around me",
    "beside me",
    "close to me",
    "next to me",
    "by me",
    "here",
    "my area",
    "my place",
    "where i am",
    "my current location",
  ].includes(normalized);
}

function getDisplayLocation(job: JobData) {
  if (!job.location && !job.resolvedLocation) return "";
  if (job.resolvedLocation?.trim()) return job.resolvedLocation.trim();
  if (isRelativeLocationText(job.location)) return "";
  return job.location.trim();
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function matchesWorkerCategory(worker: Worker, category: string) {
  if (!category) return true;
  if (worker.category === category) return true;
  const headline = worker.headline?.toLowerCase() || "";
  const skills = (worker.skills || []).join(" ").toLowerCase();
  return headline.includes(category.toLowerCase()) || skills.includes(category.toLowerCase());
}

function rankWorkersByDistance(workers: Worker[], coords: { lat: number; lng: number } | null) {
  if (!coords) return workers;
  return workers
    .map((worker) => ({
      ...worker,
      __distance: haversineKm(coords.lat, coords.lng, worker.lat, worker.lng),
    }))
    .sort((a: any, b: any) => a.__distance - b.__distance)
    .map(({ __distance, ...worker }: any) => worker);
}

function findBestWorkers(
  category: string,
  coords: { lat: number; lng: number } | null,
  limit = 6
): { workers: Worker[]; mode: "nearby-category" | "category-global" | "nearby-any" | "global-any" } {
  const categoryMatches = DUMMY_WORKERS.filter((worker) => matchesWorkerCategory(worker, category));
  const nearbyCategoryMatches = rankWorkersByDistance(categoryMatches, coords).slice(0, limit);

  if (nearbyCategoryMatches.length > 0) {
    return { workers: nearbyCategoryMatches, mode: coords ? "nearby-category" : "category-global" };
  }

  if (categoryMatches.length > 0) {
    return { workers: categoryMatches.slice(0, limit), mode: "category-global" };
  }

  const nearbyAnyMatches = rankWorkersByDistance(DUMMY_WORKERS, coords).slice(0, limit);
  if (nearbyAnyMatches.length > 0) {
    return { workers: nearbyAnyMatches, mode: coords ? "nearby-any" : "global-any" };
  }

  return { workers: DUMMY_WORKERS.slice(0, limit), mode: "global-any" };
}

const DUMMY_WORKERS: Worker[] = [
  { id: "d1", name: "Alex Chen", headline: "Senior Full-Stack Developer", category: "tech", location: "San Francisco", lat: 37.77, lng: -122.42, skills: ["React", "Node.js", "TypeScript"], rating: 4.9 },
  { id: "d2", name: "Maria Garcia", headline: "UI/UX Designer", category: "design", location: "Madrid", lat: 40.42, lng: -3.70, skills: ["Figma", "CSS", "Prototyping"], rating: 4.8 },
  { id: "d3", name: "James Wilson", headline: "Backend Engineer", category: "tech", location: "London", lat: 51.51, lng: -0.13, skills: ["Python", "Django", "AWS"], rating: 4.7 },
  { id: "d4", name: "Yuki Tanaka", headline: "Mobile App Developer", category: "tech", location: "Tokyo", lat: 35.68, lng: 139.69, skills: ["Flutter", "Swift", "Kotlin"], rating: 4.9 },
  { id: "d5", name: "Sofia Müller", headline: "Content Writer & SEO", category: "writing", location: "Berlin", lat: 52.52, lng: 13.41, skills: ["SEO", "Copywriting", "Content"], rating: 4.6 },
  { id: "d6", name: "Priya Sharma", headline: "Frontend Developer", category: "tech", location: "Mumbai", lat: 19.08, lng: 72.88, skills: ["Vue.js", "React", "TailwindCSS"], rating: 4.8 },
  { id: "d7", name: "Omar Hassan", headline: "Digital Marketing Expert", category: "marketing", location: "Dubai", lat: 25.20, lng: 55.27, skills: ["Facebook Ads", "Google Ads", "Analytics"], rating: 4.7 },
  { id: "d8", name: "Lucas Silva", headline: "Video Editor & Motion Designer", category: "video", location: "Buenos Aires", lat: -34.60, lng: -58.38, skills: ["Premiere Pro", "After Effects", "DaVinci"], rating: 4.5 },
  { id: "d9", name: "Nina Kowalski", headline: "Graphic Designer", category: "design", location: "Amsterdam", lat: 52.37, lng: 4.90, skills: ["Adobe Suite", "Branding", "Illustration"], rating: 4.9 },
  { id: "d10", name: "Ahmed Al-Rashid", headline: "DevOps Engineer", category: "tech", location: "Istanbul", lat: 41.01, lng: 28.95, skills: ["Docker", "Kubernetes", "CI/CD"], rating: 4.6 },
  { id: "d11", name: "Emma Thompson", headline: "Web Developer", category: "tech", location: "Toronto", lat: 43.65, lng: -79.38, skills: ["Next.js", "PostgreSQL", "REST API"], rating: 4.8 },
  { id: "d12", name: "Arjun Patel", headline: "Data Analyst", category: "tech", location: "Bangalore", lat: 12.97, lng: 77.59, skills: ["Python", "SQL", "Tableau"], rating: 4.7 },
];

void CATEGORIES;
void CITY_COORDS;
void geocodeCity;
void geocodingLocationAsync;
void extractBudget;
void extractLocation;
void detectCategory;

export default function GlobeAIChat({ globeRef, onWorkersFound, onMarkerAdd, onMarkersClear, className = "" }: Props) {

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: `Hi! I'm your AI job assistant. Tell me what kind of work you need done, and I'll help you create a job post.\n\nFor example: "I need a plumber to fix a leaky faucet near me" or "Looking for a web developer to build an e-commerce site, budget $2000"`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [jobData, setJobData] = useState<JobData>({
    description: "",
    category: "",
    location: "",
    budget: "",
    requirements: "",
    userLocation: null,
    intent: "",
    locationPreference: "",
    shouldAutoPost: false,
    shouldPostJob: undefined,
    shouldAskPostConfirmation: undefined,
    categoryConfirmed: false,
    budgetConfirmed: false,
  });
  const [conversationState, setConversationState] = useState<"collecting" | "asking_budget" | "asking_location" | "asking_category" | "confirming" | "posted">("collecting");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const locationCoordsCacheRef = useRef<Record<string, { lat: number; lng: number }>>({});
  const pendingPostRef = useRef(false);

  const categoryKeywords = useMemo(
    () =>
      CATEGORIES.flatMap((category) => [
        category.id.toLowerCase(),
        category.name.toLowerCase(),
        ...category.keywords.map((keyword) => keyword.toLowerCase()),
      ]),
    []
  );

  const clearFoundWorkers = () => {
    onWorkersFound?.([]);
    onMarkersClear?.();
  };

  const showFoundWorkersOnGlobe = (workers: Worker[]) => {
    onWorkersFound?.(workers);
    onMarkersClear?.();
    workers.forEach((worker) => {
      onMarkerAdd?.({
        id: worker.id,
        lat: worker.lat,
        lng: worker.lng,
        label: worker.name,
        type: "worker",
        color: "#f5c518",
      });
    });
    if (workers[0]?.lat && workers[0]?.lng) {
      globeRef.current?.flyTo(workers[0].lat, workers[0].lng, 2.2);
    }
  };

  const resolveFinalLocation = async (
    location: string,
    userLocation: { lat: number; lng: number } | null,
    existingResolvedLocation?: string
  ) => {
    if (!location) return "";
    if (!isRelativeLocationText(location)) return location;
    if (existingResolvedLocation?.trim()) return existingResolvedLocation.trim();

    const resolved = await reverseGeocodeUserLocation(userLocation);
    return resolved || location;
  };

  const getSearchCoordinates = async (data: JobData) => {
    if ((data.locationPreference === "near_me" || isRelativeLocationText(data.location)) && data.userLocation) {
      return data.userLocation;
    }

    const targetLocation = (data.resolvedLocation || data.location || "").trim();
    if (!targetLocation || targetLocation.toLowerCase() === "remote") {
      return null;
    }

    const cachedCoords = locationCoordsCacheRef.current[targetLocation.toLowerCase()];
    if (cachedCoords) {
      return cachedCoords;
    }

    const coords = await geocodingLocationAsync(targetLocation);
    if (!coords) {
      return null;
    }

    const normalizedCoords = { lat: coords[0], lng: coords[1] };
    locationCoordsCacheRef.current[targetLocation.toLowerCase()] = normalizedCoords;
    return normalizedCoords;
  };

  const inferCategoryConfirmation = (text: string) => {
    const normalized = text.toLowerCase();
    return categoryKeywords.some((keyword) => normalized.includes(keyword));
  };

  const inferBudgetConfirmation = (text: string) => {
    return Boolean(extractBudget(text));
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setJobData((prev) => ({
            ...prev,
            userLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude }
          }));
        },
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.text
      }));

      const res = await fetch("/api/community/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          jobData: jobData,
          conversationHistory: history
        })
      });

      if (!res.ok) throw new Error("Failed to get response from AI");

      const result = await res.json();

      if (result.error) throw new Error(result.error);

      const resolvedLocation = await resolveFinalLocation(
        result.jobData?.location || "",
        jobData.userLocation,
        result.jobData?.resolvedLocation
      );

      const messageHasRelativeLocationIntent =
        /\b(near me|around me|beside me|close to me|next to me|by me|my location|my area|my place|where i am|here)\b/i.test(text);
      const inferredCategoryFromText = detectCategory(text) || result.jobData?.category || jobData.category || "";
      const inferredLocation =
        messageHasRelativeLocationIntent
          ? "My Location"
          : result.jobData?.location || jobData.location || "";
      const nextCategoryConfirmed =
        Boolean(inferredCategoryFromText?.trim()) &&
        (
          jobData.categoryConfirmed ||
          inferCategoryConfirmation(text) ||
          conversationState === "asking_category"
        );

      const nextBudgetConfirmed =
        Boolean((result.jobData?.budget || jobData.budget || "").trim()) &&
        (
          jobData.budgetConfirmed ||
          inferBudgetConfirmation(text) ||
          conversationState === "asking_budget"
        );

      const mergedJobData: JobData = {
        ...jobData,
        ...result.jobData,
        userLocation: jobData.userLocation,
        category: inferredCategoryFromText,
        location: messageHasRelativeLocationIntent
          ? "My Location"
          : result.jobData?.location || inferredLocation,
        resolvedLocation: messageHasRelativeLocationIntent
          ? resolvedLocation || result.jobData?.resolvedLocation || ""
          : resolvedLocation || result.jobData?.resolvedLocation || "",
        shouldAutoPost: hasRequiredPostingSignals(text) || Boolean(result.jobData?.shouldAutoPost),
        shouldPostJob: hasRequiredPostingSignals(text) || Boolean(result.jobData?.shouldPostJob),
        categoryConfirmed: nextCategoryConfirmed,
        budgetConfirmed: nextBudgetConfirmed,
      };

      const displayLocation = getDisplayLocation(mergedJobData);
      const isConfirmed = hasRequiredPostingSignals(text) && conversationState === "confirming";
      const hasRequiredPostingData = Boolean(mergedJobData.category?.trim() && mergedJobData.budget?.trim());
      const hasConfirmedRequiredPostingData = Boolean(
        mergedJobData.categoryConfirmed &&
        mergedJobData.budgetConfirmed &&
        hasRequiredPostingData
      );
      const shouldPostNow =
        hasConfirmedRequiredPostingData &&
        !pendingPostRef.current &&
        Boolean(mergedJobData.shouldAutoPost || mergedJobData.shouldPostJob || result.nextState === "posted" || isConfirmed);

      if (!hasConfirmedRequiredPostingData) {
        const missingFields: string[] = [];
        if (!mergedJobData.category?.trim() || !mergedJobData.categoryConfirmed) missingFields.push("category");
        if (!mergedJobData.budget?.trim() || !mergedJobData.budgetConfirmed) missingFields.push("budget");

        const missingText =
          missingFields.length === 2
            ? "category and budget"
            : missingFields[0];

        const nextConversationState =
          !mergedJobData.category?.trim() || !mergedJobData.categoryConfirmed
            ? "asking_category"
            : "asking_budget";

        const promptText =
          missingFields.length === 2
            ? "Before I post your job, I still need the **category** and **budget**. Please send both, and then I'll continue."
            : missingFields[0] === "category"
              ? "Before I post your job, I still need the **category**. Please tell me what type of work this is, and then I'll continue."
              : "Before I post your job, I still need the **budget**. Please tell me your budget, and then I'll continue.";

        setJobData({
          ...mergedJobData,
          shouldAutoPost: false,
          shouldPostJob: false,
          shouldAskPostConfirmation: false,
        });
        setConversationState(nextConversationState);
        clearFoundWorkers();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: promptText,
          },
        ]);
        return;
      }

      if (shouldPostNow) {
        pendingPostRef.current = true;
        const title = generateJobTitle(mergedJobData.description, mergedJobData.category);
        const budgetText = mergedJobData.budget || "Negotiable";
        const finalLocation = displayLocation || mergedJobData.location;
        const finalJobData: JobData = {
          ...mergedJobData,
          location: finalLocation,
          resolvedLocation: displayLocation || mergedJobData.resolvedLocation,
          shouldPostJob: true,
        };
        const fullDescription = buildPostedJobDescription(finalJobData);

        try {
          const createRes = await fetch("/api/community/projects", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              description: fullDescription,
              category: finalJobData.category,
              budget: budgetText,
              location: finalJobData.location,
              skills: [finalJobData.category, finalJobData.location].filter(Boolean),
            })
          });

          if (!createRes.ok) {
            const errorData = await createRes.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${createRes.status}: Failed to post job`);
          }

          const createdProject = await createRes.json();

          if (typeof window !== "undefined" && window.BroadcastChannel) {
            const channel = new BroadcastChannel("hiremindx-projects");
            channel.postMessage({ type: "PROJECT_CREATED", project: createdProject.project });
            channel.close();
          }

          const searchCoords = await getSearchCoordinates(finalJobData);
          const workerSearch = findBestWorkers(finalJobData.category, searchCoords, 6);
          const nearbyWorkers = workerSearch.workers;
          showFoundWorkersOnGlobe(nearbyWorkers);

          setConversationState("posted");
          setJobData({
            ...finalJobData,
            categoryConfirmed: true,
            budgetConfirmed: true,
          });
          setMessages((prev) => [...prev, {
            role: "assistant",
            text: `✅ Job posted successfully\n\n• Title: ${title}\n• Category: ${finalJobData.category}\n• Budget: ${budgetText}\n• Location: ${finalJobData.location || "Not specified"}\n\n${nearbyWorkers.length > 0 ? `I also found ${nearbyWorkers.length} ${workerSearch.mode === "nearby-category" ? "matching professionals near the requested location" : workerSearch.mode === "category-global" ? "matching professionals in other regions" : workerSearch.mode === "nearby-any" ? "nearby alternative professionals" : "alternative professionals in other regions"} and marked them on the globe in gold.\n\nTop matches: ${nearbyWorkers.map((worker) => worker.name).join(", ")}.\n\n` : ""}Your job is now live on the marketplace. Freelancers can view and submit proposals.\n\nWould you like to post another job?`,
            workers: nearbyWorkers,
          }]);
          toast.success(`Job posted${finalJobData.location ? ` in ${finalJobData.location}` : ""}!`);
          pendingPostRef.current = false;
          return;
        } catch (postError) {
          const errorMsg = postError instanceof Error ? postError.message : "Unknown error";
          console.error("Job posting error:", postError);
          setMessages((prev) => [...prev, {
            role: "assistant",
            text: `❌ **Oops! There was an error posting your job**\n\n${errorMsg}\n\nPlease try again or adjust your job details.`
          }]);
          toast.error("Failed to post job");
          pendingPostRef.current = false;
          return;
        }
      }

      pendingPostRef.current = false;

      setJobData(mergedJobData);
      setConversationState(result.nextState);

      const hasKnownWorkerContext = Boolean(
        mergedJobData.category ||
        mergedJobData.location ||
        mergedJobData.resolvedLocation
      );
      const shouldShowWorkers =
        mergedJobData.intent === "find_workers" &&
        hasKnownWorkerContext &&
        !mergedJobData.shouldPostJob;

      let foundWorkers: Worker[] = [];
      let workerSummary = "";

      if (shouldShowWorkers) {
        const searchCoords = await getSearchCoordinates(mergedJobData);
        const workerSearch = findBestWorkers(mergedJobData.category, searchCoords, 6);
        foundWorkers = workerSearch.workers;

        if (foundWorkers.length > 0) {
          showFoundWorkersOnGlobe(foundWorkers);
          workerSummary =
            workerSearch.mode === "nearby-category"
              ? `\n\nI found ${foundWorkers.length} matching professionals near the requested location and marked them on the globe in gold.`
              : workerSearch.mode === "category-global"
                ? `\n\nI found ${foundWorkers.length} matching professionals in other regions and marked them on the globe in gold.`
                : workerSearch.mode === "nearby-any"
                  ? `\n\nI couldn't find an exact category match, so I showed ${foundWorkers.length} nearby alternative professionals and marked them on the globe in gold.`
                  : `\n\nI couldn't find an exact category match in that area, so I showed ${foundWorkers.length} alternative professionals from other locations and marked them on the globe in gold.`;
        }
      } else if (conversationState === "posted" || result.nextState === "posted") {
        clearFoundWorkers();
      }

      setMessages((prev) => [...prev, {
        role: "assistant",
        text: `${typeof result.message === "string" && displayLocation
          ? result.message.replace(/\bMy Location\b/g, displayLocation)
          : result.message}${workerSummary}`,
        workers: foundWorkers.length > 0 ? foundWorkers : undefined,
      }]);

    } catch (err) {
      console.error("AI Chat Error:", err);
      setMessages((prev) => [...prev, {
        role: "assistant",
        text: "I'm having a little trouble right now. Could you please try again?"
      }]);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      await handleSendMessage(text);
    } catch (err) {
      console.error("Error in handleSend:", err);
      setMessages((prev) => [...prev, { role: "assistant", text: "I'm having trouble understanding. Could you rephrase that?" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col h-full relative ${className}`}>
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-4 min-h-0 scrollbar-hide">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-lg whitespace-pre-wrap ${
                msg.role === "user"
                  ? "text-black font-semibold rounded-br-none"
                  : "text-white/90 rounded-bl-none border border-white/[0.08] backdrop-blur-sm"
              }`}
              style={
                msg.role === "user"
                  ? { background: "linear-gradient(135deg, #f5c518, #c8960c)", boxShadow: "0 4px 15px rgba(245, 197, 24, 0.2)" }
                  : { background: "rgba(255,255,255,0.03)", boxShadow: "0 4px 15px rgba(0, 0, 0, 0.2)" }
              }
            >
              {renderFormattedMessage(msg.text)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl rounded-bl-sm border border-white/[0.06]" style={{ background: "rgba(255,255,255,0.04)" }}>
              <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-6 pt-2 shrink-0 border-t border-white/[0.06] bg-gradient-to-t from-black/20 to-transparent">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={conversationState === "collecting" ? "Describe the work you need done..." : "Reply to the AI assistant..."}
            className="flex-1 h-12 pl-4 pr-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="absolute right-1.5 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 shrink-0 hover:scale-105 active:scale-95 shadow-md shadow-[#f5c518]/20"
            style={{ background: "linear-gradient(135deg, #f5c518, #c8960c)" }}
          >
            <Send className="w-3.5 h-3.5 text-black" />
          </button>
        </div>
      </div>
    </div>
  );
}
