import type { Doc } from "@/convex/_generated/dataModel";
import { ChevronRight, MapPin, MessageSquareText, Users } from "lucide-react";
import { Link } from "react-router";
import { formatRelative, formatTime } from "@/lib/format";
import { AlertChannelTag, StatusBadge, type AlertStatusBadge } from "@/components/shared/status";
import { cn } from "@/lib/utils";

export type AlertWithRecipients = Doc<"alerts"> & {
  recipients: Doc<"alertRecipients">[];
};

const recipientDot: Record<string, string> = {
  delivered: "bg-emerald-400",
  sent: "bg-cyan-400",
  sending: "bg-sky-400",
  queued: "bg-amber-400",
  retrying: "bg-orange-400",
  failed: "bg-rose-400",
};

export function AlertCard({ alert, index }: { alert: AlertWithRecipients; index: number }) {
  const status = (alert.status ?? "sent") as AlertStatusBadge;
  const cancelled = status === "cancelled";

  return (
    <Link
      to={`/alerts/${alert._id}`}
      className={cn(
        "group block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-violet-200",
        cancelled && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-xl font-display text-lg font-bold",
              cancelled ? "bg-muted text-muted-foreground" : "bg-rose-500/15 text-rose-300",
            )}
          >
            {cancelled ? "✕" : "!"}
          </span>
          <div>
            <p className="font-display text-sm font-semibold">
              {cancelled ? "SOS cancelled" : "SOS alert"}
              <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                #{index + 1}
              </span>
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {formatTime(alert.triggeredAt)} · {formatRelative(alert.triggeredAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertChannelTag channel={alert.channel} />
          <StatusBadge status={status} />
          <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>
      </div>

      {alert.failureReason && !cancelled && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-700">
          {alert.failureReason === "provider_not_configured"
            ? "No SMS/email provider configured — nothing was sent externally."
            : alert.failureReason === "no_emergency_contacts"
              ? "No active emergency contacts were configured."
              : `Delivery issue: ${alert.failureReason}`}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card/70 px-3 py-2.5">
          <MapPin className="size-4 shrink-0 text-sky-600" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Location</p>
            <p className="truncate font-mono text-xs">
              {alert.locationLabel ?? "Not shared"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card/70 px-3 py-2.5">
          <Users className="size-4 shrink-0 text-violet-600" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Notified</p>
            <p className="truncate font-mono text-xs">
              {alert.recipientsCount > 0 ? `${alert.recipientsCount} contact${alert.recipientsCount === 1 ? "" : "s"}` : "None"}
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2.5 rounded-xl border border-border bg-card/70 px-3 py-2.5 sm:flex">
          <MessageSquareText className="size-4 shrink-0 text-rose-300" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Channel</p>
            <p className="truncate font-mono text-xs">{alert.channel && alert.channel !== "none" ? alert.channel : "—"}</p>
          </div>
        </div>
      </div>

      {alert.recipients.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {alert.recipients.map((r) => (
            <span
              key={r._id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              <span className={cn("size-1.5 rounded-full", recipientDot[r.status] ?? "bg-muted-foreground")} />
              {r.contactName}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
