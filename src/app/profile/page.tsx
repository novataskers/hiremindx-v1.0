"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { resetOnboarding } from "@/lib/onboarding";
import { HeroBackground } from "@/components/HeroBackground";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  User,
  MapPin,
  Briefcase,
  DollarSign,
  Clock,
  Globe,
  Save,
  Loader2,
  Building2,
  GraduationCap,
  Trash2,
  AlertTriangle,
  X,
  Plus,
  Upload,
  Image as ImageIcon,
  Link as LinkIcon,
  Package,
  Pencil,
  Wallet,
  CreditCard,
  Banknote,
  ArrowDownToLine,
  BadgePoundSterling,
  Shield,
  History,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import StripeCardSaveForm from "@/components/StripeCardSaveForm";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth-client";

interface CommunityProfile {
  id: number;
  userId: string;
  userType: "freelancer" | "client";
  displayName: string;
  bio: string | null;
  headline: string | null;
  location: string | null;
  website: string | null;
  skills: string[] | null;
  hourlyRate: number | null;
  pricingText: string | null;
  availability: string | null;
  companyName: string | null;
  companyDescription: string | null;
  companySize: string | null;
  industry: string | null;
  profileComplete: boolean;
}

interface PortfolioItem {
  id: number;
  title: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  linkUrl: string | null;
}

interface OfferItem {
  id: number;
  title: string;
  description: string | null;
  category: string;
  price: number;
  deliveryDays: number;
  imageUrl: string | null;
  tags: string[] | null;
  status: string;
}

const PORTFOLIO_CATEGORIES = [
  "Web Development", "Mobile App", "UI/UX Design", "Logo & Branding",
  "Illustration", "Video Production", "Photography", "Content Writing",
  "Marketing", "Data Analysis", "Other",
];

const OFFER_CATEGORIES = [
  { value: "tech", label: "Technology & Programming" },
  { value: "design", label: "Design & Creative" },
  { value: "writing", label: "Writing & Translation" },
  { value: "marketing", label: "Digital Marketing" },
  { value: "video", label: "Video & Photo" },
  { value: "business", label: "Business & Support" },
];

