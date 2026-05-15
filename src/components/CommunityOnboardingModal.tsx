"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Upload,
  MapPin,
  Building2,
  CreditCard,
  FileText,
  Sparkles,
  CheckCircle2,
  X,
  Plus,
  Image as ImageIcon,
  Link as LinkIcon,
  DollarSign,
  Loader2,
  Search,
  Shield,
  Link,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import StripeCardSaveForm from "@/components/StripeCardSaveForm";

type UserType = "freelancer" | "client" | null;

// Location search hook using OpenStreetMap Nominatim (free, no API key)
function useLocationSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ display_name: string; place_id: number }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=0`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        setResults(data);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, []);

  return { query, setQuery, results, isSearching, showResults, setShowResults, search };
}

const PORTFOLIO_CATEGORIES = [
  "Web Development",
  "Mobile App",
  "UI/UX Design",
  "Logo & Branding",
  "Illustration",
  "Video Production",
  "Photography",
  "Content Writing",
  "Marketing",
  "Data Analysis",
  "Other",
];

interface PortfolioItem {
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  linkUrl: string;
}

interface CommunityOnboardingModalProps {
  isOpen: boolean;
  onComplete: (userType: "freelancer" | "client") => void;
  userId: string;
}

export function CommunityOnboardingModal({
  isOpen,
  onComplete,
  userId,
}: CommunityOnboardingModalProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [step, setStep] = useState<"select" | "profile" | "portfolio" | "payment" | "complete">("select");
  const [userType, setUserType] = useState<UserType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payoutSetupLoading, setPayoutSetupLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);

  // Location search for freelancer & client
  const freelancerLocation = useLocationSearch();
  const clientLocation = useLocationSearch();

  const [freelancerData, setFreelancerData] = useState({
    displayName: "",
    headline: "",
    location: "",
    skills: "",
    hourlyRate: "",
  });

  const [clientData, setClientData] = useState({
    displayName: "",
    companyName: "",
    companyDescription: "",
    location: "",
    industry: "",
    companySize: "",
    paymentMethods: [] as string[],
  });

  // Portfolio state
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [currentItem, setCurrentItem] = useState<PortfolioItem>({
    title: "",
    description: "",
    category: "",
    imageUrl: "",
    linkUrl: "",
  });
  const [isAddingItem, setIsAddingItem] = useState(true);

  const handleUserTypeSelect = (type: UserType) => {
    setUserType(type);
    setStep("profile");
  };

  const handleBack = () => {
    if (step === "payment") {
      setStep("portfolio");
    } else if (step === "portfolio") {
      setStep("profile");
    } else {
      setStep("select");
      setUserType(null);
    }
  };

  const handleProfileNext = () => {
    setStep("portfolio");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setCurrentItem((prev) => ({ ...prev, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const addPortfolioItem = () => {
    if (!currentItem.title || !currentItem.category) return;
    setPortfolioItems((prev) => [...prev, currentItem]);
    setCurrentItem({ title: "", description: "", category: "", imageUrl: "", linkUrl: "" });
    setIsAddingItem(false);
  };

  const removePortfolioItem = (index: number) => {
    setPortfolioItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (skipCompleteStep = false): Promise<boolean> => {
    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();
      let profileData: any = {
        userId,
        userType,
        createdAt: now,
        updatedAt: now,
        profileComplete: true,
      };

      if (userType === "freelancer") {
        profileData = {
          ...profileData,
          displayName: freelancerData.displayName,
          headline: freelancerData.headline,
          location: freelancerData.location,
          skills: freelancerData.skills.split(",").map((s) => s.trim()).filter(Boolean),
          hourlyRate: freelancerData.hourlyRate ? parseInt(freelancerData.hourlyRate) : null,
        };
      } else {
        profileData = {
          ...profileData,
          displayName: clientData.displayName,
          companyName: clientData.companyName,
          companyDescription: clientData.companyDescription,
          location: clientData.location,
          industry: clientData.industry,
          companySize: clientData.companySize,
          paymentMethods: clientData.paymentMethods,
        };
      }

      const response = await fetch("/api/community/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });

      // Save portfolio items if any
      if (response.ok && userType === "freelancer" && portfolioItems.length > 0) {
        await fetch("/api/community/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(portfolioItems),
        });
      }

      if (response.ok) {
        if (!skipCompleteStep) {
          setStep("complete");
          setTimeout(() => {
            onComplete(userType as "freelancer" | "client");
          }, 1500);
        }
        return true;
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data?.detail || data?.error || "Failed to save profile. Please try again.");
        return false;
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Something went wrong. Please try again.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePaymentMethod = (method: string) => {
    setClientData((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter((m) => m !== method)
        : [...prev.paymentMethods, method],
    }));
  };

  const isFreelancerValid = freelancerData.displayName && freelancerData.headline;
  const isClientValid = clientData.displayName && clientData.companyName;
  const isCurrentItemValid = currentItem.title && currentItem.category;

  const stepNumber = step === "select" ? 1 : step === "profile" ? 2 : step === "portfolio" ? 3 : step === "payment" ? 4 : 5;
  const totalSteps = userType === "freelancer" ? 5 : 3;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        showCloseButton={false}
        className={`p-0 border-0 overflow-hidden max-w-xl sm:max-w-2xl rounded-[2rem] ${
          isDark ? "bg-zinc-900/95 backdrop-blur-3xl" : "bg-white/95 backdrop-blur-3xl"
        }`}
      >
        {/* Progress indicator */}
        {step !== "complete" && (
          <div className="px-8 pt-6 sm:px-10 sm:pt-8">
            <div className="flex items-center gap-2">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i + 1 <= stepNumber
                      ? "bg-blue-500"
                      : isDark
                      ? "bg-white/10"
                      : "bg-zinc-200"
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs mt-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              Step {stepNumber} of {totalSteps}
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="p-8 sm:p-10 pt-4 sm:pt-6"
            >
              <div className="text-center mb-10">
                <div
                  className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 ${
                    isDark ? "bg-blue-500/10" : "bg-blue-50"
                  }`}
                >
                  <Sparkles className="w-8 h-8 text-blue-500" />
                </div>
                <h2
                  className={`text-2xl sm:text-3xl font-bold mb-3 ${
                    isDark ? "text-white" : "text-zinc-900"
                  }`}
                >
                  Welcome to the Community
                </h2>
                <p className={`text-base ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Let us know how you'd like to participate
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => handleUserTypeSelect("freelancer")}
                  className={`group relative p-6 rounded-2xl border-2 text-left transition-all duration-300 ${
                    isDark
                      ? "border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5"
                      : "border-zinc-200 hover:border-blue-500 hover:bg-blue-50/50"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                      isDark
                        ? "bg-white/5 group-hover:bg-blue-500/20"
                        : "bg-zinc-100 group-hover:bg-blue-100"
                    }`}
                  >
                    <Briefcase
                      className={`w-6 h-6 ${
                        isDark ? "text-zinc-400 group-hover:text-blue-400" : "text-zinc-600 group-hover:text-blue-600"
                      }`}
                    />
                  </div>
                  <h3
                    className={`text-lg font-semibold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}
                  >
                    I'm a Freelancer
                  </h3>
                  <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    Offer your skills and services to clients worldwide
                  </p>
                  <ArrowRight
                    className={`absolute top-6 right-6 w-5 h-5 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1 ${
                      isDark ? "text-blue-400" : "text-blue-600"
                    }`}
                  />
                </button>

                <button
                  onClick={() => handleUserTypeSelect("client")}
                  className={`group relative p-6 rounded-2xl border-2 text-left transition-all duration-300 ${
                    isDark
                      ? "border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5"
                      : "border-zinc-200 hover:border-purple-500 hover:bg-purple-50/50"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                      isDark
                        ? "bg-white/5 group-hover:bg-purple-500/20"
                        : "bg-zinc-100 group-hover:bg-purple-100"
                    }`}
                  >
                    <Building2
                      className={`w-6 h-6 ${
                        isDark ? "text-zinc-400 group-hover:text-purple-400" : "text-zinc-600 group-hover:text-purple-600"
                      }`}
                    />
                  </div>
                  <h3
                    className={`text-lg font-semibold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}
                  >
                    I'm a Client
                  </h3>
                  <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    Find talented professionals for your projects
                  </p>
                  <ArrowRight
                    className={`absolute top-6 right-6 w-5 h-5 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1 ${
                      isDark ? "text-purple-400" : "text-purple-600"
                    }`}
                  />
                </button>
              </div>
            </motion.div>
          )}

          {step === "profile" && userType === "freelancer" && (
            <motion.div
              key="freelancer-profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="p-8 sm:p-10 pt-4 sm:pt-6"
            >
              <button
                onClick={handleBack}
                className={`flex items-center gap-2 text-sm mb-6 transition-colors ${
                  isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="mb-8">
                <h2
                  className={`text-2xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}
                >
                  Create Your Freelancer Profile
                </h2>
                <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Showcase your skills to attract clients
                </p>
              </div>

              <div className="space-y-5 max-h-[50vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      Display Name *
                    </Label>
                    <Input
                      placeholder="John Doe"
                      value={freelancerData.displayName}
                      onChange={(e) =>
                        setFreelancerData({ ...freelancerData, displayName: e.target.value })
                      }
                      className={`rounded-xl h-11 ${
                        isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                      }`}
                    />
                  </div>
                    <div>
                      <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        <MapPin className="w-3.5 h-3.5 inline mr-1" />
                        Location
                      </Label>
                      <div className="relative">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
                        <Input
                          placeholder="Search city or country..."
                          value={freelancerLocation.query || freelancerData.location}
                          onChange={(e) => {
                            freelancerLocation.search(e.target.value);
                            if (!e.target.value) setFreelancerData({ ...freelancerData, location: "" });
                          }}
                          onFocus={() => {
                            if (freelancerLocation.results.length > 0) freelancerLocation.setShowResults(true);
                          }}
                          className={`rounded-xl h-11 pl-9 ${
                            isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                          }`}
                        />
                        {freelancerLocation.isSearching && (
                          <Loader2 className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
                        )}
                        {freelancerLocation.showResults && freelancerLocation.results.length > 0 && (
                          <div className={`absolute z-50 top-full mt-1 w-full rounded-xl border shadow-xl overflow-hidden ${isDark ? "bg-zinc-800 border-white/10" : "bg-white border-zinc-200"}`}>
                            {freelancerLocation.results.map((r) => (
                              <button
                                key={r.place_id}
                                type="button"
                                onClick={() => {
                                  const short = r.display_name.split(",").slice(0, 3).join(",").trim();
                                  setFreelancerData({ ...freelancerData, location: short });
                                  freelancerLocation.setQuery(short);
                                  freelancerLocation.setShowResults(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${isDark ? "text-zinc-300 hover:bg-white/5" : "text-zinc-700 hover:bg-zinc-50"}`}
                              >
                                <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="truncate">{r.display_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                </div>

                <div>
                  <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    Professional Headline *
                  </Label>
                  <Input
                    placeholder="Full-Stack Developer | React & Node.js Expert"
                    value={freelancerData.headline}
                    onChange={(e) =>
                      setFreelancerData({ ...freelancerData, headline: e.target.value })
                    }
                    className={`rounded-xl h-11 ${
                      isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      Skills (comma separated)
                    </Label>
                    <Input
                      placeholder="React, TypeScript, Node.js"
                      value={freelancerData.skills}
                      onChange={(e) =>
                        setFreelancerData({ ...freelancerData, skills: e.target.value })
                      }
                      className={`rounded-xl h-11 ${
                        isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                      }`}
                    />
                  </div>
                  <div>
                    <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      Hourly Rate ($)
                    </Label>
                    <Input
                      type="number"
                      placeholder="50"
                      value={freelancerData.hourlyRate}
                      onChange={(e) =>
                        setFreelancerData({ ...freelancerData, hourlyRate: e.target.value })
                      }
                      className={`rounded-xl h-11 ${
                        isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <Button
                  onClick={handleProfileNext}
                  disabled={!isFreelancerValid}
                  className="rounded-xl px-8 h-12 bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                >
                  Next: Portfolio
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === "portfolio" && userType === "freelancer" && (
            <motion.div
              key="freelancer-portfolio"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="p-8 sm:p-10 pt-4 sm:pt-6"
            >
              <button
                onClick={handleBack}
                className={`flex items-center gap-2 text-sm mb-6 transition-colors ${
                  isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="mb-6">
                <h2
                  className={`text-2xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}
                >
                  Showcase Your Work
                </h2>
                <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Add your best projects to attract clients. You can always add more later.
                </p>
              </div>

              <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-4">
                {/* Existing portfolio items */}
                {portfolioItems.map((item, index) => (
                  <div
                    key={index}
                    className={`relative rounded-xl border p-4 ${
                      isDark ? "border-white/10 bg-white/5" : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <button
                      onClick={() => removePortfolioItem(index)}
                      className={`absolute top-3 right-3 p-1 rounded-lg transition-colors ${
                        isDark ? "hover:bg-white/10 text-zinc-400" : "hover:bg-zinc-200 text-zinc-500"
                      }`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex gap-4 pr-8">
                      {item.imageUrl && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-semibold break-words pr-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
                          {item.title}
                        </h4>
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${
                            isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {item.category}
                        </span>
                        {item.description && (
                          <p className={`text-xs mt-1 line-clamp-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                            {item.description}
                          </p>
                        )}
                        {item.linkUrl && (
                          <div className="text-xs text-blue-500 mt-1 flex items-start gap-1 min-w-0">
                            <LinkIcon className="w-3 h-3 mt-0.5 shrink-0" />
                            <span className="break-all">
                              {item.linkUrl}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add new item form */}
                {isAddingItem ? (
                  <div
                    className={`rounded-xl border-2 border-dashed p-5 space-y-4 ${
                      isDark ? "border-white/15 bg-white/5" : "border-zinc-300 bg-zinc-50/50"
                    }`}
                  >
                    <div>
                      <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        Project Title *
                      </Label>
                      <Input
                        placeholder="E-commerce Website Redesign"
                        value={currentItem.title}
                        onChange={(e) =>
                          setCurrentItem({ ...currentItem, title: e.target.value })
                        }
                        className={`rounded-xl h-11 ${
                          isDark ? "bg-white/5 border-white/10" : "bg-white border-zinc-200"
                        }`}
                      />
                    </div>

                    <div>
                      <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        Category *
                      </Label>
                      <select
                        value={currentItem.category}
                        onChange={(e) =>
                          setCurrentItem({ ...currentItem, category: e.target.value })
                        }
                        className={`w-full rounded-xl h-11 px-3 text-sm border transition-colors ${
                          isDark
                            ? "bg-white/5 border-white/10 text-white"
                            : "bg-white border-zinc-200 text-zinc-900"
                        }`}
                      >
                        <option value="">Select a category</option>
                        {PORTFOLIO_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        Description
                      </Label>
                      <Textarea
                        placeholder="Briefly describe this project..."
                        value={currentItem.description}
                        onChange={(e) =>
                          setCurrentItem({ ...currentItem, description: e.target.value })
                        }
                        className={`rounded-xl min-h-[70px] resize-none ${
                          isDark ? "bg-white/5 border-white/10" : "bg-white border-zinc-200"
                        }`}
                      />
                    </div>

                    <div>
                      <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                        Project Image
                      </Label>
                      {currentItem.imageUrl ? (
                        <div className="relative w-full h-40 rounded-xl overflow-hidden">
                          <img
                            src={currentItem.imageUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => setCurrentItem({ ...currentItem, imageUrl: "" })}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${
                            isDark
                              ? "border-white/10 hover:border-white/20 bg-white/5"
                              : "border-zinc-200 hover:border-zinc-300 bg-white"
                          }`}
                        >
                          <Upload className={`w-6 h-6 mx-auto mb-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
                          <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                            Click to upload an image (max 5MB)
                          </p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </div>

                    <div>
                      <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        <LinkIcon className="w-3.5 h-3.5 inline mr-1" />
                        Project Link (optional)
                      </Label>
                      <Input
                        placeholder="https://example.com/project"
                        value={currentItem.linkUrl}
                        onChange={(e) =>
                          setCurrentItem({ ...currentItem, linkUrl: e.target.value })
                        }
                        className={`rounded-xl h-11 ${
                          isDark ? "bg-white/5 border-white/10" : "bg-white border-zinc-200"
                        }`}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={addPortfolioItem}
                        disabled={!isCurrentItemValid}
                        className="rounded-xl h-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add to Portfolio
                      </Button>
                      {portfolioItems.length > 0 && (
                        <Button
                          variant="ghost"
                          onClick={() => setIsAddingItem(false)}
                          className={`rounded-xl h-10 text-sm ${
                            isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                          }`}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAddingItem(true)}
                    className={`w-full rounded-xl border-2 border-dashed p-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                      isDark
                        ? "border-white/10 text-zinc-400 hover:border-white/20 hover:text-white"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    Add Another Work
                  </button>
                )}
              </div>

              <div className="mt-8 flex items-center justify-end">
                <Button
                  onClick={() => setStep("payment")}
                  className="rounded-xl px-8 h-12 bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                >
                  Next: Add Payment Method
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === "payment" && userType === "freelancer" && (
            <motion.div
              key="freelancer-payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="p-8 sm:p-10 pt-4 sm:pt-6"
            >
              <button
                onClick={handleBack}
                className={`flex items-center gap-2 text-sm mb-6 transition-colors ${
                  isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="mb-8">
                <div
                  className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 ${
                    isDark ? "bg-emerald-500/10" : "bg-emerald-50"
                  }`}
                >
                  <CreditCard className="w-7 h-7 text-emerald-500" />
                </div>
                <h2
                  className={`text-2xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}
                >
                  Add Your Debit or Credit Card
                </h2>
                <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Add a debit or credit card to receive payments from clients. This is required — you cannot accept contracts without a card on file.
                </p>
              </div>

              <div className="space-y-4">
                <StripeCardSaveForm
                  onSuccess={async (paymentMethodId: string) => {
                    // Profile must be saved first
                    const ok = await handleSubmit(true);
                    if (ok) {
                      setStep("complete");
                      setTimeout(() => onComplete("freelancer"), 1500);
                    }
                  }}
                  onCancel={() => {
                    toast.error("A card is required to receive payments. You cannot skip this step.");
                  }}
                />

                <div
                  className={`rounded-xl p-4 flex items-start gap-3 ${
                    isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"
                  }`}
                >
                  <Shield className={`w-4 h-4 mt-0.5 shrink-0 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                  <div>
                    <p className={`text-xs font-bold mb-1 ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                      Secure & Required
                    </p>
                    <p className={`text-[11px] leading-relaxed ${isDark ? "text-white/50" : "text-zinc-600"}`}>
                      Your card details are securely processed by Stripe. When a client releases payment, the money will be sent directly to your card. This step cannot be skipped.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "profile" && userType === "client" && (
            <motion.div
              key="client-profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="p-8 sm:p-10 pt-4 sm:pt-6"
            >
              <button
                onClick={handleBack}
                className={`flex items-center gap-2 text-sm mb-6 transition-colors ${
                  isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="mb-8">
                <h2
                  className={`text-2xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}
                >
                  Create Your Client Profile
                </h2>
                <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Set up your company to start hiring talent
                </p>
              </div>

              <div className="space-y-5 max-h-[50vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      Your Name *
                    </Label>
                    <Input
                      placeholder="Jane Smith"
                      value={clientData.displayName}
                      onChange={(e) =>
                        setClientData({ ...clientData, displayName: e.target.value })
                      }
                      className={`rounded-xl h-11 ${
                        isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                      }`}
                    />
                  </div>
                  <div>
                    <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      <Building2 className="w-3.5 h-3.5 inline mr-1" />
                      Company Name *
                    </Label>
                    <Input
                      placeholder="Acme Inc."
                      value={clientData.companyName}
                      onChange={(e) =>
                        setClientData({ ...clientData, companyName: e.target.value })
                      }
                      className={`rounded-xl h-11 ${
                        isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    Company Description
                  </Label>
                  <Textarea
                    placeholder="Tell freelancers about your company and what you do..."
                    value={clientData.companyDescription}
                    onChange={(e) =>
                      setClientData({ ...clientData, companyDescription: e.target.value })
                    }
                    className={`rounded-xl min-h-[100px] resize-none ${
                      isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        <MapPin className="w-3.5 h-3.5 inline mr-1" />
                        Location
                      </Label>
                      <div className="relative">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
                        <Input
                          placeholder="Search city or country..."
                          value={clientLocation.query || clientData.location}
                          onChange={(e) => {
                            clientLocation.search(e.target.value);
                            if (!e.target.value) setClientData({ ...clientData, location: "" });
                          }}
                          onFocus={() => {
                            if (clientLocation.results.length > 0) clientLocation.setShowResults(true);
                          }}
                          className={`rounded-xl h-11 pl-9 ${
                            isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                          }`}
                        />
                        {clientLocation.isSearching && (
                          <Loader2 className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
                        )}
                        {clientLocation.showResults && clientLocation.results.length > 0 && (
                          <div className={`absolute z-50 top-full mt-1 w-full rounded-xl border shadow-xl overflow-hidden ${isDark ? "bg-zinc-800 border-white/10" : "bg-white border-zinc-200"}`}>
                            {clientLocation.results.map((r) => (
                              <button
                                key={r.place_id}
                                type="button"
                                onClick={() => {
                                  const short = r.display_name.split(",").slice(0, 3).join(",").trim();
                                  setClientData({ ...clientData, location: short });
                                  clientLocation.setQuery(short);
                                  clientLocation.setShowResults(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${isDark ? "text-zinc-300 hover:bg-white/5" : "text-zinc-700 hover:bg-zinc-50"}`}
                              >
                                <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="truncate">{r.display_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  <div>
                    <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      Industry
                    </Label>
                    <Input
                      placeholder="Technology"
                      value={clientData.industry}
                      onChange={(e) =>
                        setClientData({ ...clientData, industry: e.target.value })
                      }
                      className={`rounded-xl h-11 ${
                        isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    Company Size
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {["1-10", "11-50", "51-200", "201-500", "500+"].map((size) => (
                      <button
                        key={size}
                        onClick={() => setClientData({ ...clientData, companySize: size })}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          clientData.companySize === size
                            ? "bg-blue-600 text-white"
                            : isDark
                            ? "bg-white/5 text-zinc-400 hover:bg-white/10"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className={`text-sm mb-2 block ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    <CreditCard className="w-3.5 h-3.5 inline mr-1" />
                    Preferred Payment Methods
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {["Bank Transfer", "PayPal", "Stripe", "Crypto", "Escrow"].map((method) => (
                      <button
                        key={method}
                        onClick={() => togglePaymentMethod(method)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          clientData.paymentMethods.includes(method)
                            ? "bg-purple-600 text-white"
                            : isDark
                            ? "bg-white/5 text-zinc-400 hover:bg-white/10"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <Button
                  onClick={() => handleSubmit()}
                  disabled={!isClientValid || isSubmitting}
                  className="rounded-xl px-8 h-12 bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Complete Profile"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === "complete" && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="p-10 text-center"
            >
              <div
                className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${
                  isDark ? "bg-green-500/10" : "bg-green-50"
                }`}
              >
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h2 className={`text-2xl font-bold mb-3 ${isDark ? "text-white" : "text-zinc-900"}`}>
                You're All Set!
              </h2>
              <p className={`text-base ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                Welcome to the community. Let's explore!
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
