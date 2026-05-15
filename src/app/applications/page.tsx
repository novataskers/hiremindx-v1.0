"use client";

import Sidebar from "@/components/Sidebar";
import { FileText, CheckCircle2, XCircle, Clock, Search, Filter } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const applications = [
  { company: "TechCorp", role: "Senior Developer", status: "pending", date: "2 days ago" },
  { company: "StartupXYZ", role: "Product Manager", status: "interview", date: "5 days ago" },
  { company: "Innovation Labs", role: "UX Designer", status: "accepted", date: "1 week ago" },
  { company: "Digital Agency", role: "Marketing Lead", status: "rejected", date: "2 weeks ago" },
  { company: "FinTech Co", role: "Data Analyst", status: "pending", date: "3 days ago" },
  { company: "CloudSystems", role: "Backend Engineer", status: "interview", date: "4 days ago" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  accepted: {
    label: "Accepted",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  rejected: {
    label: "Rejected",
    color: "text-red-400",
    bg: "bg-red-500/10 border border-red-500/20",
    dot: "bg-red-400",
  },
  interview: {
    label: "Interview",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border border-blue-500/20",
    dot: "bg-blue-400",
  },
  pending: {
    label: "Pending",
    color: "text-zinc-400",
    bg: "bg-white/[0.06] border border-white/[0.08]",
    dot: "bg-zinc-400",
  },
};

const FILTERS = ["All", "Pending", "Interview", "Accepted", "Rejected"];

export default function Applications() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen bg-black items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!session?.user) return null;

  const filtered = applications.filter((a) => {
    const matchesFilter = filter === "All" || a.status === filter.toLowerCase();
    const matchesSearch =
      !search ||
      a.company.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const counts = {
    total: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    interview: applications.filter((a) => a.status === "interview").length,
    accepted: applications.filter((a) => a.status === "accepted").length,
  };

  return (
    <div className="flex min-h-screen bg-black text-white">
      <Sidebar />

      <main className="flex-1 lg:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-16 lg:mt-0 mb-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-4">
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-400">Job Search</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-white leading-none mb-2">
              Applications
            </h1>
            <p className="text-zinc-500 text-sm">Track all your job applications</p>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
          >
            {[
              { label: "Total", value: counts.total, color: "text-white" },
              { label: "Pending", value: counts.pending, color: "text-zinc-400" },
              { label: "Interviews", value: counts.interview, color: "text-blue-400" },
              { label: "Accepted", value: counts.accepted, color: "text-emerald-400" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
              >
                <p className={`text-2xl font-black tracking-tighter ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </motion.div>

          {/* Search + filters */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex flex-col sm:flex-row gap-3 mb-5"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company or role..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`h-10 px-3.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                    filter === f
                      ? "bg-white/[0.10] text-white border border-white/[0.12]"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Applications list */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02]"
              >
                <FileText className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No applications found</p>
              </motion.div>
            ) : (
              filtered.map((app, idx) => {
                const cfg = STATUS_CONFIG[app.status];
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + idx * 0.05, duration: 0.3 }}
                    className="flex items-center justify-between gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-200 cursor-default"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Company avatar */}
                      <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-zinc-300">
                          {app.company[0]}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{app.role}</p>
                        <p className="text-xs text-zinc-500">{app.company}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-zinc-600 hidden sm:block">{app.date}</span>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
