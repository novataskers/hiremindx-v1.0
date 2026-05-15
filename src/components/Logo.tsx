"use client";

import { Layers3 } from "lucide-react";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Layers3 className="w-5 h-5 text-white" />
      <span className="text-xs font-bold tracking-[0.25em] uppercase text-white/90">
        HireMindX
      </span>
    </div>
  );
}
