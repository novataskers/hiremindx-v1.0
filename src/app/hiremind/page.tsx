"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function RedirectToHireMindX() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/hiremindx");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Redirecting to the new HireMindX experience...</p>
      </div>
    </div>
  );
}
