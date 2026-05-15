"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { 
  Plus, Search, Filter, Star, MapPin, Clock, Briefcase, Users, Zap, MessageCircle, ArrowRight, ChevronRight, ChevronUp, ChevronDown, Code, Palette, Edit3, Megaphone, BarChart3, Video, Globe, LayoutGrid, List as ListIcon, ArrowLeft, User, DollarSign, Image as ImageIcon, Link as LinkIcon, X, Upload, Loader2, Tag, Package, Check, FileText, Send, Layers3, Phone, Paperclip, ExternalLink, CheckCheck, Target, Wrench, HardHat, Scale, Bell, Settings, Trash2, MoreVertical, FileSignature, CreditCard, Wallet, AlertTriangle, Shield, ShieldAlert, Banknote, Building2, ArrowDownToLine, BadgePoundSterling, RotateCcw
} from "lucide-react";
import type { GlobeHandle, GlobeMarker } from "@/components/InteractiveGlobe";

const InteractiveGlobe = dynamic(() => import("@/components/InteractiveGlobe"), { ssr: false });
const GlobeAIChat = dynamic(() => import("@/components/GlobeAIChat"), { ssr: false });
import { 
  Button,
} from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { HeroBackground } from "@/components/HeroBackground";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { CommunityOnboardingModal } from "@/components/CommunityOnboardingModal";
import StripeEscrowPaymentForm from "@/components/StripeEscrowPaymentForm";
import { useIsMobile } from "@/hooks/use-mobile";

const CATEGORIES = [
  { id: "all", name: "All Categories", icon: LayoutGrid },
  { id: "tech", name: "Technology & Programming", icon: Code },
  { id: "engineering", name: "Engineering & Architecture", icon: HardHat },
  { id: "trades", name: "Trades & Local Services", icon: Wrench },
  { id: "design", name: "Design & Creative", icon: Palette },
  { id: "writing", name: "Writing & Translation", icon: Edit3 },
  { id: "marketing", name: "Digital Marketing", icon: Megaphone },
  { id: "video", name: "Video & Photo", icon: Video },
  { id: "business", name: "Business & Support", icon: BarChart3 },
  { id: "legal", name: "Legal & General Consulting", icon: Scale },
];

// Simple confirmation form for Release Money modal (no payment — client already paid at escrow funding)
function ReleaseConfirmForm({
  contract,
  onRelease,
  onCancel,
  isReleasing,
}: {
  contract: any;
  onRelease: () => void;
  onCancel: () => void;
  isReleasing: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/15 p-4 flex items-start gap-3">
        <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-blue-300 mb-1">Escrow Release</p>
          <p className="text-[11px] text-white/50 leading-relaxed">
            The client already paid £{(Number(contract.amount) * 1.1).toFixed(2)} (including 10% platform fee) when funding the escrow. 
            Releasing will move <strong className="text-white/70">£{Number(contract.amount).toFixed(2)}</strong> to the freelancer&apos;s pending balance. 
            Funds will become available for withdrawal after Stripe settlement (up to 7 days).
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 h-11 rounded-xl border border-white/[0.1] text-white/60 text-sm font-semibold hover:bg-white/[0.05] transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onRelease}
          disabled={isReleasing}
          className="flex-[2] h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-sm hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
        >
          {isReleasing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Releasing...</>
          ) : (
            <><Banknote className="w-4 h-4" /> Release Funds</>
          )}
        </button>
      </div>
    </div>
  );
}

const OFFER_CATEGORIES = [
  { value: "tech", label: "Technology & Programming" },
  { value: "engineering", label: "Engineering & Architecture" },
  { value: "trades", label: "Trades & Local Services (Plumbing, Electrical, etc.)" },
  { value: "design", label: "Design & Creative" },
  { value: "writing", label: "Writing & Translation" },
  { value: "marketing", label: "Digital Marketing" },
  { value: "video", label: "Video & Photo" },
  { value: "business", label: "Business & Support" },
  { value: "legal", label: "Legal & General Consulting" },
];

const PROJECTS = [
  {
    id: 1,
    title: "Build a Custom AI Agent for Real Estate Analysis",
    description: "Looking for an expert to develop an autonomous agent that can scrape property listings and provide ROI analysis.",
    budget: "$2,000 - $5,000",
    posted: "2 hours ago",
    proposals: 12,
    category: "tech"
  },
  {
    id: 2,
    title: "Video Editor for YouTube Tech Channel",
    description: "Need a creative editor who understands fast-paced tech content. 10-minute videos, 1 per week.",
    budget: "$150 / video",
    posted: "5 hours ago",
    proposals: 8,
    category: "video"
  }
];

const normalizePortfolioItems = (portfolioItems: any) => {
  if (!Array.isArray(portfolioItems)) return [];

  return portfolioItems
    .map((item: any, index: number) => {
      if (typeof item === "string") {
        return {
          id: `portfolio-${index}`,
          title: item,
          description: "",
          imageUrl: null,
          linkUrl: item,
        };
      }

      return {
        id: item?.id || `portfolio-${index}`,
        title: item?.title || item?.name || item?.linkUrl || item?.url || `Portfolio Item ${index + 1}`,
        description: item?.description || "",
        imageUrl: item?.imageUrl || item?.image || null,
        linkUrl: item?.linkUrl || item?.url || null,
      };
    })
    .filter(Boolean);
};

const messageUrlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;


