import { Badge } from "@/components/ui/badge";
import {
  Bell,
  HeartHandshake,
  MapPin,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type AlertStatusBadge = "sent" | "delivered" | "cancelled" | "failed";

const statusStyles: Record<AlertStatusBadge, { label: string; className: string; dot: string }> = {
  sent: { label: "Sent", className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300", dot: "bg-cyan-400" },
  delivered: { label: "Delivered", className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300", dot: "bg-emerald-400" },
  cancelled: { label: "Cancelled", className: "border-muted-foreground/30 bg-muted/40 text-muted-foreground", dot: "bg-muted-foreground" },
  failed: { label: "Failed", className: "border-rose-400/40 bg-rose-400/10 text-rose-300", dot: "bg-rose-400" },
};

export function StatusBadge({ status, className }: { status: AlertStatusBadge; className?: string }) {
  const s = statusStyles[status] ?? statusStyles.sent;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", s.className, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot, status === "sent" && "animate-pulse-soft")} />
      {s.label}
    </Badge>
  );
}

export function AlertChannelTag({ channel }: { channel?: string }) {
  if (!channel || channel === "demo") return null;
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {channel}
    </span>
  );
}

const typeMeta: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  sos: { icon: ShieldAlert, className: "bg-rose-500/15 text-rose-300" },
  contact: { icon: HeartHandshake, className: "bg-violet-500/15 text-violet-300" },
  security: { icon: ShieldAlert, className: "bg-amber-400/15 text-amber-300" },
  location: { icon: MapPin, className: "bg-cyan-400/15 text-cyan-300" },
  system: { icon: Bell, className: "bg-white/10 text-foreground/80" },
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
