"use client";

import Sidebar from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Brain, Search, Mail, Filter } from "lucide-react";

export default function Orchestrator() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      
        <main className="flex-1 ml-64 p-8">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl font-bold mb-8">HireMindX Orchestrator</h1>

            <Card className="p-12 bg-gradient-to-br from-card to-card/50">
            <div className="relative">
              {/* Central Hub */}
              <div className="flex items-center justify-center mb-12">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                    <Brain className="w-16 h-16 text-primary" />
                  </div>
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-semibold">
                    Orchestrator
                  </div>
                </div>
              </div>

              {/* AI Services Network */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16">
                {/* GPT-4 */}
                <div className="text-center">
                  <div className="mb-4">
                    <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                      <Brain className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <div className="font-semibold mb-2">GPT-4</div>
                  <div className="text-xs text-muted-foreground">Reasoning</div>
                </div>

                {/* Perplexity */}
                <div className="text-center">
                  <div className="mb-4">
                    <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                      <Search className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <div className="font-semibold mb-2">Perplexity</div>
                  <div className="text-xs text-muted-foreground">Job search</div>
                  <div className="text-xs text-muted-foreground">Email polish</div>
                </div>

                {/* Gemini */}
                <div className="text-center">
                  <div className="mb-4">
                    <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                      <Mail className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <div className="font-semibold mb-2">Gemini</div>
                  <div className="text-xs text-muted-foreground">Email polish</div>
                  <div className="text-xs text-muted-foreground">Email</div>
                </div>

                {/* DeepSeek */}
                <div className="text-center">
                  <div className="mb-4">
                    <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                      <Filter className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <div className="font-semibold mb-2">DeepSeek</div>
                  <div className="text-xs text-muted-foreground">Filtering</div>
                </div>
              </div>

              {/* Connection Lines Effect */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: -1 }}>
                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
                <line x1="50%" y1="20%" x2="25%" y2="60%" stroke="url(#lineGradient)" strokeWidth="2" />
                <line x1="50%" y1="20%" x2="40%" y2="60%" stroke="url(#lineGradient)" strokeWidth="2" />
                <line x1="50%" y1="20%" x2="60%" y2="60%" stroke="url(#lineGradient)" strokeWidth="2" />
                <line x1="50%" y1="20%" x2="75%" y2="60%" stroke="url(#lineGradient)" strokeWidth="2" />
              </svg>
            </div>

            <div className="mt-16 text-center">
              <h3 className="text-xl font-semibold mb-2">HIREINSever</h3>
              <p className="text-sm text-muted-foreground">
                Coordinating multiple AI models to optimize your job search
              </p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
