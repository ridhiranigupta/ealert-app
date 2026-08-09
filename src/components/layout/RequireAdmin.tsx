import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Loader2, ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { EmptyState } from "@/components/shared/EmptyState";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useQuery(api.users.isAdmin);

  if (isAdmin === undefined) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          kind="security"
          title="Admin access required"
          description="This area is restricted to EAlert administrators. If you believe this is a mistake, contact the team that manages your workspace."
          action={
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ShieldX className="size-4" />
              Back to my dashboard
            </Link>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
