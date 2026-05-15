"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import {
  tourSteps,
  hasCompletedOnboarding,
  getSavedStep,
  saveStep,
  completeOnboarding,
} from "@/lib/onboarding";

export default function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Initialize: check if we should start the tour (only for authenticated users)
  useEffect(() => {
    if (typeof window === "undefined" || isPending) return;
    if (!session?.user?.id) {
      // User not logged in — don't start tour
      setIsActive(false);
      return;
    }
    const completed = hasCompletedOnboarding();
    if (!completed) {
      const savedStep = getSavedStep();
      setStepIndex(savedStep);
      setIsActive(true);
    }
  }, [session, isPending]);

  const currentStep = tourSteps[stepIndex];

  // Find target element and compute its position
  const updateTargetRect = useCallback(() => {
    if (!currentStep) return;
    const el = document.querySelector(currentStep.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!isActive || !currentStep) return;

    // If we need to navigate to a different page
    if (currentStep.page && currentStep.page !== pathname) {
      setIsNavigating(true);
      router.push(currentStep.page);
      return;
    }

    setIsNavigating(false);

    // Wait for page to render then find element
    const timeout = setTimeout(() => {
      updateTargetRect();
    }, 400);

    // Observe resize for responsive updates
    const el = document.querySelector(currentStep.target);
    if (el) {
      resizeObserverRef.current = new ResizeObserver(() => updateTargetRect());
      resizeObserverRef.current.observe(el);
    }

    window.addEventListener("scroll", updateTargetRect, true);
    window.addEventListener("resize", updateTargetRect);

    return () => {
      clearTimeout(timeout);
      resizeObserverRef.current?.disconnect();
      window.removeEventListener("scroll", updateTargetRect, true);
      window.removeEventListener("resize", updateTargetRect);
    };
  }, [isActive, currentStep, pathname, router, updateTargetRect]);

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0) {
        setIsActive(false);
        return;
      }
      if (index >= tourSteps.length) {
        completeOnboarding();
        setIsActive(false);
        return;
      }
      setStepIndex(index);
      saveStep(index);
      setTargetRect(null);
    },
    []
  );

  const handleNext = () => goToStep(stepIndex + 1);
  const handleBack = () => goToStep(stepIndex - 1);
  const handleSkip = () => {
    completeOnboarding();
    setIsActive(false);
  };

  if (!isActive || isNavigating || !currentStep) return null;

  const padding = 12;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const tooltipMaxWidth = isMobile ? window.innerWidth - 32 : 360;
  const tooltipWidth = tooltipMaxWidth;
  // Estimate tooltip height: header (~50) + title (~24) + desc (lines * 20) + nav (~40) + padding (~40)
  const descLines = currentStep.description.split("\n").length;
  const estimatedHeight = 50 + 24 + Math.max(60, descLines * 22) + 48 + 40;
  const safeMargin = 12;

  // Comprehensive tooltip positioning that avoids all edges
  let tooltipLeft = 0;
  let tooltipTop = 0;
  let tooltipPosition: "top" | "bottom" | "left" | "right" = currentStep.position || "bottom";
  let arrowStyle: React.CSSProperties = {};

  if (targetRect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    const fitsBottom = targetRect.bottom + padding + 8 + estimatedHeight + safeMargin <= vh;
    const fitsTop = targetRect.top - padding - 8 - estimatedHeight - safeMargin >= 0;
    const fitsRight = targetRect.right + padding + 8 + tooltipWidth + safeMargin <= vw;
    const fitsLeft = targetRect.left - padding - 8 - tooltipWidth - safeMargin >= 0;

    // On mobile, prefer top/bottom and center-align; avoid left/right
    const positions: Array<"top" | "bottom" | "left" | "right"> = isMobile
      ? fitsBottom
        ? ["bottom", "top"]
        : ["top", "bottom"]
      : [tooltipPosition, "bottom", "top", "right", "left"];

    // Remove duplicates while preserving order
    const uniquePositions = positions.filter((p, i, arr) => arr.indexOf(p) === i);

    let chosenPos: typeof tooltipPosition = tooltipPosition;
    for (const pos of uniquePositions) {
      if (pos === "bottom" && fitsBottom) { chosenPos = pos; break; }
      if (pos === "top" && fitsTop) { chosenPos = pos; break; }
      if (pos === "right" && fitsRight) { chosenPos = pos; break; }
      if (pos === "left" && fitsLeft) { chosenPos = pos; break; }
    }
    tooltipPosition = chosenPos;

    switch (tooltipPosition) {
      case "bottom": {
        tooltipLeft = Math.max(safeMargin, Math.min(vw - tooltipWidth - safeMargin, targetCenterX - tooltipWidth / 2));
        tooltipTop = targetRect.bottom + scrollY + padding + 8;
        arrowStyle = { left: targetCenterX - tooltipLeft - 6, top: -6, transform: "rotate(45deg)" };
        break;
      }
      case "top": {
        tooltipLeft = Math.max(safeMargin, Math.min(vw - tooltipWidth - safeMargin, targetCenterX - tooltipWidth / 2));
        tooltipTop = targetRect.top + scrollY - padding - 8 - estimatedHeight;
        // Ensure it doesn't go above viewport
        tooltipTop = Math.max(safeMargin + scrollY, tooltipTop);
        arrowStyle = { left: targetCenterX - tooltipLeft - 6, bottom: -6, transform: "rotate(225deg)" };
        break;
      }
      case "left": {
        tooltipLeft = targetRect.left + scrollX - tooltipWidth - padding - 8;
        tooltipTop = Math.max(safeMargin + scrollY, Math.min(vh - estimatedHeight - safeMargin + scrollY, targetCenterY - estimatedHeight / 2 + scrollY));
        arrowStyle = { right: -6, top: targetCenterY - tooltipTop + scrollY - 6, transform: "rotate(135deg)" };
        break;
      }
      case "right": {
        tooltipLeft = targetRect.right + scrollX + padding + 8;
        tooltipTop = Math.max(safeMargin + scrollY, Math.min(vh - estimatedHeight - safeMargin + scrollY, targetCenterY - estimatedHeight / 2 + scrollY));
        arrowStyle = { left: -6, top: targetCenterY - tooltipTop + scrollY - 6, transform: "rotate(-45deg)" };
        break;
      }
    }

    // Final safety clamp for left
    tooltipLeft = Math.max(safeMargin, Math.min(vw - tooltipWidth - safeMargin, tooltipLeft));
    // Final safety clamp for top
    tooltipTop = Math.max(safeMargin + scrollY, Math.min(vh - estimatedHeight - safeMargin + scrollY, tooltipTop));
  }

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === tourSteps.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Dark overlay with cutout */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - padding}
                  y={targetRect.top - padding}
                  width={targetRect.width + padding * 2}
                  height={targetRect.height + padding * 2}
                  rx={12}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.65)"
            mask="url(#tour-mask)"
            className="pointer-events-auto"
            onClick={handleSkip}
          />
        </svg>

        {/* Highlight border around target */}
        {targetRect && (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: targetRect.left - padding,
              top: targetRect.top - padding,
              width: targetRect.width + padding * 2,
              height: targetRect.height + padding * 2,
              borderRadius: 12,
              boxShadow: "0 0 0 2px rgba(212,175,55,0.8), 0 0 20px rgba(212,175,55,0.3)",
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          />
        )}

        {/* Tooltip card */}
        <motion.div
          className="fixed z-10"
          style={{
            left: tooltipLeft,
            top: tooltipTop,
            width: tooltipWidth,
          }}
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, delay: 0.05 }}
        >
          {/* Arrow pointer */}
          {targetRect && (
            <div
              className="absolute w-3 h-3 bg-zinc-900 border-l border-t border-zinc-700"
              style={arrowStyle}
            />
          )}
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-4 sm:p-5 relative">
            {/* Close button */}
            <button
              onClick={handleSkip}
              className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Step counter */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] sm:text-xs font-medium text-zinc-500 whitespace-nowrap">
                Step {stepIndex + 1} of {tourSteps.length}
              </span>
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${((stepIndex + 1) / tourSteps.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Title */}
            <h3 className="text-sm sm:text-base font-semibold text-white mb-2 pr-6">
              {currentStep.title}
            </h3>

            {/* Description */}
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-4">
              {currentStep.description}
            </p>

            {/* Navigation */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                disabled={isFirst}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1 disabled:opacity-30 text-xs sm:text-sm h-8"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 gap-1 text-xs sm:text-sm h-8"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1 text-xs sm:text-sm h-8"
                >
                  {isLast ? "Finish" : "Next"}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
