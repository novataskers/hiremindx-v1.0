"use client";

import Sidebar from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

export default function LogPage() {
  const logEntries = [
    { time: "56:45 EPT2", action: "Pursot d ew bualftings", status: "39:33" },
    { time: "09:43 ERE1", action: "Speld Enitic decorminar your valfro", status: "60:32" },
    { time: "60:40 ERE1", action: "Pumme nsc nsquisrolhll blaule orne", status: "60:40" },
    { time: "05:36 ERR1", action: "Ettulce e uw anderwar your rosx", status: "60:30" },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <ScrollText className="w-10 h-10" />
              Job Log
            </h1>
            <p className="text-muted-foreground">Activity history and system logs</p>
          </div>

          <Card className="p-6">
            <div className="space-y-3">
              {logEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-accent/50 transition-colors font-mono text-sm"
                >
                  <span className="text-muted-foreground min-w-[100px]">{entry.time}</span>
                  <span className="flex-1">{entry.action}</span>
                  <span className="text-muted-foreground">{entry.status}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="font-semibold mb-4">Job log</h3>
              <div className="p-4 rounded-lg bg-accent/30 font-mono text-sm">
                <div className="text-primary font-semibold mb-2">HIREMINDX AGENT •</div>
                <div className="text-muted-foreground">
                  lelsed quune berttuu
                  <br />
                  for ugmuniesl scttueletter
                  <br />
                  Job-log
                </div>
              </div>
              <div className="mt-4 text-right">
                <span className="text-xs text-muted-foreground">Jav fronse •</span>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
