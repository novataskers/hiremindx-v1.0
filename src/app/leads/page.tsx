"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Search,
  Mail,
  Edit,
  Trash2,
  Plus,
  Filter,
  ExternalLink,
  Building2,
  MapPin,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: number;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  companyWebsite: string | null;
  industry: string | null;
  location: string | null;
  companySize: string | null;
  matchScore: number | null;
  matchReason: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  contacted: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  replied: "bg-green-500/10 text-green-500 border-green-500/20",
  qualified: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  rejected: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function Leads() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [editForm, setEditForm] = useState({
    status: "",
    notes: "",
    contactName: "",
    contactEmail: "",
  });

  const [emailForm, setEmailForm] = useState({
    subject: "",
    body: "",
  });

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session?.user) {
      fetchLeads();
    }
  }, [session, statusFilter, industryFilter, searchQuery]);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("bearer_token");
      const params = new URLSearchParams();

      if (statusFilter !== "all") params.append("status", statusFilter);
      if (industryFilter !== "all") params.append("industry", industryFilter);
      if (searchQuery) params.append("search", searchQuery);
      params.append("limit", "50");

      const response = await fetch(`/api/leads?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch leads");

      const data = await response.json();
      setLeads(data);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  const handleEditLead = (lead: Lead) => {
    setSelectedLead(lead);
    setEditForm({
      status: lead.status,
      notes: lead.notes || "",
      contactName: lead.contactName || "",
      contactEmail: lead.contactEmail || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedLead) return;

    try {
      const token = localStorage.getItem("bearer_token");
      const response = await fetch(`/api/leads/${selectedLead.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) throw new Error("Failed to update lead");

      toast.success("Lead updated successfully");
      setIsEditDialogOpen(false);
      fetchLeads();
    } catch (error) {
      console.error("Error updating lead:", error);
      toast.error("Failed to update lead");
    }
  };

  const handleDeleteLead = async () => {
    if (!selectedLead) return;

    try {
      const token = localStorage.getItem("bearer_token");
      const response = await fetch(`/api/leads/${selectedLead.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to delete lead");

      toast.success("Lead deleted successfully");
      setIsDeleteDialogOpen(false);
      fetchLeads();
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast.error("Failed to delete lead");
    }
  };

  const handleSendEmail = async () => {
    if (!selectedLead || !emailForm.subject || !emailForm.body) {
      toast.error("Please fill in all email fields");
      return;
    }

    try {
      setIsSending(true);
      const token = localStorage.getItem("bearer_token");
      const response = await fetch("/api/email-campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leadId: selectedLead.id,
          subject: emailForm.subject,
          body: emailForm.body,
          sendNow: true,
        }),
      });

      if (!response.ok) throw new Error("Failed to send email");

      toast.success("Email sent successfully");
      setIsEmailDialogOpen(false);
      setEmailForm({ subject: "", body: "" });

      // Update lead status to contacted
      await fetch(`/api/leads/${selectedLead.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "contacted" }),
      });

      fetchLeads();
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  const uniqueIndustries = Array.from(
    new Set(leads.map((lead) => lead.industry).filter(Boolean))
  );

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
              <Users className="w-10 h-10" />
              Leads
            </h1>
            <p className="text-muted-foreground">
              Manage companies and contacts matched to your expertise
            </p>
          </div>

          {/* Filters and Search */}
          <Card className="p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search companies, contacts, or emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="w-[180px]">
                  <Building2 className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries</SelectItem>
                  {uniqueIndustries.map((industry) => (
                    <SelectItem key={industry} value={industry as string}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Leads Table */}
          <Card>
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center p-12">
                <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No leads found</h3>
                <p className="text-muted-foreground">
                  Upload your CV and generate leads to get started
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold">
                              {lead.companyName}
                            </span>
                            {lead.companyWebsite && (
                              <a
                                href={lead.companyWebsite}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                Visit website
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            {lead.contactName && (
                              <span className="text-sm">{lead.contactName}</span>
                            )}
                            {lead.contactEmail && (
                              <span className="text-xs text-muted-foreground">
                                {lead.contactEmail}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{lead.industry || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            {lead.location || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {lead.matchScore && (
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary"
                                  style={{ width: `${lead.matchScore}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold">
                                {lead.matchScore}%
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusColors[lead.status] || ""}
                          >
                            {lead.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setSelectedLead(lead);
                                setEmailForm({
                                  subject: `Partnership opportunity with ${lead.companyName}`,
                                  body: `Hi ${lead.contactName || "there"},\n\nI came across ${lead.companyName} and was impressed by your work in ${lead.industry}. ${lead.matchReason}\n\nI'd love to explore potential collaboration opportunities. Would you be open to a brief call?\n\nBest regards`,
                                });
                                setIsEmailDialogOpen(true);
                              }}
                              title="Send Email"
                            >
                              <Mail className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditLead(lead)}
                              title="Edit Lead"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setSelectedLead(lead);
                                setIsDeleteDialogOpen(true);
                              }}
                              title="Delete Lead"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      </main>

      {/* Edit Lead Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>
              Update lead information and status
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="contact-name">Contact Name</Label>
              <Input
                id="contact-name"
                value={editForm.contactName}
                onChange={(e) =>
                  setEditForm({ ...editForm, contactName: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="contact-email">Contact Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={editForm.contactEmail}
                onChange={(e) =>
                  setEditForm({ ...editForm, contactEmail: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(value) =>
                  setEditForm({ ...editForm, status: value })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={4}
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm({ ...editForm, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedLead?.companyName}? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteLead}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Email to {selectedLead?.companyName}</DialogTitle>
            <DialogDescription>
              Compose and send a cold email to {selectedLead?.contactName || "this lead"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={emailForm.subject}
                onChange={(e) =>
                  setEmailForm({ ...emailForm, subject: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                rows={10}
                value={emailForm.body}
                onChange={(e) =>
                  setEmailForm({ ...emailForm, body: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEmailDialogOpen(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
