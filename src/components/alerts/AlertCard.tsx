import type { Doc } from "@/convex/_generated/dataModel";
import { MapPin, MessageSquareText, Users } from "lucide-react";
import { formatRelative, formatTime } from "@/lib/format";
import { AlertChannelTag, StatusBadge, type AlertStatusBadge } from "@/components/shared/status";
import { cn } from "@/lib/utils";

export type AlertWithRecipients = Doc<"alerts"> & {
  recipients: Doc<"alertRecipients">[];
};

export function AlertCard({ alert, index }: { alert: AlertWithRecipients; index: number }) {
  const status = (alert.status ?? "sent") as AlertStatusBadge;
  const cancelled = status === "cancelled";

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-white/20",
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
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <MapPin className="size-4 shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Location</p>
            <p className="truncate font-mono text-xs">
              {alert.locationLabel ?? "Not shared"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <Users className="size-4 shrink-0 text-violet-300" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Notified</p>
            <p className="truncate font-mono text-xs">
              {alert.recipientsCount > 0 ? `${alert.recipientsCount} contact${alert.recipientsCount === 1 ? "" : "s"}` : "None"}
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 sm:flex">
          <MessageSquareText className="size-4 shrink-0 text-rose-300" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Channel</p>
            <p className="truncate font-mono text-xs">{alert.channel ?? "demo"}</p>
          </div>
        </div>
      </div>

      {alert.recipients.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {alert.recipients.map((r) => (
            <span
              key={r._id}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {r.contactName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
