"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Mail, Users, Zap, Briefcase, ChevronRight } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

const TOUR_STEPS = [
  {
    index: 0,
    icon: Search,
    label: "Assist",
    description: "Your AI assistant — search for jobs, get help with applications, and let AI handle your professional tasks.",
  },
  {
    index: 1,
    icon: Mail,
    label: "Outreach",
    description: "Send hyper-personalized cold emails to recruiters and hiring managers automatically.",
  },
  {
    index: 2,
    icon: Users,
    label: "Community",
    description: "Connect with other professionals, find freelancers, and collaborate on projects.",
  },
  {
    index: 3,
    icon: Zap,
    label: "Pricing",
    description: "Explore premium plans to unlock the full power of HireMindX.",
  },
  {
    index: 4,
    icon: Briefcase,
    label: "Match",
    description: "AI-powered tools to analyze candidates and make smarter hiring decisions.",
  },
];

const STORAGE_KEY = "hiremindx_tour_seen";

interface DockTourProps {
  show: boolean;
  onComplete: () => void;
}

export default function DockTour({ show, onComplete }: DockTourProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const updateHighlight = useCallback(() => {
    const dockButtons = document.querySelectorAll("[data-dock-item]");
    const btn = dockButtons[TOUR_STEPS[currentStep].index] as HTMLElement;
    if (btn) {
      setHighlightRect(btn.getBoundingClientRect());
    }
  }, [currentStep]);

  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => setVisible(true), 1600);
      return () => clearTimeout(timer);
    }
  }, [show]);

  useEffect(() => {
    if (!visible) return;
    updateHighlight();
    window.addEventListener("resize", updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [visible, currentStep, updateHighlight]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      finish();
    }
  };

  const finish = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
    onComplete();
  };

  if (!visible) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const StepIcon = step.icon;

  // Position tooltip above the highlighted button
  const tooltipStyle: React.CSSProperties = highlightRect
    ? {
        position: "fixed",
        bottom: `calc(100vh - ${highlightRect.top - 16}px)`,
        left: highlightRect.left + highlightRect.width / 2,
        transform: "translateX(-50%)",
      }
    : { position: "fixed", bottom: 120, left: "50%", transform: "translateX(-50%)" };

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60"
        onClick={finish}
      />

      {/* Highlight ring around current dock button */}
      {highlightRect && (
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="fixed z-[70] rounded-2xl border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="fixed z-[80]"
          style={tooltipStyle}
        >
          <div
            className={`w-72 p-5 rounded-2xl border shadow-2xl backdrop-blur-xl ${
              isDark
                ? "bg-zinc-900/95 border-white/10 shadow-black/50"
                : "bg-white/95 border-zinc-200 shadow-zinc-300/50"
            }`}
          >
            {/* Header with icon and step count */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isDark ? "bg-blue-500/15 border border-blue-500/20" : "bg-blue-50 border border-blue-100"
                  }`}
                >
                  <StepIcon className={`w-4.5 h-4.5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                </div>
                <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}>
                  {step.label}
                </span>
              </div>
              <span className={`text-[11px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                {currentStep + 1}/{TOUR_STEPS.length}
              </span>
            </div>

            {/* Description */}
            <p className={`text-sm leading-relaxed mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              {step.description}
            </p>

            {/* Progress dots */}
            <div className="flex items-center gap-1.5 mb-4">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? "w-6 bg-blue-500"
                      : i < currentStep
                      ? `w-1.5 ${isDark ? "bg-blue-500/40" : "bg-blue-300"}`
                      : `w-1.5 ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={finish}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-white/5" : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Skip
              </button>
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-500/20"
              >
                {isLast ? "Got it!" : "Next"}
                {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Arrow pointing down to dock */}
            <div
              className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 border-r border-b ${
                isDark ? "bg-zinc-900/95 border-white/10" : "bg-white/95 border-zinc-200"
              }`}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export { STORAGE_KEY as TOUR_STORAGE_KEY };
