import { useAuth } from "@/hooks/use-auth";
import { Loader2, ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  // Disabled accounts are blocked from the app (server guards mutations too).
  if (user && user.status === "disabled") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="glass-strong max-w-md rounded-3xl p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-500/15">
            <ShieldX className="size-7 text-rose-300" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">Account disabled</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This account has been disabled by an administrator. If you believe
            this is a mistake, please contact support.
          </p>
        </div>
      </main>
    );
  }

  return children;
}
