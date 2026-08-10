import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  Ban,
  CheckCircle2,
  Loader2,
  Search,
  Shield,
  ShieldCheck,
  ShieldX,
  Siren,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge, type AlertStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const actionOptions = [
  "login",
  "logout",
  "register",
  "profile_update",
  "profile_completed",
  "contact_added",
  "contact_updated",
  "contact_removed",
  "contact_primary",
  "sos_activated",
  "sos_cancelled",
  "location_shared",
  "account_disabled",
  "account_enabled",
  "account_deleted",
  "role_changed",
];

export default function Admin() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin console"
        subtitle="Monitor users, alerts and security activity across EAlert. Sensitive profile data is only shown in moderation views."
        actions={
          <Badge variant="outline" className="gap-1.5 border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 font-mono text-emerald-300">
            <Shield className="size-3.5" /> role: admin
          </Badge>
        }
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1 sm:w-fit">
          <TabTrigger value="overview" label="Overview" />
          <TabTrigger value="users" label="Users" />
          <TabTrigger value="alerts" label="Alerts" />
          <TabTrigger value="activity" label="Activity logs" />
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Overview />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="alerts" className="mt-6">
          <AlertsPanel />
        </TabsContent>
        <TabsContent value="activity" className="mt-6">
          <ActivityPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabTrigger({ value, label }: { value: string; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="h-9 flex-1 gap-2 rounded-xl px-4 font-medium data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-200 sm:flex-none"
    >
      {label}
    </TabsTrigger>
  );
}

/* ---------------- Overview ---------------- */

function Overview() {
  const stats = useQuery(api.admin.stats);
  if (!stats) return <SkeletonGrid />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total users" value={stats.totalUsers} hint={`${stats.disabledUsers} disabled`} tone="lavender" />
        <StatCard icon={UserCheck} label="Active users" value={stats.activeUsers} hint="active accounts" tone="mint" />
        <StatCard icon={Siren} label="Emergency alerts" value={stats.totalAlerts} hint={`${stats.cancelledAlerts} cancelled`} tone="coral" />
        <StatCard icon={Activity} label="Alerts today" value={stats.alertsToday} hint="last 24 hours" tone="cyan" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Sent", value: stats.sentAlerts, tone: "text-cyan-300" },
          { label: "Delivered", value: stats.deliveredAlerts, tone: "text-emerald-300" },
          { label: "Failed", value: stats.failedAlerts, tone: "text-rose-300" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className={cn("mt-2 font-display text-3xl font-bold", s.tone)}>{s.value}</p>
          </div>
        ))}
      </div>
      <EmptyState
        kind="admin"
        title="All systems nominal"
        description="Real-time oversight of the EAlert deployment. Users, alerts and activity appear here as they happen."
      />
    </div>
  );
}

/* ---------------- Users ---------------- */

