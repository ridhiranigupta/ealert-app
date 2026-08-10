import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  MapPin,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { RecipientStatusTag, StatusBadge, type AlertStatusBadge } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const alert = useQuery(api.alerts.getById, { id: id as Id<"alerts"> });
  const retryRecipient = useMutation(api.alerts.retryRecipient);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!id) {
    return (
      <EmptyState
        kind="alerts"
        title="Alert not found"
        description="This alert doesn't exist or you don't have access to it."
        action={
          <Button asChild className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to="/alerts">Back to history</Link>
          </Button>
        }
      />
    );
  }

  if (alert === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-xl bg-card" />
        <div className="h-40 animate-pulse rounded-3xl border border-border bg-card/70" />
      </div>
    );
  }

  if (alert === null) {
    return (
      <EmptyState
        kind="alerts"
        title="Alert not found"
        description="This alert doesn't exist or you don't have access to it."
        action={
          <Button asChild className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to="/alerts">Back to history</Link>
          </Button>
        }
      />
    );
  }

  const cancelled = alert.status === "cancelled";
  const mapLink =
    alert.lat !== undefined && alert.lng !== undefined
      ? `https://maps.google.com/?q=${alert.lat.toFixed(6)},${alert.lng.toFixed(6)}`
      : null;

  const retry = async (recipientId: Id<"alertRecipients">) => {
    setBusyId(recipientId);
    try {
      const res = await retryRecipient({ recipientId });
      const o = res.outcome;
      toast(
        o?.status === "failed"
          ? `Still failed — ${o?.error ?? "unknown error"}`
          : o?.status === "queued"
            ? "Queued — provider is not configured."
            : "Retry dispatched",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/alerts"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Alert history
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Alert id · {alert._id}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            {cancelled ? "SOS cancelled" : "Emergency alert"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Triggered {formatTime(alert.triggeredAt)}
            {alert.updatedAt ? ` · updated ${formatTime(alert.updatedAt)}` : ""}
          </p>
        </div>
        <StatusBadge status={(alert.status ?? "sent") as AlertStatusBadge} />
      </div>

      {/* Location */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <MapPin className="size-4 text-sky-600" />
            Location
          </h2>
          <p className="mt-3 font-mono text-sm">{alert.locationLabel ?? "Not shared"}</p>
          {alert.lat !== undefined && alert.lng !== undefined && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {alert.lat.toFixed(6)}, {alert.lng.toFixed(6)}
              {alert.accuracy !== undefined ? ` · ±${Math.round(alert.accuracy)}m` : ""}
            </p>
          )}
          {mapLink && (
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100"
            >
              <ExternalLink className="size-4" />
              Open in maps
            </a>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <MessageSquareText className="size-4 text-violet-600" />
            Alert message
          </h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-border bg-card/70 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {alert.message ?? "No message recorded."}
          </pre>
          {alert.note && (
            <p className="mt-3 rounded-xl border border-border bg-card/70 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Your note:</span> {alert.note}
            </p>
          )}
        </div>
      </div>

      {/* Recipients / delivery results */}
      <div className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-semibold">
          Delivery results
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {alert.recipientsCount} recipient{alert.recipientsCount === 1 ? "" : "s"}
          </span>
        </h2>

        {alert.failureReason && !cancelled && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            <ShieldAlert className="size-4 shrink-0" />
            {alert.failureReason === "provider_not_configured"
              ? "No SMS or email provider is configured — this alert was recorded but nothing was sent externally. Add provider credentials to enable delivery."
              : alert.failureReason === "no_emergency_contacts"
                ? "No active emergency contacts were configured when this alert was triggered."
                : `Delivery issue: ${alert.failureReason}`}
          </p>
        )}

        {alert.recipients.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {cancelled
              ? "This alert was cancelled before anything was sent."
              : "No recipients were recorded for this alert."}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {alert.recipients.map((r) => (
              <div
                key={r._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.contactName}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {r.phone}
                    {r.channel ? ` · ${r.channel}` : ""}
                    {r.provider ? ` · ${r.provider}` : ""}
                  </p>
                  {r.providerMessageId && (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                      provider id: {r.providerMessageId}
                    </p>
                  )}
                  {r.error && r.error !== "provider_not_configured" && (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-rose-300/80">
                      error: {r.error}
                    </p>
                  )}
                  {r.error === "provider_not_configured" && (
                    <p className="mt-0.5 font-mono text-[10px] text-amber-700/90">
                      provider not configured
                    </p>
                  )}
                  {r.deliveredAt && (
                    <p className="mt-0.5 font-mono text-[10px] text-emerald-300/80">
                      delivered {formatTime(r.deliveredAt)}
                      {r.attempts && r.attempts > 1 ? ` · ${r.attempts} attempt${r.attempts > 1 ? "s" : ""}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RecipientStatusTag status={r.status} />
                  {(r.status === "failed" || r.status === "queued") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-border bg-card"
                      disabled={busyId === r._id}
                      onClick={() => retry(r._id)}
                    >
                      {busyId === r._id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        Historical alert records can't be edited. EAlert helps you contact trusted people — in a
        life-threatening emergency, contact your local emergency services.
      </p>
    </div>
  );
}
