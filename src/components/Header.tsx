"use client";

import Logo from "./Logo";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSession, authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { resetOnboarding } from "@/lib/onboarding";
import { LogOut, Crown, Trash2, Palette } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTheme } from "./ThemeProvider";
import SignInModal from "./SignInModal";

export default function Header() {
  const { data: session, isPending, refetch } = useSession();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-6">
            <div className="w-20 h-8 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </header>
    );
  }

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

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
        const response = await fetch("/api/user/delete", {
          method: "DELETE",
          credentials: "include",
        });

      if (!response.ok) {
        throw new Error("Failed to delete account");
      }

        resetOnboarding();
        localStorage.removeItem("bearer_token");
        localStorage.removeItem("devSession");
        localStorage.removeItem("hiremindx_tour_seen");
        document.cookie = "devSession=; path=/; max-age=0";
        toast.success("Account deleted successfully");
        window.location.href = "/";
    } catch (error) {
      toast.error("Failed to delete account. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-6">
            {isPending ? (
              <div className="w-20 h-8 bg-muted animate-pulse rounded" />
                  ) : session?.user ? (
                    <>
                          <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <button className="relative h-9 w-9 rounded-full ring-1 ring-white/60 transition-all focus:outline-none p-0 bg-zinc-900 overflow-hidden">
                          <Avatar className="h-full w-full rounded-full">
                            <AvatarFallback className="bg-zinc-900 text-white text-xs font-bold">
                              {session.user.name?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </button>
                      </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium">{session.user.name}</p>
                        <p className="text-xs text-muted-foreground">{session.user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/premium" className="cursor-pointer">
                        <Crown className="w-4 h-4 mr-2" />
                        Premium
                      </Link>
                    </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="cursor-pointer">
                          <Palette className="w-4 h-4 mr-2" />
                          Theme
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem 
                            onClick={() => setTheme("dark")}
                            className="cursor-pointer"
                          >
                            {theme === "dark" && "✓ "}Dark
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setTheme("light")}
                            className="cursor-pointer"
                          >
                            {theme === "light" && "✓ "}Light
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuItem 
                        onClick={() => setShowDeleteDialog(true)} 

                      className="cursor-pointer text-red-500 focus:text-red-500"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Account
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
                ) : (
                  <>
                    <Button size="sm" onClick={() => setIsSignInModalOpen(true)}>
                      Get started
                    </Button>
                  </>
                )}
            </div>
          </div>
        </header>

        <SignInModal 
          isOpen={isSignInModalOpen} 
          onClose={() => setIsSignInModalOpen(false)} 
        />

        {/* Delete Account Confirmation Dialog */}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {isDeleting ? "Deleting..." : "Yes, delete my account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}