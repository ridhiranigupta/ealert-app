import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCheck,
  HeartHandshake,
  Loader2,
  MapPin,
  ShieldAlert,
  Siren,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@/convex/schema";
import { cn } from "@/lib/utils";

export type AlertStatusBadge =
  | "sent"
  | "sending"
  | "queued"
  | "delivered"
  | "partially_delivered"
  | "cancelled"
  | "failed";

const statusStyles: Record<AlertStatusBadge, { label: string; className: string; dot: string }> = {
  sent: { label: "Sent", className: "border-sky-200 bg-sky-50 text-sky-700", dot: "bg-cyan-400" },
  sending: { label: "Sending", className: "border-sky-400/40 bg-sky-400/10 text-sky-300", dot: "bg-sky-400" },
  queued: { label: "Queued", className: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  delivered: { label: "Delivered", className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300", dot: "bg-emerald-400" },
  partially_delivered: {
    label: "Partially delivered",
    className: "border-orange-400/40 bg-orange-400/10 text-orange-300",
    dot: "bg-orange-400",
  },
  cancelled: { label: "Cancelled", className: "border-muted-foreground/30 bg-muted/40 text-muted-foreground", dot: "bg-muted-foreground" },
  failed: { label: "Failed", className: "border-rose-400/40 bg-rose-400/10 text-rose-300", dot: "bg-rose-400" },
};

export function StatusBadge({ status, className }: { status: AlertStatusBadge; className?: string }) {
  const s = statusStyles[status] ?? statusStyles.queued;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", s.className, className)}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          s.dot,
          (status === "sent" || status === "sending") && "animate-pulse-soft",
        )}
      />
      {s.label}
    </Badge>
  );
}

/** Per-recipient delivery state tag. */
export function RecipientStatusTag({ status }: { status: string }) {
  const meta: Record<string, { label: string; className: string }> = {
    delivered: { label: "Delivered", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
    sent: { label: "Sent", className: "border-sky-200 bg-sky-50 text-sky-700" },
    sending: { label: "Sending", className: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
    queued: { label: "Queued", className: "border-amber-200 bg-amber-50 text-amber-700" },
    retrying: { label: "Retrying", className: "border-orange-400/30 bg-orange-400/10 text-orange-300" },
    failed: { label: "Failed", className: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  };
  const m = meta[status] ?? meta.queued;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider",
        m.className,
      )}
    >
      {status === "sending" || status === "retrying" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {m.label}
    </span>
  );
}

export function AlertChannelTag({ channel }: { channel?: string }) {
  if (!channel || channel === "none" || channel === "demo") return null;
  return (
    <span className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {channel}
    </span>
  );
}

const typeMeta: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  sos: { icon: ShieldAlert, className: "bg-rose-500/15 text-rose-300" },
  delivery: { icon: CheckCheck, className: "bg-emerald-400/15 text-emerald-300" },
  contact: { icon: HeartHandshake, className: "bg-violet-100 text-violet-700" },
  security: { icon: ShieldAlert, className: "bg-amber-100 text-amber-700" },
  account: { icon: UserCog, className: "bg-sky-400/15 text-sky-300" },
  location: { icon: MapPin, className: "bg-sky-100 text-sky-700" },
  system: { icon: Bell, className: "bg-muted text-foreground/80" },
  emergency: { icon: Siren, className: "bg-rose-100 text-rose-600" },
};

export function NotificationTypeIcon({
  type,
  className,
}: {
  type: NotificationType;
  className?: string;
}) {
  const meta = typeMeta[type] ?? typeMeta.system;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        meta.className,
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
