import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { Link } from "react-router";
import { AlertCard } from "@/components/alerts/AlertCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

export default function AlertsHistory() {
  const alerts = useQuery(api.alerts.listMine);

  const counts = alerts
    ? {
        total: alerts.length,
        sent: alerts.filter((a) => a.status === "sent").length,
        delivered: alerts.filter((a) => a.status === "delivered").length,
        cancelled: alerts.filter((a) => a.status === "cancelled").length,
        failed: alerts.filter((a) => a.status === "failed").length,
      }
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Alert history"
        subtitle="Every SOS event, with its status, location and the contacts it reached."
        actions={
          counts && (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2">
              <ScrollText className="size-4 text-muted-foreground" />
              <span className="font-mono text-sm">
                {counts.total} total
                <span className="mx-1.5 text-muted-foreground/40">|</span>
                {counts.cancelled} cancelled
              </span>
            </div>
          )
        }
      />

      {alerts === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-border bg-card/70" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          kind="alerts"
          title="No alerts yet"
          description="Your emergency activity will appear here. When you trigger an SOS, this is where you can review exactly what was sent."
          action={
            <Button asChild className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, i) => (
            <AlertCard key={alert._id} alert={alert} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