function UsersPanel() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const users = useQuery(api.admin.listUsers, { search: search || undefined });
  const setUserStatus = useMutation(api.admin.setUserStatus);
  const setUserRole = useMutation(api.admin.setUserRole);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);

  const toggle = async (id: Id<"users">, current: string) => {
    setBusyId(id);
    try {
      await setUserStatus({ id, status: current === "disabled" ? "active" : "disabled" });
      toast.success(current === "disabled" ? "Account re-enabled" : "Account disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (id: Id<"users">, currentRole: string) => {
    const next = currentRole === "admin" ? "user" : "admin";
    setBusyRoleId(id);
    try {
      await setUserRole({ id, role: next });
      toast.success(
        next === "admin" ? "User promoted to admin — role saved" : "Admin role removed — user demoted to member",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change role.");
    } finally {
      setBusyRoleId(null);
    }
  };

  const isSelf = (id: string) => me?._id === id;

  return (
    <div className="space-y-5">
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="h-11 rounded-xl pl-10"
          aria-label="Search users"
        />
      </div>
      {users === undefined ? (
        <SkeletonRows />
      ) : users.length === 0 ? (
        <EmptyState kind="empty" title="No users found" description="Try a different search, or wait for new sign-ups." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Role</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Alerts</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {users.map((u) => (
                <tr key={u._id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3.5">
                    <p className="font-medium">{u.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="hidden px-4 py-3.5 sm:table-cell">
                    <Badge variant="outline" className={cn("font-mono text-[10px] uppercase", u.role === "admin" ? "border-violet-400/40 text-violet-300" : "border-white/10 text-muted-foreground")}>
                      {u.role}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3.5 font-mono text-muted-foreground md:table-cell">{u.alertCount}</td>
                  <td className="px-4 py-3.5">
                    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px] uppercase", u.status === "disabled" ? "text-rose-300" : "text-emerald-300")}>
                      <span className={cn("size-1.5 rounded-full", u.status === "disabled" ? "bg-rose-400" : "bg-emerald-400")} />
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyRoleId === u._id || isSelf(u._id)}
                        onClick={() => changeRole(u._id, u.role)}
                        title={isSelf(u._id) ? "You can't change your own role" : u.role === "admin" ? "Remove admin access" : "Grant admin access"}
                        className={cn(
                          "rounded-lg border-white/12 bg-white/[0.03]",
                          u.role === "admin"
                            ? "text-violet-300 hover:bg-violet-400/10"
                            : "text-muted-foreground hover:text-violet-200 hover:bg-violet-400/10",
                        )}
                      >
                        {busyRoleId === u._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : u.role === "admin" ? (
                          <ShieldX className="size-3.5" />
                        ) : (
                          <UserCog className="size-3.5" />
                        )}
                        {u.role === "admin" ? "Remove" : "Make admin"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === u._id || isSelf(u._id)}
                        onClick={() => toggle(u._id, u.status)}
                        className={cn(
                          "rounded-lg border-white/12 bg-white/[0.03]",
                          u.status === "disabled" ? "text-emerald-300 hover:bg-emerald-400/10" : "text-rose-300 hover:bg-rose-400/10",
                        )}
                      >
                        {busyId === u._id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : u.status === "disabled" ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : (
                          <Ban className="size-3.5" />
                        )}
                        {u.status === "disabled" ? "Enable" : "Disable"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-300" />
        Lists show only what's needed for moderation — no addresses, family names or medical details.
      </p>
    </div>
  );
}

/* ---------------- Alerts ---------------- */

function AlertsPanel() {
  const alerts = useQuery(api.admin.listAlerts, {});
  if (!alerts) return <SkeletonRows />;
  if (alerts.length === 0) {
    return <EmptyState kind="alerts" title="No alerts yet" description="Emergency alerts across all users will appear here." />;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-white/[0.03] font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">User</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">Triggered</th>
            <th className="hidden px-4 py-3 font-medium md:table-cell">Location</th>
            <th className="hidden px-4 py-3 font-medium md:table-cell">Recipients</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {alerts.map((a) => (
            <tr key={a._id} className="transition-colors hover:bg-white/[0.03]">
              <td className="px-4 py-3.5">
                <p className="font-medium">{a.userName}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{a.type}</p>
              </td>
              <td className="hidden px-4 py-3.5 font-mono text-xs text-muted-foreground sm:table-cell">{formatTime(a.triggeredAt)}</td>
              <td className="hidden max-w-[180px] truncate px-4 py-3.5 font-mono text-xs text-muted-foreground md:table-cell">
                {a.locationLabel ?? "—"}
              </td>
              <td className="hidden px-4 py-3.5 font-mono text-xs text-muted-foreground md:table-cell">{a.recipientsCount}</td>
              <td className="px-4 py-3.5">
                <StatusBadge status={(a.status ?? "sent") as AlertStatusBadge} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Activity ---------------- */

function ActivityPanel() {
  const [action, setAction] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const args = useMemo(
    () => ({
      action: action === "all" ? undefined : action,
      search: search || undefined,
      from: from ? new Date(from).getTime() : undefined,
      to: to ? new Date(`${to}T23:59:59`).getTime() : undefined,
    }),
    [action, search, from, to],
  );

  const logs = useQuery(api.admin.listActivity, args);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actionOptions.map((a) => (
                <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="User or metadata…" className="h-10 rounded-xl pl-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl [color-scheme:dark]" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl [color-scheme:dark]" />
        </div>
      </div>

      {logs === undefined ? (
        <SkeletonRows />
      ) : logs.length === 0 ? (
        <EmptyState kind="security" title="No matching activity" description="Adjust the filters to see more audit events." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Result</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Device</th>
                <th className="px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {logs.map((l) => (
                <tr key={l._id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium">{l.userName}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{l.action.replace(/_/g, " ")}</span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase",
                        l.result === "success" ? "text-emerald-300" : l.result === "cancelled" ? "text-muted-foreground" : "text-rose-300",
                      )}
                    >
                      {l.result}
                    </span>
                  </td>
                  <td className="hidden max-w-[200px] truncate px-4 py-3 font-mono text-[11px] text-muted-foreground md:table-cell">
                    {l.device ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatTime(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Skeletons ---------------- */

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl border border-white/5 bg-white/[0.03]" />
      ))}
    </div>
  );
}