const inp = "w-full h-12 px-4 rounded-xl text-sm bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-white/20 transition-all";
const selectCls = `w-full h-12 px-4 rounded-xl text-sm bg-white/[0.05] border border-white/[0.08] text-white focus:outline-none focus:ring-2 focus:ring-white/10`;
const textareaCls = "w-full px-4 py-3 rounded-xl resize-none text-sm bg-white/[0.05] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-white/20 transition-all";
const card = "rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-7 mb-5";
const sectionLabel = "text-xs font-bold uppercase tracking-[0.2em] text-white/30 mb-1";

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const profilePicInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [availability, setAvailability] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [industry, setIndustry] = useState("");
  const [skills, setSkills] = useState("");
  const [pricingText, setPricingText] = useState("");

  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [newItem, setNewItem] = useState({ title: "", description: "", category: "", imageUrl: "", linkUrl: "" });
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const portfolioFileInputRef = useRef<HTMLInputElement>(null);

  const [myOffers, setMyOffers] = useState<OfferItem[]>([]);
  const [showAddOffer, setShowAddOffer] = useState(false);
  const [newOffer, setNewOffer] = useState({ title: "", description: "", category: "", price: "", deliveryDays: "", tags: "" });
  const [offerImageUrl, setOfferImageUrl] = useState("");
  const [savingOffer, setSavingOffer] = useState(false);
  const offerFileInputRef = useRef<HTMLInputElement>(null);

  // Financial state
  const [walletData, setWalletData] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("");
  const [processingWithdraw, setProcessingWithdraw] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPmType, setNewPmType] = useState("");
  const [newPmDetails, setNewPmDetails] = useState({ cardNumber: "", expiry: "", cvv: "", name: "", email: "", accountId: "" });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user?.id) { setLoading(false); return; }
      try {
        const response = await fetch("/api/community/profile");
        const data = await response.json();
        if (data.profile) {
          setProfile(data.profile);
          setDisplayName(data.profile.displayName || session.user.name || "");
          setHeadline(data.profile.headline || "");
          setBio(data.profile.bio || "");
          setLocation(data.profile.location || "");
          setWebsite(data.profile.website || "");
          setHourlyRate(data.profile.hourlyRate?.toString() || "");
          setPricingText(data.profile.pricingText || "");
          setAvailability(data.profile.availability || "");
          setCompanyName(data.profile.companyName || "");
          setCompanyDescription(data.profile.companyDescription || "");
          setCompanySize(data.profile.companySize || "");
          setIndustry(data.profile.industry || "");
          const parsedSkills = typeof data.profile.skills === "string" ? JSON.parse(data.profile.skills) : data.profile.skills;
          setSkills(parsedSkills?.join(", ") || "");
          if (data.profile.userType === "freelancer") {
            const portfolioRes = await fetch("/api/community/portfolio");
            const portfolioData = await portfolioRes.json();
            if (portfolioData.items) setPortfolioItems(portfolioData.items);
            const offersRes = await fetch(`/api/community/offers?userId=${session.user.id}`);
            const offersData = await offersRes.json();
            if (offersData.offers) setMyOffers(offersData.offers.map((o: any) => ({ ...o, tags: typeof o.tags === "string" ? JSON.parse(o.tags) : o.tags })));
          }
        } else {
          setDisplayName(session.user.name || "");
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };
    if (!isPending) fetchProfile();
  }, [session, isPending]);

  // Fetch financial data
  useEffect(() => {
    if (!session?.user?.id || !profile) return;
    const fetchFinancialData = async () => {
      setLoadingWallet(true);
      try {
        const [walletRes, pmRes] = await Promise.all([
          fetch("/api/community/wallet"),
          fetch("/api/community/payment-methods"),
        ]);
        const walletJson = await walletRes.json();
        const pmJson = await pmRes.json();
        if (walletJson.wallet) setWalletData(walletJson.wallet);
        if (walletJson.transactions) setTransactions(walletJson.transactions);
        if (pmJson.paymentMethods) setPaymentMethods(pmJson.paymentMethods);
      } catch (err) {
        console.error("Error fetching financial data:", err);
      } finally {
        setLoadingWallet(false);
      }
    };
    fetchFinancialData();
  }, [session?.user?.id, profile]);

  // Derive isFreelancer/isClient early so hooks can use them
  const isFreelancer = profile?.userType === "freelancer";
  const isClient = profile?.userType === "client";


  const handleWithdraw = async () => {
    if (!withdrawAmount || !withdrawMethod) { toast.error("Please fill all fields"); return; }

    // Check if the selected withdrawal method has a saved payment method
    const hasCard = paymentMethods.some((pm: any) => pm.type === "card" || pm.type === "debit_card" || pm.type === "credit_card");
    const hasPaypal = paymentMethods.some((pm: any) => pm.type === "paypal");

    if (withdrawMethod === "card" && !hasCard) {
      toast.error("No card on file. Please add a card first.");
      return;
    }
    if (withdrawMethod === "paypal" && !hasPaypal) {
      toast.error("No PayPal account on file. Please add PayPal first.");
      return;
    }

    setProcessingWithdraw(true);
    try {
      const res = await fetch("/api/community/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(withdrawAmount), withdrawalMethod: withdrawMethod }),
      });
      const data = await res.json();


      if (res.ok && data?.success) {
        toast.success("Withdrawal processed!");
        setShowWithdrawModal(false);
        setWithdrawAmount("");
        setWithdrawMethod("");
        // Refresh wallet
        const walletRes = await fetch("/api/community/wallet");
        const walletJson = await walletRes.json();
        if (walletJson.wallet) setWalletData(walletJson.wallet);
        if (walletJson.transactions) setTransactions(walletJson.transactions);
      } else {
        toast.error(data?.error || "Withdrawal failed");
      }
    } catch { toast.error("Withdrawal failed"); }
    finally { setProcessingWithdraw(false); }
  };


  const handleAddPm = async () => {
    if (!newPmType) { toast.error("Select a type"); return; }

    if (newPmType === "paypal") {
      if (!newPmDetails.email) { toast.error("Enter your PayPal email"); return; }
      const label = `PayPal - ${newPmDetails.email}`;
      try {
        const res = await fetch("/api/community/payment-methods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "paypal", label, email: newPmDetails.email, isDefault: paymentMethods.length === 0 }),
        });
        const data = await res.json();
        if (res.ok && data.paymentMethod) {
          setPaymentMethods((prev) => [...prev, data.paymentMethod]);
          setShowAddPayment(false);
          setNewPmType("");
          setNewPmDetails({ cardNumber: "", expiry: "", cvv: "", name: "", email: "", accountId: "" });
          toast.success("PayPal added successfully!");
        } else { toast.error(data?.error || "Failed"); }
      } catch { toast.error("Failed to add PayPal"); }
      return;
    }
  };

  const handleCardSaveSuccess = async (paymentMethodId: string) => {
    // The StripeCardSaveForm already saved the PaymentMethod to our DB via the stripe API route.
    // We just need to refresh the payment methods list.
    try {
      const res = await fetch("/api/community/payment-methods");
      const data = await res.json();
      if (data.paymentMethods) setPaymentMethods(data.paymentMethods);
    } catch {}
    setShowAddPayment(false);
    setNewPmType("");
  };

  const handleDeletePm = async (id: number) => {
    try {
      const res = await fetch(`/api/community/payment-methods?id=${id}`, { method: "DELETE" });
      if (res.ok) { setPaymentMethods((prev) => prev.filter((pm) => pm.id !== id)); toast.success("Removed"); }
    } catch { toast.error("Failed"); }
  };

  const handleSave = async () => {
    if (!session?.user?.id) return;
    setSaving(true);
    try {
      const response = await fetch("/api/community/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userType: profile?.userType || "freelancer",
          displayName, headline, bio, location, website,
          hourlyRate: hourlyRate ? parseInt(hourlyRate) : null,
          pricingText: pricingText || null, availability,
          companyName, companyDescription, companySize, industry,
          skills: skills.split(",").map(s => s.trim()).filter(Boolean),
          profileComplete: true,
        }),
      });
      if (response.ok) {
        toast.success("Profile updated");
        const data = await response.json();
        setProfile(data.profile);
      } else {
        toast.error("Failed to update profile");
      }
    } catch { toast.error("Failed to update profile"); }
    finally { setSaving(false); }
  };

  const handleAddPortfolioItem = async () => {
    if (!newItem.title || !newItem.category) return;
    setSavingPortfolio(true);
    try {
      const response = await fetch("/api/community/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newItem) });
      if (response.ok) {
        const data = await response.json();
        setPortfolioItems(prev => [...prev, data.items[0]]);
        setNewItem({ title: "", description: "", category: "", imageUrl: "", linkUrl: "" });
        setShowAddPortfolio(false);
        toast.success("Portfolio item added");
      }
    } catch { toast.error("Failed to add portfolio item"); }
    finally { setSavingPortfolio(false); }
  };

  const handleDeletePortfolioItem = async (itemId: number) => {
    try {
      const res = await fetch(`/api/community/portfolio?id=${itemId}`, { method: "DELETE" });
      if (res.ok) { setPortfolioItems(prev => prev.filter(i => i.id !== itemId)); toast.success("Removed"); }
    } catch { toast.error("Failed to delete"); }
  };

  const handlePortfolioImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const reader = new FileReader();
    reader.onloadend = () => setNewItem(prev => ({ ...prev, imageUrl: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleOfferImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const reader = new FileReader();
    reader.onloadend = () => setOfferImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAddOffer = async () => {
    if (!newOffer.title || !newOffer.category || !newOffer.price || !newOffer.deliveryDays) return;
    setSavingOffer(true);
    try {
      const res = await fetch("/api/community/offers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newOffer.title, description: newOffer.description, category: newOffer.category, price: parseInt(newOffer.price), deliveryDays: parseInt(newOffer.deliveryDays), imageUrl: offerImageUrl || null, tags: newOffer.tags ? newOffer.tags.split(",").map(t => t.trim()).filter(Boolean) : [] }),
      });
      if (res.ok) {
        const data = await res.json();
        const offer = data.offer;
        setMyOffers(prev => [{ ...offer, tags: typeof offer.tags === "string" ? JSON.parse(offer.tags) : offer.tags }, ...prev]);
        setNewOffer({ title: "", description: "", category: "", price: "", deliveryDays: "", tags: "" });
        setOfferImageUrl(""); setShowAddOffer(false);
        toast.success("Offer created!");
      } else { toast.error("Failed to create offer"); }
    } catch { toast.error("Failed to create offer"); }
    finally { setSavingOffer(false); }
  };

  const handleDeleteOffer = async (offerId: number) => {
    try {
      const res = await fetch(`/api/community/offers?id=${offerId}`, { method: "DELETE" });
      if (res.ok) { setMyOffers(prev => prev.filter(o => o.id !== offerId)); toast.success("Offer removed"); }
    } catch { toast.error("Failed to delete offer"); }
  };

  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        const { data, error } = await authClient.updateUser({ image: base64 });
        if (error) { toast.error(error.message || "Failed to update picture"); }
        else { 
            setProfileImage(base64); 
            toast.success("Profile picture updated!"); 
            setTimeout(() => window.location.reload(), 800);
        }
      } catch { toast.error("Failed to update picture"); }
      finally { setUploadingImage(false); if (profilePicInputRef.current) profilePicInputRef.current.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== "DELETE") { toast.error("Please type DELETE to confirm"); return; }
    setIsDeleting(true);
    try {
      const response = await fetch("/api/user/delete", { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Failed to delete account");
      toast.success("Account deleted successfully");
      resetOnboarding();
      localStorage.removeItem("bearer_token");
      localStorage.removeItem("hiremindx_tour_seen");
      await authClient.signOut();
      window.location.href = "/";
    } catch { toast.error("Failed to delete account. Please try again."); }
    finally { setIsDeleting(false); }
  };

  if (isPending || loading) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <HeroBackground />
        <div className="text-center relative z-10">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-white/40">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!session?.user) { router.push("/"); return null; }

  return (
    <div className="relative min-h-screen text-white font-sans">
      <HeroBackground />

      {/* Back Button */}
      <div className="fixed top-6 left-6 z-50">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] flex items-center justify-center transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-white/70" />
        </button>
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-5 pt-24 pb-24">

        {/* Page title */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] mb-5">
            <User className="w-3.5 h-3.5 text-white/50" />
            <span className="text-xs font-semibold tracking-[0.15em] uppercase text-white/50">Community Profile</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white leading-[0.95]">
            Edit Profile
          </h1>
        </motion.div>


        {/* ── Profile Picture ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={card}>
          <p className={sectionLabel}>Profile Picture</p>
          <div className="flex items-center gap-6 mt-4">
            <div className="relative">
              <Avatar className="w-20 h-20 border border-white/10">
                <AvatarImage src={profileImage || session.user.image || ""} />
                <AvatarFallback className="text-2xl font-bold bg-white/[0.06] text-white/60">
                  {session.user.name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => profilePicInputRef.current?.click()}
                disabled={uploadingImage}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 transition-all shadow-lg"
              >
                {uploadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
              </button>
              <input ref={profilePicInputRef} type="file" accept="image/*" onChange={handleProfileImageUpload} className="hidden" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">{session.user.name}</p>
              <p className="text-sm text-white/40">{session.user.email}</p>
              {profile?.userType && (
                <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  isFreelancer ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                }`}>
                  {isFreelancer ? <Briefcase className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                  {isFreelancer ? "Freelancer" : "Client"}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Basic Info ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={card}>
          <p className={sectionLabel}>Basic Information</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <Label className="text-xs text-white/40 mb-1.5 block">Display Name</Label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your display name" className={inp} />
            </div>
            <div>
              <Label className="text-xs text-white/40 mb-1.5 block">Headline</Label>
              <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="e.g. Senior Software Engineer" className={inp} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-white/40 mb-1.5 block flex items-center gap-1"><MapPin className="w-3 h-3" />Location</Label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. New York, USA" className={inp} />
            </div>
            {(isFreelancer || !profile) && (
              <>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block flex items-center gap-1"><DollarSign className="w-3 h-3" />Hourly Rate ($)</Label>
                  <input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="e.g. 50" className={inp} />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block flex items-center gap-1"><GraduationCap className="w-3 h-3" />Skills (comma separated)</Label>
                  <input value={skills} onChange={e => setSkills(e.target.value)} placeholder="e.g. React, Node.js, TypeScript" className={inp} />
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* ── Client Details ── */}
        {isClient && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={card}>
            <p className={sectionLabel}>Company Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <Label className="text-xs text-white/40 mb-1.5 block">Company Name</Label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company name" className={inp} />
              </div>
              <div>
                <Label className="text-xs text-white/40 mb-1.5 block">Industry</Label>
                <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Technology, Finance" className={inp} />
              </div>
              <div>
                <Label className="text-xs text-white/40 mb-1.5 block">Company Size</Label>
                <select value={companySize} onChange={e => setCompanySize(e.target.value)} className={selectCls}>
                  <option value="">Select company size</option>
                  <option value="1-10">1-10 employees</option>
                  <option value="11-50">11-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="500+">500+ employees</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-white/40 mb-1.5 block">Company Description</Label>
                <textarea value={companyDescription} onChange={e => setCompanyDescription(e.target.value)} placeholder="Describe your company..." rows={3} className={textareaCls} />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Portfolio ── */}
        {isFreelancer && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={card}>
            <div className="flex items-center justify-between mb-4">
              <p className={sectionLabel}>Portfolio</p>
              {!showAddPortfolio && (
                <button onClick={() => setShowAddPortfolio(true)} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors border border-white/[0.08] px-3 py-1.5 rounded-xl hover:bg-white/[0.05]">
                  <Plus className="w-3.5 h-3.5" /> Add Work
                </button>
              )}
            </div>

            {portfolioItems.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {portfolioItems.map(item => (
                  <div key={item.id} className="group relative rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                    {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-32 object-cover" />}
                    <div className="p-3">
                      <p className="text-sm font-semibold text-white/80 truncate">{item.title}</p>
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/40 mt-1">{item.category}</span>
                      {item.description && <p className="text-xs text-white/40 mt-1.5 line-clamp-2">{item.description}</p>}
                      {item.linkUrl && (
                        <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors">
                          <LinkIcon className="w-3 h-3" /> View Project
                        </a>
                      )}
                    </div>
                    <button onClick={() => handleDeletePortfolioItem(item.id)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {portfolioItems.length === 0 && !showAddPortfolio && (
              <div className="text-center py-8 rounded-xl border border-dashed border-white/[0.06]">
                <ImageIcon className="w-7 h-7 mx-auto mb-2 text-white/10" />
                <p className="text-sm text-white/30">No portfolio items yet.</p>
              </div>
            )}

            {showAddPortfolio && (
              <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Project Title *</Label>
                    <input placeholder="E-commerce Redesign" value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Category *</Label>
                    <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className={selectCls}>
                      <option value="">Select a category</option>
                      {PORTFOLIO_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Description</Label>
                  <textarea placeholder="Briefly describe this project..." value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} rows={2} className={textareaCls} />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block">Project Image</Label>
                  {newItem.imageUrl ? (
                    <div className="relative w-full h-36 rounded-xl overflow-hidden">
                      <img src={newItem.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button onClick={() => setNewItem({ ...newItem, imageUrl: "" })} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div onClick={() => portfolioFileInputRef.current?.click()} className="border border-dashed border-white/[0.08] rounded-xl p-4 text-center cursor-pointer hover:border-white/20 hover:bg-white/[0.03] transition-all">
                      <Upload className="w-5 h-5 mx-auto mb-1 text-white/20" />
                      <p className="text-xs text-white/30">Click to upload (max 5MB)</p>
                    </div>
                  )}
                  <input ref={portfolioFileInputRef} type="file" accept="image/*" onChange={handlePortfolioImageUpload} className="hidden" />
                </div>
                <div>
                  <Label className="text-xs text-white/40 mb-1.5 block flex items-center gap-1"><LinkIcon className="w-3 h-3" />Project Link (optional)</Label>
                  <input placeholder="https://example.com/project" value={newItem.linkUrl} onChange={e => setNewItem({ ...newItem, linkUrl: e.target.value })} className={inp} />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddPortfolioItem} disabled={!newItem.title || !newItem.category || savingPortfolio} className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 transition-all">
                    {savingPortfolio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {savingPortfolio ? "Saving..." : "Add to Portfolio"}
                  </button>
                  <button onClick={() => { setShowAddPortfolio(false); setNewItem({ title: "", description: "", category: "", imageUrl: "", linkUrl: "" }); }} className="px-4 h-10 rounded-xl text-sm text-white/40 hover:text-white hover:bg-white/[0.05] transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Freelancer: Wallet, Payments & Transactions ── */}
        {isFreelancer && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className={card}>
            <p className={sectionLabel}>Wallet & Payments</p>

            {/* Balance */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Balance</p>
                {walletData && walletData.availableBalance > 0 && (
                  <button onClick={() => setShowWithdrawModal(true)} className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors border border-emerald-500/20 px-3 py-1.5 rounded-xl hover:bg-emerald-500/10">
                    <ArrowDownToLine className="w-3.5 h-3.5" /> Withdraw
                  </button>
                )}
              </div>
              {loadingWallet ? (
                <div className="text-center py-6"><Loader2 className="w-6 h-6 mx-auto animate-spin text-white/20" /></div>
              ) : walletData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/15 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-400/60 mb-1">Available</p>
                      <p className="text-xl font-black text-emerald-400">£{(walletData.availableBalance / 100).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/15 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-blue-400/60 mb-1">Pending Escrow</p>
                      <p className="text-xl font-black text-blue-400/80">£{(walletData.pendingBalance / 100).toFixed(2)}</p>
                    </div>
                  </div>
                  {walletData.pendingBalance > 0 && (
                    <div className="rounded-lg bg-blue-500/[0.04] border border-blue-500/10 p-3 flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-blue-300/70 leading-relaxed">
                        Funds are processing and may take up to 7 days to become available after Stripe settlement.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-white/25 mb-1">Total Earned</p>
                      <p className="text-sm font-bold text-white/50">£{(walletData.totalEarned / 100).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-white/25 mb-1">Total Withdrawn</p>
                      <p className="text-sm font-bold text-white/50">£{(walletData.totalWithdrawn / 100).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 rounded-xl border border-dashed border-white/[0.06]">
                  <Wallet className="w-7 h-7 mx-auto mb-2 text-white/10" />
                  <p className="text-sm text-white/30">No wallet data yet</p>
                </div>
              )}

              {/* Withdraw Modal */}
              {showWithdrawModal && (
                <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-emerald-300">Withdraw Funds</p>
                    <button onClick={() => setShowWithdrawModal(false)} className="text-[11px] text-white/40 hover:text-white">Cancel</button>
                  </div>
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Amount (£)</Label>
                    <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder={`Max: £${walletData ? (walletData.availableBalance / 100).toFixed(2) : "0.00"}`} className={inp} />
                  </div>
                  <div>
                    <Label className="text-xs text-white/40 mb-1.5 block">Withdraw To</Label>
                    <div className="space-y-2">
                      {(() => {
                        const hasCard = paymentMethods.some((pm: any) => pm.type === "card" || pm.type === "debit_card" || pm.type === "credit_card");
                        const hasPaypal = paymentMethods.some((pm: any) => pm.type === "paypal");
                        return (
                          <>
                            <button
                              onClick={() => { if (hasCard) setWithdrawMethod("card"); else toast.error("No card on file. Add one first."); }}
                              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${withdrawMethod === "card" ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/[0.08] bg-white/[0.03] hover:border-white/20"} ${!hasCard ? "opacity-40 cursor-not-allowed" : ""}`}
                            >
                              <CreditCard className={`w-4 h-4 ${withdrawMethod === "card" ? "text-emerald-400" : "text-white/40"}`} />
                              <div className="flex-1">
                                <p className={`text-sm ${withdrawMethod === "card" ? "text-white font-semibold" : "text-white/60"}`}>Debit / Credit Card</p>
                                {hasCard ? (
                                  <p className="text-[10px] text-white/30">{paymentMethods.filter((pm: any) => pm.type === "card" || pm.type === "debit_card" || pm.type === "credit_card").map((pm: any) => pm.label).join(", ")}</p>
                                ) : (
                                  <p className="text-[10px] text-amber-400">No card added — add one first</p>
                                )}
                              </div>
                            </button>
                            <button
                              onClick={() => { if (hasPaypal) setWithdrawMethod("paypal"); else toast.error("No PayPal on file. Add one first."); }}
                              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${withdrawMethod === "paypal" ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/[0.08] bg-white/[0.03] hover:border-white/20"} ${!hasPaypal ? "opacity-40 cursor-not-allowed" : ""}`}
                            >
                              <svg className={`w-4 h-4 ${withdrawMethod === "paypal" ? "text-emerald-400" : "text-white/40"}`} viewBox="0 0 24 24" fill="currentColor"><path d="M7.076 2.778C6.82 2.314 6.38 2 5.88 2H2.12C1.47 2 .94 2.5.88 3.15L.02 11.15c-.06.6.4 1.13 1 1.13h3.77c.65 0 1.18-.5 1.24-1.15l.5-4.5c.06-.65.59-1.15 1.24-1.15h1.13c2.56 0 4.56-.52 5.93-1.53 1.37-1.01 2.06-2.48 2.06-4.37C16.89 1.58 14.39 0 10.89 0H7.07c-.65 0-1.18.5-1.24 1.15l-.5 4.5c-.06.65-.59 1.15-1.24 1.15H3.12c-.6 0-1.06.53-1 1.13l.86 8c.06.65.59 1.15 1.24 1.15h3.76c.65 0 1.18-.5 1.24-1.15l.5-4.5c.06-.65.59-1.15 1.24-1.15h1.13c2.56 0 4.56-.52 5.93-1.53 1.37-1.01 2.06-2.48 2.06-4.37C16.89 1.58 14.39 0 10.89 0H7.07z"/></svg>
                              <div className="flex-1">
                                <p className={`text-sm ${withdrawMethod === "paypal" ? "text-white font-semibold" : "text-white/60"}`}>PayPal</p>
                                {hasPaypal ? (
                                  <p className="text-[10px] text-white/30">{paymentMethods.filter((pm: any) => pm.type === "paypal").map((pm: any) => pm.email || pm.label).join(", ")}</p>
                                ) : (
                                  <p className="text-[10px] text-amber-400">No PayPal added — add one first</p>
                                )}
                              </div>
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/15 p-3 flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-white/50">Transaction fees are covered by the platform. You receive the full amount.</p>
                  </div>
                  <button onClick={handleWithdraw} disabled={!withdrawAmount || !withdrawMethod || processingWithdraw} className="w-full h-11 rounded-xl bg-emerald-500 text-black text-sm font-bold hover:bg-emerald-400 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                    {processingWithdraw ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><ArrowDownToLine className="w-4 h-4" /> Withdraw</>}
                  </button>
                </div>
              )}
            </div>

            {/* Payment Methods */}
            <div className="border-t border-white/[0.06] pt-5 mt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Payment Methods</p>
                {!showAddPayment && (
                  <button onClick={() => setShowAddPayment(true)} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors border border-white/[0.08] px-3 py-1.5 rounded-xl hover:bg-white/[0.05]">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>
              {paymentMethods.length > 0 && (
                <div className="space-y-2 mb-3">
                  {paymentMethods.map((pm: any) => (
                    <div key={pm.id} className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03]">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-4 h-4 text-white/40" />
                        <div>
                          <p className="text-sm text-white/80">{pm.label}</p>
                          {pm.isDefault && <span className="text-[10px] text-emerald-400 font-medium">Default</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDeletePm(pm.id)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-red-400 transition-all"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              {paymentMethods.length === 0 && !showAddPayment && (
                <div className="text-center py-5 rounded-xl border border-dashed border-white/[0.06]">
                  <CreditCard className="w-6 h-6 mx-auto mb-2 text-white/10" />
                  <p className="text-sm text-white/30">No payment methods saved</p>
                </div>
              )}
              {showAddPayment && (
                <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">Add Payment Method</p>
                    <button onClick={() => { setShowAddPayment(false); setNewPmType(""); }} className="text-[11px] text-white/40 hover:text-white">Cancel</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: "card", l: "Debit / Credit Card" },
                      { v: "paypal", l: "PayPal" },
                    ].map(({ v, l }) => (
                      <button key={v} onClick={() => setNewPmType(v)} className={`p-2.5 rounded-xl border text-[11px] font-semibold text-center transition-all ${newPmType === v ? "border-[#f5c518]/30 bg-[#f5c518]/10 text-[#f5c518]" : "border-white/[0.08] text-white/40 hover:border-white/15"}`}>{l}</button>
                    ))}
                  </div>
                  {newPmType === "card" && (
                    <StripeCardSaveForm
                      onSuccess={handleCardSaveSuccess}
                      onCancel={() => { setNewPmType(""); }}
                    />
                  )}
                  {newPmType === "paypal" && (
                    <div className="space-y-3">
                      <input placeholder="PayPal Email" value={newPmDetails.email} onChange={e => setNewPmDetails(p => ({ ...p, email: e.target.value }))} className={inp} />
                      <button onClick={handleAddPm} className="w-full h-10 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition-all">Save PayPal</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Transaction History */}
            <div className="border-t border-white/[0.06] pt-5 mt-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-3">Transaction History</p>
              {transactions.length === 0 ? (
                <div className="text-center py-5 rounded-xl border border-dashed border-white/[0.06]">
                  <History className="w-6 h-6 mx-auto mb-2 text-white/10" />
                  <p className="text-sm text-white/30">No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === "credit" ? "bg-emerald-500/15 text-emerald-400" : tx.type === "withdrawal" ? "bg-amber-500/15 text-amber-400" : "bg-white/5 text-white/40"}`}>
                          {tx.type === "credit" ? <BadgePoundSterling className="w-4 h-4" /> : <ArrowDownToLine className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white/80">{tx.description}</p>
                          <p className="text-[10px] text-white/30">{new Date(tx.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${tx.type === "credit" ? "text-emerald-400" : "text-amber-400"}`}>
                          {tx.type === "credit" ? "+" : "-"}£{(tx.netAmount / 100).toFixed(2)}
                        </p>
                        <p className={`text-[10px] ${tx.status === "completed" ? "text-emerald-400/60" : "text-amber-400/60"}`}>{tx.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Client: Payments & Transactions ── */}
        {isClient && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className={card}>
            <p className={sectionLabel}>Payments & Transactions</p>

            {/* Payment Methods */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Payment Methods</p>
                {!showAddPayment && (
                  <button onClick={() => setShowAddPayment(true)} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors border border-white/[0.08] px-3 py-1.5 rounded-xl hover:bg-white/[0.05]">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>
              {paymentMethods.length > 0 && (
                <div className="space-y-2 mb-3">
                  {paymentMethods.map((pm: any) => (
                    <div key={pm.id} className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03]">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-4 h-4 text-white/40" />
                        <div>
                          <p className="text-sm text-white/80">{pm.label}</p>
                          {pm.isDefault && <span className="text-[10px] text-emerald-400 font-medium">Default</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDeletePm(pm.id)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-red-400 transition-all"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              {paymentMethods.length === 0 && !showAddPayment && (
                <div className="text-center py-5 rounded-xl border border-dashed border-white/[0.06]">
                  <CreditCard className="w-6 h-6 mx-auto mb-2 text-white/10" />
                  <p className="text-sm text-white/30">No payment methods saved</p>
                </div>
              )}
              {showAddPayment && (
                <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-white">Add Payment Method</p>
                    <button onClick={() => { setShowAddPayment(false); setNewPmType(""); }} className="text-[11px] text-white/40 hover:text-white">Cancel</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: "card", l: "Debit / Credit Card" },
                      { v: "paypal", l: "PayPal" },
                    ].map(({ v, l }) => (
                      <button key={v} onClick={() => setNewPmType(v)} className={`p-2.5 rounded-xl border text-[11px] font-semibold text-center transition-all ${newPmType === v ? "border-[#f5c518]/30 bg-[#f5c518]/10 text-[#f5c518]" : "border-white/[0.08] text-white/40 hover:border-white/15"}`}>{l}</button>
                    ))}
                  </div>
                  {newPmType === "card" && (
                    <StripeCardSaveForm
                      onSuccess={handleCardSaveSuccess}
                      onCancel={() => { setNewPmType(""); }}
                    />
                  )}
                  {newPmType === "paypal" && (
                    <div className="space-y-3">
                      <input placeholder="PayPal Email" value={newPmDetails.email} onChange={e => setNewPmDetails(p => ({ ...p, email: e.target.value }))} className={inp} />
                      <button onClick={handleAddPm} className="w-full h-10 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 transition-all">Save PayPal</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Transaction History */}
            <div className="border-t border-white/[0.06] pt-5 mt-6">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-3">Transaction History</p>
              {transactions.length === 0 ? (
                <div className="text-center py-5 rounded-xl border border-dashed border-white/[0.06]">
                  <History className="w-6 h-6 mx-auto mb-2 text-white/10" />
                  <p className="text-sm text-white/30">No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === "credit" ? "bg-emerald-500/15 text-emerald-400" : tx.type === "withdrawal" ? "bg-amber-500/15 text-amber-400" : "bg-white/5 text-white/40"}`}>
                          {tx.type === "credit" ? <BadgePoundSterling className="w-4 h-4" /> : <ArrowDownToLine className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white/80">{tx.description}</p>
                          <p className="text-[10px] text-white/30">{new Date(tx.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${tx.type === "credit" ? "text-emerald-400" : "text-amber-400"}`}>
                          {tx.type === "credit" ? "+" : "-"}£{(tx.netAmount / 100).toFixed(2)}
                        </p>
                        <p className={`text-[10px] ${tx.status === "completed" ? "text-emerald-400/60" : "text-amber-400/60"}`}>{tx.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Save Button ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex justify-center mb-5">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 h-12 px-8 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 disabled:opacity-50 transition-all shadow-lg">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Changes</>}
          </button>
        </motion.div>

        {/* ── Danger Zone ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] backdrop-blur-xl p-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400/60 mb-4">Danger Zone</p>
          <p className="text-sm text-white/40 mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 h-10 px-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all">
            <Trash2 className="w-4 h-4" /> Delete My Account
          </button>
        </motion.div>

        {/* ── Delete Account Modal ── */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md rounded-2xl border border-red-500/20 bg-[#121212] p-7 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">Delete Account</p>
                  <p className="text-xs text-white/40">This action is permanent and irreversible.</p>
                </div>
              </div>

              <p className="text-sm text-white/60 mb-6 leading-relaxed">
                All your data will be permanently removed — including your profile, subscription, conversations, community data, wallet, and every record associated with this account.
              </p>

              <div className="mb-5">
                <p className="text-sm text-white/50 mb-2">Type <strong className="text-white/80">DELETE</strong> to confirm.</p>
                <input
                  value={deleteInput}
                  onChange={e => setDeleteInput(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className={`${inp} border-red-500/20 focus:border-red-500/40 focus:ring-red-500/10`}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
                  className="flex-1 h-11 rounded-xl border border-white/[0.08] text-sm text-white/50 hover:text-white hover:bg-white/[0.05] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteInput !== "DELETE" || isDeleting}
                  className="flex-1 h-11 rounded-xl bg-red-500/80 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-40 transition-all"
                >
                  {isDeleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

      </main>
    </div>
  );
}
