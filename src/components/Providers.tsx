"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import OnboardingTour from "@/components/OnboardingTour";
import LocalStorageCleanup from "@/components/LocalStorageCleanup";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <LocalStorageCleanup />
        {children}
        <OnboardingTour />
      </LanguageProvider>
    </ThemeProvider>
  );
}
