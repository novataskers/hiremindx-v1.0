"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Loader2, Send, Upload, X, FileText, Image as ImageIcon, BookOpen, Copy, Check, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { toast } from "sonner";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Dual endpoints from n8n
const CHAT_ENDPOINT = 'https://hiremindv10.app.n8n.cloud/webhook/chat';
const ANALYZE_ENDPOINT = 'https://hiremindv10.app.n8n.cloud/webhook/analyze';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  file?: {
    name: string;
    type: string;
  };
}

export default function AnalyzePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [messages, setMessages] = useState<Message[]>([{
    id: "initial",
    role: "assistant",
    content: "Hello! I'm HireMindX Study AI. You can chat with me or upload files (PDF, images, documents) for analysis. How can I help you today?",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "upload">("chat");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  
  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('hiremind_analyze_session_id');
      if (!id) {
        id = 'analyze_session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('hiremind_analyze_session_id', id);
      }
      return id;
    }
    return `analyze_session_${Date.now()}`;
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendTextMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      let aiResponse = "Sorry, I couldn't process that request.";
      if (data.response) {
        aiResponse = data.response;
      } else if (data.message) {
        aiResponse = data.message;
      }
      
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeFile = async () => {
    if (!selectedFile || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim() || "Please analyze this file",
      timestamp: new Date(),
      file: {
        name: selectedFile.name,
        type: selectedFile.type,
      }
    };
    setMessages(prev => [...prev, userMsg]);
    
    const messageText = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (messageText) {
        formData.append('message', messageText);
      }

      const response = await fetch(ANALYZE_ENDPOINT, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      let aiResponse = "Sorry, I couldn't analyze that file.";
      if (data.response) {
        aiResponse = data.response;
      } else if (data.message) {
        aiResponse = data.message;
      }
      
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setSelectedFile(null);
      toast.success("File analyzed successfully!");
    } catch (error) {
      console.error('Error analyzing file:', error);
      toast.error("Failed to analyze file. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === "chat") {
      sendTextMessage(input);
    } else {
      analyzeFile();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && activeTab === "chat") {
      e.preventDefault();
      sendTextMessage(input);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setSelectedFile(file);
      setActiveTab("upload");
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("Copied to clipboard");
    });
  };

  const speak = (text: string, id: string) => {
    if ('speechSynthesis' in window) {
      if (speakingId === id) {
        window.speechSynthesis.cancel();
        setSpeakingId(null);
        return;
      }
      
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    } else {
      toast.error("Text-to-speech not supported in this browser");
    }
  };

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-blue-500/5">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-gradient-to-br from-background via-background to-blue-500/5">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
        <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link href="/bulk-cv" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <BookOpen className="w-6 h-6 text-blue-500" />
            <span className="text-xl font-bold tracking-tight">HIREMINDX STUDY</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-hidden">
          <div className="max-w-5xl mx-auto h-full flex flex-col">
            <Card className="h-full flex flex-col border-border/50 bg-card/50 backdrop-blur-xl supports-[backdrop-filter]:bg-card/30 shadow-2xl overflow-hidden">
              <div 
                className="flex-1 overflow-y-auto p-4 sm:p-6" 
              >
                <div className="space-y-6">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div className={`flex gap-3 max-w-[85%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        {message.role === "assistant" ? (
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 shadow-lg flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-accent via-primary to-primary shadow-lg flex items-center justify-center text-primary-foreground font-bold flex-shrink-0">
                            {session.user.name?.charAt(0).toUpperCase() || "U"}
                          </div>
                        )}
                        
                            <div
                              className={`rounded-2xl px-4 py-3 shadow-lg backdrop-blur-sm relative group/msg ${
                                message.role === "user"
                                  ? "bg-gradient-to-br from-primary via-primary to-accent text-primary-foreground"
                                  : "bg-muted/80 text-foreground border border-border/50 prose prose-sm dark:prose-invert max-w-none"
                              }`}
                            >
                              {message.file && (
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-current/20">
                                  {message.file.type.startsWith('image/') ? (
                                    <ImageIcon className="w-4 h-4" />
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                  <span className="text-xs font-medium">{message.file.name}</span>
                                </div>
                              )}
                              {message.role === "user" ? (
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed font-semibold">
                                  {message.content}
                                </p>
                              ) : (
                                <>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {message.content}
                                  </ReactMarkdown>
                                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/20 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => copyToClipboard(message.content, message.id)}
                                      className="p-1.5 rounded-lg hover:bg-background/50 transition-colors text-muted-foreground hover:text-primary"
                                      title="Copy message"
                                    >
                                      {copiedId === message.id ? (
                                        <Check className="w-3.5 h-3.5" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => speak(message.content, message.id)}
                                      className={`p-1.5 rounded-lg hover:bg-background/50 transition-colors ${speakingId === message.id ? 'text-blue-500 animate-pulse' : 'text-muted-foreground hover:text-blue-500'}`}
                                      title="Listen to message"
                                    >
                                      <Volume2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex gap-3 max-w-[85%]">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 shadow-lg flex items-center justify-center flex-shrink-0">
                          <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </div>
                        <div className="bg-muted/80 border border-border/50 rounded-2xl px-4 py-3 flex gap-1.5 shadow-lg">
                          <div className="w-2 h-2 rounded-full bg-blue-500/60 animate-bounce" style={{ animationDelay: '0s' }}></div>
                          <div className="w-2 h-2 rounded-full bg-blue-500/60 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-2 h-2 rounded-full bg-blue-500/60 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="border-t border-border/50 bg-background/80 backdrop-blur-xl p-4 sm:p-6 flex-shrink-0">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "upload")} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="chat">Text Chat</TabsTrigger>
                    <TabsTrigger value="upload">File Upload</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="chat" className="mt-0">
                    <form onSubmit={handleSubmit} className="flex gap-3">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your message..."
                        disabled={isLoading}
                        className="flex-1 rounded-2xl border-2 border-border/50 px-5 py-6 bg-background/50 backdrop-blur-sm focus:border-blue-500/50 transition-all text-sm sm:text-base shadow-inner"
                        autoComplete="off"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="flex-shrink-0 rounded-2xl w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 hover:shadow-xl hover:scale-105 transition-all shadow-lg flex items-center justify-center text-white disabled:opacity-50"
                      >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="upload" className="mt-0">
                    <div className="space-y-3">
                      {selectedFile ? (
                        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-2xl border-2 border-border/50">
                          {selectedFile.type.startsWith('image/') ? (
                            <ImageIcon className="w-5 h-5 text-blue-500" />
                          ) : (
                            <FileText className="w-5 h-5 text-blue-500" />
                          )}
                          <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={removeFile}
                            className="flex-shrink-0 h-8 w-8"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            accept=".pdf,.doc,.docx,.txt,image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={isLoading}
                          />
                          <div className="flex items-center justify-center gap-3 p-6 bg-muted/50 rounded-2xl border-2 border-dashed border-border/50 hover:border-blue-500/50 transition-colors cursor-pointer">
                            <Upload className="w-5 h-5 text-blue-500" />
                            <span className="text-sm text-muted-foreground">
                              Click to upload file (PDF, images, docs)
                            </span>
                          </div>
                        </div>
                      )}
                      
                      <form onSubmit={handleSubmit} className="flex gap-3">
                        <Input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="Optional message about the file..."
                          disabled={isLoading || !selectedFile}
                          className="flex-1 rounded-2xl border-2 border-border/50 px-5 py-6 bg-background/50 backdrop-blur-sm focus:border-blue-500/50 transition-all text-sm sm:text-base shadow-inner"
                          autoComplete="off"
                        />
                        <button
                          type="submit"
                          disabled={!selectedFile || isLoading}
                          className="flex-shrink-0 rounded-2xl w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 hover:shadow-xl hover:scale-105 transition-all shadow-lg flex items-center justify-center text-white disabled:opacity-50"
                        >
                          {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Send className="w-5 h-5" />
                          )}
                        </button>
                      </form>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