const renderLinkedMessageText = (text: string) => {
  const parts = text.split(messageUrlRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (messageUrlRegex.test(part)) {
      const href = part.startsWith("http") ? part : `https://${part}`;

      return (
        <a
          key={`${part}-${index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 break-all font-medium hover:opacity-80"
        >
          {part}
        </a>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

const triggerAttachmentDownload = (url: string, fileName: string) => {
  if (!url) return;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "attachment";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function CommunityPage() {
  const [activeTab, setActiveTab] = useState<"offers" | "projects" | "freelancers" | "myOffers" | "myPosts">("offers");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [userType, setUserType] = useState<"freelancer" | "client" | null>(null);
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [freelancers, setFreelancers] = useState<any[]>([]);
  const [selectedFreelancer, setSelectedFreelancer] = useState<any>(null);
  const [freelancerPortfolio, setFreelancerPortfolio] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [myOffers, setMyOffers] = useState<any[]>([]);
  const [loadingMyOffers, setLoadingMyOffers] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const [creatingOffer, setCreatingOffer] = useState(false);
  const isMobile = useIsMobile();
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);
  const [newOffer, setNewOffer] = useState({
    title: "", description: "", category: "", price: "", deliveryDays: "", tags: "",
  });
  const offerImageRef = useRef<HTMLInputElement>(null);
  const [offerImageUrl, setOfferImageUrl] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [loadingMyPosts, setLoadingMyPosts] = useState(false);
  const [showManageProjects, setShowManageProjects] = useState(false);
  const [showManageContracts, setShowManageContracts] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [loadingManagedProjectsContracts, setLoadingManagedProjectsContracts] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProject, setNewProject] = useState({
    title: "", description: "", category: "", budget: "", deadline: "", skills: "", location: "",
  });
  const [dbProjects, setDbProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<{ type: string; label: string; value: string }[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const lastMessageTimestampRef = useRef<string>(""); // for delta queries
  const messageCacheRef = useRef<Map<string, any[]>>(new Map()); // partnerId → messages cache
  const conversationCacheRef = useRef<any[] | null>(null); // cached conversation list
  const lastFetchedContractIdRef = useRef<string | null>(null);

  const [showContractModal, setShowContractModal] = useState(false);
  const [submittingContract, setSubmittingContract] = useState(false);
  const [contractForm, setContractForm] = useState({ title: "", description: "", amount: "", timeline: "", milestones: "", revisions: "0" });
  const locationCoordinateCacheRef = useRef<Record<string, { lat: number; lng: number }>>({});

  const [showMessages, setShowMessages] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false); // for scroll-to-load-more
  const [sendingMessage, setSendingMessage] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const activeConversationRef = useRef<any>(null);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [selectedDetailsProject, setSelectedDetailsProject] = useState<any>(null);
  const [showProjectDetailsModal, setShowProjectDetailsModal] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [contractActionLoadingId, setContractActionLoadingId] = useState<string | null>(null);
  const [managedProjectContracts, setManagedProjectContracts] = useState<any[]>([]);

  const [isLoadingProfileViewer, setIsLoadingProfileViewer] = useState(false);
  const locationSuggestionMouseDownRef = useRef(false);
  const locationBlurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Escrow & Payment System State ──
  const [showEscrowModal, setShowEscrowModal] = useState(false);
  const [showFreelancerAcceptModal, setShowFreelancerAcceptModal] = useState(false);
  const [escrowContract, setEscrowContract] = useState<any>(null);
  const [escrowMsg, setEscrowMsg] = useState<any>(null);
  const [escrowProcessing, setEscrowProcessing] = useState(false);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<any[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<number | null>(null);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [newPaymentMethodType, setNewPaymentMethodType] = useState("");
  const [newPaymentMethodDetails, setNewPaymentMethodDetails] = useState({ cardNumber: "", expiry: "", cvv: "", name: "", email: "", accountId: "" });
  const [releasingContractId, setReleasingContractId] = useState<string | null>(null);
  const [showReleaseConfirm, setShowReleaseConfirm] = useState<string | null>(null);
  const [showReleasePaymentModal, setShowReleasePaymentModal] = useState(false);
  const [releaseContractData, setReleaseContractData] = useState<any>(null);
  const [releaseSavedPaymentMethods, setReleaseSavedPaymentMethods] = useState<any[]>([]);
  const [releaseSelectedPaymentMethod, setReleaseSelectedPaymentMethod] = useState<number | null>(null);
  const [cancellingContractId, setCancellingContractId] = useState<string | null>(null);
  const [chatEscrowMap, setChatEscrowMap] = useState<Record<string, string | null>>({});

  // ── Deliverable & Revision Submission State ──
  const [showDeliverableModal, setShowDeliverableModal] = useState(false);
  const [deliverableForm, setDeliverableForm] = useState({ message: "", attachments: [] as File[] });
  const [submittingDeliverable, setSubmittingDeliverable] = useState(false);

  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionForm, setRevisionForm] = useState({ message: "", attachments: [] as File[], parentDeliverableId: null as number | null });
  const [submittingRevision, setSubmittingRevision] = useState(false);

  const [contractDeliverables, setContractDeliverables] = useState<Record<string, any[]>>({});

  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeForm, setDisputeForm] = useState({ title: "", description: "", attachments: [] as File[] });
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const formatLocalDateTime = useCallback((value: any) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
  }, []);

  const getProjectDateLabel = useCallback((project: any) => {
    if (!project) return null;
    const exactDate = formatLocalDateTime(project.createdAt || project.postedAt || project.updatedAt);
    if (exactDate) return { label: "Posted", value: exactDate };
    if (typeof project.posted === "string" && project.posted.trim()) return { label: "Posted", value: project.posted };
    return null;
  }, [formatLocalDateTime]);

  const getContractDateLabel = useCallback((contract: any) => {
    if (!contract) return null;
    const updated = formatLocalDateTime(contract.statusUpdatedAt);
    if (updated) return { label: "Updated", value: updated };
    const created = formatLocalDateTime(contract.createdAt);
    if (created) return { label: "Created", value: created };
    return null;
  }, [formatLocalDateTime]);

  useEffect(() => {
    if (!hasProfile || !session?.user?.id) return;
    const fetchNotifs = async () => {
      try {
        const res = await fetch("/api/community/notifications");
        const data = await res.json();
        if (data.notifications) setNotifications(data.notifications);
      } catch (e) {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000);
    return () => clearInterval(interval);
  }, [hasProfile, session?.user?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.BroadcastChannel) return;

    const channel = new BroadcastChannel("hiremindx-projects");
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "PROJECT_CREATED") {
        fetch("/api/community/projects")
          .then((r) => r.json())
          .then((data) => {
            if (data.projects) {
              setDbProjects(data.projects);
            }
          })
          .catch(console.error);
      }
    };

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }, []);

  const globeRef = useRef<GlobeHandle | null>(null);
  const [globeMarkers, setGlobeMarkers] = useState<GlobeMarker[]>([]);
  const [globeWorkers, setGlobeWorkers] = useState<any[]>([]);
  const [selectedGlobeWorker, setSelectedGlobeWorker] = useState<any>(null);
  const [selectedGlobeProject, setSelectedGlobeProject] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showFullProfileModal, setShowFullProfileModal] = useState(false);
  const [profileViewerData, setProfileViewerData] = useState<any>(null);

  const [freelancerLocationFilter, setFreelancerLocationFilter] = useState("");
  const [freelancerCategoryFilter, setFreelancerCategoryFilter] = useState("all");
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);

  const openProfileViewer = useCallback(async (target: any) => {
    const targetUserId = target?.userId || target?.id || target?.partnerId;
    if (!targetUserId) {
      toast.error("Unable to open profile");
      return;
    }

    const fallbackName = target?.displayName || target?.name || target?.partnerName || "Community Member";
    const fallbackHeadline = target?.headline || target?.partnerHeadline || null;
    const fallbackImage = target?.image || target?.userImage || target?.partnerImage || null;
    const fallbackLocation = target?.location || null;
    const fallbackUserType = target?.userType || target?.partnerType || null;
    const fallbackBio = target?.bio || target?.description || target?.companyDescription || null;
    const fallbackPortfolio = normalizePortfolioItems(target?.portfolio || target?.portfolioUrls || []);

    setProfileViewerData({
      id: targetUserId,
      userId: targetUserId,
      name: fallbackName,
      displayName: fallbackName,
      image: fallbackImage,
      headline: fallbackHeadline,
      location: fallbackLocation,
      userType: fallbackUserType,
      bio: fallbackBio,
      description: fallbackBio,
      companyName: target?.companyName || null,
      companyDescription: target?.companyDescription || null,
      workExperience: Array.isArray(target?.workExperience) ? target.workExperience : [],
      skills: Array.isArray(target?.skills) ? target.skills : [],
      portfolio: fallbackPortfolio,
      portfolioUrls: fallbackPortfolio,
      pricingText: target?.pricingText || null,
      hourlyRate: target?.hourlyRate || null,
      availability: target?.availability || null,
    });
    setShowFullProfileModal(true);
    setIsLoadingProfileViewer(true);

    try {
      const response = await fetch(`/api/community/profile?userId=${encodeURIComponent(targetUserId)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load profile");
      }

      if (data?.profile) {
        const profile = data.profile;
        const normalizedPortfolio = normalizePortfolioItems(profile.portfolio || profile.portfolioUrls || []);

        setProfileViewerData((prev: any) => ({
          ...prev,
          ...profile,
          id: profile.userId || profile.id || targetUserId,
          userId: profile.userId || profile.id || targetUserId,
          name: profile.name || profile.displayName || prev?.name || fallbackName,
          displayName: profile.displayName || profile.name || prev?.displayName || fallbackName,
          image: profile.image || prev?.image || fallbackImage,
          headline: profile.headline || prev?.headline || fallbackHeadline,
          location: profile.location || prev?.location || fallbackLocation,
          userType: profile.userType || prev?.userType || fallbackUserType,
          bio: profile.bio || profile.description || prev?.bio || fallbackBio,
          description: profile.description || profile.bio || prev?.description || fallbackBio,
          companyName: profile.companyName || prev?.companyName || null,
          companyDescription: profile.companyDescription || prev?.companyDescription || null,
          workExperience: Array.isArray(profile.workExperience) ? profile.workExperience : prev?.workExperience || [],
          skills: Array.isArray(profile.skills) ? profile.skills : prev?.skills || [],
          portfolio: normalizedPortfolio,
          portfolioUrls: normalizedPortfolio,
          pricingText: profile.pricingText || prev?.pricingText || null,
          hourlyRate: profile.hourlyRate || prev?.hourlyRate || null,
          availability: profile.availability || prev?.availability || null,
        }));
      }
    } catch (error) {
      console.error("Error loading profile viewer:", error);
    } finally {
      setIsLoadingProfileViewer(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (locationBlurTimeoutRef.current) {
        clearTimeout(locationBlurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasProfile) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });
        const myMarker: GlobeMarker = {
          id: "__my_location__",
          lat,
          lng,
          label: "You",
          type: "user",
          color: "#f5c518",
        };
        setGlobeMarkers((prev) => [...prev.filter((m) => m.id !== "__my_location__"), myMarker]);
        globeRef.current?.flyTo(lat, lng, 2.2);
      },
      () => {}
    );
  }, [hasProfile]);

  // Handle 3D Secure redirect: Stripe redirects back to /community?payment_intent=xxx&redirect_status=succeeded
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get("payment_intent");
    const redirectStatus = params.get("redirect_status");
    if (paymentIntentId && redirectStatus === "succeeded") {
      // Clean URL so we don't re-process on refresh
      window.history.replaceState({}, "", "/community");

      // Call backend to verify and record the escrow
      (async () => {
        try {
          const res = await fetch("/api/community/escrow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "fund", paymentIntentId, contractId: null, freelancerId: null, contractAmount: null }),
          });
          const data = await res.json();
          if (res.ok && data.success && !data.alreadyFunded) {
            toast.success("Escrow funded successfully after authentication!");
            // Update escrow map if we have the contractId
            if (data.escrow?.contractId) {
              setChatEscrowMap((prev) => ({ ...prev, [data.escrow.contractId]: "escrow_funded" }));

              // Send escrow_funded chat message so the freelancer sees it
              if (data.escrow.freelancerId && session?.user?.id) {
                try {
                  const responsePayload = {
                    type: "contract_response",
                    contractId: data.escrow.contractId,
                    action: "escrow_funded",
                    actedAt: new Date().toISOString(),
                    actorName: session.user.name || "User",
                  };
                  await fetch("/api/community/messages", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      receiverId: data.escrow.freelancerId,
                      message: `[CONTRACT_RESPONSE]${JSON.stringify(responsePayload)}`,
                    }),
                  });
                } catch {}
              }
            }
            fetchManagedContracts();
            fetchConversations();
            if (activeConversation) {
              fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
            }
          } else if (data.alreadyFunded) {
            // Already funded by the StripeEscrowPaymentForm's onSuccess callback — just refresh data
            if (data.escrow?.contractId) {
              setChatEscrowMap((prev) => ({ ...prev, [data.escrow.contractId]: "escrow_funded" }));
            }
            fetchManagedContracts();
            fetchConversations();
          } else if (!data.alreadyFunded) {
            toast.error(data.error || "Failed to record escrow after payment authentication.");
          }
        } catch {
          toast.error("Failed to finalize escrow funding after authentication.");
        }
      })();
    }
  }, []);

  useEffect(() => {
    const checkProfile = async () => {
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");

      if (isLocalhost) {
        setHasProfile(true);
        setIsCheckingProfile(false);
        setUserType("client");
        setActiveTab("offers");
        return;
      }

      if (!session?.user?.id) {
        setHasProfile(true);
        setIsCheckingProfile(false);
        setUserType("client");
        return;
      }

      try {
        const response = await fetch("/api/community/profile");
        const data = await response.json();
        if (data.profile && data.profile.profileComplete) {
          setHasProfile(true);
          setShowOnboarding(false);
          const type = data.profile.userType as "freelancer" | "client";
          setUserType(type);
          setActiveTab(type === "freelancer" ? "projects" : "offers");
        } else {
          setHasProfile(true);
          setShowOnboarding(true);
        }
      } catch (error) {
        console.error("Error checking profile:", error);
        setHasProfile(true);
      } finally {
        setIsCheckingProfile(false);
      }
    };

    if (!isPending) {
      checkProfile();
    }
  }, [session, isPending]);

  const handleOnboardingComplete = (type: "freelancer" | "client") => {
    setShowOnboarding(false);
    setHasProfile(true);
    setUserType(type);
    setActiveTab(type === "freelancer" ? "projects" : "offers");
  };

  useEffect(() => {
    if (!hasProfile) return;
    if (userType === "freelancer" && dbProjects.length === 0) {
      fetch("/api/community/projects")
        .then((r) => r.json())
        .then((data) => { if (data.projects) setDbProjects(data.projects); })
        .catch(console.error);
    }
    if (userType === "client" && offers.length === 0) {
      fetch("/api/community/offers")
        .then((r) => r.json())
        .then((data) => { if (data.offers) setOffers(data.offers); })
        .catch(console.error);
    }
  }, [hasProfile, userType]);

  useEffect(() => {
    if (activeTab === "freelancers" && freelancers.length === 0) {
      fetch("/api/community/freelancers")
        .then((r) => r.json())
        .then((data) => {
          if (data.freelancers) setFreelancers(data.freelancers);
        })
        .catch(console.error);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "offers" && offers.length === 0) {
      setLoadingOffers(true);
      fetch("/api/community/offers")
        .then((r) => r.json())
        .then((data) => {
          if (data.offers) setOffers(data.offers);
        })
        .catch(console.error)
        .finally(() => setLoadingOffers(false));
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "myOffers" && myOffers.length === 0 && session?.user?.id) {
      setLoadingMyOffers(true);
      fetch(`/api/community/offers?userId=${session.user.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.offers) setMyOffers(data.offers);
        })
        .catch(console.error)
        .finally(() => setLoadingMyOffers(false));
    }
  }, [activeTab, session?.user?.id]);

  useEffect(() => {
    if (activeTab === "myPosts" && myPosts.length === 0 && session?.user?.id) {
      setLoadingMyPosts(true);
      fetch(`/api/community/projects?userId=${session.user.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.projects) setMyPosts(data.projects);
        })
        .catch(console.error)
        .finally(() => setLoadingMyPosts(false));
    }
  }, [activeTab, session?.user?.id]);

  useEffect(() => {
    if (activeTab === "projects" && dbProjects.length === 0) {
      fetch("/api/community/projects")
        .then((r) => r.json())
        .then((data) => {
          if (data.projects) setDbProjects(data.projects);
        })
        .catch(console.error);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "projects") return;

    let cancelled = false;

    const refreshProjects = async () => {
      try {
        const res = await fetch("/api/community/projects");
        const data = await res.json();
        if (!cancelled && data.projects) {
          setDbProjects(data.projects);
        }
      } catch (error) {
        console.error("Error refreshing projects:", error);
      }
    };

    refreshProjects();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      if (userType !== "freelancer") {
        setSuggestions([]);
        setShowSuggestions(false);
      }
      return;
    }

    if (userType === "freelancer" && document.activeElement !== null && searchContainerRef.current?.contains(document.activeElement)) {
      return;
    }

    const results: { type: string; label: string; value: string }[] = [];

    CATEGORIES.filter(c => c.id !== "all").forEach((cat) => {
      if (cat.name.toLowerCase().includes(q)) {
        results.push({ type: "Category", label: cat.name, value: cat.name });
      }
    });

    if (userType === "freelancer") {
      [...dbProjects, ...PROJECTS].forEach((p) => {
        if (p.title.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)) {
          if (!results.find((r) => r.label === p.title)) {
            results.push({ type: "Project", label: p.title, value: p.title });
          }
        }
      });
    } else {
      offers.forEach((o: any) => {
        if (o.title?.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q)) {
          if (!results.find((r) => r.label === o.title)) {
            results.push({ type: "Offer", label: o.title, value: o.title });
          }
        }
        if (Array.isArray(o.tags)) {
          o.tags.forEach((tag: string) => {
            if (tag.toLowerCase().includes(q) && !results.find((r) => r.label === tag && r.type === "Tag")) {
              results.push({ type: "Tag", label: tag, value: tag });
            }
          });
        }
      });
    }

    if (userType !== "freelancer") {
      setSuggestions(results.slice(0, 8));
      setShowSuggestions(results.length > 0);
    }
  }, [searchQuery, userType, dbProjects, offers]);

  const handleSelectSuggestion = (suggestion: { type: string; label: string; value: string }) => {
    setSearchQuery(suggestion.value);
    setShowSuggestions(false);
    setTimeout(() => {
      const q = suggestion.value.toLowerCase();
      if (userType === "freelancer") {
        const allProjects = [...dbProjects, ...PROJECTS];
        const filtered = allProjects.filter((p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
        setSearchResults(filtered);
        setActiveTab("projects");
      } else {
        const filtered = offers.filter((o: any) =>
          o.title?.toLowerCase().includes(q) ||
          o.description?.toLowerCase().includes(q) ||
          o.category?.toLowerCase().includes(q) ||
          (Array.isArray(o.tags) && o.tags.some((t: string) => t.toLowerCase().includes(q)))
        );
        setSearchResults(filtered);
        setActiveTab("offers");
      }
    }, 0);
  };

  const handleSearch = () => {
    setShowSuggestions(false);
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResults(null);
      return;
    }

    if (userType === "freelancer") {
      const allProjects = [...dbProjects, ...PROJECTS];
      const filtered = allProjects.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
      setSearchResults(filtered);
      setActiveTab("projects");
    } else {
      if (offers.length === 0) {
        fetch("/api/community/offers")
          .then((r) => r.json())
          .then((data) => {
            if (data.offers) {
              setOffers(data.offers);
              const filtered = data.offers.filter((o: any) =>
                o.title?.toLowerCase().includes(q) ||
                o.description?.toLowerCase().includes(q) ||
                o.category?.toLowerCase().includes(q) ||
                (Array.isArray(o.tags) && o.tags.some((t: string) => t.toLowerCase().includes(q)))
              );
              setSearchResults(filtered);
            }
          });
      } else {
        const filtered = offers.filter((o: any) =>
          o.title?.toLowerCase().includes(q) ||
          o.description?.toLowerCase().includes(q) ||
          o.category?.toLowerCase().includes(q) ||
          (Array.isArray(o.tags) && o.tags.some((t: string) => t.toLowerCase().includes(q)))
        );
        setSearchResults(filtered);
      }
      setActiveTab("offers");
    }
  };

  const openContractForProject = useCallback((project: any) => {
    if (!project) return;

    setSelectedProject(project);
    setProfileViewerData({
      userId: project.userId,
      id: project.userId,
      name: project.authorName || "Client",
      displayName: project.authorName || "Client",
      image: project.clientImage || null,
      userType: "client",
      location: project.location || null,
    });
    setContractForm({
      title: project.title || "",
      description: project.description || "",
      amount: project.budget?.split("-")[0]?.trim()?.replace(/[^\d.]/g, "") || "",
      timeline: project.deadline || "",
      milestones: "",
    });
    setShowContractModal(true);
  }, []);

  const normalizeMessageForUi = useCallback((message: any) => {
    if (!message) return message;

    let normalizedAttachments = message.attachments;
    if (typeof normalizedAttachments === "string") {
      try {
        normalizedAttachments = JSON.parse(normalizedAttachments);
      } catch {
        normalizedAttachments = null;
      }
    }

    return {
      ...message,
      attachments: Array.isArray(normalizedAttachments) ? normalizedAttachments : [],
    };
  }, []);

  const mergeMessages = useCallback((current: any[], incoming: any[]) => {
    const messageMap = new Map<string, any>();

    current.forEach((message) => {
      const key = message.id ? `id:${message.id}` : `temp:${message.clientTempId || message.createdAt || Math.random()}`;
      messageMap.set(key, message);
    });

    incoming.forEach((message) => {
      const normalized = normalizeMessageForUi(message);
      const serverKey = normalized.id ? `id:${normalized.id}` : null;
      const tempKey = normalized.clientTempId ? `temp:${normalized.clientTempId}` : null;

      if (tempKey && messageMap.has(tempKey) && serverKey) {
        const optimistic = messageMap.get(tempKey);
        messageMap.delete(tempKey);
        messageMap.set(serverKey, {
          ...optimistic,
          ...normalized,
          status: normalized.status || "sent",
          isOptimistic: false,
        });
        return;
      }

      if (serverKey && messageMap.has(serverKey)) {
        messageMap.set(serverKey, {
          ...messageMap.get(serverKey),
          ...normalized,
          isOptimistic: false,
        });
        return;
      }

      if (tempKey && messageMap.has(tempKey)) {
        messageMap.set(tempKey, {
          ...messageMap.get(tempKey),
          ...normalized,
        });
        return;
      }

      messageMap.set(serverKey || tempKey || `fallback:${normalized.createdAt || Math.random()}`, normalized);
    });

    return Array.from(messageMap.values()).sort((a, b) => {
      const first = new Date(a.createdAt || 0).getTime();
      const second = new Date(b.createdAt || 0).getTime();
      return first - second;
    });
  }, [normalizeMessageForUi]);

  const parseContractEventMessage = useCallback((rawMessage: string) => {
    if (typeof rawMessage !== "string") return null;

    const prefixes = ["[CONTRACT_RESPONSE]", "[CONTRACT_CANCEL]"];
    const matchedPrefix = prefixes.find((prefix) => rawMessage.startsWith(prefix));
    if (!matchedPrefix) return null;

    try {
      const parsed = JSON.parse(rawMessage.replace(matchedPrefix, ""));
      if (!parsed?.contractId) return null;
      return {
        contractId: String(parsed.contractId),
        action: parsed.action === "accepted" ? "accepted" : parsed.action === "declined" ? "declined" : parsed.action === "escrow_funded" ? "escrow_funded" : parsed.action === "released" ? "released" : "cancelled",
        actedAt: String(parsed.actedAt || ""),
        actorName: String(parsed.actorName || ""),
      };
    } catch {
      return null;
    }
  }, []);

  const parseDeliverableMessage = useCallback((rawMessage: string) => {
    if (typeof rawMessage !== "string" || !rawMessage.startsWith("[DELIVERABLE]")) return null;
    try {
      const parsed = JSON.parse(rawMessage.replace("[DELIVERABLE]", ""));
      if (!parsed?.contractId) return null;
      return {
        contractId: String(parsed.contractId),
        submittedAt: String(parsed.submittedAt || ""),
        notes: String(parsed.notes || ""),
        deliverableId: Number(parsed.deliverableId) || null,
      };
    } catch {
      return null;
    }
  }, []);

  const parseRevisionRequestMessage = useCallback((rawMessage: string) => {
    if (typeof rawMessage !== "string" || !rawMessage.startsWith("[REVISION_REQUEST]")) return null;
    try {
      const parsed = JSON.parse(rawMessage.replace("[REVISION_REQUEST]", ""));
      if (!parsed?.contractId) return null;
      return {
        contractId: String(parsed.contractId),
        requestedAt: String(parsed.requestedAt || ""),
        notes: String(parsed.notes || ""),
        parentDeliverableId: Number(parsed.parentDeliverableId) || null,
      };
    } catch {
      return null;
    }
  }, []);

  const fetchMessagesForConversation = useCallback(async (partnerId: string, options?: { silent?: boolean; loadMore?: boolean }) => {
    if (!partnerId) return;
    const isSilent = options?.silent;
    const isLoadMore = options?.loadMore;

    if (!isSilent && !isLoadMore) setLoadingChat(true);

    try {
      // Build URL with pagination/delta params
      let url = `/api/community/messages?withUser=${partnerId}&limit=50`;
      if (!isLoadMore && lastMessageTimestampRef.current) {
        // Delta query: only fetch new messages since last check
        url += `&since=${encodeURIComponent(lastMessageTimestampRef.current)}`;
      }
      if (isLoadMore && chatMessages.length > 0) {
        // Pagination: load older messages before the oldest one we have
        const oldestMsg = chatMessages[0];
        if (oldestMsg?.id) url += `&before=${oldestMsg.id}`;
      }

      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();

      if (data.messages) {
        const normalized = data.messages.map(normalizeMessageForUi);
        setChatMessages((prev) => mergeMessages(prev, normalized));
        setHasMoreMessages(data.hasMore || false);

        // Update cache
        messageCacheRef.current.set(partnerId, mergeMessages(
          messageCacheRef.current.get(partnerId) || [],
          normalized
        ));

        // Track latest timestamp for delta queries
        if (normalized.length > 0) {
          const latest = normalized[normalized.length - 1];
          if (latest?.createdAt) {
            const latestTs = typeof latest.createdAt === "string" ? latest.createdAt : new Date(latest.createdAt).toISOString();
            if (!lastMessageTimestampRef.current || latestTs > lastMessageTimestampRef.current) {
              lastMessageTimestampRef.current = latestTs;
            }
          }
        }
      }
    } catch {
    } finally {
      if (!isSilent && !isLoadMore) setLoadingChat(false);
    }
  }, [mergeMessages, normalizeMessageForUi, chatMessages]);

  // ── Compute escrow state lazily from chatMessages during render ──
  const computedEscrowMap = useMemo(() => {
    const updates: Record<string, string> = {};
    const STATE_PRIORITY: Record<string, number> = { declined: 0, accepted: 1, escrow_funded: 2, released: 3, completed: 4, cancelled: 2 };
    for (const msg of chatMessages) {
      const evt = parseContractEventMessage(msg.message);
      if (evt?.contractId) {
        const priority = STATE_PRIORITY[evt.action] || 0;
        const existingPriority = STATE_PRIORITY[updates[evt.contractId]] || 0;
        if (!updates[evt.contractId] || priority > existingPriority) {
          updates[evt.contractId] = evt.action;
        }
      }
    }
    return updates;
  }, [chatMessages, parseContractEventMessage]);

  // Sync computed escrow state to chatEscrowMap
  useEffect(() => {
    if (Object.keys(computedEscrowMap).length > 0) {
      setChatEscrowMap((prev) => {
        const merged = { ...prev };
        for (const [cid, state] of Object.entries(computedEscrowMap)) {
          merged[cid] = state;
        }
        return merged;
      });
    }
  }, [computedEscrowMap]);

  const fetchConversations = async (options?: { useCache?: boolean }) => {
    // If we have a cache and want to show it instantly, do so first
    if (options?.useCache && conversationCacheRef.current) {
      setConversations(conversationCacheRef.current);
      setUnreadCount(conversationCacheRef.current.reduce((sum: number, c: any) => sum + c.unreadCount, 0));
    }

    if (!options?.useCache) setLoadingConversations(true);
    try {
      const res = await fetch("/api/community/messages?conversations=true", { credentials: "include" });
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
        setUnreadCount(data.conversations.reduce((sum: number, c: any) => sum + c.unreadCount, 0));
        conversationCacheRef.current = data.conversations; // update cache
      }
    } catch {} finally { setLoadingConversations(false); }
  };

  const fetchDeliverables = useCallback(async (contractId: string) => {
    try {
      const res = await fetch(`/api/community/deliverables?contractId=${encodeURIComponent(contractId)}`, { credentials: "include" });
      const data = await res.json();
      if (data.deliverables) {
        setContractDeliverables((prev) => ({ ...prev, [contractId]: data.deliverables }));
      }
    } catch (err) {
      console.error("[fetchDeliverables] failed:", err);
    }
  }, []);

  const hasPendingDeliverable = useCallback((contractId: string) => {
    const deliverables = contractDeliverables[contractId] || [];
    return deliverables.some((d: any) =>
      d.type === "deliverable" &&
      d.status === "pending_review" &&
      !d.isArchived
    );
  }, [contractDeliverables]);

  const openConversation = async (conv: any) => {
    setActiveConversation(conv);
    activeConversationRef.current = conv;
    lastFetchedContractIdRef.current = null;
    setShowPlusMenu(false);

    // Reset delta timestamp for the new conversation
    lastMessageTimestampRef.current = "";

    // Show cached messages instantly if available
    const cached = messageCacheRef.current.get(conv.partnerId);
    if (cached && cached.length > 0) {
      setChatMessages(cached);
      // Track latest timestamp from cache
      const latest = cached[cached.length - 1];
      if (latest?.createdAt) {
        lastMessageTimestampRef.current = typeof latest.createdAt === "string" ? latest.createdAt : new Date(latest.createdAt).toISOString();
      }
    } else {
      setChatMessages([]);
    }

    // Fetch latest messages (will use delta if cache exists)
    await fetchMessagesForConversation(conv.partnerId);
    try {
      await fetch("/api/community/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ withUser: conv.partnerId }) });
      setConversations((prev) => prev.map((c) => c.partnerId === conv.partnerId ? { ...c, unreadCount: 0 } : c));
      setUnreadCount((prev) => Math.max(0, prev - (conv.unreadCount || 0)));
    } catch {}
  };

  const deleteConversation = async (conv: any) => {
    const confirmed = window.confirm("Delete this conversation permanently? All messages and attachments will be removed.");
    if (!confirmed) return;

    try {
      const ids = [session?.user?.id, conv.partnerId].sort();
      const conversationKey = `${ids[0]}_${ids[1]}`;
      const res = await fetch(`/api/community/messages?conversationKey=${conversationKey}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete conversation");

      setConversations((prev) => prev.filter((c) => c.partnerId !== conv.partnerId));
      if (activeConversation?.partnerId === conv.partnerId) {
        setActiveConversation(null);
        setChatMessages([]);
      }
      setUnreadCount((prev) => Math.max(0, prev - (conv.unreadCount || 0)));
      toast.success("Conversation deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete conversation");
    }
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !attachment) || !activeConversation || !session?.user?.id) {
      if (!session?.user?.id) toast.error("Please log in to send messages");
      return;
    }

    const messageContent = newMessage.trim();
    const attachmentToSend = attachment;
    const clientTempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    setSendingMessage(true);
    setNewMessage("");
    setAttachment(null);
    setShowPlusMenu(false);

    try {
      let attachmentsToSave = null;
      let optimisticAttachments: any[] = [];

      if (attachmentToSend) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("Failed to read file"));
            }
          };
          reader.onerror = () => reject(new Error("File read failed"));
          reader.readAsDataURL(attachmentToSend);
        });

        optimisticAttachments = [{
          name: attachmentToSend.name,
          type: attachmentToSend.type,
          size: attachmentToSend.size,
          url: base64,
        }];

        attachmentsToSave = optimisticAttachments;
      }

      const optimisticMessage = normalizeMessageForUi({
        clientTempId,
        senderId: session.user.id,
        receiverId: activeConversation.partnerId,
        message: messageContent || "",
        attachments: optimisticAttachments,
        createdAt: nowIso,
        status: "sending",
        isOptimistic: true,
      });

      setChatMessages((prev) => mergeMessages(prev, [optimisticMessage]));

      const previewText = attachmentToSend ? (messageContent || "Attachment") : formatConversationPreview(messageContent);
      setConversations((prev) => {
        const exists = prev.find((c) => c.partnerId === activeConversation.partnerId);
        if (exists) {
          return prev.map((c) => c.partnerId === activeConversation.partnerId ? { ...c, lastMessage: previewText, lastMessageAt: nowIso } : c);
        }
        return [{ ...activeConversation, lastMessage: previewText, lastMessageAt: nowIso }, ...prev];
      });

      const res = await fetch("/api/community/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          receiverId: activeConversation.partnerId, 
          message: messageContent || "Sent an attachment",
          attachments: attachmentsToSave,
          clientTempId,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 429 && data?.limitReached) {
          const usage = data.usage || {};
          window.dispatchEvent(new CustomEvent("usage-limit-reached", { detail: { message: data.error, resetAt: usage.resetAt || null, isLifetime: usage.isLifetime !== undefined ? usage.isLifetime : true } }));
          throw new Error("LIMIT_REACHED_SILENT");
        }
        throw new Error(data?.error || "Send failed");
      }

      if (data?.message) {
        const sentMessage = normalizeMessageForUi({
          ...data.message,
          clientTempId,
          status: data.message.status || "sent",
          isOptimistic: false,
        });
        setChatMessages((prev) => mergeMessages(prev, [sentMessage]));

        // Update cache with confirmed message
        const partnerId = activeConversation.partnerId;
        messageCacheRef.current.set(partnerId, mergeMessages(
          messageCacheRef.current.get(partnerId) || [],
          [sentMessage]
        ));
      }

      // SSE handles real-time updates, but refresh conversation list as fallback
      fetchConversations({ useCache: false });
    } catch (err: any) {
      console.error("Community sendMessage failed", err);
      const isSilent = err instanceof Error && err.message === "LIMIT_REACHED_SILENT";
      
      if (!isSilent) {
        setChatMessages((prev) => prev.map((msg) => msg.clientTempId === clientTempId ? { ...msg, status: "failed", isOptimistic: false } : msg));
        toast.error(err.message || "Failed to send message");
      } else {
        // Just remove the optimistic message if they hit the limit
        setChatMessages((prev) => prev.filter((msg) => msg.clientTempId !== clientTempId));
      }
    } finally {
      setSendingMessage(false);
    }
  };

  const submitDeliverable = async (contractId: string, notes: string, attachments: File[]) => {
    if (!activeConversation || !session?.user?.id) return;
    setSubmittingDeliverable(true);

    try {
      let attachmentsToSave: any[] = [];
      if (attachments.length > 0) {
        attachmentsToSave = await Promise.all(
          attachments.map(async (file) => {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                if (typeof reader.result === "string") resolve(reader.result);
                else reject(new Error("Failed to read file"));
              };
              reader.onerror = () => reject(new Error("File read failed"));
              reader.readAsDataURL(file);
            });
            return { name: file.name, type: file.type, size: file.size, url: base64 };
          })
        );
      }

      const nowIso = new Date().toISOString();
      const payload = {
        type: "deliverable",
        contractId,
        submittedAt: nowIso,
        notes,
        deliverableId: null,
      };

      const msgRes = await fetch("/api/community/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: activeConversation.partnerId,
          message: `[DELIVERABLE]${JSON.stringify(payload)}`,
          attachments: attachmentsToSave.length > 0 ? attachmentsToSave : null,
        }),
      });

      const msgData = await msgRes.json().catch(() => null);
      if (!msgRes.ok) throw new Error(msgData?.error || "Failed to send deliverable");

      if (msgData?.message?.id) {
        await fetch("/api/community/deliverables", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractId,
            messageId: msgData.message.id,
            type: "deliverable",
          }),
        });
      }

      toast.success("Deliverable submitted!");
      setShowDeliverableModal(false);
      setDeliverableForm({ message: "", attachments: [] });
      await fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
      await fetchDeliverables(contractId);
      fetchConversations();
    } catch (err: any) {
      console.error("[submitDeliverable] failed:", err);
      toast.error(err.message || "Failed to submit deliverable");
    } finally {
      setSubmittingDeliverable(false);
    }
  };

  const approveDeliverable = async (deliverableId: number, contractId: string) => {
    try {
      const res = await fetch("/api/community/deliverables", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverableId, status: "approved" }),
      });
      if (!res.ok) throw new Error("Failed to approve deliverable");
      toast.success("Deliverable approved!");
      await fetchDeliverables(contractId);
    } catch (err: any) {
      console.error("[approveDeliverable] failed:", err);
      toast.error(err.message || "Failed to approve deliverable");
    }
  };

  const submitRevisionRequest = async (contractId: string, notes: string, attachments: File[], parentDeliverableId: number | null) => {
    if (!activeConversation || !session?.user?.id) return;
    setSubmittingRevision(true);

    try {
      let attachmentsToSave: any[] = [];
      if (attachments.length > 0) {
        attachmentsToSave = await Promise.all(
          attachments.map(async (file) => {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                if (typeof reader.result === "string") resolve(reader.result);
                else reject(new Error("Failed to read file"));
              };
              reader.onerror = () => reject(new Error("File read failed"));
              reader.readAsDataURL(file);
            });
            return { name: file.name, type: file.type, size: file.size, url: base64 };
          })
        );
      }

      const nowIso = new Date().toISOString();
      const payload = {
        type: "revision_request",
        contractId,
        requestedAt: nowIso,
        notes,
        parentDeliverableId,
      };

      const msgRes = await fetch("/api/community/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: activeConversation.partnerId,
          message: `[REVISION_REQUEST]${JSON.stringify(payload)}`,
          attachments: attachmentsToSave.length > 0 ? attachmentsToSave : null,
        }),
      });

      const msgData = await msgRes.json().catch(() => null);
      if (!msgRes.ok) throw new Error(msgData?.error || "Failed to send revision request");

      if (msgData?.message?.id && parentDeliverableId) {
        await fetch("/api/community/deliverables", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractId,
            messageId: msgData.message.id,
            type: "revision",
            parentDeliverableId,
          }),
        });

        await fetch("/api/community/deliverables", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deliverableId: parentDeliverableId,
            status: "revision_requested",
          }),
        });
      }

      toast.success("Revision request sent!");
      setShowRevisionModal(false);
      setRevisionForm({ message: "", attachments: [], parentDeliverableId: null });
      await fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
      await fetchDeliverables(contractId);
      fetchConversations();
    } catch (err: any) {
      console.error("[submitRevisionRequest] failed:", err);
      toast.error(err.message || "Failed to send revision request");
    } finally {
      setSubmittingRevision(false);
    }
  };

  const submitDispute = async (contractId: string, title: string, description: string, attachments: File[]) => {
    if (!activeConversation || !session?.user?.id) return;
    setSubmittingDispute(true);

    try {
      let attachmentsToSave: any[] = [];
      if (attachments.length > 0) {
        attachmentsToSave = await Promise.all(
          attachments.map(async (file) => {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            return { name: file.name, url: base64, type: file.type };
          })
        );
      }

      const disputePayload = {
        type: "dispute",
        contractId,
        title,
        description,
        raisedBy: session.user.name || "Unknown",
        raisedByRole: userType,
        attachments: attachmentsToSave,
        createdAt: new Date().toISOString(),
      };

      const res = await fetch("/api/community/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: activeConversation.partnerId,
          message: `[DISPUTE]${JSON.stringify(disputePayload)}`,
          attachments: attachmentsToSave,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit dispute");
      }

      toast.success("Dispute submitted!");
      setShowDisputeModal(false);
      setDisputeForm({ title: "", description: "", attachments: [] });
      await fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
      fetchConversations();
    } catch (err: any) {
      console.error("[submitDispute] failed:", err);
      toast.error(err.message || "Failed to submit dispute");
    } finally {
      setSubmittingDispute(false);
    }
  };

  const startChatWithFreelancer = (freelancer: any) => {
    const partnerId = freelancer.userId || freelancer.id;
    if (!partnerId) {
      toast.error("Could not find freelancer ID");
      return;
    }

    setShowMessages(true);
    const conv = {
      partnerId,
      partnerName: freelancer.displayName || freelancer.name || "Freelancer",
      partnerImage: freelancer.image || freelancer.userImage || null,
      partnerType: freelancer.userType || "freelancer",
      partnerHeadline: freelancer.headline || null,
      lastMessage: "",
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
    };

    setConversations((prev) => {
      const existing = prev.find((c) => c.partnerId === partnerId);
      if (!existing) return [conv, ...prev];
      return prev;
    });
    openConversation(conv);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!chatMessages.length) return;
    const offerMsg = chatMessages.find((m: any) => {
      const raw = m.message;
      return typeof raw === "string" && raw.startsWith("[CONTRACT_OFFER_JSON]");
    });
    if (offerMsg) {
      try {
        const parsed = JSON.parse(offerMsg.message.replace("[CONTRACT_OFFER_JSON]", ""));
        if (parsed?.contractId) {
          const cid = String(parsed.contractId);
          const last = lastFetchedContractIdRef.current;
          if (last !== cid) {
            lastFetchedContractIdRef.current = cid;
            fetchDeliverables(cid);
          }
        }
      } catch {}
    }
  }, [chatMessages, fetchDeliverables]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // ── SSE Real-Time Connection ──
  useEffect(() => {
    if (!showMessages || !session?.user?.id) {
      // Close SSE when chat panel closes
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      return;
    }

    // Open SSE connection for real-time message push
    const connectSSE = () => {
      if (sseRef.current) {
        sseRef.current.close();
      }

      const es = new EventSource("/api/community/messages/stream");
      sseRef.current = es;

      es.addEventListener("connected", () => {
        console.log("[SSE] Connected to message stream");
      });

      es.addEventListener("new_message", (event) => {
        try {
          const msg = JSON.parse(event.data);
          const normalized = normalizeMessageForUi(msg);
          const currentConv = activeConversationRef.current;

          // If message is for the currently active conversation, append it
          if (currentConv?.partnerId && (normalized.senderId === currentConv.partnerId || normalized.receiverId === currentConv.partnerId)) {
            setChatMessages((prev) => mergeMessages(prev, [normalized]));

            // Update cache
            const partnerId = currentConv.partnerId;
            messageCacheRef.current.set(partnerId, mergeMessages(
              messageCacheRef.current.get(partnerId) || [],
              [normalized]
            ));

            // Update latest timestamp
            if (normalized.createdAt) {
              const ts = typeof normalized.createdAt === "string" ? normalized.createdAt : new Date(normalized.createdAt).toISOString();
              if (!lastMessageTimestampRef.current || ts > lastMessageTimestampRef.current) {
                lastMessageTimestampRef.current = ts;
              }
            }

            // Mark as read if it's from the partner
            if (normalized.senderId === currentConv.partnerId) {
              fetch("/api/community/messages", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ withUser: currentConv.partnerId }),
              }).catch(() => {});
            }
          }

          // Refresh conversation list to update preview/unread
          fetchConversations({ useCache: false });
        } catch (err) {
          console.error("[SSE] Failed to parse new_message:", err);
        }
      });

      es.addEventListener("conversation_update", () => {
        // A conversation was updated (new message sent/received), refresh the list
        fetchConversations({ useCache: false });
      });

      es.onerror = () => {
        console.warn("[SSE] Connection lost, reconnecting in 3s...");
        es.close();
        sseRef.current = null;
        // Auto-reconnect after 3 seconds
        setTimeout(() => {
          if (showMessages && !sseRef.current) {
            connectSSE();
          }
        }, 3000);
      };
    };

    connectSSE();

    // Fallback: periodic refresh of conversation list every 15s (lightweight)
    const fallbackInterval = setInterval(() => {
      fetchConversations({ useCache: false });
      fetchManagedContracts();
    }, 15000);

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      clearInterval(fallbackInterval);
    };
  }, [showMessages, session?.user?.id, normalizeMessageForUi, mergeMessages]);

  useEffect(() => {
    if (showMessages) fetchConversations({ useCache: true });
  }, [showMessages]);

  useEffect(() => {
    if (!hasProfile || !session?.user?.id) return;
    const checkUnread = async () => {
      try {
        const res = await fetch("/api/community/messages?conversations=true");
        const data = await res.json();
        if (data.conversations) {
          setUnreadCount(data.conversations.reduce((sum: number, c: any) => sum + c.unreadCount, 0));
        }
      } catch {}
    };
    checkUnread();
    const interval = setInterval(checkUnread, 15000);
    return () => clearInterval(interval);
  }, [hasProfile, session?.user?.id]);

  const handleOfferImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setOfferImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreateOffer = async () => {
    if (!newOffer.title || !newOffer.category || !newOffer.price || !newOffer.deliveryDays) return;
    setCreatingOffer(true);
    try {
      const res = await fetch("/api/community/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newOffer.title,
          description: newOffer.description,
          category: newOffer.category,
          price: parseInt(newOffer.price),
          deliveryDays: parseInt(newOffer.deliveryDays),
          imageUrl: offerImageUrl || null,
          tags: newOffer.tags ? newOffer.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        }),
      });
      if (res.ok) {
        await res.json();
        const refreshRes = await fetch("/api/community/offers");
        const refreshData = await refreshRes.json();
        if (refreshData.offers) setOffers(refreshData.offers);
        if (session?.user?.id) {
          const myRes = await fetch(`/api/community/offers?userId=${session.user.id}`);
          const myData = await myRes.json();
          if (myData.offers) setMyOffers(myData.offers);
        }
        setShowCreateOffer(false);
        setNewOffer({ title: "", description: "", category: "", price: "", deliveryDays: "", tags: "" });
        setOfferImageUrl("");
        toast.success("Offer created successfully!");
      } else {
        toast.error("Failed to create offer");
      }
    } catch {
      toast.error("Failed to create offer");
    } finally {
      setCreatingOffer(false);
    }
  };

  const handleSendContract = async () => {
    if (!profileViewerData || !contractForm.title || !contractForm.description || !contractForm.amount) {
      toast.error("Please fill in all fields");
      return;
    }
    setSubmittingContract(true);
    try {
      const partnerId = profileViewerData.userId || profileViewerData.id;
      const contractId = `contract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const contractPayload = {
        type: "contract_offer",
        version: 1,
        contractId,
        title: contractForm.title.trim(),
        amount: Number(contractForm.amount),
        timeline: contractForm.timeline.trim(),
        milestones: contractForm.milestones.trim(),
        description: contractForm.description.trim(),
        revisions: Number(contractForm.revisions) || 0,
        createdAt: new Date().toISOString(),
      };

      const res = await fetch("/api/community/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: partnerId,
          message: `[CONTRACT_OFFER_JSON]${JSON.stringify(contractPayload)}`,
        }),
      });
      const data = await res.json().catch(() => null);
      
      if (res.ok || (res.status === 400 && data?.error?.includes("demo profile"))) {
        toast.success("Contract offer sent!");

        setShowContractModal(false);
        setContractForm({ title: "", description: "", amount: "", timeline: "", milestones: "", revisions: "0" });
        startChatWithFreelancer(profileViewerData);
        setConversations((prev) => prev.map((conv) =>
          conv.partnerId === partnerId
            ? {
                ...conv,
                lastMessage: formatConversationPreview(`[CONTRACT_OFFER_JSON]${JSON.stringify(contractPayload)}`),
                lastMessageAt: new Date().toISOString(),
              }
            : conv
        ));
      } else {
        toast.error(data?.error || data?.details || "Failed to send contract");
      }
    } catch {
      toast.error("Error sending contract");
    } finally {
      setSubmittingContract(false);
    }
  };

  const formatConversationPreview = useCallback((rawMessage: string) => {
    if (typeof rawMessage !== "string") return "No messages yet";

    if (rawMessage.startsWith("[CONTRACT_OFFER_JSON]")) {
      try {
        const parsed = JSON.parse(rawMessage.replace("[CONTRACT_OFFER_JSON]", ""));
        if (parsed?.type === "contract_offer") {
          const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Contract Offer";
          return `📄 Contract Offer: ${title}`;
        }
      } catch {}
      return "📄 Contract Offer";
    }

    if (rawMessage.startsWith("[CONTRACT_RESPONSE]")) {
      try {
        const parsed = JSON.parse(rawMessage.replace("[CONTRACT_RESPONSE]", ""));
        if (parsed?.action === "accepted") return "✅ Contract accepted";
        if (parsed?.action === "declined") return "❌ Contract declined";
      } catch {}
      return "📄 Contract updated";
    }

    if (rawMessage.startsWith("[CONTRACT_CANCEL]")) {
      return "⚠️ Contract cancelled";
    }

    if (rawMessage.startsWith("[DELIVERABLE]")) {
      return "📦 Deliverable submitted";
    }

    if (rawMessage.startsWith("[REVISION_REQUEST]")) {
      return "🔄 Revision requested";
    }

    return rawMessage || "No messages yet";
  }, []);

  const parseContractOfferMessage = useCallback((rawMessage: string) => {
    if (typeof rawMessage !== "string") return null;

    if (rawMessage.startsWith("[CONTRACT_OFFER_JSON]")) {
      try {
        const parsed = JSON.parse(rawMessage.replace("[CONTRACT_OFFER_JSON]", ""));
        if (parsed?.type === "contract_offer" && parsed?.contractId) {
          return {
            contractId: String(parsed.contractId),
            title: String(parsed.title || "Contract Offer"),
            amount: parsed.amount != null ? String(parsed.amount) : "",
            timeline: String(parsed.timeline || ""),
            milestones: String(parsed.milestones || ""),
            description: String(parsed.description || ""),
            revisions: parsed.revisions != null ? Number(parsed.revisions) : 0,
            createdAt: String(parsed.createdAt || ""),
          };
        }
      } catch {}
    }

    if (!rawMessage.startsWith("[CONTRACT OFFER]")) return null;

    const lines = rawMessage.split("\n");
    const title = lines.find((line) => line.startsWith("Title: "))?.replace("Title: ", "") || "Contract Offer";
    const amount = lines.find((line) => line.startsWith("Amount: "))?.replace("Amount: ", "").replace("$", "") || "";
    const timeline = lines.find((line) => line.startsWith("Timeline: "))?.replace("Timeline: ", "") || "";
    const milestones = lines.find((line) => line.startsWith("Milestones: "))?.replace("Milestones: ", "") || "";
    const descriptionIndex = lines.findIndex((line) => line.trim() === "Description:");
    const description = descriptionIndex >= 0 ? lines.slice(descriptionIndex + 1).join("\n").trim() : "";
    const fallbackKey = rawMessage.replace(/\s+/g, " ").trim().slice(0, 120);

    return {
      contractId: `legacy_${fallbackKey}`,
      title,
      amount,
      timeline,
      milestones,
      description,
      createdAt: "",
    };
  }, []);

  const fetchManagedContracts = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const res = await fetch("/api/community/contracts", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (data.contracts) {
        setContracts(data.contracts);
        const escrowMap: Record<string, string | null> = {};
        for (const c of data.contracts) {
          // Only update escrow map if backend has a real status (don't overwrite "accepted" with null)
          if (c.escrowStatus) {
            escrowMap[c.contractId] = c.escrowStatus;
          }
        }
        // Merge with existing map using priority-based merge so highest state always wins
        const STATE_PRIORITY: Record<string, number> = { declined: 0, accepted: 1, escrow_funded: 2, released: 3, completed: 4, cancelled: 2 };
        setChatEscrowMap((prev) => {
          const merged = { ...prev };
          for (const [cid, state] of Object.entries(escrowMap)) {
            if (state && (!merged[cid] || (STATE_PRIORITY[state] || 0) > (STATE_PRIORITY[merged[cid] || ""] || 0))) {
              merged[cid] = state;
            }
          }
          return merged;
        });
        const ongoing = data.contracts.filter((contract: any) => contract.isOngoing);
        setManagedProjectContracts(ongoing);
        console.log("[fetchManagedContracts] total:", data.contracts.length, "| ongoing:", ongoing.length, "| escrowStatuses:", data.contracts.map((c: any) => ({ id: c.contractId, escrowStatus: c.escrowStatus, isOngoing: c.isOngoing })));
      }
    } catch (err) {
      console.error("[fetchManagedContracts] failed:", err);
    }
  }, [session?.user?.id]);

  const handleContractAction = useCallback(async (msg: any, action: "accepted" | "declined" | "cancelled") => {
    if (!activeConversation || !session?.user?.id) return;

    const contractOffer = parseContractOfferMessage(msg.message);
    if (!contractOffer) return;

    const isSender = msg.senderId === session.user.id;
    if ((action === "accepted" || action === "declined") && isSender) {
      toast.error("Only the receiver can accept or decline this contract");
      return;
    }
    // Both sender and receiver can cancel before escrow is funded
    // (enforced in UI by only showing cancel when escrow is not funded)

    // Intercept "accepted" to handle contract acceptance
    if (action === "accepted") {
      setEscrowContract(contractOffer);
      setEscrowMsg(msg);
      
      if (userType === "client") {
        // Client is accepting — just send acceptance message. Escrow funding happens separately.
        try {
          // Send acceptance message
          const responsePayload = {
            type: "contract_response",
            contractId: contractOffer.contractId,
            action: "accepted",
            actedAt: new Date().toISOString(),
            actorName: session.user.name || "User",
          };
          const msgRes = await fetch("/api/community/messages", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              receiverId: activeConversation.partnerId,
              message: `[CONTRACT_RESPONSE]${JSON.stringify(responsePayload)}`,
            }),
          });
          const msgData = await msgRes.json().catch(() => null);
          if (msgData?.message) {
            setChatMessages((prev) => mergeMessages(prev, [normalizeMessageForUi(msgData.message)]));
          }

          setChatEscrowMap((prev) => ({ ...prev, [contractOffer.contractId]: "accepted" }));
          fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
          fetchConversations();
          fetchManagedContracts();
          toast.success("Contract accepted! Please proceed to fund the escrow.");
        } catch (err: any) {
          toast.error(err.message || "Failed to accept contract");
        }
      } else {
        // Freelancer is accepting — show info modal
        setShowFreelancerAcceptModal(true);
      }
      return;
    }

    setContractActionLoadingId(contractOffer.contractId);

    try {
      const responsePayload = {
        type: action === "cancelled" ? "contract_cancel" : "contract_response",
        contractId: contractOffer.contractId,
        action,
        actedAt: new Date().toISOString(),
        actorName: session.user.name || "User",
      };

      const prefix = action === "cancelled" ? "[CONTRACT_CANCEL]" : "[CONTRACT_RESPONSE]";
      const res = await fetch("/api/community/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: activeConversation.partnerId,
          message: `${prefix}${JSON.stringify(responsePayload)}`,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || data?.details || "Failed to update contract");
      }

      if (data?.message) {
        setChatMessages((prev) => mergeMessages(prev, [normalizeMessageForUi(data.message)]));
      }

      toast.success(action === "declined" ? "Contract declined" : "Contract cancelled");
      fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
      fetchConversations();
      fetchManagedContracts();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update contract");
    } finally {
      setContractActionLoadingId(null);
    }
  }, [activeConversation, fetchConversations, fetchManagedContracts, fetchMessagesForConversation, mergeMessages, normalizeMessageForUi, parseContractOfferMessage, session?.user?.id, session?.user?.name, userType]);

  const handleCancelContractFromManage = useCallback(async (contract: any) => {
    if (!contract?.contractId || !session?.user?.id) return;
    setCancellingContractId(contract.contractId);
    try {
      // Always call escrow cancel API — it handles both funded and non-funded cases
      const res = await fetch("/api/community/escrow", {
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", contractId: contract.contractId, reason: "Cancelled by user from manage view" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to cancel contract");
      }

      // Send cancel message in chat so the other party sees it — use contract.partnerId, NOT activeConversation
      const partnerId = contract.partnerId;
      if (partnerId) {
        try {
          const cancelPayload = {
            type: "contract_response",
            contractId: contract.contractId,
            action: "cancelled",
            actedAt: new Date().toISOString(),
            actorName: session.user.name || "User",
          };
          await fetch("/api/community/messages", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              receiverId: partnerId,
              message: `[CONTRACT_CANCEL]${JSON.stringify(cancelPayload)}`,
            }),
          });
        } catch {}
      }
      setChatEscrowMap((prev) => ({ ...prev, [contract.contractId]: "cancelled" }));
      toast.success("Contract cancelled");
      fetchManagedContracts();
      fetchConversations();
      if (activeConversation) {
        fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to cancel contract");
    } finally {
      setCancellingContractId(null);
    }
  }, [session?.user?.id, session?.user?.name, activeConversation, fetchManagedContracts, fetchConversations, fetchMessagesForConversation]);

  // Freelancer accepts contract (no payment, just acceptance + notify client)
  const handleFreelancerAcceptContract = useCallback(async () => {
    if (!escrowContract || !activeConversation || !session?.user?.id) return;

    setEscrowProcessing(true);
    try {
      const responsePayload = {
        type: "contract_response",
        contractId: escrowContract.contractId,
        action: "accepted",
        actedAt: new Date().toISOString(),
        actorName: session.user.name || "User",
      };

      const res = await fetch("/api/community/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: activeConversation.partnerId,
          message: `[CONTRACT_RESPONSE]${JSON.stringify(responsePayload)}`,
        }),
      });

      if (!res.ok) throw new Error("Failed to accept contract");

      const data = await res.json().catch(() => null);
      if (data?.message) {
        setChatMessages((prev) => mergeMessages(prev, [normalizeMessageForUi(data.message)]));
      }

      toast.success("Contract accepted! The client will be notified to fund the escrow.");
      setShowFreelancerAcceptModal(false);
      setEscrowContract(null);
      setEscrowMsg(null);
      fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
      fetchConversations();
      fetchManagedContracts();
    } catch (error: any) {
      toast.error(error?.message || "Failed to accept contract");
    } finally {
      setEscrowProcessing(false);
    }
  }, [escrowContract, activeConversation, session?.user?.id, session?.user?.name, fetchConversations, fetchManagedContracts, fetchMessagesForConversation, mergeMessages, normalizeMessageForUi]);

  // Add a new payment method
  const handleAddPaymentMethod = useCallback(async () => {
    if (!newPaymentMethodType) {
      toast.error("Please select a payment method type");
      return;
    }

    const isCard = newPaymentMethodType === "debit_card" || newPaymentMethodType === "credit_card";
    if (isCard && (!newPaymentMethodDetails.cardNumber || !newPaymentMethodDetails.expiry || !newPaymentMethodDetails.cvv)) {
      toast.error("Please fill in all card details");
      return;
    }

    const isEmailBased = newPaymentMethodType === "paypal" || newPaymentMethodType === "wise";
    if (isEmailBased && !newPaymentMethodDetails.email) {
      toast.error("Please enter the email address");
      return;
    }

    try {
      const last4 = isCard ? newPaymentMethodDetails.cardNumber.slice(-4) : undefined;
      const [expiryMonth, expiryYear] = isCard ? newPaymentMethodDetails.expiry.split("/").map(Number) : [undefined, undefined];
      const typeLabels: Record<string, string> = {
        debit_card: "Debit Card",
        credit_card: "Credit Card",
        paypal: "PayPal",
        wise: "Wise",
        payoneer: "Payoneer",
        bank_swift: "Bank (SWIFT)",
      };

      const label = isCard
        ? `${typeLabels[newPaymentMethodType]} ending ${last4}`
        : isEmailBased
          ? `${typeLabels[newPaymentMethodType]} - ${newPaymentMethodDetails.email}`
          : `${typeLabels[newPaymentMethodType]} - ${newPaymentMethodDetails.accountId || "Account"}`;

      const res = await fetch("/api/community/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newPaymentMethodType,
          label,
          last4,
          cardBrand: isCard ? "visa" : undefined,
          expiryMonth,
          expiryYear: expiryYear ? (expiryYear < 100 ? 2000 + expiryYear : expiryYear) : undefined,
          email: isEmailBased ? newPaymentMethodDetails.email : undefined,
          accountId: newPaymentMethodDetails.accountId || undefined,
          isDefault: savedPaymentMethods.length === 0,
        }),
      });

      const data = await res.json();
      if (res.ok && data.paymentMethod) {
        setSavedPaymentMethods((prev) => [...prev, data.paymentMethod]);
        setSelectedPaymentMethod(data.paymentMethod.id);
        setShowAddPaymentMethod(false);
        setNewPaymentMethodType("");
        setNewPaymentMethodDetails({ cardNumber: "", expiry: "", cvv: "", name: "", email: "", accountId: "" });
        toast.success("Payment method added!");
      } else {
        toast.error(data?.error || "Failed to add payment method");
      }
    } catch {
      toast.error("Failed to add payment method");
    }
  }, [newPaymentMethodType, newPaymentMethodDetails, savedPaymentMethods]);

  // Open release confirmation modal (client already paid at escrow funding)
  const handleOpenReleaseModal = useCallback((contract: any) => {
    setReleaseContractData(contract);
    setShowReleasePaymentModal(true);
  }, []);

  // Release money from escrow (client action)
  const handleReleaseMoney = useCallback(async (contract: any) => {
    const contractId = contract.contractId;
    const freelancerId = contract.partnerId;
    setReleasingContractId(contractId);
    try {
      const res = await fetch("/api/community/escrow", {
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release", contractId }),
      });

      const data = await res.json();
      if (res.ok) {
        // Optimistic UI: remove contract from managed list immediately
        setManagedProjectContracts((prev) => prev.filter((c) => c.contractId !== contractId));
        console.log("[handleReleaseMoney] optimistic removal for:", contractId, "| freelancer:", freelancerId);

        // Always send release notification message to the actual freelancer (not activeConversation)
        if (session?.user?.id && freelancerId) {
          try {
            const responsePayload = {
              type: "contract_response",
              contractId,
              action: "released",
              actedAt: new Date().toISOString(),
              actorName: session.user.name || "User",
            };
            console.log("[handleReleaseMoney] sending release message to freelancer:", freelancerId);
            const msgRes = await fetch("/api/community/messages", {
              cache: "no-store",
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                receiverId: freelancerId,
                message: `[CONTRACT_RESPONSE]${JSON.stringify(responsePayload)}`,
              }),
            });
            const msgData = await msgRes.json().catch(() => null);
            console.log("[handleReleaseMoney] message API status:", msgRes.status, "| msgData:", Boolean(msgData?.message));
            if (msgData?.message) {
              setChatMessages((prev) => mergeMessages(prev, [normalizeMessageForUi(msgData.message)]));
            }
          } catch (msgErr) {
            console.error("[handleReleaseMoney] failed to send release chat message:", msgErr);
          }
        } else {
          console.warn("[handleReleaseMoney] skipped release message — missing session or freelancerId:", { hasSession: Boolean(session?.user?.id), freelancerId });
        }

        setChatEscrowMap((prev) => ({ ...prev, [contractId]: "released" }));
        toast.success("Money released to freelancer!");
        setShowReleaseConfirm(null);
        setShowReleasePaymentModal(false);
        setReleaseContractData(null);

        // Delayed re-fetch with retry to handle Turso replication lag
        const doFetch = async () => {
          await fetchManagedContracts();
        };
        await new Promise((r) => setTimeout(r, 600));
        await doFetch();
        // If the contract somehow re-appeared (stale read), try once more
        setManagedProjectContracts((prev) => {
          const stillThere = prev.some((c) => c.contractId === contractId);
          if (stillThere) {
            console.log("[handleReleaseMoney] contract still in list after first re-fetch, retrying...");
            setTimeout(() => fetchManagedContracts(), 800);
          }
          return prev.filter((c) => c.contractId !== contractId);
        });

        // Refresh current chat if open (optional — may be a different conversation)
        if (activeConversation) {
          fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
          fetchConversations();
        }
      } else {
        console.error("[handleReleaseMoney] API error:", data);
        toast.error(data?.error || "Failed to release funds");
      }
    } catch (err) {
      console.error("[handleReleaseMoney] exception:", err);
      toast.error("Failed to release funds");
    } finally {
      setReleasingContractId(null);
    }
  }, [fetchManagedContracts, activeConversation, session?.user?.id, session?.user?.name, fetchMessagesForConversation, fetchConversations, mergeMessages, normalizeMessageForUi]);

  const handleCreateProject = async () => {
    if (!newProject.title || !newProject.category || !newProject.budget) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/community/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProject.title,
          description: newProject.description,
          category: newProject.category,
          budget: newProject.budget,
          deadline: newProject.deadline || null,
          skills: newProject.skills ? newProject.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
          location: newProject.location.trim() || null,
        }),
      });
      if (res.ok) {
        if (session?.user?.id) {
          const myRes = await fetch(`/api/community/projects?userId=${session.user.id}`);
          const myData = await myRes.json();
          if (myData.projects) setMyPosts(myData.projects);
        }
        const allRes = await fetch("/api/community/projects");
        const allData = await allRes.json();
        if (allData.projects) setDbProjects(allData.projects);
        setShowCreateProject(false);
        setNewProject({ title: "", description: "", category: "", budget: "", deadline: "", skills: "", location: "" });
        toast.success("Project posted successfully!");
      } else {
        toast.error("Failed to post project");
      }
    } catch {
      toast.error("Failed to post project");
    } finally {
      setCreatingProject(false);
    }
  };

  const openFreelancerPortfolio = async (freelancer: any) => {
    const normalizedFreelancer = {
      ...freelancer,
      portfolio: normalizePortfolioItems(freelancer?.portfolio || freelancer?.portfolioUrls || []),
    };

    setSelectedFreelancer(normalizedFreelancer);
    setFreelancerPortfolio(normalizedFreelancer.portfolio);

    try {
      const userId = freelancer?.userId || freelancer?.id;
      if (!userId) return;

      const res = await fetch(`/api/community/portfolio?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      const normalizedItems = normalizePortfolioItems(data.items || freelancer?.portfolio || freelancer?.portfolioUrls || []);
      setSelectedFreelancer((prev: any) => prev ? { ...prev, portfolio: normalizedItems } : prev);
      setFreelancerPortfolio(normalizedItems);
    } catch {
      setFreelancerPortfolio(normalizedFreelancer.portfolio);
    }
  };

  const filteredProjects = useMemo(() => {
    return dbProjects.filter((p) => {
      if (freelancerCategoryFilter !== "all" && p.category !== freelancerCategoryFilter) return false;
      if (freelancerLocationFilter) {
        const search = freelancerLocationFilter.toLowerCase().trim();
        const queryParts = search.split(/[\s,]+/).filter(Boolean);
        const searchableFields = [
          p.projectLocation,
          p.location,
          p.city,
          p.region,
          p.country,
          p.title,
          p.description,
        ]
          .filter(Boolean)
          .join(" | ")
          .toLowerCase();

        const normalizedLocation = (p.location || "").toLowerCase().trim();
        const exactMatch = normalizedLocation === search;
        const partialMatch = searchableFields.includes(search);
        const tokenMatch = queryParts.every((part) => searchableFields.includes(part));

        if (!exactMatch && !partialMatch && !tokenMatch) return false;
      }
      return true;
    });
  }, [dbProjects, freelancerCategoryFilter, freelancerLocationFilter]);

  useEffect(() => {
    if (userType !== "freelancer" || !userLocation) return;

    let cancelled = false;

    const resolveProjectCoordinates = async () => {
      const baseMarkers: GlobeMarker[] = [{
        id: "__my_location__",
        lat: userLocation.lat,
        lng: userLocation.lng,
        label: "You",
        type: "user",
        color: "#f5c518",
      }];

      const projectsNeedingLookup = filteredProjects.slice(0, 25);
      const resolvedProjectMarkers: GlobeMarker[] = projectsNeedingLookup.flatMap((project) => {
        const explicitLat = Number(project.lat);
        const explicitLng = Number(project.lng);

        if (!Number.isFinite(explicitLat) || !Number.isFinite(explicitLng)) {
          return [];
        }

        return [{
          id: `proj_${project.id}`,
          lat: explicitLat,
          lng: explicitLng,
          label: project.title,
          type: "project" as const,
          color: "#22c55e",
        }];
      });

      const uncachedProjects = projectsNeedingLookup.filter((project) => {
        const explicitLat = Number(project.lat);
        const explicitLng = Number(project.lng);
        if (Number.isFinite(explicitLat) && Number.isFinite(explicitLng)) return false;

        const resolvedProjectLocation = String(project.projectLocation || project.location || "").trim().toLowerCase();
        return Boolean(resolvedProjectLocation && !locationCoordinateCacheRef.current[resolvedProjectLocation]);
      });

      if (!cancelled) {
        const cachedMarkers = projectsNeedingLookup.flatMap((project) => {
          const locationKey = String(project.projectLocation || project.location || "").trim().toLowerCase();
          const cached = locationCoordinateCacheRef.current[locationKey];
          if (!cached) return [];

          return [{
            id: `proj_${project.id}`,
            lat: cached.lat,
            lng: cached.lng,
            label: project.title,
            type: "project" as const,
            color: "#22c55e",
          }];
        });

        setGlobeMarkers([...baseMarkers, ...resolvedProjectMarkers, ...cachedMarkers]);
      }

      const newlyResolved = await Promise.all(
        uncachedProjects.map(async (project) => {
          const resolvedProjectLocation = project.projectLocation || project.location;
          const locationKey = String(resolvedProjectLocation || "").trim().toLowerCase();
          if (!locationKey) return null;

          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(resolvedProjectLocation)}&limit=1`, {
              headers: { "Accept-Language": "en" },
            });
            const results = await response.json();
            const first = Array.isArray(results) ? results[0] : null;
            if (!first?.lat || !first?.lon) return null;

            const coords = { lat: Number(first.lat), lng: Number(first.lon) };
            if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;

            locationCoordinateCacheRef.current[locationKey] = coords;
            return {
              id: `proj_${project.id}`,
              lat: coords.lat,
              lng: coords.lng,
              label: project.title,
              type: "project" as const,
              color: "#22c55e",
            };
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      setGlobeMarkers((prev) => {
        const userMarker = prev.find((marker) => marker.id === "__my_location__") || baseMarkers[0];
        const combinedProjectMarkers = [...resolvedProjectMarkers, ...newlyResolved.filter(Boolean)] as GlobeMarker[];
        return [userMarker, ...combinedProjectMarkers];
      });
    };

    resolveProjectCoordinates();
    return () => {
      cancelled = true;
    };
  }, [userType, userLocation, filteredProjects]);

  useEffect(() => {
    if (userType !== "freelancer") return;

    const q = freelancerLocationFilter.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearchingLocations(false);
      return;
    }

    const normalizedQuery = q.toLowerCase();
    const queryParts = normalizedQuery.split(/[\s,]+/).filter(Boolean);
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsSearchingLocations(true);

      try {
        const queryVariants = Array.from(new Set([
          freelancerLocationFilter,
          freelancerLocationFilter.replace(/\s+/g, " ").trim(),
          ...queryParts,
        ])).filter((value) => value.length >= 2);

        const responses = await Promise.all(
          queryVariants.slice(0, 3).map(async (variant) => {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(variant)}&limit=10&addressdetails=1&dedupe=1`,
              {
                headers: {
                  "Accept-Language": "en",
                },
                signal: controller.signal,
              }
            );
            return res.json();
          })
        );

        const dedupedResults = new Map<string, { type: string; label: string; value: string } & { score: number }>();

        responses.forEach((batch) => {
          if (!Array.isArray(batch)) return;

          batch.forEach((item: any) => {
            const displayName = typeof item?.display_name === "string" ? item.display_name : "";
            if (!displayName) return;

            const lowerDisplayName = displayName.toLowerCase();
            const address = item?.address || {};
            const labelParts = [
              address.city,
              address.town,
              address.village,
              address.county,
              address.state,
              address.country,
            ].filter(Boolean);
            const compactLabel = labelParts.length > 0 ? Array.from(new Set(labelParts)).join(", ") : displayName;

            const score = queryParts.reduce((total: number, part: string) => {
              if (lowerDisplayName.startsWith(part)) return total + 4;
              if (lowerDisplayName.includes(` ${part}`)) return total + 3;
              if (lowerDisplayName.includes(part)) return total + 2;
              return total;
            }, 0) + (item?.importance || 0);

            const key = `${item?.lat}-${item?.lon}-${compactLabel}`;
            const nextValue = {
              type: "location",
              label: compactLabel,
              value: compactLabel,
              score,
            };

            const existing = dedupedResults.get(key);
            if (!existing || existing.score < score) {
              dedupedResults.set(key, nextValue);
            }
          });
        });

        const locationResults = Array.from(dedupedResults.values())
          .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
          .slice(0, 12)
          .map(({ score, ...item }) => item);

        setSuggestions(locationResults);
        setShowSuggestions(locationResults.length > 0);
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } finally {
        setIsSearchingLocations(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [freelancerLocationFilter, userType]);

  if (isPending || isCheckingProfile) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <HeroBackground />
        <div className="text-center relative z-10">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-white/40 tracking-wide">Loading community...</p>
        </div>
      </div>
    );
  }

  const inp = "bg-white/[0.05] border-white/[0.08] text-white placeholder:text-white/30 focus:border-white/20 focus:ring-white/10 rounded-xl h-12";
  const textarea = "w-full px-4 py-3 rounded-xl resize-none text-sm bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-white/20 transition-all";
  const selectCls = `w-full h-12 px-4 rounded-xl text-sm border bg-white/[0.05] border-white/[0.08] text-white focus:outline-none focus:ring-2 focus:ring-white/10`;
  const modalCard = "relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[2rem] bg-[#0a0a0a] border border-white/[0.08]";
  const modalHeader = "sticky top-0 z-10 flex items-center justify-between p-6 pb-4 border-b border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-xl";
  const modalFooter = "sticky bottom-0 p-6 pt-4 border-t border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-xl";

  return (
    <div className="relative min-h-screen text-white font-sans">
      <HeroBackground />
      {session?.user?.id && (
        <CommunityOnboardingModal
          isOpen={showOnboarding}
          onComplete={handleOnboardingComplete}
          userId={session.user.id}
        />
      )}

      <div className="fixed top-3 left-3 md:top-6 md:left-6 z-50">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-3 md:py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all"
        >
          <Layers3 className="w-4 h-4 text-white/70" />
          <span className="hidden md:inline text-xs font-bold tracking-[0.25em] uppercase text-white/80">HireMindX</span>
        </button>
      </div>

      <div className="fixed top-3 right-3 md:top-6 md:right-6 z-50 flex items-center gap-1.5 md:gap-2 flex-wrap justify-end">
        <button onClick={() => router.push("/profile")} className="pointer-events-auto w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all flex items-center justify-center">
          {session?.user?.image ? (
            <Avatar className="w-7 h-7"><AvatarImage src={session.user.image} /><AvatarFallback className="text-xs bg-white/10">{session.user.name?.[0] || "U"}</AvatarFallback></Avatar>
          ) : (<User className="w-4 h-4 text-white/60" />)}
        </button>
        <button onClick={() => setShowMessages(true)} className="relative w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-white/60" />
          {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-black text-[9px] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </button>

        <div className="relative">
          <button onClick={() => setShowNotifications(!showNotifications)} className="relative w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all flex items-center justify-center">
            <Bell className="w-4 h-4 text-white/60" />
            {notifications.filter((n) => !n.isRead).length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#f5c518] text-black text-[9px] font-bold rounded-full flex items-center justify-center">{notifications.filter((n) => !n.isRead).length}</span>}
          </button>
          
          <AnimatePresence>
            {showNotifications && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute right-0 top-14 w-[calc(100vw-1.5rem)] max-w-xs md:w-80 max-h-96 overflow-y-auto bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl z-50 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-bold text-sm text-white">Notifications</h3>
                  {notifications.length > 0 && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/community/notifications", { method: "DELETE" });
                          if (!res.ok) throw new Error("Failed to clear notifications");
                          setNotifications([]);
                          toast.success("All notifications cleared");
                        } catch {
                          toast.error("Failed to clear notifications");
                        }
                      }}
                      className="text-[11px] font-medium text-white/50 hover:text-white transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-4">No new notifications</p>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notif: any) => (
                      <div key={notif.id} className={`p-3 rounded-xl text-left border ${notif.isRead ? "bg-white/5 border-transparent" : "bg-white/10 border-white/20"}`} onClick={async () => {
                        if (!notif.isRead) {
                          await fetch("/api/community/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: notif.id }) });
                          setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, isRead: true } : n));
                        }
                        if (notif.type === "contract_offer") setShowMessages(true);
                      }}>
                        <p className="text-[13px] font-bold text-white mb-1">{notif.title}</p>
                        <p className="text-xs text-white/70 line-clamp-2">{notif.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {userType === "client" && (
          <button
            onClick={() => {
              setActiveTab("myPosts");
              setShowManageProjects(true);
              if (session?.user?.id) {
                if (myPosts.length === 0) {
                  setLoadingMyPosts(true);
                  fetch(`/api/community/projects?userId=${session?.user?.id}`)
                    .then((r) => r.json())
                    .then((data) => { if (data.projects) setMyPosts(data.projects); })
                    .finally(() => setLoadingMyPosts(false));
                }
                setLoadingManagedProjectsContracts(true);
                fetch("/api/community/contracts", { cache: "no-store" })
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.contracts) {
                      setManagedProjectContracts(data.contracts.filter((contract: any) => contract.isOngoing));
                    }
                  })
                  .finally(() => setLoadingManagedProjectsContracts(false));
              }
            }}
            className="pointer-events-auto w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all flex items-center justify-center"
            aria-label="Manage Projects"
            title="Manage Projects"
          >
            <FileSignature className="w-4 h-4 text-white/60" />
          </button>
        )}

        {userType === "freelancer" && (
          <button
            onClick={() => {
              setShowManageContracts(true);
              if (!session?.user?.id) return;
              setLoadingContracts(true);
              fetch("/api/community/contracts", { cache: "no-store" })
                .then((r) => r.json())
                .then((data) => { if (data.contracts) setContracts(data.contracts); })
                .finally(() => setLoadingContracts(false));
            }}
            className="pointer-events-auto w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all flex items-center justify-center"
            aria-label="Manage Contracts"
            title="Manage Contracts"
          >
            <FileSignature className="w-4 h-4 text-white/60" />
          </button>
        )}

        <button onClick={() => router.push("/")} className="pointer-events-auto w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div data-tour="community-feed" className="fixed inset-0 pt-[60px] md:pt-[72px] flex flex-col-reverse md:flex-row overflow-hidden">
        {/* Bottom Panel — AI Chat (client) or Job Feed (freelancer) */}
        <div
          className={`w-full md:w-80 shrink-0 flex flex-col relative transition-all duration-300 ease-out md:overflow-hidden md:h-auto md:m-4 md:mr-0 md:rounded-[2.5rem] border border-white/[0.08] bg-[#0a0a0a]/70 backdrop-blur-3xl shadow-[0_0_50px_rgba(0,0,0,0.6)] group hover:border-white/20 ${
            isMobile
              ? (isMobilePanelOpen
                  ? "h-[48vh] rounded-t-[2rem] m-3 mt-1"
                  : "h-12 rounded-t-[2rem] m-3 mt-1")
              : "overflow-hidden"
          }`}
        >
          {/* Mobile collapse toggle handle */}
          {isMobile && (
            <button
              onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
              className="w-full h-10 flex items-center justify-center shrink-0 cursor-pointer hover:bg-white/[0.03] transition-colors z-50 relative"
            >
              <div className="w-12 h-1.5 rounded-full bg-white/30" />
              <ChevronDown
                className={`w-4 h-4 text-white/50 ml-2 transition-transform duration-300 ${
                  !isMobilePanelOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          )}

          <div className={`flex flex-col flex-1 overflow-hidden relative ${isMobile && !isMobilePanelOpen ? "opacity-0 pointer-events-none" : ""}`}>
            <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />
          
          {userType === "client" || userType === null ? (
            <GlobeAIChat
              globeRef={globeRef}
              onWorkersFound={(workers) => setGlobeWorkers(workers)}
              onMarkerAdd={(marker) => setGlobeMarkers((prev) => [...prev.filter((m) => m.id !== marker.id), marker])}
              onMarkersClear={() => {
                const myLoc = globeMarkers.find((m) => m.id === "__my_location__");
                setGlobeMarkers(myLoc ? [myLoc] : []);
                globeRef.current?.clearMarkers();
                if (myLoc) setTimeout(() => globeRef.current?.addMarker(myLoc), 50);
              }}
              className="h-full"
            />
          ) : (
            <div className="flex flex-col h-full bg-[#0a0a0a]/90 relative z-20">
              <div className="p-5 border-b border-white/[0.08] sticky top-0 bg-[#0a0a0a]/95 backdrop-blur-md z-30">
                <h2 className="text-sm font-black uppercase tracking-widest text-white/80 mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#22c55e]" /> Nearby Jobs
                </h2>
                <div className="space-y-3">
                  <div className="relative">
                    <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <Input 
                      placeholder="Location (e.g. city, area, country)" 
                      value={freelancerLocationFilter}
                      onChange={(e) => setFreelancerLocationFilter(e.target.value)}
                      onFocus={() => {
                        if (suggestions.length > 0 || isSearchingLocations) {
                          setShowSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        locationBlurTimeoutRef.current = setTimeout(() => {
                          if (!locationSuggestionMouseDownRef.current) {
                            setShowSuggestions(false);
                          }
                          locationSuggestionMouseDownRef.current = false;
                        }, 150);
                      }}
                      className="pl-9 h-10 bg-white/[0.03] border border-white/[0.06] text-xs focus:ring-white/10"
                    />
                    <AnimatePresence>
                      {showSuggestions && userType === "freelancer" && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute left-0 right-0 top-12 z-[100] bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden p-1">
                          {isSearchingLocations && (
                            <div className="px-3 py-2 text-xs text-white/40 flex items-center gap-2">
                              <Loader2 className="w-3 h-3 animate-spin" /> Searching locations...
                            </div>
                          )}
                          {!isSearchingLocations && suggestions.length === 0 && freelancerLocationFilter.trim().length >= 2 && (
                            <div className="px-3 py-2 text-xs text-white/35">
                              No matching places found. Try a city, region, neighborhood, or country.
                            </div>
                          )}
                          {suggestions.map((s, i) => (
                            <button
                              key={i}
                              type="button"
                              onMouseDown={() => {
                                locationSuggestionMouseDownRef.current = true;
                                if (locationBlurTimeoutRef.current) {
                                  clearTimeout(locationBlurTimeoutRef.current);
                                }
                              }}
                              onClick={() => {
                                setFreelancerLocationFilter(s.value);
                                setShowSuggestions(false);
                                locationSuggestionMouseDownRef.current = false;
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 rounded-lg flex items-start gap-2 transition-all"
                            >
                              <MapPin className="w-3 h-3 text-white/30 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{s.label}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="relative">
                    <ListIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <select 
                      value={freelancerCategoryFilter}
                      onChange={(e) => setFreelancerCategoryFilter(e.target.value)}
                      className="w-full pl-9 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs focus:ring-white/10 text-white appearance-none outline-none"
                    >
                      {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <p className="text-[10px] text-white/40 pt-1 text-center">Found {filteredProjects.length} posts matching criteria</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {filteredProjects.length === 0 ? (
                  <div className="text-center py-10 opacity-50">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No posts matched.</p>
                  </div>
                ) : (
                  filteredProjects.map((p) => {
                    const projectDate = getProjectDateLabel(p);
                    return (
                      <div key={p.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-all cursor-pointer group" onClick={() => {
                        setSelectedDetailsProject(p);
                        setShowProjectDetailsModal(true);
                        const marker = globeMarkers.find((mx) => mx.id === `proj_${p.id}`);
                        if (marker) globeRef.current?.flyTo(marker.lat, marker.lng, 2.2);
                      }}>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-sm text-white/90 line-clamp-2">{p.title}</h3>
                          <Badge className="bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20 shrink-0 text-[10px] uppercase font-bold px-2 py-0">NEW</Badge>
                        </div>
                        <p className="text-xs text-white/40 line-clamp-2 mb-3 leading-relaxed">{p.description}</p>
                        <div className="flex items-center gap-3 text-[10px] text-white/50 mb-2 bg-white/[0.03] p-2 rounded-lg border border-white/[0.04]">
                          <span className="flex items-center gap-1 font-semibold text-white/80"><DollarSign className="w-3 h-3 text-[#f5c518]"/> {p.budget}</span>
                          {p.deadline && <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-white/40"/> {p.deadline}</span>}
                        </div>
                        {projectDate && (
                          <p className="text-[10px] text-white/35 mb-4">{projectDate.label}: {projectDate.value}</p>
                        )}
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); startChatWithFreelancer({ userId: p.userId || "client1", displayName: p.authorName || "Client", userType: "client", location: p.location || null }); setShowMessages(true); }}
                            className="flex-1 h-8 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-bold transition-all flex items-center justify-center gap-1.5"
                          >
                            <MessageCircle className="w-3 h-3" /> Message
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); openProfileViewer({ userId: p.userId || "client1", name: p.authorName || "Client", userType: "client", location: p.location || null }); }}
                            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-all"
                          >
                            <User className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
            </div>
        </div>

        {/* Globe Area */}
        <div className="flex-1 relative overflow-hidden min-h-0 m-3 mb-1 md:m-0 z-10">
          <div className="absolute inset-0">
            <InteractiveGlobe
              ref={globeRef}
              markers={globeMarkers}
              onMarkerClick={(marker) => {
                if (marker.id === "__my_location__") return;
                if (userType === "freelancer" && marker.id.startsWith("proj_")) {
                  const pid = parseInt(marker.id.replace("proj_", ""));
                  const project = filteredProjects.find((p: any) => p.id === pid);
                  if (project) setSelectedGlobeProject(project === selectedGlobeProject ? null : project);
                } else {
                  const worker = globeWorkers.find((w: any) => w.id === marker.id);
                  if (worker) setSelectedGlobeWorker(worker === selectedGlobeWorker ? null : worker);
                }
              }}
              className="w-full h-full"
            />

            <AnimatePresence>
              {globeWorkers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className={`absolute ${isMobile ? (isMobilePanelOpen ? "bottom-36" : "bottom-20") : "bottom-6"} left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 flex-wrap justify-center px-2`}
                  style={{ maxWidth: "calc(100% - 16px)" }}
                >
                  <div
                    className="flex items-center gap-1.5 p-1.5 rounded-2xl border border-white/10 backdrop-blur-2xl shadow-2xl flex-wrap justify-center"
                    style={{ background: "rgba(10,10,10,0.9)" }}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40 pl-3 pr-2 shrink-0">
                      {globeWorkers.length} FOUND
                    </span>
                    <div className={`flex items-center gap-1 ${isMobile ? "flex-wrap justify-center" : "flex-nowrap"}`}>
                      {globeWorkers.slice(0, isMobile ? 3 : 5).map((worker: any) => (
                        <button
                          key={worker.id}
                          onClick={() => {
                            setSelectedGlobeWorker(selectedGlobeWorker?.id === worker.id ? null : worker);
                            if (worker.lat && worker.lng) globeRef.current?.flyTo(worker.lat, worker.lng, 2.2);
                          }}
                          className={`flex items-center gap-2 pr-3 pl-1 py-1 rounded-full text-[11px] font-semibold transition-all ${
                            selectedGlobeWorker?.id === worker.id
                              ? "bg-gradient-to-r from-[#f5c518] to-[#c8960c] text-black shadow-[0_0_15px_rgba(245,197,24,0.3)]"
                              : "bg-white/5 border border-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                            selectedGlobeWorker?.id === worker.id ? "bg-black/20 text-black" : "bg-white/10 text-white"
                          }`}>
                            {worker.name?.[0] || "W"}
                          </div>
                          {worker.name?.split(" ")[0]}
                        </button>
                      ))}
                      {globeWorkers.length > (isMobile ? 3 : 5) && (
                        <span className="text-[11px] font-bold text-white/30 px-2 py-1 rounded-full bg-white/5 border border-white/5">
                          +{globeWorkers.length - (isMobile ? 3 : 5)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setGlobeWorkers([]);
                        setSelectedGlobeWorker(null);
                        const myLoc = globeMarkers.find((m) => m.id === "__my_location__");
                        setGlobeMarkers(myLoc ? [myLoc] : []);
                        globeRef.current?.clearMarkers();
                        if (myLoc) setTimeout(() => globeRef.current?.addMarker(myLoc), 50);
                      }}
                      className="ml-2 mr-2 text-[12px] font-light text-white/30 hover:text-white/80 transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {selectedGlobeWorker && (
                <motion.div
                  key={selectedGlobeWorker.id}
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  className="absolute top-4 right-4 md:top-6 md:right-6 z-30 w-[calc(100%-2rem)] max-w-xs md:w-64 rounded-[1.5rem] border border-white/[0.12] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
                  style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(24px)" }}
                >
                  <button
                    onClick={() => setSelectedGlobeWorker(null)}
                    className="absolute top-4 right-4 text-white/30 hover:text-white text-sm transition-colors"
                  >✕</button>
                  
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-lg font-black text-[#f5c518] shrink-0 shadow-inner">
                      {selectedGlobeWorker.name?.[0] || "W"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{selectedGlobeWorker.name}</p>
                      <p className="text-[11px] text-[#f5c518] font-medium flex items-center gap-1 truncate mb-0.5">
                        4.9 ★ <span className="text-white/30 font-normal">| {selectedGlobeWorker.location || "Global"}</span>
                      </p>
                    </div>
                  </div>
                  
                  {selectedGlobeWorker.headline && (
                    <p className="text-[11px] text-white/60 mb-3 leading-relaxed line-clamp-2">{selectedGlobeWorker.headline}</p>
                  )}
                  
                  <div className="text-[10px] text-white/50 mb-4 flex flex-col gap-1.5 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
                    <div className="flex items-center gap-2 hover:text-white transition-colors cursor-pointer">
                      <DollarSign className="w-4 h-4 text-[#f5c518]" /> 
                      {selectedGlobeWorker.pricingText || (selectedGlobeWorker.hourlyRate ? `${selectedGlobeWorker.hourlyRate}/hr` : "Rate not specified")}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => { startChatWithFreelancer(selectedGlobeWorker); setShowMessages(true); }}
                      className="w-full h-8 rounded-xl text-[11px] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"
                    >
                      <MessageCircle className="w-3 h-3" /> Message
                    </button>
                    <button
                      onClick={() => {
                        openProfileViewer(selectedGlobeWorker);
                      }}
                      className="w-full h-8 rounded-xl text-[11px] font-bold text-black transition-all flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-95 shadow-md shadow-[#f5c518]/20"
                      style={{ background: "linear-gradient(135deg, #f5c518, #c8960c)" }}
                    >
                      <User className="w-3 h-3 black" /> Profile
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {selectedGlobeProject && (
                <motion.div
                  key={"proj_" + selectedGlobeProject.id}
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  className="absolute top-4 right-4 md:top-6 md:right-6 z-30 w-[calc(100%-2rem)] max-w-xs md:w-72 rounded-[1.5rem] border border-white/[0.12] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
                  style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(24px)" }}
                >
                  <button
                    onClick={() => setSelectedGlobeProject(null)}
                    className="absolute top-4 right-4 text-white/30 hover:text-white text-sm transition-colors"
                  >✕</button>
                  
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center text-xl font-black text-[#22c55e] shrink-0 shadow-inner">
                      {selectedGlobeProject.authorName?.[0] || "C"}
                    </div>
                    <div className="min-w-0 pr-4">
                      <p className="text-xs font-bold text-[#22c55e] uppercase tracking-wider mb-0.5">Project</p>
                      <p className="text-sm font-bold text-white line-clamp-2">{selectedGlobeProject.title}</p>
                    </div>
                  </div>
                  
                  {selectedGlobeProject.description && (
                    <p className="text-[11px] text-white/60 mb-3 leading-relaxed line-clamp-3">{selectedGlobeProject.description}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 text-[10px] text-white/60 mb-2 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
                    <span className="flex items-center gap-1 bg-white/[0.05] px-2 py-1 rounded-md"><DollarSign className="w-3 h-3 text-[#f5c518]"/> {selectedGlobeProject.budget}</span>
                    {selectedGlobeProject.deadline && <span className="flex items-center gap-1 bg-white/[0.05] px-2 py-1 rounded-md"><Clock className="w-3 h-3"/> {selectedGlobeProject.deadline}</span>}
                  </div>
                  {getProjectDateLabel(selectedGlobeProject) && (
                    <p className="text-[10px] text-white/35 mb-4">{getProjectDateLabel(selectedGlobeProject)?.label}: {getProjectDateLabel(selectedGlobeProject)?.value}</p>
                  )}

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => { startChatWithFreelancer({ userId: selectedGlobeProject.userId || "client1", displayName: selectedGlobeProject.authorName || "Client", userType: "client", location: selectedGlobeProject.location || null }); setShowMessages(true); }}
                      className="w-full h-8 rounded-xl text-[11px] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"
                    >
                      <MessageCircle className="w-3 h-3" /> Message Client
                    </button>
                    <button
                      onClick={() => { 
                        openProfileViewer({ userId: selectedGlobeProject.userId || "client1", name: selectedGlobeProject.authorName || "Client", userType: "client", location: selectedGlobeProject.location || null });
                      }}
                      className="w-full h-8 rounded-xl text-[11px] font-bold text-black transition-all flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-95 shadow-md shadow-[#22c55e]/20"
                      style={{ background: "linear-gradient(135deg, #4ade80, #16a34a)" }}
                    >
                      <User className="w-3 h-3 black" /> View Profile
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + activeCategory}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            {activeTab === "offers" && loadingOffers && (
              <div className="col-span-full text-center py-16">
                <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin text-white/20" />
                <p className="text-sm text-white/30">Loading offers...</p>
              </div>
            )}

            {activeTab === "offers" && !loadingOffers && (searchResults !== null && userType === "client" ? searchResults : offers).filter((o) => activeCategory === "all" || o.category === activeCategory).length === 0 && (
              <div className="col-span-full text-center py-16">
                <Package className="w-10 h-10 mx-auto mb-3 text-white/10" />
                <p className="text-base font-medium text-white/30 mb-1">{searchResults !== null ? "No offers match your search" : "No offers available yet"}</p>
                {searchResults !== null && (
                  <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="text-xs text-white/50 hover:text-white mt-2">Clear Search</button>
                )}
              </div>
            )}

            {activeTab === "offers" && !loadingOffers && (searchResults !== null && userType === "client" ? searchResults : offers).filter((o) => activeCategory === "all" || o.category === activeCategory).map((offer: any) => (
              <div key={offer.id} className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden hover:border-white/20 hover:bg-white/[0.05] transition-all duration-300">
                <div className="relative h-44 overflow-hidden">
                  {offer.imageUrl ? (
                    <img src={offer.imageUrl} alt={offer.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/[0.03]">
                      <Package className="w-10 h-10 text-white/10" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/50 border border-white/[0.08] backdrop-blur-sm text-white text-xs font-medium">
                    From ${offer.price}
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2.5 mb-3 min-w-0">
                    <Avatar className="w-7 h-7 border border-white/10 shrink-0">
                      <AvatarFallback className="text-[10px] bg-white/10">{offer.profile?.displayName?.[0] || "F"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white/80 truncate">{offer.profile?.displayName || "Freelancer"}</p>
                      <p className="text-[10px] text-white/30 truncate">{offer.profile?.headline || ""}</p>
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2 leading-tight line-clamp-2 group-hover:text-white/80 transition-colors">
                    {offer.title}
                  </h3>
                  {offer.tags && Array.isArray(offer.tags) && offer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {offer.tags.slice(0, 3).map((tag: string, idx: number) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.06]">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                    <div className="flex flex-col items-start gap-1">
                      <span className="flex items-center gap-1.5 text-xs text-white/30">
                        <Clock className="w-3 h-3" />
                        {offer.deliveryDays} day{offer.deliveryDays !== 1 ? "s" : ""} delivery
                      </span>
                      {formatLocalDateTime(offer.createdAt || offer.postedAt) && (
                        <span className="text-[10px] text-white/25">Posted: {formatLocalDateTime(offer.createdAt || offer.postedAt)}</span>
                      )}
                    </div>
                    <button className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors font-medium">
                      View Offer <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {activeTab === "myOffers" && loadingMyOffers && (
              <div className="col-span-full text-center py-16">
                <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin text-white/20" />
                <p className="text-sm text-white/30">Loading your offers...</p>
              </div>
            )}

            {activeTab === "myOffers" && !loadingMyOffers && myOffers.length === 0 && (
              <div className="col-span-full text-center py-16">
                <Package className="w-10 h-10 mx-auto mb-3 text-white/10" />
                <p className="text-base font-medium text-white/30 mb-1">No offers yet</p>
                <p className="text-sm text-white/20 mb-4">Create your first offer to start attracting clients!</p>
                <button onClick={() => setShowCreateOffer(true)} className="flex items-center gap-2 mx-auto px-4 h-9 rounded-xl bg-white/10 border border-white/[0.08] text-white text-xs font-medium hover:bg-white/15 transition-all">
                  <Plus className="w-3.5 h-3.5" /> Create Offer
                </button>
              </div>
            )}

            {activeTab === "myOffers" && !loadingMyOffers && myOffers.map((offer: any) => (
              <div key={offer.id} className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden hover:border-white/20 transition-all duration-300">
                <div className="relative h-44 overflow-hidden">
                  {offer.imageUrl ? (
                    <img src={offer.imageUrl} alt={offer.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/[0.03]">
                      <Package className="w-10 h-10 text-white/10" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/50 border border-white/[0.08] backdrop-blur-sm text-white text-xs font-medium">
                    From ${offer.price}
                  </span>
                  <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-lg text-[10px] font-medium ${offer.status === "active" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" : "bg-white/10 text-white/50 border border-white/[0.08]"}`}>
                    {offer.status === "active" ? "Active" : offer.status || "Active"}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="text-sm font-bold text-white mb-2 leading-tight">{offer.title}</h3>
                  {offer.description && <p className="text-xs text-white/40 mb-3 line-clamp-2">{offer.description}</p>}
                  {offer.tags && Array.isArray(offer.tags) && offer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {offer.tags.slice(0, 3).map((tag: string, idx: number) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.06]">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                    <div className="flex flex-col items-start gap-1">
                      <span className="flex items-center gap-1.5 text-xs text-white/30">
                        <Clock className="w-3 h-3" />
                        {offer.deliveryDays} day{offer.deliveryDays !== 1 ? "s" : ""} delivery
                      </span>
                      {formatLocalDateTime(offer.createdAt || offer.postedAt) && (
                        <span className="text-[10px] text-white/25">Posted: {formatLocalDateTime(offer.createdAt || offer.postedAt)}</span>
                      )}
                    </div>
                    <button
                      className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-colors"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/community/offers?id=${offer.id}`, { method: "DELETE" });
                          if (res.ok) {
                            setMyOffers((prev) => prev.filter((o) => o.id !== offer.id));
                            setOffers((prev) => prev.filter((o) => o.id !== offer.id));
                            toast.success("Offer deleted");
                          }
                        } catch { toast.error("Failed to delete"); }
                      }}
                    >
                      <X className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {activeTab === "projects" && (searchResults !== null ? searchResults : [...dbProjects, ...PROJECTS].filter((p) => activeCategory === "all" || p.category === activeCategory)).length === 0 && (
              <div className="col-span-full text-center py-16">
                <Briefcase className="w-10 h-10 mx-auto mb-3 text-white/10" />
                <p className="text-base font-medium text-white/30">{searchResults !== null ? "No projects match your search" : "No projects yet"}</p>
                {searchResults !== null && (
                  <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="text-xs text-white/50 hover:text-white mt-2">Clear Search</button>
                )}
              </div>
            )}

            {activeTab === "projects" && (searchResults !== null ? searchResults : [...dbProjects, ...PROJECTS].filter((p) => activeCategory === "all" || p.category === activeCategory)).map((project: any) => {
              const projectDate = getProjectDateLabel(project);
              return (
                <div key={project.id} className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05] transition-all duration-300">
                  <div className="flex justify-between items-start mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/70 text-xs font-medium">{project.budget}</span>
                    <div className="text-right">
                      <span className="text-[10px] text-white/25 font-medium uppercase tracking-widest">{project.posted}</span>
                      {projectDate && <p className="text-[10px] text-white/25 mt-1">{projectDate.value}</p>}
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2">{project.title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed mb-4 line-clamp-2">{project.description}</p>
                  {project.skills && Array.isArray(project.skills) && project.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {project.skills.slice(0, 4).map((skill: string, i: number) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.06]">{skill}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-white/30">
                      <span className="flex items-center gap-1">
                        <FileSignature className="w-3.5 h-3.5" />
                        Contract-based
                      </span>
                      {project.deadline && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {project.deadline}
                        </span>
                      )}
                    </div>
                    <button
                      className="flex items-center gap-1.5 px-3 h-8 rounded-xl bg-white/10 border border-white/[0.08] text-white text-xs font-medium hover:bg-white/15 transition-all"
                      onClick={() => openContractForProject(project)}
                    >
                      Send Contract
                    </button>
                  </div>
                </div>
              );
            })}

            {activeTab === "freelancers" && freelancers.length === 0 && (
              <div className="col-span-full text-center py-16">
                <Users className="w-10 h-10 mx-auto mb-3 text-white/10" />
                <p className="text-base font-medium text-white/30 mb-1">No freelancers yet</p>
                <p className="text-sm text-white/20">Be the first to join as a freelancer!</p>
              </div>
            )}

            {activeTab === "freelancers" && freelancers.map((freelancer) => (
              <div key={freelancer.id} className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden hover:border-white/20 hover:bg-white/[0.05] transition-all duration-300">
                {freelancer.portfolio && freelancer.portfolio.length > 0 ? (
                  <div className="relative h-36 overflow-hidden grid grid-cols-3 gap-0.5">
                    {freelancer.portfolio.slice(0, 3).map((item: any, idx: number) => (
                      <div key={idx} className={`relative overflow-hidden ${freelancer.portfolio.length === 1 ? "col-span-3" : idx === 0 && freelancer.portfolio.length === 2 ? "col-span-2" : ""}`}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.title} className="w-full h-36 object-cover transition-transform duration-700 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-36 flex items-center justify-center bg-white/[0.03]">
                            <LinkIcon className="w-5 h-5 text-white/10" />
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {freelancer.portfolio.length > 3 && (
                      <div className="absolute bottom-2 right-2 text-[10px] text-white/60 font-medium bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
                        +{freelancer.portfolio.length - 3} more
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-20 flex items-center justify-center bg-white/[0.02]">
                    <ImageIcon className="w-7 h-7 text-white/[0.06]" />
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <Avatar className="w-9 h-9 border border-white/10">
                      <AvatarImage src={freelancer.userImage || ""} />
                      <AvatarFallback className="text-xs bg-white/10">{freelancer.displayName?.[0] || "F"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{freelancer.displayName}</p>
                      {freelancer.location && (
                        <p className="flex items-center gap-1 text-[11px] text-white/30">
                          <MapPin className="w-3 h-3" />{freelancer.location}
                        </p>
                      )}
                    </div>
                    {(freelancer.pricingText || freelancer.hourlyRate) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/50 shrink-0">
                        {freelancer.pricingText || `${freelancer.hourlyRate}/hr`}
                      </span>
                    )}
                  </div>

                  {freelancer.headline && (
                    <p className="text-xs text-white/60 mb-2 line-clamp-1">{freelancer.headline}</p>
                  )}

                  {freelancer.skills && Array.isArray(freelancer.skills) && freelancer.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {freelancer.skills.slice(0, 4).map((skill: string, idx: number) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.06]">{skill}</span>
                      ))}
                      {freelancer.skills.length > 4 && <span className="text-[10px] text-white/20">+{freelancer.skills.length - 4}</span>}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                    <span className="flex items-center gap-1.5 text-xs text-white/30">
                      <Briefcase className="w-3 h-3" />
                      {freelancer.portfolio?.length || 0} works
                    </span>
                    <div className="flex items-center gap-2">
                      {userType === "client" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); startChatWithFreelancer(freelancer); }}
                          className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Chat
                        </button>
                      )}
                      <button
                        onClick={() => openFreelancerPortfolio(freelancer)}
                        className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors font-medium"
                      >
                        Portfolio <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {activeTab === "myPosts" && loadingMyPosts && (
              <div className="col-span-full text-center py-16">
                <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin text-white/20" />
                <p className="text-sm text-white/30">Loading your projects...</p>
              </div>
            )}

            {activeTab === "myPosts" && !loadingMyPosts && myPosts.length === 0 && (
              <div className="col-span-full text-center py-16">
                <Briefcase className="w-10 h-10 mx-auto mb-3 text-white/10" />
                <p className="text-base font-medium text-white/30 mb-1">No projects posted yet</p>
                <p className="text-sm text-white/20 mb-4">Post your first project to find talented freelancers!</p>
                <button onClick={() => setShowCreateProject(true)} className="flex items-center gap-2 mx-auto px-4 h-9 rounded-xl bg-white/10 border border-white/[0.08] text-white text-xs font-medium hover:bg-white/15 transition-all">
                  <Plus className="w-3.5 h-3.5" /> Post a Project
                </button>
              </div>
            )}

            {activeTab === "myPosts" && !loadingMyPosts && myPosts.map((project: any) => {
              const projectDate = getProjectDateLabel(project);
              return (
                <div key={project.id} className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-white/20 transition-all duration-300">
                  <div className="flex justify-between items-start mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/70 text-xs font-medium">{project.budget}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-lg font-medium ${project.status === "open" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/[0.05] text-white/30 border border-white/[0.06]"}`}>
                      {project.status === "open" ? "Open" : project.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2">{project.title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed mb-3 line-clamp-2">{project.description}</p>
                  {projectDate && <p className="text-[10px] text-white/25 mb-4">{projectDate.label}: {projectDate.value}</p>}
                  {project.skills && Array.isArray(project.skills) && project.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {project.skills.map((skill: string, idx: number) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.06]">{skill}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-white/30">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{project.proposals || 0} proposals</span>
                      {project.deadline && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{project.deadline}</span>}
                    </div>
                    <button
                      className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 transition-colors"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/community/projects?id=${project.id}`, { method: "DELETE" });
                          if (res.ok) {
                            setMyPosts((prev) => prev.filter((p) => p.id !== project.id));
                            toast.success("Project closed");
                          }
                        } catch { toast.error("Failed to close project"); }
                      }}
                    >
                      <X className="w-3 h-3" /> Close
                    </button>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showCreateOffer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowCreateOffer(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()} className={modalCard}>
              <div className={modalHeader}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08]"><Package className="w-4 h-4 text-white/60" /></div>
                  <h2 className="text-base font-bold text-white">Create New Offer</h2>
                </div>
                <button onClick={() => setShowCreateOffer(false)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><X className="w-4 h-4 text-white/50" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Offer Title *</Label>
                  <Input placeholder="e.g., Full-Stack Web Development with Next.js" value={newOffer.title} onChange={(e) => setNewOffer({ ...newOffer, title: e.target.value })} className={inp} />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Description</Label>
                  <textarea placeholder="Describe what you're offering in detail..." value={newOffer.description} onChange={(e) => setNewOffer({ ...newOffer, description: e.target.value })} rows={3} className={textarea} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Category *</Label>
                    <select value={newOffer.category} onChange={(e) => setNewOffer({ ...newOffer, category: e.target.value })} className={selectCls}>
                      <option value="">Select category</option>
                      {OFFER_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Price ($) *</Label>
                    <Input type="number" placeholder="e.g., 100" value={newOffer.price} onChange={(e) => setNewOffer({ ...newOffer, price: e.target.value })} className={inp} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Delivery Days *</Label>
                    <Input type="number" placeholder="e.g., 5" value={newOffer.deliveryDays} onChange={(e) => setNewOffer({ ...newOffer, deliveryDays: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Tags (comma separated)</Label>
                    <Input placeholder="e.g., React, Next.js" value={newOffer.tags} onChange={(e) => setNewOffer({ ...newOffer, tags: e.target.value })} className={inp} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Cover Image</Label>
                  {offerImageUrl ? (
                    <div className="relative w-full h-36 rounded-xl overflow-hidden border border-white/[0.08]">
                      <img src={offerImageUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button onClick={() => setOfferImageUrl("")} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="border border-white/[0.08] rounded-xl p-4 bg-white/[0.02]">
                      <input ref={offerImageRef} type="file" accept="image/*" onChange={handleOfferImageUpload} className="hidden" />
                      <button onClick={() => offerImageRef.current?.click()} className="w-full h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-xs text-white/70">
                        <Upload className="w-4 h-4" /> Upload Image
                      </button>
                    </div>
                  )}
                </div>
                <div className="pt-2">
                  <Button disabled={creatingOffer} onClick={handleCreateOffer} className="w-full h-10 rounded-xl font-bold text-black" style={{ background: "linear-gradient(135deg, #f5c518, #c8960c)" }}>
                    {creatingOffer ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Offer"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManageContracts && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowManageContracts(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()} className={modalCard}>
              <div className={modalHeader}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08]"><FileSignature className="w-4 h-4 text-white/60" /></div>
                  <h2 className="text-base font-bold text-white">Manage Contracts</h2>
                </div>
                <button onClick={() => setShowManageContracts(false)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><X className="w-4 h-4 text-white/50" /></button>
              </div>
              <div className="p-6">
                {loadingContracts && (
                  <div className="text-center py-10">
                    <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin text-white/20" />
                    <p className="text-sm text-white/30">Loading your contracts...</p>
                  </div>
                )}

                {!loadingContracts && contracts.filter((c) => c.isOngoing).length === 0 && (
                  <div className="text-center py-10">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-white/10" />
                    <p className="text-sm text-white/40">No active contracts yet.</p>
                    <p className="text-xs text-white/25 mt-1">Contracts will appear here once the client funds the escrow.</p>
                  </div>
                )}

                {!loadingContracts && contracts.filter((c) => c.isOngoing).length > 0 && (
                  <div className="space-y-3">
                    {contracts.filter((c) => c.isOngoing).map((c) => {
                      const contractDate = getProjectDateLabel(c);
                      return (
                        <div key={c.contractId} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-white truncate">{c.contractData?.title || c.title || "Contract"}</p>
                                <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-medium">
                                  Ongoing
                                </span>
                              </div>
                              <p className="text-xs text-white/60 mt-1">With {c.partnerName || "Client"}</p>
                              {c.contractData?.description && (
                                <p className="text-xs text-white/40 mt-2 line-clamp-3 whitespace-pre-wrap">{c.contractData.description}</p>
                              )}
                              <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-white/35">
                                {c.contractData?.amount && <span>Amount: ${c.contractData.amount}</span>}
                                {c.contractData?.revisions !== undefined && <span>Revisions: {c.contractData.revisions === 0 ? "None" : c.contractData.revisions}</span>}
                                {c.contractData?.timeline && <span>Timeline: {c.contractData.timeline}</span>}
                                {contractDate && <span>{contractDate.label}: {contractDate.value}</span>}
                              </div>
                            </div>
                            <button
                              className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 transition-colors shrink-0"
                              disabled={cancellingContractId === c.contractId}
                              onClick={() => handleCancelContractFromManage(c)}
                            >
                              {cancellingContractId === c.contractId ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManageProjects && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowManageProjects(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()} className={modalCard}>
              <div className={modalHeader}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08]"><FileSignature className="w-4 h-4 text-white/60" /></div>
                  <h2 className="text-base font-bold text-white">Manage Projects</h2>
                </div>
                <button onClick={() => setShowManageProjects(false)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><X className="w-4 h-4 text-white/50" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <FileSignature className="w-4 h-4 text-[#f5c518]" />
                    <h3 className="text-sm font-bold text-white">Ongoing Contracts</h3>
                  </div>

                  {loadingManagedProjectsContracts && (
                    <div className="text-center py-8">
                      <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin text-white/20" />
                      <p className="text-sm text-white/30">Loading ongoing contracts...</p>
                    </div>
                  )}

                  {!loadingManagedProjectsContracts && managedProjectContracts.length === 0 && (
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                      <p className="text-sm font-medium text-white/40">No ongoing contracts yet</p>
                      <p className="text-xs text-white/25 mt-1">Accepted contracts with freelancers will appear here automatically.</p>
                    </div>
                  )}

                  {!loadingManagedProjectsContracts && managedProjectContracts.length > 0 && (
                    <div className="space-y-4">
                      {managedProjectContracts.map((contract: any) => {
                        const contractDate = getContractDateLabel(contract);
                        return (
                          <div key={contract.contractId || contract.id} className="p-5 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] hover:border-emerald-500/30 transition-all">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-white truncate">{contract.title || "Contract"}</p>
                                  <span className="text-[10px] px-2 py-0.5 rounded-lg font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    Ongoing
                                  </span>
                                </div>
                                <p className="text-xs text-white/60 mt-1">With {contract.partnerName || (userType === "client" ? "Freelancer" : "Client")}</p>
                                {contract.description && (
                                  <p className="text-xs text-white/40 mt-2 line-clamp-3 whitespace-pre-wrap">{contract.description}</p>
                                )}
                                <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-white/35">
                                  {contract.amount && <span>Amount: £{contract.amount}</span>}
                                  {contract.revisions !== undefined && <span>Revisions: {contract.revisions === 0 ? "None" : contract.revisions}</span>}
                                  {contract.timeline && <span>Timeline: {contract.timeline}</span>}
                                  {contractDate && <span>{contractDate.label}: {contractDate.value}</span>}
                                </div>
                              </div>
                            </div>

                            {/* Release Money Section */}
                            {contract.isOngoing && userType === "client" && (
                              <div className="mt-4 pt-4 border-t border-emerald-500/10">
                                <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                                  <button
                                    onClick={() => handleOpenReleaseModal(contract)}
                                    className="w-full h-10 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-bold hover:from-emerald-500 hover:to-emerald-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
                                  >
                                    <Banknote className="w-4 h-4" /> Release Money (£{contract.amount})
                                  </button>
                                  <button
                                    onClick={() => handleCancelContractFromManage(contract)}
                                    disabled={cancellingContractId === contract.contractId}
                                    className="w-full h-9 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/15 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                                  >
                                    {cancellingContractId === contract.contractId ? (
                                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancelling...</>
                                    ) : (
                                      <><X className="w-3.5 h-3.5" /> Cancel Contract</>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}
                            {contract.isOngoing && userType !== "client" && (
                              <div className="mt-4 pt-4 border-t border-emerald-500/10">
                                <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                                  <button
                                    onClick={() => handleCancelContractFromManage(contract)}
                                    disabled={cancellingContractId === contract.contractId}
                                    className="w-full h-9 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/15 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                                  >
                                    {cancellingContractId === contract.contractId ? (
                                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancelling...</>
                                    ) : (
                                      <><X className="w-3.5 h-3.5" /> Cancel Contract</>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  {loadingMyPosts && (
                    <div className="text-center py-10">
                      <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin text-white/20" />
                      <p className="text-sm text-white/30">Loading your projects...</p>
                    </div>
                  )}

                  {!loadingMyPosts && myPosts.length === 0 && (
                    <div className="text-center py-10">
                      <Briefcase className="w-10 h-10 mx-auto mb-3 text-white/10" />
                      <p className="text-base font-medium text-white/30 mb-1">No projects posted yet</p>
                      <p className="text-sm text-white/20 mb-4">Post your first project to find talented freelancers!</p>
                      <button onClick={() => { setShowManageProjects(false); setShowCreateProject(true); }} className="flex items-center gap-2 mx-auto px-4 h-9 rounded-xl bg-white/10 border border-white/[0.08] text-white text-xs font-medium hover:bg-white/15 transition-all">
                        <Plus className="w-3.5 h-3.5" /> Post a Project
                      </button>
                    </div>
                  )}

                  {!loadingMyPosts && myPosts.length > 0 && (
                    <div className="space-y-4">
                      {myPosts.map((project: any) => {
                        const projectDate = getProjectDateLabel(project);
                        return (
                          <div key={project.id} className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-white/20 transition-all duration-300">
                            <div className="flex justify-between items-start mb-3">
                              <span className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/70 text-xs font-medium">{project.budget}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-lg font-medium ${project.status === "open" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/[0.05] text-white/30 border border-white/[0.06]"}`}>
                                {project.status === "open" ? "Open" : project.status}
                              </span>
                            </div>
                            <h3 className="text-sm font-bold text-white mb-2">{project.title}</h3>
                            <p className="text-xs text-white/40 leading-relaxed mb-3 line-clamp-2">{project.description}</p>
                            {projectDate && <p className="text-[10px] text-white/25 mb-4">{projectDate.label}: {projectDate.value}</p>}
                            {project.skills && Array.isArray(project.skills) && project.skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-4">
                                {project.skills.map((skill: string, idx: number) => (
                                  <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.06]">{skill}</span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 text-xs text-white/30">
                                <span className="flex items-center gap-1"><FileSignature className="w-3.5 h-3.5" />Contract-based</span>
                                {project.deadline && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{project.deadline}</span>}
                              </div>
                              <button
                                className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 transition-colors"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/community/projects?id=${project.id}`, { method: "DELETE" });
                                    if (res.ok) {
                                      setMyPosts((prev) => prev.filter((p) => p.id !== project.id));
                                      toast.success("Project closed");
                                    }
                                  } catch { toast.error("Failed to close project"); }
                                }}
                              >
                                <X className="w-3 h-3" /> Close
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreateProject && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowCreateProject(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()} className={modalCard}>
              <div className={modalHeader}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08]"><Briefcase className="w-4 h-4 text-white/60" /></div>
                  <h2 className="text-base font-bold text-white">Post a New Project</h2>
                </div>
                <button onClick={() => setShowCreateProject(false)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><X className="w-4 h-4 text-white/50" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Project Title *</Label>
                  <Input placeholder="e.g., Build a Custom AI Agent for Real Estate" value={newProject.title} onChange={(e) => setNewProject({ ...newProject, title: e.target.value })} className={inp} />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Description</Label>
                  <textarea placeholder="Describe your project requirements in detail..." value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} rows={4} className={textarea} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Category *</Label>
                    <select value={newProject.category} onChange={(e) => setNewProject({ ...newProject, category: e.target.value })} className={selectCls}>
                      <option value="">Select category</option>
                      {OFFER_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Budget *</Label>
                    <Input placeholder="e.g., $500 - $1,000" value={newProject.budget} onChange={(e) => setNewProject({ ...newProject, budget: e.target.value })} className={inp} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Deadline (optional)</Label>
                    <Input placeholder="e.g., 2 weeks" value={newProject.deadline} onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Location (optional)</Label>
                    <Input placeholder="e.g., Dhaka, Bangladesh" value={newProject.location} onChange={(e) => setNewProject({ ...newProject, location: e.target.value })} className={inp} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Required Skills</Label>
                  <Input placeholder="e.g., React, Python, AI" value={newProject.skills} onChange={(e) => setNewProject({ ...newProject, skills: e.target.value })} className={inp} />
                </div>
              </div>
              <div className={modalFooter}>
                <button onClick={handleCreateProject} disabled={!newProject.title || !newProject.category || !newProject.budget || creatingProject} className="w-full h-11 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all disabled:opacity-40">
                  {creatingProject ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Posting...</span> : "Post Project"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {showContractModal && profileViewerData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={() => setShowContractModal(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()} className={modalCard}>
              <div className={modalHeader}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/[0.05] border border-white/[0.08]"><FileText className="w-4 h-4 text-white/60" /></div>
                  <h2 className="text-base font-bold text-white">Create Contract for {profileViewerData.name || profileViewerData.displayName}</h2>
                </div>
                <button onClick={() => setShowContractModal(false)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><X className="w-4 h-4 text-white/50" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Contract Title *</Label>
                  <Input
                    placeholder="e.g., Landing page redesign"
                    value={contractForm.title}
                    onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })}
                    className={inp}
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Contract Description *</Label>
                  <textarea 
                    placeholder="Describe the scope of work, deliverables, and timeline..." 
                    value={contractForm.description} 
                    onChange={(e) => setContractForm({ ...contractForm, description: e.target.value })} 
                    rows={6} 
                    className={textarea} 
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Contract Timeline</Label>
                  <Input
                    placeholder="e.g., Start: Mar 10, End: Apr 10"
                    value={contractForm.timeline}
                    onChange={(e) => setContractForm({ ...contractForm, timeline: e.target.value })}
                    className={inp}
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Milestones</Label>
                  <textarea
                    placeholder="e.g., Milestone 1: Wireframes (Mar 15)\nMilestone 2: UI (Mar 25)"
                    value={contractForm.milestones}
                    onChange={(e) => setContractForm({ ...contractForm, milestones: e.target.value })}
                    rows={4}
                    className={textarea}
                  />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Revisions</Label>
                  <select
                    value={contractForm.revisions}
                    onChange={(e) => setContractForm({ ...contractForm, revisions: e.target.value })}
                    className={inp}
                  >
                    <option value="0">No revision</option>
                    <option value="1">1 Revision</option>
                    <option value="2">2 Revisions</option>
                    <option value="3">3 Revisions</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Contract Amount ($) *</Label>
                  <Input 
                    type="number" 
                    placeholder="e.g., 500" 
                    value={contractForm.amount} 
                    onChange={(e) => setContractForm({ ...contractForm, amount: e.target.value })} 
                    className={inp} 
                  />
                </div>
              </div>
              <div className={modalFooter}>
                <button 
                  onClick={handleSendContract} 
                  disabled={!contractForm.title || !contractForm.description || !contractForm.amount || submittingContract} 
                  className="w-full h-11 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all disabled:opacity-40"
                >
                  {submittingContract ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending...</span> : "Send Contract Offer"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedFreelancer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedFreelancer(null)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-[2rem] bg-[#0a0a0a] border border-white/[0.08]">
              <div className={modalHeader}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar className="w-10 h-10 border border-white/10 shrink-0">
                    <AvatarImage src={selectedFreelancer.userImage || ""} />
                    <AvatarFallback className="bg-white/10 text-sm">{selectedFreelancer.displayName?.[0] || "F"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-white truncate">{selectedFreelancer.displayName}</h2>
                    <p className="text-xs text-white/40 truncate">{selectedFreelancer.headline || "Freelancer"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {userType === "client" && (
                    <button onClick={() => { setSelectedFreelancer(null); startChatWithFreelancer(selectedFreelancer); }} className="flex items-center gap-1.5 px-3 h-8 rounded-xl bg-white/10 border border-white/[0.08] text-white text-xs font-medium hover:bg-white/15 transition-all">
                      <MessageCircle className="w-3.5 h-3.5" /> Message
                    </button>
                  )}
                  <button onClick={() => setSelectedFreelancer(null)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><X className="w-4 h-4 text-white/50" /></button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selectedFreelancer.location && (
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[10px] text-white/30 mb-0.5">Location</p>
                      <p className="text-xs text-white/70 font-medium flex items-center gap-1"><MapPin className="w-3 h-3" />{selectedFreelancer.location}</p>
                    </div>
                  )}
                  {(selectedFreelancer.pricingText || selectedFreelancer.hourlyRate) && (
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[10px] text-white/30 mb-0.5">Rate</p>
                      <p className="text-xs text-white/70 font-medium flex items-center gap-1"><DollarSign className="w-3 h-3" />{selectedFreelancer.pricingText || `${selectedFreelancer.hourlyRate}/hr`}</p>
                    </div>
                  )}
                  {selectedFreelancer.availability && (
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[10px] text-white/30 mb-0.5">Availability</p>
                      <p className="text-xs text-white/70 font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{selectedFreelancer.availability}</p>
                    </div>
                  )}
                </div>

                {selectedFreelancer.bio && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 mb-2">About</h3>
                    <p className="text-sm text-white/60 leading-relaxed">{selectedFreelancer.bio}</p>
                  </div>
                )}

                {selectedFreelancer.skills && Array.isArray(selectedFreelancer.skills) && selectedFreelancer.skills.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 mb-2">Skills</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedFreelancer.skills.map((skill: string, idx: number) => (
                        <span key={idx} className="text-xs px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-white/60">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}

                {freelancerPortfolio.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 mb-3">Portfolio</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {freelancerPortfolio.map((item: any) => (
                        <div key={item.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden group">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.title} className="w-full h-36 object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-36 flex items-center justify-center bg-white/[0.02]">
                              <ImageIcon className="w-8 h-8 text-white/10" />
                            </div>
                          )}
                          <div className="p-3">
                            <p className="text-sm font-semibold text-white/80 mb-0.5">{item.title}</p>
                            {item.description && <p className="text-xs text-white/40 line-clamp-2">{item.description}</p>}
                            {item.linkUrl && (
                              <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors">
                                <LinkIcon className="w-3 h-3" /> View Project
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {freelancerPortfolio.length === 0 && (
                  <div className="text-center py-8">
                    <ImageIcon className="w-10 h-10 mx-auto mb-2 text-white/10" />
                    <p className="text-sm text-white/30">No portfolio items yet</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMessages && (
          <motion.div initial={{ opacity: 0, x: 400 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 400 }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 z-[200] w-full md:max-w-sm bg-[#080808] border-l border-white/[0.08] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
              {activeConversation ? (
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button onClick={() => setActiveConversation(null)} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors shrink-0"><ArrowLeft className="w-4 h-4 text-white/50" /></button>
                  <Avatar className="w-9 h-9 border border-white/10 shrink-0 shadow-xl shadow-black">
                    <AvatarImage src={activeConversation.partnerImage || ""} />
                    <AvatarFallback className="text-sm font-bold bg-[#f5c518]/20 text-[#f5c518] border border-[#f5c518]/30">
                      {activeConversation.partnerName?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{activeConversation.partnerName}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => openProfileViewer({
                          partnerId: activeConversation.partnerId,
                          partnerName: activeConversation.partnerName,
                          partnerImage: activeConversation.partnerImage,
                          partnerHeadline: activeConversation.partnerHeadline,
                          partnerType: activeConversation.partnerType,
                        })}
                        className="h-6 px-2.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10px] font-semibold text-white/75 hover:text-white hover:bg-white/[0.1] transition-all flex items-center gap-1 shrink-0"
                      >
                        <User className="w-3 h-3" /> View Profile
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-white">Messages</p>
                  {unreadCount > 0 && <p className="text-[10px] text-white/40">{unreadCount} unread</p>}
                </div>
              )}
              <button onClick={() => { setShowMessages(false); setActiveConversation(null); }} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors shrink-0"><X className="w-4 h-4 text-white/50" /></button>
            </div>

            {!activeConversation ? (
              <div className="flex-1 overflow-y-auto">
                {loadingConversations ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageCircle className="w-10 h-10 mx-auto mb-3 text-white/10" />
                    <p className="text-sm text-white/30">No conversations yet</p>
                  </div>
                ) : (
                  conversations.map((conv, idx) => (
                    <div key={idx} className="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]">
                      <div className="flex items-start gap-2 p-4">
                        <button onClick={() => openConversation(conv)} className="flex-1 flex items-start gap-3 min-w-0 text-left">
                          <Avatar className="w-9 h-9 shrink-0 border border-white/10">
                            <AvatarImage src={conv.partnerImage || ""} />
                            <AvatarFallback className="text-xs bg-white/10">{conv.partnerName?.[0] || "U"}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <p className="text-sm font-medium text-white/80 truncate flex-1 min-w-0">{conv.partnerName}</p>
                              {conv.unreadCount > 0 && (
                                <span className="min-w-4 h-4 px-1 bg-white text-black text-[9px] font-bold rounded-full flex items-center justify-center shrink-0">
                                  {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white/30 truncate mt-1 pr-2">{formatConversationPreview(conv.lastMessage)}</p>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv); }}
                          className="shrink-0 p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {hasMoreMessages && activeConversation && (
                    <div className="flex justify-center pb-2">
                      <button
                        onClick={() => fetchMessagesForConversation(activeConversation.partnerId, { silent: true, loadMore: true })}
                        className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06]"
                      >
                        Load older messages
                      </button>
                    </div>
                  )}
                  {loadingChat ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
                  ) : chatMessages.length === 0 ? (
                    <div className="text-center py-8"><p className="text-sm text-white/30">No messages yet. Say hi!</p></div>
                  ) : (
                    chatMessages
                    .filter((msg: any) => {
                      // Filter out messages hidden for this user
                      const hiddenFor = Array.isArray(msg.hiddenForUsers) ? msg.hiddenForUsers : [];
                      if (hiddenFor.includes(session?.user?.id)) return false;
                      // Filter out messages not visible to this user
                      if (msg.visibleTo) {
                        const visibleToArr = Array.isArray(msg.visibleTo) ? msg.visibleTo : [];
                        if (visibleToArr.length > 0 && !visibleToArr.includes(session?.user?.id)) return false;
                      }
                      return true;
                    })
                    .map((msg: any, idx: number) => {
                      const isMe = msg.senderId === (session?.user?.id || "mock-user");
                      const contractOffer = parseContractOfferMessage(msg.message);
                      const contractEvent = parseContractEventMessage(msg.message);
                      const deliverableData = parseDeliverableMessage(msg.message);
                      const revisionData = parseRevisionRequestMessage(msg.message);
                      const disputeData = (() => {
                        if (typeof msg.message === "string" && msg.message.startsWith("[DISPUTE]")) {
                          try { return JSON.parse(msg.message.replace("[DISPUTE]", "")); } catch { return null; }
                        }
                        return null;
                      })();
                      const contractStatus = contractOffer
                        ? [...chatMessages]
                            .filter((candidate: any) => {
                              // Only consider messages from the same conversation to prevent cross-conversation state leakage
                              if (activeConversation?.partnerId && session?.user?.id) {
                                const ids = [session.user.id, activeConversation.partnerId].sort();
                                const currentConvKey = `${ids[0]}_${ids[1]}`;
                                if (candidate.conversationKey && candidate.conversationKey !== currentConvKey) return false;
                              }
                              return true;
                            })
                            .map((candidate: any) => parseContractEventMessage(candidate.message))
                            .filter(Boolean)
                            .reverse()
                            .find((candidate: any) => candidate?.contractId === contractOffer.contractId)
                        : null;
                      const shouldHidePlainMessage = Boolean(contractOffer || contractEvent || deliverableData || revisionData || disputeData);
                      const messageText = !shouldHidePlainMessage && (msg.message && typeof msg.message === "string" && msg.message.trim()) ? msg.message.trim() : "";

                      let attachments = msg.attachments;
                      if (typeof attachments === "string") {
                        try {
                          attachments = JSON.parse(attachments);
                        } catch {
                          attachments = null;
                        }
                      }

                      const hasStructuredCard = Boolean(contractOffer || contractEvent || deliverableData || revisionData || disputeData);

                      return (
                        <div key={msg.id ?? msg.clientTempId ?? `${msg.createdAt}-${idx}`} className={`flex w-full items-end ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`w-fit ${isMe ? "ml-auto max-w-[98%]" : "mr-auto max-w-[94%]"} flex flex-col gap-1 text-sm ${hasStructuredCard ? "px-0 py-0 bg-transparent border-0" : `px-3 py-2 rounded-2xl ${isMe ? "bg-white text-black" : "bg-white/[0.08] text-white/80 border border-white/[0.06]"}`}`}>
                            {attachments && Array.isArray(attachments) && attachments.length > 0 && (
                              <div className="flex flex-col gap-2 mt-1 mb-1">
                                {attachments.map((att: any, aIdx: number) => {
                                  const fileType = typeof att?.type === "string" ? att.type : "";
                                  const fileName = typeof att?.name === "string" ? att.name : "attachment";
                                  const rawUrl = typeof att?.url === "string" ? att.url : "";
                                  const lowerName = fileName.toLowerCase();
                                  const isImage = fileType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lowerName);
                                  const isVideo = fileType.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/i.test(lowerName);
                                  const isPdf = fileType === "application/pdf" || /\.pdf$/i.test(lowerName);
                                  const isDocument =
                                    isPdf ||
                                    fileType.includes("document") ||
                                    fileType.includes("text") ||
                                    /\.(docx?|xlsx?|pptx?|txt|csv|rtf|json)$/i.test(lowerName);
                                  const attachmentApiUrl = msg?.id ? `/api/community/attachments?messageId=${msg.id}&attachmentIndex=${aIdx}` : "";
                                  const hasInlineDataUrl = rawUrl.startsWith("data:");
                                  const previewUrl = hasInlineDataUrl ? rawUrl : (attachmentApiUrl || rawUrl);
                                  const directDownloadUrl = msg?.id ? `/api/community/attachments?messageId=${msg.id}&attachmentIndex=${aIdx}&download=1` : rawUrl;
                                  const fileSizeKB = att?.size && Number.isFinite(att.size)
                                    ? Math.max(1, Math.ceil(att.size / 1024))
                                    : hasInlineDataUrl
                                      ? Math.max(1, Math.ceil((rawUrl.length / 1024) * 0.75))
                                      : null;

                                  return (
                                    <div key={aIdx}>
                                      {isImage && (
                                        <div className="group/attachment relative rounded-lg overflow-hidden border border-white/10">
                                          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="block hover:opacity-80 transition-opacity">
                                            <img src={previewUrl} alt={fileName} className="max-w-full max-h-80 rounded-lg" />
                                          </a>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              triggerAttachmentDownload(directDownloadUrl, fileName);
                                            }}
                                            className="absolute top-2 right-2 opacity-0 group-hover/attachment:opacity-100 transition-opacity w-8 h-8 rounded-full bg-black/70 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white z-10"
                                            title="Download file"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                          </button>
                                          <div className="p-2 flex items-center justify-between bg-black/20">
                                            <p className="text-xs truncate text-white/70">{fileName}</p>
                                            <p className="text-xs text-white/50 ml-2">{fileSizeKB ? `${fileSizeKB} KB` : "File"}</p>
                                          </div>
                                        </div>
                                      )}

                                      {isVideo && (
                                        <div className="group/attachment relative rounded-lg overflow-hidden border border-white/10 bg-black/40">
                                          <video controls className="max-w-full max-h-80 rounded-lg bg-black" src={previewUrl} />
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              triggerAttachmentDownload(directDownloadUrl, fileName);
                                            }}
                                            className="absolute top-2 right-2 opacity-0 group-hover/attachment:opacity-100 transition-opacity w-8 h-8 rounded-full bg-black/70 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white z-10"
                                            title="Download file"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                          </button>
                                          <div className="p-2 flex items-center justify-between bg-black/20">
                                            <p className="text-xs truncate text-white/70">{fileName}</p>
                                            <p className="text-xs text-white/50 ml-2">{fileSizeKB ? `${fileSizeKB} KB` : "File"}</p>
                                          </div>
                                        </div>
                                      )}

                                      {!isImage && !isVideo && (
                                        <div className={`group/attachment relative flex items-center gap-2.5 p-2.5 rounded-xl border transition-all hover:scale-105 ${isMe ? "bg-black/5 border-black/10 hover:bg-black/10" : "bg-black/20 border-white/10 hover:bg-black/40"}`}>
                                          <a
                                            href={directDownloadUrl}
                                            download={fileName}
                                            className="absolute inset-0 rounded-xl z-0"
                                            aria-label={`Download ${fileName || "file"}`}
                                          />
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative z-10 ${isMe ? "bg-black/10" : "bg-white/10"}`}>
                                            {isDocument ? (
                                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M4 3a2 2 0 012-2h6a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V13a2 2 0 01-2 2H6a2 2 0 01-2-2zm2 5a1 1 0 000 2h6a1 1 0 000-2H6z" />
                                              </svg>
                                            ) : (
                                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 1.4A1 1 0 0116 10.5V12a6 6 0 01-6 6H9a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a3 3 0 01-3-3v-1z" />
                                              </svg>
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0 relative z-10">
                                            <p className="font-semibold text-[13px] truncate">{fileName || "Download"}</p>
                                            <p className={`text-[10px] uppercase tracking-wider ${isMe ? "text-black/50" : "text-white/40"}`}>
                                              {isDocument ? "Document" : "File"}{fileSizeKB ? ` • ${fileSizeKB} KB` : ""}
                                            </p>
                                          </div>
                                          <div className="relative z-10 flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              triggerAttachmentDownload(directDownloadUrl, fileName);
                                            }}
                                            className="opacity-0 group-hover/attachment:opacity-100 transition-opacity w-7 h-7 rounded-full bg-black/70 hover:bg-black/85 border border-white/15 flex items-center justify-center text-white"
                                            title="Download file"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                          </button>
                                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {contractOffer && (
                              <div className={`min-w-[260px] max-w-[420px] rounded-[1.25rem] overflow-hidden ${isMe ? "bg-black text-white" : "bg-gradient-to-br from-white/[0.09] via-white/[0.07] to-white/[0.04] text-white border border-white/[0.08]"}`}>
                                <div className={`px-4 py-3 border-b ${isMe ? "border-white/10 bg-white/5" : "border-white/[0.08] bg-white/[0.04]"}`}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isMe ? "bg-[#f5c518] text-black" : "bg-[#f5c518]/15 text-[#f5c518]"}`}>
                                        <FileSignature className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <p className={`text-[10px] uppercase tracking-[0.25em] ${isMe ? "text-white/60" : "text-white/40"}`}>Contract Offer</p>
                                        <p className="text-sm font-semibold">{contractOffer.title}</p>
                                      </div>
                                    </div>
                                    <div className={`text-right ${isMe ? "text-white" : "text-[#f5c518]"}`}>
                                      <p className={`text-[10px] uppercase tracking-[0.2em] ${isMe ? "text-white/55" : "text-white/35"}`}>Amount</p>
                                      <p className="text-base font-black">${contractOffer.amount}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="px-4 py-3 space-y-3">
                                  {contractOffer.revisions !== undefined && contractOffer.revisions !== null && (
                                    <div className={`rounded-xl px-3 py-2 ${isMe ? "bg-white/5" : "bg-black/20 border border-white/[0.06]"}`}>
                                      <p className={`text-[10px] uppercase tracking-[0.2em] ${isMe ? "text-white/50" : "text-white/35"}`}>Revisions</p>
                                      <p className="mt-1 text-xs leading-relaxed">
                                        {contractOffer.revisions === 0 ? "None" : contractOffer.revisions}
                                      </p>
                                    </div>
                                  )}

                                  {(contractOffer.timeline || contractOffer.milestones) && (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      {contractOffer.timeline && (
                                        <div className={`rounded-xl px-3 py-2 ${isMe ? "bg-white/5" : "bg-black/20 border border-white/[0.06]"}`}>
                                          <p className={`text-[10px] uppercase tracking-[0.2em] ${isMe ? "text-white/50" : "text-white/35"}`}>Timeline</p>
                                          <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap">{contractOffer.timeline}</p>
                                        </div>
                                      )}
                                      {contractOffer.milestones && (
                                        <div className={`rounded-xl px-3 py-2 ${isMe ? "bg-white/5" : "bg-black/20 border border-white/[0.06]"}`}>
                                          <p className={`text-[10px] uppercase tracking-[0.2em] ${isMe ? "text-white/50" : "text-white/35"}`}>Milestones</p>
                                          <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap">{contractOffer.milestones}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {contractOffer.description && (
                                    <div className={`rounded-xl px-3 py-3 ${isMe ? "bg-white/5" : "bg-black/20 border border-white/[0.06]"}`}>
                                      <p className={`text-[10px] uppercase tracking-[0.2em] ${isMe ? "text-white/50" : "text-white/35"}`}>Scope</p>
                                      <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap">{contractOffer.description}</p>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between gap-2 text-[10px] text-white/40">
                                    <span>Created</span>
                                    <span>{formatLocalDateTime(contractOffer.createdAt) || "Just now"}</span>
                                  </div>

                                  {contractStatus ? (
                                    contractStatus.action === "accepted" && !(
                                      chatEscrowMap[contractOffer.contractId] === "escrow_funded" ||
                                      chatEscrowMap[contractOffer.contractId] === "released" ||
                                      chatEscrowMap[contractOffer.contractId] === "completed"
                                    ) ? (
                                      // Accepted but escrow not funded yet
                                      userType === "client" ? (
                                        <div className="flex justify-end gap-2 pt-1">
                                          <button
                                            type="button"
                                            disabled={contractActionLoadingId === contractOffer.contractId}
                                            onClick={() => handleContractAction(msg, "cancelled")}
                                            className="h-8 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-[11px] font-semibold text-red-400 hover:bg-red-500/15 disabled:opacity-50"
                                          >
                                            {contractActionLoadingId === contractOffer.contractId ? "Please wait..." : "Cancel"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEscrowContract(contractOffer);
                                              setEscrowMsg(msg);
                                              setShowEscrowModal(true);
                                            }}
                                            className="h-8 rounded-lg px-3 text-[11px] font-semibold text-black bg-[#f5c518] hover:bg-[#e6b910]"
                                          >
                                            Proceed to Fund Escrow
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 bg-amber-500/15 text-amber-300 border border-amber-500/20">
                                          <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4" />
                                            <div>
                                              <p className="text-xs font-semibold">Waiting for client to fund escrow</p>
                                              <p className="text-[11px] opacity-80">The client has accepted. Once they fund the escrow, you can start working.</p>
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            disabled={contractActionLoadingId === contractOffer.contractId}
                                            onClick={() => handleContractAction(msg, "cancelled")}
                                            className="shrink-0 h-7 rounded-lg border border-red-500/20 bg-red-500/10 px-2 text-[11px] font-semibold text-red-400 hover:bg-red-500/15 disabled:opacity-50"
                                          >
                                            {contractActionLoadingId === contractOffer.contractId ? "..." : "Cancel"}
                                          </button>
                                        </div>
                                      )
                                    ) : (
                                      <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${contractStatus.action === "accepted" || contractStatus.action === "escrow_funded" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" : contractStatus.action === "released" ? "bg-blue-500/15 text-blue-300 border border-blue-500/20" : contractStatus.action === "declined" ? "bg-rose-500/15 text-rose-300 border border-rose-500/20" : "bg-amber-500/15 text-amber-300 border border-amber-500/20"}`}>
                                        <div className="flex items-center gap-2">
                                          {contractStatus.action === "accepted" || contractStatus.action === "escrow_funded" || contractStatus.action === "released" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                          <div>
                                            <p className="text-xs font-semibold">
                                              {contractStatus.action === "accepted" || contractStatus.action === "escrow_funded" ? "Contract Active" : contractStatus.action === "released" ? "Payment Released" : contractStatus.action === "declined" ? "Contract declined" : "Contract cancelled"}
                                            </p>
                                            <p className="text-[11px] opacity-80">
                                              {contractStatus.actorName ? `${contractStatus.actorName} ` : ""}{contractStatus.action === "accepted" || contractStatus.action === "escrow_funded" ? "funded this escrow" : contractStatus.action === "released" ? "released payment" : contractStatus.action === "declined" ? "declined this offer" : "cancelled this offer"}
                                            </p>
                                          </div>
                                        </div>
                                        {contractStatus.actedAt && (
                                          <span className="text-[10px] opacity-70 whitespace-nowrap">
                                            {new Date(contractStatus.actedAt).toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                    )
                                  ) : isMe ? (
                                    <div className="flex justify-end gap-2 pt-1">
                                      <button
                                        type="button"
                                        disabled={contractActionLoadingId === contractOffer.contractId}
                                        onClick={() => handleContractAction(msg, "cancelled")}
                                        className="h-8 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
                                      >
                                        {contractActionLoadingId === contractOffer.contractId ? "Please wait..." : "Cancel Contract"}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex justify-end gap-2 pt-1">
                                      <button
                                        type="button"
                                        disabled={contractActionLoadingId === contractOffer.contractId}
                                        onClick={() => handleContractAction(msg, "declined")}
                                        className="h-8 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-white/75 hover:text-white hover:bg-white/10 disabled:opacity-50"
                                      >
                                        {contractActionLoadingId === contractOffer.contractId ? "Please wait..." : "Decline"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={contractActionLoadingId === contractOffer.contractId}
                                        onClick={() => handleContractAction(msg, "accepted")}
                                        className="h-8 rounded-lg px-3 text-[11px] font-semibold text-black bg-[#f5c518] hover:bg-[#e6b910] disabled:opacity-50"
                                      >
                                        {contractActionLoadingId === contractOffer.contractId ? "Please wait..." : "Accept"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {contractEvent && (() => {
                              const escrowState = chatEscrowMap[contractEvent.contractId];
                              const evtEscrowFunded = escrowState === "escrow_funded" || escrowState === "released" || escrowState === "completed";
                              const evtAcceptedNotFunded = (contractEvent.action === "accepted" || contractEvent.action === "escrow_funded") && !evtEscrowFunded && escrowState !== "escrow_funded";
                              const isReleased = escrowState === "released";
                              const isCompleted = escrowState === "completed";
                              return (
                                <div
                                  className={`min-w-[240px] max-w-[360px] rounded-2xl border px-3 py-3 text-xs shadow-sm ${
                                    evtAcceptedNotFunded
                                      ? "bg-amber-500/12 text-amber-200 border-amber-500/25"
                                      : isReleased
                                        ? "bg-blue-500/12 text-blue-200 border-blue-500/25"
                                        : isCompleted
                                          ? "bg-emerald-500/12 text-emerald-200 border-emerald-500/25"
                                          : contractEvent.action === "accepted" || contractEvent.action === "escrow_funded"
                                            ? "bg-emerald-500/12 text-emerald-200 border-emerald-500/25"
                                            : contractEvent.action === "declined"
                                              ? "bg-rose-500/12 text-rose-200 border-rose-500/25"
                                              : "bg-amber-500/12 text-amber-200 border-amber-500/25"
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div
                                      className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                                        evtAcceptedNotFunded
                                          ? "bg-amber-500/20"
                                          : isReleased
                                            ? "bg-blue-500/20"
                                            : isCompleted
                                              ? "bg-emerald-500/20"
                                              : contractEvent.action === "accepted" || contractEvent.action === "escrow_funded"
                                                ? "bg-emerald-500/20"
                                                : contractEvent.action === "declined"
                                                  ? "bg-rose-500/20"
                                                  : "bg-amber-500/20"
                                      }`}
                                    >
                                      {contractEvent.action === "accepted" || contractEvent.action === "escrow_funded" ? (
                                        evtAcceptedNotFunded ? <Clock className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />
                                      ) : (
                                        <X className="w-3.5 h-3.5" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-semibold">
                                        {evtAcceptedNotFunded
                                          ? "Waiting for client to fund escrow"
                                          : isReleased
                                            ? "Payment released — pending settlement"
                                            : isCompleted
                                              ? "Funds available for withdrawal"
                                              : contractEvent.action === "accepted" || contractEvent.action === "escrow_funded"
                                                ? "Contract active"
                                                : contractEvent.action === "declined"
                                                  ? "Contract declined"
                                                  : "Contract cancelled"}
                                      </p>
                                      {contractEvent.actorName && (
                                        <p className="mt-0.5 text-[11px] opacity-80">
                                          by {contractEvent.actorName}
                                        </p>
                                      )}
                                      {contractEvent.actedAt && (
                                        <p className="mt-1 text-[10px] opacity-70">
                                          {new Date(contractEvent.actedAt).toLocaleString()}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* ── Deliverable Card ── */}
                            {deliverableData && (() => {
                              const submittedAt = deliverableData.submittedAt ? new Date(deliverableData.submittedAt) : new Date(msg.createdAt);
                              const deadline = new Date(submittedAt.getTime() + 72 * 60 * 60 * 1000);
                              const now = new Date();
                              const isExpired = now > deadline;
                              const totalMs = 72 * 60 * 60 * 1000;
                              const elapsedMs = now.getTime() - submittedAt.getTime();
                              const remainingMs = Math.max(0, totalMs - elapsedMs);
                              const hours = Math.floor(remainingMs / (1000 * 60 * 60));
                              const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                              const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
                              const timerText = isExpired ? "Expired" : `${hours}h ${minutes}m ${seconds}s`;

                              const dbList = contractDeliverables[deliverableData.contractId] || [];
                              const dbDeliverable = dbList.find((d: any) => d.messageId === msg.id);
                              const dbStatus = dbDeliverable?.status;
                              const isApproved = dbStatus === "approved";
                              const isUnderRevision = dbStatus === "revision_requested";

                              return (
                                <div className={`min-w-[280px] max-w-[420px] rounded-2xl border px-4 py-4 text-xs shadow-sm ${isApproved ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-blue-500/20 bg-blue-500/[0.06]"}`}>
                                  <div className="flex items-start gap-2 mb-3">
                                    <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${isApproved ? "bg-emerald-500/20" : "bg-blue-500/20"}`}>
                                      <Package className={`w-3.5 h-3.5 ${isApproved ? "text-emerald-400" : "text-blue-400"}`} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-sm text-white/90">
                                        {isApproved ? "✅ Deliverable Approved" : "📦 Deliverable Submitted"}
                                      </p>
                                      <p className="text-[10px] text-white/50 mt-0.5">{submittedAt.toLocaleString()} • Version {dbDeliverable?.version || 1}</p>
                                    </div>
                                  </div>
                                  {deliverableData.notes && (
                                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 mb-3">
                                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1">Notes</p>
                                      <p className="text-xs text-white/70 whitespace-pre-wrap">{deliverableData.notes}</p>
                                    </div>
                                  )}
                                  {/* Status badge */}
                                  {isApproved && (
                                    <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 bg-emerald-500/[0.08] border border-emerald-500/15">
                                      <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                                      <p className="text-xs font-semibold text-emerald-300">This deliverable has been approved by the client.</p>
                                    </div>
                                  )}
                                  {isUnderRevision && (
                                    <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 bg-amber-500/[0.08] border border-amber-500/15">
                                      <RotateCcw className="w-4 h-4 shrink-0 text-amber-400" />
                                      <p className="text-xs font-semibold text-amber-300">This deliverable is under revision.</p>
                                    </div>
                                  )}
                                  {dbDeliverable?.isArchived && (
                                    <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 bg-gray-500/[0.08] border border-gray-500/15">
                                      <Archive className="w-4 h-4 shrink-0 text-gray-400" />
                                      <p className="text-xs font-semibold text-gray-300">Archived - Superseded by newer version</p>
                                    </div>
                                  )}
                                  {/* Timer — only when pending review, client is viewing, and is latest */}
                                  {!isApproved && !isUnderRevision && userType === "client" && dbDeliverable?.isLatest && (
                                    <div className={`rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 ${isExpired ? "bg-red-500/[0.08] border border-red-500/15" : "bg-amber-500/[0.08] border border-amber-500/15"}`}>
                                      <Clock className={`w-4 h-4 shrink-0 ${isExpired ? "text-red-400" : "text-amber-400"}`} />
                                      <div>
                                        <p className={`text-xs font-semibold ${isExpired ? "text-red-300" : "text-amber-300"}`}>
                                          {isExpired ? "Review window expired" : "Review window remaining"}
                                        </p>
                                        <p className={`text-[11px] ${isExpired ? "text-red-300/70" : "text-amber-300/70"}`}>{timerText}</p>
                                      </div>
                                    </div>
                                  )}
                                  {/* Action buttons for client — when pending review */}
                                  {!isApproved && !isUnderRevision && userType === "client" && dbDeliverable?.id && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => approveDeliverable(Number(dbDeliverable.id), deliverableData.contractId)}
                                        className="flex-1 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-1.5"
                                      >
                                        <Check className="w-3.5 h-3.5" /> Approve
                                      </button>
                                      <button
                                        onClick={() => { setRevisionForm((prev) => ({ ...prev, parentDeliverableId: Number(dbDeliverable.id) })); setShowRevisionModal(true); }}
                                        className="flex-1 h-9 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-300 text-[11px] font-bold hover:bg-blue-500/20 transition-all flex items-center justify-center gap-1.5"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" /> Request Revision
                                      </button>
                                    </div>
                                  )}
                                  {isExpired && !isApproved && !isUnderRevision && (
                                    <p className="text-[11px] text-white/40 text-center">Review window has expired.</p>
                                  )}
                                </div>
                              );
                            })()}

                            {/* ── Revision Request Card ── */}
                            {revisionData && (() => {
                              const requestedAt = revisionData.requestedAt ? new Date(revisionData.requestedAt) : new Date(msg.createdAt);
                              const deadline = new Date(requestedAt.getTime() + 72 * 60 * 60 * 1000);
                              const now = new Date();
                              const isExpired = now > deadline;
                              const totalMs = 72 * 60 * 60 * 1000;
                              const elapsedMs = now.getTime() - requestedAt.getTime();
                              const remainingMs = Math.max(0, totalMs - elapsedMs);
                              const hours = Math.floor(remainingMs / (1000 * 60 * 60));
                              const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                              const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
                              const timerText = isExpired ? "Expired" : `${hours}h ${minutes}m ${seconds}s`;
                              return (
                                <div className="min-w-[280px] max-w-[420px] rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-4 text-xs shadow-sm">
                                  <div className="flex items-start gap-2 mb-3">
                                    <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20">
                                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-sm text-white/90">🔄 Revision Requested</p>
                                      <p className="text-[10px] text-white/50 mt-0.5">{requestedAt.toLocaleString()}</p>
                                    </div>
                                  </div>
                                  {revisionData.notes && (
                                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 mb-3">
                                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1">Changes Needed</p>
                                      <p className="text-xs text-white/70 whitespace-pre-wrap">{revisionData.notes}</p>
                                    </div>
                                  )}
                                  {/* Timer — only when freelancer is viewing and is latest */}
                                  {userType === "freelancer" && dbDeliverable?.isLatest && (
                                    <div className={`rounded-xl px-3 py-2.5 mb-3 flex items-center gap-2 ${isExpired ? "bg-red-500/[0.08] border border-red-500/15" : "bg-amber-500/[0.08] border border-amber-500/15"}`}>
                                      <Clock className={`w-4 h-4 shrink-0 ${isExpired ? "text-red-400" : "text-amber-400"}`} />
                                      <div>
                                        <p className={`text-xs font-semibold ${isExpired ? "text-red-300" : "text-amber-300"}`}>
                                          {isExpired ? "Revision window expired" : "Revision window remaining"}
                                        </p>
                                        <p className={`text-[11px] ${isExpired ? "text-red-300/70" : "text-amber-300/70"}`}>{timerText}</p>
                                      </div>
                                    </div>
                                  )}
                                  {isExpired && userType === "freelancer" && (
                                    <p className="text-[11px] text-white/40 text-center">Revision window has expired.</p>
                                  )}
                                </div>
                              );
                            })()}

                            {/* ── Dispute Card ── */}
                            {disputeData && (() => {
                              const roleLabel = disputeData.raisedByRole === "freelancer" ? "Freelancer" : "Client";
                              const raisedByName = disputeData.raisedBy || "Unknown";
                              const createdAt = disputeData.createdAt ? new Date(disputeData.createdAt) : new Date(msg.createdAt);
                              return (
                                <div className="min-w-[280px] max-w-[420px] rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-4 text-xs shadow-sm">
                                  <div className="flex items-start gap-2 mb-3">
                                    <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20">
                                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-sm text-white/90">{roleLabel} raised a dispute</p>
                                      <p className="text-[10px] text-white/50 mt-0.5">{createdAt.toLocaleString()}</p>
                                    </div>
                                  </div>
                                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 mb-3">
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1">Title</p>
                                    <p className="text-xs text-white/70 font-semibold">{disputeData.title || "Untitled"}</p>
                                  </div>
                                  {disputeData.description && (
                                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 mb-3">
                                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1">Description</p>
                                      <p className="text-xs text-white/70 whitespace-pre-wrap">{disputeData.description}</p>
                                    </div>
                                  )}
                                  {Array.isArray(disputeData.attachments) && disputeData.attachments.length > 0 && (
                                    <div className="mb-3">
                                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-2">Attachments</p>
                                      <div className="flex flex-col gap-1.5">
                                        {disputeData.attachments.map((att: any, aIdx: number) => {
                                          const fileType = typeof att?.type === "string" ? att.type : "";
                                          const fileName = typeof att?.name === "string" ? att.name : "attachment";
                                          const isImage = fileType.startsWith("image/");
                                          return (
                                            <a
                                              key={aIdx}
                                              href={`/api/community/attachments?messageId=${msg.id}&attachmentIndex=${aIdx}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white/70 hover:bg-white/[0.06] transition-all"
                                            >
                                              {isImage ? <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Paperclip className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                              <span className="truncate">{fileName}</span>
                                            </a>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  <div className="rounded-xl px-3 py-2.5 flex items-center gap-2 bg-amber-500/[0.08] border border-amber-500/15">
                                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                                    <p className="text-xs font-semibold text-amber-300">HireMindX will review this dispute within 24 hours.</p>
                                  </div>
                                </div>
                              );
                            })()}

                            {messageText && (
                              <div className="whitespace-pre-wrap break-words">
                                {renderLinkedMessageText(messageText)}
                              </div>
                            )}

                            {!hasStructuredCard && msg.createdAt && (
                              <div className={`text-[10px] ${isMe ? "text-black/45" : "text-white/35"}`}>
                                {new Date(msg.createdAt).toLocaleString()}
                              </div>
                            )}

                            {isMe && msg.status && (
                              <div className="flex justify-end mt-0.5">
                                {msg.status === "sent" && <Check className="w-[14px] h-[14px] text-black/40" />}
                                {msg.status === "delivered" && <CheckCheck className="w-[14px] h-[14px] text-black/40" />}
                                {msg.status === "seen" && <CheckCheck className="w-[14px] h-[14px] text-blue-500" />}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-4 border-t border-white/[0.06]">
                  <AnimatePresence>
                    {attachment && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mb-3 flex items-center justify-between bg-white/5 border border-white/10 p-2.5 rounded-xl text-xs text-white/80">
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                          {attachment.type.startsWith("image/") ? (
                            <ImageIcon className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                          ) : attachment.type.startsWith("video/") ? (
                            <svg className="w-3.5 h-3.5 shrink-0 text-purple-400" fill="currentColor" viewBox="0 0 20 20"><path d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 1.4A1 1 0 0116 10.5V13a2 2 0 01-2 2h-2.5a1 1 0 01-1-1v-2.5H9V13a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2h2v2.5H4V6z" /></svg>
                          ) : (
                            <Paperclip className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          )}
                          <div className="truncate min-w-0">
                            <span className="truncate block">{attachment.name}</span>
                            <span className="text-[10px] text-white/40">
                              {attachment.type ? attachment.type.split("/")[1]?.toUpperCase() : "Unknown"} • {(attachment.size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        </div>
                        <button onClick={() => setAttachment(null)} className="ml-3 hover:text-white/50 shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="relative flex items-center">
                    <button
                      type="button"
                      onClick={() => setShowPlusMenu((prev) => !prev)}
                      className="absolute left-3 z-10 w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
                      aria-label="Open message actions"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <AnimatePresence>
                      {showPlusMenu && (
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: -8, x: 0 }} animate={{ opacity: 1, scale: 1, y: 0, x: 0 }} exit={{ opacity: 0, scale: 0.9, y: -10 }} className="absolute bottom-12 left-0 w-44 bg-[#0a0a0a]/95 backdrop-blur-3xl border border-white/[0.08] rounded-2xl shadow-2xl p-2 z-[200]">
                          <button
                            onClick={() => { setShowDisputeModal(true); setShowPlusMenu(false); }}
                            className="w-full h-10 rounded-xl px-3 flex items-center gap-3 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all text-left"
                          >
                            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400"><ShieldAlert className="w-3.5 h-3.5" /></div>
                            Raise dispute
                          </button>
                          <button
                            onClick={() => { setShowContractModal(true); setProfileViewerData({ id: activeConversation.partnerId, userId: activeConversation.partnerId, name: activeConversation.partnerName, image: activeConversation.partnerImage, headline: activeConversation.partnerHeadline, userType: activeConversation.partnerType }); setShowPlusMenu(false); }}
                            className="w-full h-10 rounded-xl px-3 flex items-center gap-3 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all text-left"
                          >
                            <div className="p-1.5 rounded-lg bg-[#f5c518]/10 text-[#f5c518]"><FileText className="w-3.5 h-3.5" /></div>
                            Send contract
                          </button>
                          {userType === "freelancer" && (
                            <button
                              onClick={() => { setShowDeliverableModal(true); setShowPlusMenu(false); }}
                              className="w-full h-10 rounded-xl px-3 flex items-center gap-3 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all text-left"
                            >
                              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400"><Upload className="w-3.5 h-3.5" /></div>
                              {hasPendingDeliverable(activeConversation.contractId) ? "Resubmit work" : "Submit work"}
                            </button>
                          )}
                          {userType === "client" && (
                            <button
                              onClick={() => { setShowRevisionModal(true); setShowPlusMenu(false); }}
                              className="w-full h-10 rounded-xl px-3 flex items-center gap-3 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all text-left"
                            >
                              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400"><RotateCcw className="w-3.5 h-3.5" /></div>
                              Request to revision
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !sendingMessage) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Type a message..."
                      className="flex-1 h-11 pl-11 pr-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-[#f5c518]/20 focus:bg-white/[0.05] transition-all"
                    />
                    <button onClick={sendMessage} disabled={(!newMessage.trim() && !attachment) || sendingMessage} className="absolute right-1.5 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 shrink-0 hover:scale-[1.05] active:scale-95 shadow-md shadow-[#f5c518]/20" style={{ background: "linear-gradient(135deg, #f5c518, #c8960c)" }}>
                      {sendingMessage ? <Loader2 className="w-3 h-3 text-black animate-spin" /> : <Send className="w-3 h-3 text-black" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFullProfileModal && profileViewerData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6"
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowFullProfileModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={`${modalCard} max-w-3xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={modalHeader}>
                <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                  {profileViewerData.userType === "client" ? "Client Profile" : "Freelancer Profile"}
                </h3>
                <button
                  onClick={() => setShowFullProfileModal(false)}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-white/60" />
                </button>
              </div>

              <div className="p-6 md:p-8 space-y-8">
                {isLoadingProfileViewer && (
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading full profile...
                  </div>
                )}

                <div className="flex flex-col md:flex-row gap-6 items-start">
                  <Avatar className="w-24 h-24 rounded-[2rem] border border-[#f5c518]/20 shadow-2xl shrink-0 overflow-hidden">
                    <AvatarImage src={profileViewerData.image || ""} className="object-cover" />
                    <AvatarFallback className="w-full h-full bg-gradient-to-br from-[#f5c518]/20 to-[#c8960c]/5 flex items-center justify-center text-4xl font-black text-[#f5c518]">
                      {(profileViewerData.name || profileViewerData.displayName)?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h2 className="text-3xl font-bold text-white mb-2">{profileViewerData.name || profileViewerData.displayName}</h2>
                    <p className="text-[#f5c518] font-medium text-lg mb-2">
                      {profileViewerData.headline || (profileViewerData.userType === "client" ? "Client" : "Professional Freelancer")}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-white/50 mb-4">
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {profileViewerData.location || "Location not specified"}</span>
                      {profileViewerData.userType !== "client" && (
                        <span className="flex items-center gap-1.5 text-white/80"><span className="text-[#f5c518]">★</span> 4.9 (124 reviews)</span>
                      )}
                      {(profileViewerData.pricingText || profileViewerData.hourlyRate) && (
                        <span className="flex items-center gap-1.5 text-white/80">
                          <DollarSign className="w-4 h-4 text-[#f5c518]" /> 
                          {profileViewerData.pricingText || `${profileViewerData.hourlyRate}/hr`}
                        </span>
                      )}
                    </div>
                    {profileViewerData.companyName && (
                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white/70">
                        <Briefcase className="w-4 h-4 text-[#f5c518]" />
                        {profileViewerData.companyName}
                        {profileViewerData.industry && <span className="text-white/35">• {profileViewerData.industry}</span>}
                      </div>
                    )}
                  </div>
                </div>

                {(profileViewerData.bio || profileViewerData.description) && (
                  <div>
                    <h4 className="text-sm font-bold text-white mb-3 uppercase tracking-widest text-[#f5c518]">
                      {profileViewerData.userType === "client" ? "About / Company Overview" : "About"}
                    </h4>
                    <p className="text-white/70 leading-relaxed text-sm bg-white/[0.02] p-4 rounded-2xl border border-white/[0.04] whitespace-pre-wrap">
                      {profileViewerData.bio || profileViewerData.description}
                    </p>
                  </div>
                )}

                {profileViewerData.companyDescription && profileViewerData.companyDescription !== profileViewerData.bio && (
                  <div>
                    <h4 className="text-sm font-bold text-white mb-3 uppercase tracking-widest text-[#f5c518]">Company Description</h4>
                    <p className="text-white/70 leading-relaxed text-sm bg-white/[0.02] p-4 rounded-2xl border border-white/[0.04] whitespace-pre-wrap">
                      {profileViewerData.companyDescription}
                    </p>
                  </div>
                )}

                {Array.isArray(profileViewerData.skills) && profileViewerData.skills.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-white mb-3 uppercase tracking-widest text-[#f5c518]">
                      {profileViewerData.userType === "client" ? "Focus Areas" : "Expertise"}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {profileViewerData.skills.map((skill: string, idx: number) => (
                        <span key={idx} className="px-3 py-1.5 rounded-full bg-white/5 text-white/80 text-sm border border-white/10 shadow-sm">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(profileViewerData.workExperience) && profileViewerData.workExperience.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-white mb-3 uppercase tracking-widest text-[#f5c518]">
                      {profileViewerData.userType === "client" ? "Work / Business Details" : "Work Experience"}
                    </h4>
                    <div className="space-y-3">
                      {profileViewerData.workExperience.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                          <p className="text-sm font-semibold text-white">
                            {typeof item === "string" ? item : item?.title || item?.role || item?.company || `Experience ${idx + 1}`}
                          </p>
                          {(item?.company || item?.organization) && typeof item !== "string" && (
                            <p className="text-xs text-[#f5c518] mt-1">{item.company || item.organization}</p>
                          )}
                          {(item?.description || item?.summary) && typeof item !== "string" && (
                            <p className="text-xs text-white/55 mt-2 whitespace-pre-wrap">{item.description || item.summary}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(profileViewerData.portfolio) && profileViewerData.portfolio.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-bold text-white/40 mb-4 uppercase tracking-[0.2em]">
                      {profileViewerData.userType === "client" ? "Portfolio / Links" : "Portfolio & Previous Work"}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {profileViewerData.portfolio.map((item: any, idx: number) => (
                        <div key={idx} className="group relative rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#f5c518]/30 transition-all bg-white/[0.02]">
                          <div className="aspect-video bg-white/[0.05] flex items-center justify-center overflow-hidden">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                            ) : (
                              <ImageIcon className="w-8 h-8 text-white/15" />
                            )}
                          </div>
                          <div className="p-4">
                            <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                            {item.description && <p className="text-xs text-white/40 mt-1 line-clamp-3">{item.description}</p>}
                            {item.linkUrl && (
                              <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors">
                                <ExternalLink className="w-3 h-3" /> Open Link
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {profileViewerData.userType !== "client" && (!Array.isArray(profileViewerData.portfolio) || profileViewerData.portfolio.length === 0) && (
                  <div className="p-8 rounded-2xl border border-dashed border-white/5 text-center">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 text-white/10" />
                    <p className="text-xs text-white/20">No portfolio items available yet</p>
                  </div>
                )}
              </div>

              <div className={modalFooter + " flex justify-end gap-3"}>
                <button
                  onClick={() => setShowFullProfileModal(false)}
                  className="px-6 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-sm font-medium text-white/80"
                >
                  Close
                </button>
                <button
                  onClick={() => { 
                    setShowFullProfileModal(false);
                    setShowMessages(true);
                    startChatWithFreelancer(profileViewerData);
                  }}
                  className="px-6 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-sm font-medium text-white/80 flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Message
                </button>
                    <button
                      onClick={() => {
                        if (profileViewerData.userType !== "client") {
                          setSelectedFreelancer(profileViewerData);
                          setFreelancerPortfolio(normalizePortfolioItems(profileViewerData.portfolio || profileViewerData.portfolioUrls || []));
                        }
                        setShowFullProfileModal(false);
                      }}
                      className="px-6 py-2.5 rounded-xl font-bold text-black transition-all hover:scale-105 shadow-xl shadow-[#f5c518]/20 text-sm flex items-center gap-2"
                      style={{ background: "linear-gradient(135deg, #f5c518, #c8960c)" }}
                    >
                      <User className="w-4 h-4" />
                      {profileViewerData.userType === "client" ? "Close Profile" : "Open Portfolio"}
                    </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProjectDetailsModal && selectedDetailsProject && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[400] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowProjectDetailsModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} transition={{ duration: 0.25 }} className={modalCard}>
              <div className={modalHeader}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20"><Briefcase className="w-4 h-4 text-[#22c55e]" /></div>
                  <h2 className="text-base font-bold text-white">Project Details</h2>
                </div>
                <button onClick={() => setShowProjectDetailsModal(false)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><X className="w-4 h-4 text-white/50" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-xl font-black text-white mb-2">{selectedDetailsProject.title}</h3>
                  <div className="flex flex-wrap gap-2 text-xs text-white/50">
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[#f5c518] font-bold">
                      <DollarSign className="w-3.5 h-3.5" /> {selectedDetailsProject.budget}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                      <MapPin className="w-3.5 h-3.5" /> {selectedDetailsProject.projectLocation || selectedDetailsProject.location || "Remote"}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 uppercase font-black tracking-tighter">
                      {selectedDetailsProject.category}
                    </span>
                    {getProjectDateLabel(selectedDetailsProject) && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                        <Clock className="w-3.5 h-3.5" /> {getProjectDateLabel(selectedDetailsProject)?.label}: {getProjectDateLabel(selectedDetailsProject)?.value}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                  {selectedDetailsProject.description}
                </div>

                {selectedDetailsProject.skills && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Required Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(selectedDetailsProject.skills) ? selectedDetailsProject.skills : JSON.parse(selectedDetailsProject.skills || "[]")).map((s: string, i: number) => (
                        <span key={i} className="px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/60">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-white/[0.06]">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-4">Client Information</h4>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                    <Avatar className="w-12 h-12 border border-white/10">
                      <AvatarImage src={selectedDetailsProject.clientImage} />
                      <AvatarFallback className="bg-white/10">{selectedDetailsProject.authorName?.[0] || "C"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-bold text-white">{selectedDetailsProject.authorName || "Verified Client"}</p>
                      <p className="text-xs text-white/40">{selectedDetailsProject.projectLocation || selectedDetailsProject.location || "Member since 2026"}</p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                      <button 
                        onClick={() => { setShowProjectDetailsModal(false); openProfileViewer({ userId: selectedDetailsProject.userId, name: selectedDetailsProject.authorName, image: selectedDetailsProject.clientImage, userType: "client", location: selectedDetailsProject.projectLocation || selectedDetailsProject.location || null }); }}
                        className="px-4 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 border border-white/10"
                      >
                        <User className="w-3.5 h-3.5" /> View Profile
                      </button>
                      <button 
                        onClick={() => { setShowProjectDetailsModal(false); startChatWithFreelancer({ userId: selectedDetailsProject.userId, displayName: selectedDetailsProject.authorName, image: selectedDetailsProject.clientImage, userType: "client", location: selectedDetailsProject.projectLocation || selectedDetailsProject.location || null }); setShowMessages(true); }}
                        className="px-4 h-9 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Message Client
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className={modalFooter}>
                <button 
                  onClick={() => {
                    setShowProjectDetailsModal(false);
                    openContractForProject(selectedDetailsProject);
                  }}
                  className="w-full h-12 rounded-xl bg-white text-black font-bold text-sm hover:scale-[1.02] transition-all shadow-xl shadow-white/5"
                >
                  Send Contract
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CLIENT ESCROW PAYMENT MODAL ── */}
      <AnimatePresence>
        {showEscrowModal && escrowContract && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={() => { setShowEscrowModal(false); setShowAddPaymentMethod(false); }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.3 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.1] bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] shadow-2xl shadow-black/50">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur-xl px-6 py-5 border-b border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20">
                      <Shield className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Escrow Payment</h2>
                      <p className="text-[11px] text-white/40">Secure payment for contract acceptance</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowEscrowModal(false); setShowAddPaymentMethod(false); }} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Contract Summary */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-3">Contract Details</p>
                  <h3 className="text-sm font-bold text-white mb-1">{escrowContract.title}</h3>
                  {escrowContract.description && <p className="text-xs text-white/50 mb-3 line-clamp-2">{escrowContract.description}</p>}
                  {escrowContract.timeline && <p className="text-[11px] text-white/40"><span className="text-white/60 font-medium">Timeline:</span> {escrowContract.timeline}</p>}
                </div>

                {/* Payment Breakdown */}
                <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-600/[0.04] border border-emerald-500/15 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/60 mb-4">Payment Breakdown</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/70">Contract Amount</span>
                      <span className="text-sm font-bold text-white">£{Number(escrowContract.amount).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/70">Platform Fee (10%)</span>
                      <span className="text-sm font-bold text-[#f5c518]">+ £{(Number(escrowContract.amount) * 0.1).toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-white/10" />
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-white">Total</span>
                      <span className="text-xl font-black text-emerald-400">£{(Number(escrowContract.amount) * 1.1).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Escrow Info */}
                <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/15 p-4 flex items-start gap-3">
                  <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-300 mb-1">Secure Escrow Protection</p>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Your payment will be held in secure escrow until the freelancer completes the work and you release the funds. The freelancer will receive £{Number(escrowContract.amount).toFixed(2)}.
                    </p>
                  </div>
                </div>

                {/* Payment Method Selection */}
                <StripeEscrowPaymentForm
                  savedMethods={savedPaymentMethods}
                  onPaymentMethodSelect={setSelectedPaymentMethod}
                  selectedPaymentMethod={selectedPaymentMethod}
                  amount={Number(escrowContract.amount)}
                  contractId={escrowContract.contractId}
                  freelancerId={activeConversation?.partnerId || ""}
                  onSuccess={async () => {
                    setShowEscrowModal(false);
                    setEscrowContract(null);
                    setEscrowMsg(null);
                    if (activeConversation && escrowContract) {
                      try {
                        // Send escrow funded notification message
                        const responsePayload = {
                          type: "contract_response",
                          contractId: escrowContract.contractId,
                          action: "escrow_funded",
                          actedAt: new Date().toISOString(),
                          actorName: session?.user?.name || "User",
                        };
                        const msgRes = await fetch("/api/community/messages", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            receiverId: activeConversation.partnerId,
                            message: `[CONTRACT_RESPONSE]${JSON.stringify(responsePayload)}`,
                          }),
                        });
                        const msgData = await msgRes.json().catch(() => null);
                        if (msgData?.message) {
                          setChatMessages((prev) => mergeMessages(prev, [normalizeMessageForUi(msgData.message)]));
                        }
                        setChatEscrowMap((prev) => ({ ...prev, [escrowContract.contractId]: "escrow_funded" }));
                        fetchMessagesForConversation(activeConversation.partnerId, { silent: true });
                        fetchConversations();
                        fetchManagedContracts();
                      } catch {}
                    }
                  }}
                  onCancel={() => {
                    setShowEscrowModal(false);
                    setShowAddPaymentMethod(false);
                  }}
                />

                {/* Cancellation Policy Warning */}
                <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/15 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-xs font-bold text-amber-300">Cancellation Policy</p>
                  </div>
                  <div className="text-[11px] text-white/50 leading-relaxed space-y-1.5 pl-6">
                    <p>• You can cancel within <strong className="text-white/70">12 hours</strong> for a full refund with no penalties.</p>
                    <p>• After 12 hours: The <strong className="text-amber-300">10% platform fee</strong> will be charged and kept.</p>
                    <p>• <strong className="text-red-400">2nd late cancellation:</strong> Double platform fee (20% of contract amount) charged + <strong className="text-red-400">permanent ban</strong> from the community.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FREELANCER ACCEPT CONTRACT INFO MODAL ── */}
      <AnimatePresence>
        {showFreelancerAcceptModal && escrowContract && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={() => setShowFreelancerAcceptModal(false)}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.3 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.1] bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] shadow-2xl shadow-black/50">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur-xl px-6 py-5 border-b border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20">
                      <FileSignature className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Accept Contract</h2>
                      <p className="text-[11px] text-white/40">Review contract details before accepting</p>
                    </div>
                  </div>
                  <button onClick={() => setShowFreelancerAcceptModal(false)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Contract Summary */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-3">Contract Details</p>
                  <h3 className="text-sm font-bold text-white mb-1">{escrowContract.title}</h3>
                  {escrowContract.description && <p className="text-xs text-white/50 mb-3 line-clamp-3">{escrowContract.description}</p>}
                  {escrowContract.timeline && <p className="text-[11px] text-white/40 mb-1"><span className="text-white/60 font-medium">Timeline:</span> {escrowContract.timeline}</p>}
                  {escrowContract.milestones && <p className="text-[11px] text-white/40"><span className="text-white/60 font-medium">Milestones:</span> {escrowContract.milestones}</p>}
                </div>

                {/* Payment Info for Freelancer */}
                <div className="rounded-2xl bg-gradient-to-br from-blue-500/[0.08] to-indigo-500/[0.04] border border-blue-500/15 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400/60 mb-4">Your Earnings</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">You will receive</span>
                    <span className="text-2xl font-black text-emerald-400">£{Number(escrowContract.amount).toFixed(2)}</span>
                  </div>
                </div>

                {/* Escrow Info */}
                <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/15 p-4 flex items-start gap-3">
                  <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-300 mb-1">Escrow Protection</p>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      The client&apos;s payment will be held in secure escrow until you complete the work. Once the client releases the funds, £{Number(escrowContract.amount).toFixed(2)} will be added to your balance.
                    </p>
                  </div>
                </div>

                {/* Cancellation Policy Warning */}
                <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/15 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-xs font-bold text-amber-300">Cancellation Policy</p>
                  </div>
                  <div className="text-[11px] text-white/50 leading-relaxed space-y-1.5 pl-6">
                    <p>• You can cancel within <strong className="text-white/70">12 hours</strong> with no penalties.</p>
                    <p>• After 12 hours: The <strong className="text-amber-300">10% platform fee</strong> will be deducted from your next contract earnings.</p>
                    <p>• <strong className="text-red-400">2nd late cancellation:</strong> You will be <strong className="text-red-400">permanently banned</strong> from the community.</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowFreelancerAcceptModal(false)}
                    className="flex-1 h-12 rounded-xl border border-white/[0.1] text-white/60 text-sm font-semibold hover:bg-white/[0.05] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFreelancerAcceptContract}
                    disabled={escrowProcessing}
                    className="flex-[2] h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold text-sm hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                  >
                    {escrowProcessing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Accepting...</>
                    ) : (
                      <><Check className="w-4 h-4" /> Accept Contract</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CLIENT RELEASE PAYMENT MODAL ── */}
      <AnimatePresence>
        {showReleasePaymentModal && releaseContractData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={() => { setShowReleasePaymentModal(false); setReleaseContractData(null); }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.3 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.1] bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] shadow-2xl shadow-black/50">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur-xl px-6 py-5 border-b border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20">
                      <Banknote className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Release Payment</h2>
                      <p className="text-[11px] text-white/40">Confirm payment to release funds to freelancer</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowReleasePaymentModal(false); setReleaseContractData(null); }} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Contract Summary */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-3">Contract Details</p>
                  <h3 className="text-sm font-bold text-white mb-1">{releaseContractData.title || "Contract"}</h3>
                  {releaseContractData.description && <p className="text-xs text-white/50 mb-3 line-clamp-2">{releaseContractData.description}</p>}
                  <p className="text-[11px] text-white/40">Freelancer: <span className="text-white/60 font-medium">{releaseContractData.partnerName || "Freelancer"}</span></p>
                </div>

                {/* Payment Summary */}
                <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-600/[0.04] border border-emerald-500/15 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/60 mb-4">Payment Summary</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/70">Contract Amount</span>
                      <span className="text-sm font-bold text-white">£{Number(releaseContractData.amount).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/70">Platform Fee (10%)</span>
                      <span className="text-sm font-bold text-[#f5c518]">£{(Number(releaseContractData.amount) * 0.1).toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-white/10" />
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-white">Total You Paid</span>
                      <span className="text-xl font-black text-emerald-400">£{(Number(releaseContractData.amount) * 1.1).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-dashed border-white/10">
                      <span className="text-sm text-white/70">Freelancer Receives</span>
                      <span className="text-lg font-black text-blue-400">£{Number(releaseContractData.amount).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* How it works */}
                <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/15 p-4 flex items-start gap-3">
                  <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-300 mb-1">How It Works</p>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      You already paid <strong className="text-white/70">£{(Number(releaseContractData.amount) * 1.1).toFixed(2)}</strong> when funding the escrow (contract amount + 10% platform fee). 
                      Clicking release will move <strong className="text-blue-300">£{Number(releaseContractData.amount).toFixed(2)}</strong> to the freelancer&apos;s pending balance. 
                      Funds will become available for withdrawal after Stripe settlement (up to 7 days). The platform fee was already collected.
                    </p>
                  </div>
                </div>

                {/* Release Confirmation */}
                <ReleaseConfirmForm
                  contract={releaseContractData}
                  onRelease={() => handleReleaseMoney(releaseContractData)}
                  onCancel={() => { setShowReleasePaymentModal(false); setReleaseContractData(null); }}
                  isReleasing={releasingContractId === releaseContractData.contractId}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DELIVERABLE SUBMISSION MODAL ── */}
      <AnimatePresence>
        {showDeliverableModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={() => { setShowDeliverableModal(false); setDeliverableForm({ message: "", attachments: [] }); }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.3 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.1] bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] shadow-2xl shadow-black/50">
              <div className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur-xl px-6 py-5 border-b border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20">
                      <Package className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">{hasPendingDeliverable(contractId) ? "Resubmit Deliverable" : "Submit Deliverable"}</h2>
                      <p className="text-[11px] text-white/40">Attach your completed work and add notes</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowDeliverableModal(false); setDeliverableForm({ message: "", attachments: [] }); }} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Message textarea */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 block">Notes</label>
                  <textarea
                    value={deliverableForm.message}
                    onChange={(e) => setDeliverableForm((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Describe what you're submitting..."
                    className="w-full h-28 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/20 p-3 focus:outline-none focus:border-blue-500/30 focus:bg-white/[0.05] transition-all resize-none"
                  />
                </div>

                {/* File drop zone */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 block">Attachments</label>
                  <div
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "*/*";
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = Array.from((e.target as HTMLInputElement).files || []);
                        const valid = files.filter((f) => {
                          if (f.size > 50 * 1024 * 1024) {
                            toast.error(`${f.name} is too large (max 50MB)`);
                            return false;
                          }
                          return true;
                        });
                        setDeliverableForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...valid] }));
                      };
                      input.click();
                    }}
                    className="w-full h-24 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-all"
                  >
                    <Upload className="w-6 h-6 text-white/30" />
                    <p className="text-xs text-white/40">Click to upload files</p>
                  </div>
                </div>

                {/* Attachment list */}
                {deliverableForm.attachments.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {deliverableForm.attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white/70">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-white/40 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                        </div>
                        <button
                          onClick={() => setDeliverableForm((prev) => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }))}
                          className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowDeliverableModal(false); setDeliverableForm({ message: "", attachments: [] }); }}
                    className="flex-1 h-11 rounded-xl border border-white/[0.08] text-white/70 text-sm font-medium hover:bg-white/[0.05] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const contractOffer = chatMessages.map((m: any) => parseContractOfferMessage(m.message)).find((c: any) => c?.contractId);
                      const contractId = contractOffer?.contractId || `contract_${Date.now()}`;
                      submitDeliverable(contractId, deliverableForm.message, deliverableForm.attachments);
                    }}
                    disabled={submittingDeliverable}
                    className="flex-1 h-11 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {submittingDeliverable ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : "Submit Deliverable"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── REVISION REQUEST MODAL ── */}
      <AnimatePresence>
        {showRevisionModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={() => { setShowRevisionModal(false); setRevisionForm({ message: "", attachments: [], parentDeliverableId: null }); }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.3 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.1] bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] shadow-2xl shadow-black/50">
              <div className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur-xl px-6 py-5 border-b border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20">
                      <RotateCcw className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Request Revision</h2>
                      <p className="text-[11px] text-white/40">Describe the changes needed</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowRevisionModal(false); setRevisionForm({ message: "", attachments: [], parentDeliverableId: null }); }} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 block">Revision Notes</label>
                  <textarea
                    value={revisionForm.message}
                    onChange={(e) => setRevisionForm((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Describe what needs to be changed..."
                    className="w-full h-28 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/20 p-3 focus:outline-none focus:border-blue-500/30 focus:bg-white/[0.05] transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 block">Attachments</label>
                  <div
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "*/*";
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = Array.from((e.target as HTMLInputElement).files || []);
                        const valid = files.filter((f) => {
                          if (f.size > 50 * 1024 * 1024) {
                            toast.error(`${f.name} is too large (max 50MB)`);
                            return false;
                          }
                          return true;
                        });
                        setRevisionForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...valid] }));
                      };
                      input.click();
                    }}
                    className="w-full h-24 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-all"
                  >
                    <Upload className="w-6 h-6 text-white/30" />
                    <p className="text-xs text-white/40">Click to upload files</p>
                  </div>
                </div>

                {revisionForm.attachments.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {revisionForm.attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white/70">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-white/40 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                        </div>
                        <button
                          onClick={() => setRevisionForm((prev) => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }))}
                          className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowRevisionModal(false); setRevisionForm({ message: "", attachments: [], parentDeliverableId: null }); }}
                    className="flex-1 h-11 rounded-xl border border-white/[0.08] text-white/70 text-sm font-medium hover:bg-white/[0.05] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const contractOffer = chatMessages.map((m: any) => parseContractOfferMessage(m.message)).find((c: any) => c?.contractId);
                      const contractId = contractOffer?.contractId || `contract_${Date.now()}`;
                      submitRevisionRequest(contractId, revisionForm.message, revisionForm.attachments, revisionForm.parentDeliverableId);
                    }}
                    disabled={submittingRevision}
                    className="flex-1 h-11 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {submittingRevision ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Send Request"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DISPUTE MODAL ── */}
      <AnimatePresence>
        {showDisputeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={() => { setShowDisputeModal(false); setDisputeForm({ title: "", description: "", attachments: [] }); }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.3 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.1] bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] shadow-2xl shadow-black/50">
              <div className="sticky top-0 z-10 bg-[#0f0f0f]/95 backdrop-blur-xl px-6 py-5 border-b border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-red-500/10 border border-amber-500/20">
                      <ShieldAlert className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Raise Dispute</h2>
                      <p className="text-[11px] text-white/40">Describe the issue with this contract</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowDisputeModal(false); setDisputeForm({ title: "", description: "", attachments: [] }); }} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Info banner */}
                <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-amber-500/[0.08] border border-amber-500/15">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <p className="text-xs text-amber-300/90">HireMindX will review the dispute within 24 hours.</p>
                </div>

                {/* Valid disputes */}
                <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-3">
                  {userType === "freelancer" ? (
                    <>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-2">Valid disputes for freelancers</p>
                      <ul className="text-xs text-white/60 space-y-1.5">
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> No client response</li>
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> No approval even after 72 hours</li>
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> No client response after 72+ hours</li>
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Client requesting work outside agreed contract scope</li>
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Payment not being released even after deliverables are accepted</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-2">Valid disputes for clients</p>
                      <ul className="text-xs text-white/60 space-y-1.5">
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Work never delivered</li>
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Work does not match agreement</li>
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Mismatch from agreed scope</li>
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Broken or unusable files</li>
                        <li className="flex items-start gap-2"><Check className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /> Proven fraud or misrepresentation</li>
                      </ul>
                    </>
                  )}
                </div>

                {/* Invalid disputes */}
                <div className="rounded-xl bg-red-500/[0.04] border border-red-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-red-400/50 mb-2">Invalid disputes</p>
                  <ul className="text-xs text-white/40 space-y-1">
                    <li className="flex items-start gap-2"><X className="w-3 h-3 text-red-400/60 shrink-0 mt-0.5" /> Changing mind</li>
                    <li className="flex items-start gap-2"><X className="w-3 h-3 text-red-400/60 shrink-0 mt-0.5" /> Finding someone cheaper</li>
                    <li className="flex items-start gap-2"><X className="w-3 h-3 text-red-400/60 shrink-0 mt-0.5" /> Subjective preference complaints</li>
                  </ul>
                </div>

                {/* Title input */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 block">Dispute Title</label>
                  <input
                    type="text"
                    value={disputeForm.title}
                    onChange={(e) => setDisputeForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Payment not released after approval"
                    className="w-full h-11 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/20 px-3 focus:outline-none focus:border-amber-500/30 focus:bg-white/[0.05] transition-all"
                  />
                </div>

                {/* Description textarea */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 block">Description</label>
                  <textarea
                    value={disputeForm.description}
                    onChange={(e) => setDisputeForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the issue in detail..."
                    className="w-full h-28 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/20 p-3 focus:outline-none focus:border-amber-500/30 focus:bg-white/[0.05] transition-all resize-none"
                  />
                </div>

                {/* File upload */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 block">Screenshots / Attachments</label>
                  <div
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "*/*";
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = Array.from((e.target as HTMLInputElement).files || []);
                        const valid = files.filter((f) => {
                          if (f.size > 50 * 1024 * 1024) {
                            toast.error(`${f.name} is too large (max 50MB)`);
                            return false;
                          }
                          return true;
                        });
                        setDisputeForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...valid] }));
                      };
                      input.click();
                    }}
                    className="w-full h-24 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-amber-500/30 hover:bg-amber-500/[0.03] transition-all"
                  >
                    <Upload className="w-6 h-6 text-white/30" />
                    <p className="text-xs text-white/40">Click to upload screenshots or files</p>
                  </div>
                </div>

                {/* Attachment list */}
                {disputeForm.attachments.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {disputeForm.attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-xs text-white/70">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="text-white/40 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                        </div>
                        <button
                          onClick={() => setDisputeForm((prev) => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }))}
                          className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowDisputeModal(false); setDisputeForm({ title: "", description: "", attachments: [] }); }}
                    className="flex-1 h-11 rounded-xl border border-white/[0.08] text-white/70 text-sm font-medium hover:bg-white/[0.05] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!disputeForm.title.trim()) {
                        toast.error("Please enter a dispute title");
                        return;
                      }
                      const contractOffer = chatMessages.map((m: any) => parseContractOfferMessage(m.message)).find((c: any) => c?.contractId);
                      const contractId = contractOffer?.contractId || `contract_${Date.now()}`;
                      submitDispute(contractId, disputeForm.title, disputeForm.description, disputeForm.attachments);
                    }}
                    disabled={submittingDispute || !disputeForm.title.trim()}
                    className="flex-1 h-11 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-600 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {submittingDispute ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : "Submit Dispute"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
