import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { BellOff, CheckCheck, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

export default function NotificationsPage() {
  const notifications = useQuery(api.notifications.list);
  const unread = useQuery(api.notifications.unreadCount);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const clearAll = useMutation(api.notifications.clearAll);
  const navigate = useNavigate();

  const handleOpen = async (n: Doc<"notifications">) => {
    if (!n.read) {
      markRead({ id: n._id }).catch(() => {});
    }
    if (n.linkTo) navigate(n.linkTo);
  };

  const handleMarkAll = async () => {
    const count = await markAllRead();
    toast.success(count > 0 ? `${count} marked as read` : "Nothing to mark");
  };

  const handleClear = async () => {
    const count = await clearAll();
    toast.success(count > 0 ? `${count} notifications cleared` : "Already empty");
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifications"
        subtitle="SOS alerts, contact updates, security events and location check-ins."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-violet-50" onClick={handleMarkAll} disabled={(unread ?? 0) === 0}>
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
            <Button variant="outline" className="rounded-xl border-border bg-card hover:bg-violet-50" onClick={handleClear} disabled={(notifications?.length ?? 0) === 0}>
              <Trash2 className="size-4" />
              Clear all
            </Button>
          </div>
        }
      />

      {notifications === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-card/70" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          kind="notifications"
          title="All caught up"
          description="Notifications about SOS alerts, contacts and account security will appear here."
        />
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n) => (
            <NotificationCard key={n._id} notification={n} onOpen={handleOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
