"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import OnboardingTour from "@/components/OnboardingTour";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        {children}
        <OnboardingTour />
      </LanguageProvider>
    </ThemeProvider>
  );
}
