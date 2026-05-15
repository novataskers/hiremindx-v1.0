"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Send,
  MailOpen,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Loader2,
} from "lucide-react";

interface EmailCampaign {
  id: number;
  subject: string;
  body: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  replyContent: string | null;
  errorMessage: string | null;
  createdAt: string;
  lead: {
    id: number;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
  } | null;
}

interface CampaignStats {
  total: number;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  draft: number;
  failed: number;
}

const statusConfig: Record<
  string,
  { icon: any; color: string; label: string }
> = {
  draft: {
    icon: Clock,
    color: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    label: "Draft",
  },
  sent: {
    icon: Send,
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    label: "Sent",
  },
  delivered: {
    icon: CheckCircle2,
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    label: "Delivered",
  },
  opened: {
    icon: MailOpen,
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    label: "Opened",
  },
  replied: {
    icon: MessageSquare,
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    label: "Replied",
  },
  bounced: {
    icon: AlertCircle,
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    label: "Bounced",
  },
  failed: {
    icon: AlertCircle,
    color: "bg-destructive/10 text-destructive border-destructive/20",
    label: "Failed",
  },
};

export default function Campaigns() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [stats, setStats] = useState<CampaignStats>({
    total: 0,
    sent: 0,
    opened: 0,
    replied: 0,
    bounced: 0,
    draft: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [expandedCampaign, setExpandedCampaign] = useState<number | null>(null);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session?.user) {
      fetchCampaigns();
      fetchStats();
    }
  }, [session]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("bearer_token");
      const response = await fetch("/api/email-campaigns?limit=50", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch campaigns");

      const data = await response.json();
      setCampaigns(data);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("bearer_token");
      const response = await fetch("/api/email-campaigns/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch stats");

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateMetrics = () => {
    const openRate = stats.sent > 0 ? (stats.opened / stats.sent) * 100 : 0;
    const replyRate = stats.sent > 0 ? (stats.replied / stats.sent) * 100 : 0;
    const bounceRate = stats.sent > 0 ? (stats.bounced / stats.sent) * 100 : 0;
    
    return { openRate, replyRate, bounceRate };
  };

  const metrics = calculateMetrics();

  if (isPending || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Mail className="w-10 h-10" />
              Email Campaigns
            </h1>
            <p className="text-muted-foreground">
              Track your cold email outreach and engagement
            </p>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Send className="w-6 h-6 text-primary" />
                </div>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Sent</p>
                <p className="text-3xl font-bold">{stats.sent}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.draft} drafts
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <MailOpen className="w-6 h-6 text-purple-500" />
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-purple-500">
                    {metrics.openRate.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Opened</p>
                <p className="text-3xl font-bold">{stats.opened}</p>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-purple-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${metrics.openRate}%` }}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-emerald-500">
                    {metrics.replyRate.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Replied</p>
                <p className="text-3xl font-bold">{stats.replied}</p>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${metrics.replyRate}%` }}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-red-500/10 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-red-500">
                    {metrics.bounceRate.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Bounced</p>
                <p className="text-3xl font-bold">{stats.bounced}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.failed} failed
                </p>
              </div>
            </Card>
          </div>

          {/* Campaigns Table */}
          <Card>
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center p-12">
                <Mail className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
                <p className="text-muted-foreground">
                  Start sending emails from your leads page
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company / Contact</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Replied</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => {
                      const StatusIcon =
                        statusConfig[campaign.status]?.icon || Mail;
                      const isExpanded = expandedCampaign === campaign.id;

                      return (
                        <>
                          <TableRow
                            key={campaign.id}
                            className="cursor-pointer hover:bg-accent/50"
                            onClick={() =>
                              setExpandedCampaign(
                                isExpanded ? null : campaign.id
                              )
                            }
                          >
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-semibold">
                                  {campaign.lead?.companyName || "Unknown"}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {campaign.lead?.contactName || "No contact"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm line-clamp-1">
                                {campaign.subject}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  statusConfig[campaign.status]?.color || ""
                                }
                              >
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusConfig[campaign.status]?.label ||
                                  campaign.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {formatDate(campaign.sentAt)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {formatDate(campaign.openedAt)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {formatDate(campaign.repliedAt)}
                              </span>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={6} className="bg-accent/30">
                                <div className="p-4 space-y-4">
                                  <div>
                                    <h4 className="font-semibold mb-2">
                                      Email Body:
                                    </h4>
                                    <div className="bg-background p-4 rounded-lg border border-border">
                                      <pre className="text-sm whitespace-pre-wrap font-sans">
                                        {campaign.body}
                                      </pre>
                                    </div>
                                  </div>

                                  {campaign.replyContent && (
                                    <div>
                                      <h4 className="font-semibold mb-2 text-emerald-500 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" />
                                        Reply Received:
                                      </h4>
                                      <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
                                        <pre className="text-sm whitespace-pre-wrap font-sans">
                                          {campaign.replyContent}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {campaign.errorMessage && (
                                    <div>
                                      <h4 className="font-semibold mb-2 text-destructive flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4" />
                                        Error:
                                      </h4>
                                      <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
                                        <p className="text-sm">
                                          {campaign.errorMessage}
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <span>
                                      Contact:{" "}
                                      {campaign.lead?.contactEmail || "N/A"}
                                    </span>
                                    <span>•</span>
                                    <span>
                                      Created: {formatDate(campaign.createdAt)}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
