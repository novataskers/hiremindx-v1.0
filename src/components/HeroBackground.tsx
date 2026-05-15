"use client";

import { useMemo } from "react";

export function HeroBackground() {
  const stars = useMemo(() => {
    return [...Array(60)].map((_, i) => ({
      id: i,
      top: `${(i * 37.3 + 11.7) % 100}%`,
      left: `${(i * 61.8 + 23.4) % 100}%`,
      opacity: 0.2 + ((i * 0.137) % 0.4),
    }));
  }, []);

  return (
    <div
      className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-black"
      style={{ animation: "bgFadeInSubtle 2s ease forwards", opacity: 0 }}
    >
      {/* Stars */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute w-[1px] h-[1px] bg-white rounded-full"
          style={{
            top: star.top,
            left: star.left,
            opacity: star.opacity,
            boxShadow: "0 0 2px 1px rgba(255,255,255,0.15)",
          }}
        />
      ))}

      {/* Shooting star trails */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="glow-bg" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="bg-sg1" gradientUnits="userSpaceOnUse" x1="5" y1="98" x2="90" y2="5">
            <stop offset="0%"   stopColor="#c8960c" stopOpacity="0" />
            <stop offset="25%"  stopColor="#c8960c" stopOpacity="0.2" />
            <stop offset="55%"  stopColor="#d4a017" stopOpacity="0.35" />
            <stop offset="75%"  stopColor="#f5d060" stopOpacity="0.45" />
            <stop offset="90%"  stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="bg-sg2" gradientUnits="userSpaceOnUse" x1="-8" y1="85" x2="68" y2="-2">
            <stop offset="0%"   stopColor="#c8960c" stopOpacity="0" />
            <stop offset="30%"  stopColor="#c8960c" stopOpacity="0.15" />
            <stop offset="60%"  stopColor="#d4a017" stopOpacity="0.28" />
            <stop offset="85%"  stopColor="#f5d060" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="bg-sg3" gradientUnits="userSpaceOnUse" x1="22" y1="102" x2="102" y2="22">
            <stop offset="0%"   stopColor="#c8960c" stopOpacity="0" />
            <stop offset="35%"  stopColor="#c8960c" stopOpacity="0.12" />
            <stop offset="70%"  stopColor="#d4a017" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f5d060" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="bg-sg4" gradientUnits="userSpaceOnUse" x1="42" y1="100" x2="108" y2="32">
            <stop offset="0%"   stopColor="#c8960c" stopOpacity="0" />
            <stop offset="50%"  stopColor="#c8960c" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#d4a017" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <line x1="5"  y1="98"  x2="90"  y2="5"  stroke="url(#bg-sg1)" strokeWidth="1.2" strokeLinecap="round" filter="url(#glow-bg)" />
        <line x1="-8" y1="85"  x2="68"  y2="-2" stroke="url(#bg-sg2)" strokeWidth="0.9" strokeLinecap="round" filter="url(#glow-bg)" />
        <line x1="22" y1="102" x2="102" y2="22" stroke="url(#bg-sg3)" strokeWidth="0.7" strokeLinecap="round" filter="url(#glow-bg)" />
        <line x1="42" y1="100" x2="108" y2="32" stroke="url(#bg-sg4)" strokeWidth="0.5" strokeLinecap="round" filter="url(#glow-bg)" />
      </svg>
    </div>
  );
}
