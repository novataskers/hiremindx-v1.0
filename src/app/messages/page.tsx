"use client";

import { useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Download,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Trash2,
} from "lucide-react";

type Conversation = {
  name: string;
  company: string;
  lastMessage: string;
  time: string;
  unread: boolean;
};

type MessageAttachment = {
  name: string;
  url: string;
  type: string;
};

type Message = {
  id: number;
  text: string;
  time: string;
  sender: "me" | "other";
  attachment?: MessageAttachment;
};

const formatTime = () =>
  new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function renderMessageText(text: string) {
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.match(urlRegex)) {
      const href = part.startsWith("http") ? part : `https://${part}`;

      return (
        <a
          key={`${part}-${index}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 break-all text-inherit font-medium hover:opacity-80"
        >
          {part}
        </a>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function downloadAttachment(attachment: MessageAttachment) {
  const link = document.createElement("a");
  link.href = attachment.url;
  link.download = attachment.name;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function Messages() {
  const conversations: Conversation[] = useMemo(
    () => [
      {
        name: "Sarah Chen",
        company: "TechCorp",
        lastMessage: "Thanks for your application! Visit https://techcorp.example/interview for updates.",
        time: "2h ago",
        unread: true,
      },
      {
        name: "Mike Johnson",
        company: "StartupXYZ",
        lastMessage: "Would you be available for an interview?",
        time: "1d ago",
        unread: true,
      },
      {
        name: "Emma Williams",
        company: "Innovation Labs",
        lastMessage: "Great to meet you!",
        time: "3d ago",
        unread: false,
      },
    ],
    [],
  );

  const [selectedConversation, setSelectedConversation] = useState(0);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Thanks for your application! We're reviewing it now.",
      time: "2 hours ago",
      sender: "other",
    },
    {
      id: 2,
      text: "You can also review the role details at www.techcorp.example/jobs/frontend-engineer",
      time: "1 hour ago",
      sender: "other",
    },
    {
      id: 3,
      text: "Here is the job description PDF.",
      time: "55 minutes ago",
      sender: "other",
      attachment: {
        name: "job-description.pdf",
        url: "/file.svg",
        type: "application/pdf",
      },
    },
  ]);

  const selectedConversationData = conversations[selectedConversation];

  const deleteMessage = (id: number) => {
    setMessages((prev) => {
      const updatedMessages = prev.filter((msg) => msg.id !== id);
      return updatedMessages;
    });
  };

  const sendMessage = () => {
    if (!message.trim() && !attachment) return;

    const newMessage: Message = {
      id: Date.now(),
      text: message.trim(),
      time: formatTime(),
      sender: "me",
      attachment: attachment
        ? {
            name: attachment.name,
            url: URL.createObjectURL(attachment),
            type: attachment.type || "application/octet-stream",
          }
        : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    setMessage("");
    setAttachment(null);
    setShowAttachmentMenu(false);
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <MessageSquare className="w-10 h-10" />
              Messages
            </h1>
            <p className="text-muted-foreground">
              Chat with recruiters and hiring managers
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 h-[600px]">
            <Card className="p-4 overflow-y-auto">
              <h2 className="font-semibold mb-4">Conversations</h2>
              <div className="space-y-2">
                {conversations.map((conv, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedConversation(idx)}
                      className={`w-full p-3 rounded-lg text-left transition-colors group ${
                        selectedConversation === idx
                          ? "bg-primary/20 border border-primary/30"
                          : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative">
                          <Avatar className="w-10 h-10 bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {conv.name[0]}
                          </Avatar>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <h3 className="font-semibold text-sm truncate">
                              {conv.name}
                            </h3>
                            <span className="text-xs text-muted-foreground group-hover:hidden">
                              {conv.time}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {conv.company}
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-muted-foreground truncate">
                              {conv.lastMessage}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </Card>

            <Card className="col-span-2 p-6 flex flex-col">
              <div className="mb-4 pb-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="w-10 h-10 bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {selectedConversationData?.name[0]}
                    </Avatar>
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {selectedConversationData?.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedConversationData?.company}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                {messages.map((msg) => {
                  const isMe = msg.sender === "me";

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 items-end group ${
                        isMe ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`rounded-lg p-3 max-w-[70%] ${
                          isMe
                            ? "bg-primary text-primary-foreground"
                            : "bg-accent"
                        }`}
                      >
                        {msg.text && (
                          <p className="text-sm break-words whitespace-pre-wrap">
                            {renderMessageText(msg.text)}
                          </p>
                        )}

                        {msg.attachment && (
                          <div
                            className={`mt-3 rounded-md border p-3 ${
                              isMe
                                ? "border-primary-foreground/20 bg-primary-foreground/10"
                                : "border-border bg-background/80"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {msg.attachment.name}
                                </p>
                                <p className="text-xs opacity-70 truncate">
                                  {msg.attachment.type || "Attachment"}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={isMe ? "secondary" : "outline"}
                                className="shrink-0"
                                onClick={() =>
                                  downloadAttachment(msg.attachment!)
                                }
                              >
                                <Download className="w-4 h-4 mr-1" />
                                Download
                              </Button>
                            </div>
                          </div>
                        )}

                        <span
                          className={`text-xs mt-1 block ${
                            isMe ? "opacity-70" : "text-muted-foreground"
                          }`}
                        >
                          {msg.time}
                        </span>
                      </div>

                      {isMe && (
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive shrink-0"
                          title="Delete message"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {attachment && (
                <div className="mb-3 flex items-center gap-2 bg-accent/20 px-3 py-2 rounded-lg border border-accent/30">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="text-xs flex-1 truncate">
                    {attachment.name}
                  </span>
                  <button
                    onClick={() => setAttachment(null)}
                    className="text-xs hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex gap-2 relative">
                <button
                  onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                  className="shrink-0 p-2 hover:bg-accent rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>

                {showAttachmentMenu && (
                  <div className="absolute bottom-12 left-0 bg-card border border-border rounded-lg shadow-lg p-2 z-20 min-w-[180px]">
                    <button
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "*/*";
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) {
                            setAttachment(file);
                            setShowAttachmentMenu(false);
                          }
                        };
                        input.click();
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-accent rounded transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4" />
                        Attach File
                      </div>
                    </button>
                  </div>
                )}

                <Input
                  placeholder="Type your message..."
                  className="flex-1"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      (message.trim() || attachment)
                    ) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  disabled={!message.trim() && !attachment}
                  onClick={sendMessage}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
