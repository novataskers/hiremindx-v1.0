"use client";

import { Upload, MessageSquare, User, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";
import { authClient, useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const menuItems = [
  { icon: Upload, label: "Assist", href: "/assist" },
  { icon: MessageSquare, label: "Outreach", href: "/outreach" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, refetch } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  const handleSignOut = async () => {
    const { error } = await authClient.signOut();
    if (error?.code) {
      toast.error("Failed to sign out");
    } else {
      localStorage.removeItem("bearer_token");
      refetch();
      router.push("/");
      toast.success("Signed out successfully");
    }
  };

  const closeSidebar = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Menu Button - Fixed positioning */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden bg-card/80 backdrop-blur-sm border border-border"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 border-r border-border bg-card p-4 sm:p-6 flex flex-col z-40 transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="pt-12 lg:pt-0">
          <Logo className="mb-6 sm:mb-8" />
        </div>
        
        <nav className="flex-1 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSidebar}
                className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-border space-y-2">
          {/* Profile Section */}
          {session?.user && (
            <div className="mb-3">
              <div className="flex items-center gap-2 sm:gap-3 px-2 py-2">
                <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">
                    {session.user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">{session.user.name}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{session.user.email}</p>
                </div>
              </div>
            </div>
          )}

          <Separator className="my-2" />

          {/* Profile Link */}
          <Link
            href="/settings"
            onClick={closeSidebar}
            className="flex items-center gap-3 px-3 sm:px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <User className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">Profile</span>
          </Link>

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 sm:px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-full text-left"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">Sign out</span>
          </button>

          <div className="text-[10px] sm:text-xs text-muted-foreground mt-3 sm:mt-4 px-2">Powered by GPT-4</div>
        </div>
      </aside>
    </>
  );
}