import type { Doc } from "@/convex/_generated/dataModel";
import { formatRelative } from "@/lib/format";
import { NotificationTypeIcon } from "@/components/shared/status";
import { cn } from "@/lib/utils";

export function NotificationCard({
  notification,
  onOpen,
}: {
  notification: Doc<"notifications">;
  onOpen: (notification: Doc<"notifications">) => void;
}) {
  const unread = !notification.read;
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn(
        "flex w-full items-start gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all hover:border-violet-200 hover:bg-violet-50/60",
        unread
          ? "border-violet-200 bg-violet-50"
          : "border-border bg-card",
      )}
      aria-label={`${notification.title}. ${unread ? "Unread." : "Read."} ${notification.body}`}
    >
      <NotificationTypeIcon type={notification.type} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("truncate text-sm font-semibold", !unread && "font-medium text-muted-foreground")}>
            {notification.title}
          </p>
          {unread && <span className="size-2 shrink-0 rounded-full bg-violet-400" aria-hidden="true" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{notification.body}</p>
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/70">
          {formatRelative(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}
