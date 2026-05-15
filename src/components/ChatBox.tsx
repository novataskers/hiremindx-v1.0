"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brain, Send, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: "ai" | "user";
  content: string;
  timestamp: Date;
}

export default function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content: "👋 Hello! I'm your AI job search assistant. I can help you find the perfect role, optimize your résumé, and automate your applications.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Simulate AI response (replace with actual Lindy AI integration)
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: getAIResponse(userMessage.content),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsLoading(false);
      inputRef.current?.focus();
    }, 1000);
  };

  const getAIResponse = (userInput: string): string => {
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes("remote") || lowerInput.includes("software") || lowerInput.includes("engineering")) {
      return "🚀 Perfect! I'll start scanning for remote software engineering positions that match your profile. Upload your résumé to get personalized matches!";
    } else if (lowerInput.includes("resume") || lowerInput.includes("cv")) {
      return "📄 Great! Click the 'Upload résumé' button at the top of the page to get started. I'll analyze your experience and match you with the best opportunities.";
    } else if (lowerInput.includes("job") || lowerInput.includes("position")) {
      return "🔍 I can help you find jobs! Tell me what kind of role you're looking for - industry, location preference, seniority level, or any specific requirements.";
    } else if (lowerInput.includes("apply")) {
      return "✨ I can automate your job applications! Once you upload your résumé, I'll apply to matching positions on your behalf with tailored cover letters.";
    } else if (lowerInput.includes("track") || lowerInput.includes("status")) {
      return "📊 I track all your applications and notify you of responses. Check the Applications page to see your progress and which companies have replied.";
    } else if (lowerInput.includes("help") || lowerInput.includes("what can you do")) {
      return "💡 I can:\n• Find jobs matching your profile\n• Auto-apply to opportunities\n• Track application status\n• Follow up with recruiters\n• Optimize your résumé\n\nWhat would you like help with?";
    } else {
      return "I'm here to help with your job search! You can ask me about finding roles, uploading your résumé, tracking applications, or automating your job hunt. What would you like to know?";
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5" />
      
      <div className="relative flex flex-col h-[600px]">
        {/* Chat Header */}
        <div className="px-6 py-4 border-b border-border/50 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold">HireMindX AI Assistant</h3>
              <p className="text-xs text-muted-foreground">Always online • Ready to help</p>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${
                message.role === "user" ? "justify-end" : ""
              } animate-in slide-in-from-${message.role === "user" ? "right" : "left"} duration-500`}
            >
              {message.role === "ai" && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Brain className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    message.role === "ai"
                      ? "bg-muted/50 backdrop-blur-sm border border-border/50 rounded-tl-sm prose prose-sm dark:prose-invert"
                      : "bg-primary/90 backdrop-blur-sm border border-primary rounded-tr-sm text-primary-foreground"
                  }`}
                >
                  {message.role === "ai" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {message.content}
                    </p>
                  )}
                </div>

              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold">You</span>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-3 animate-in slide-in-from-left duration-500">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <Brain className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="bg-muted/50 backdrop-blur-sm border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-6 py-4 border-t border-border/50 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about your job search..."
              className="flex-1 bg-background/50 border-border/50 focus:border-primary/50"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press Enter to send • Shift+Enter for new line
          </p>
        </div>
      </div>
    </Card>
  );
}
