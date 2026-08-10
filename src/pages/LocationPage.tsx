import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Crosshair,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Share2,
  Timer,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime } from "@/lib/format";

interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

function getPosition(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default function LocationPage() {
  const saved = useQuery(api.locations.latest);
  const session = useQuery(api.locationSessions.getActiveSession);
  const saveLocation = useMutation(api.locations.save);
  const startSession = useMutation(api.locationSessions.startSession);
  const updateSession = useMutation(api.locationSessions.updateSession);
  const stopSession = useMutation(api.locationSessions.stopSession);

  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeoutMin, setTimeoutMin] = useState("30");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick to keep the session countdown fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingMs = session && !session.expired ? session.expiresAt - now : 0;

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const f = await getPosition();
      setFix(f);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("denied")
          ? "Location permission was denied. Enable it in your browser settings to share live coordinates."
          : "Couldn't determine your location right now.",
      );
    } finally {
      setLocating(false);
    }
  };

  const share = async () => {
    const target = fix ?? (saved ? { lat: saved.lat, lng: saved.lng, accuracy: saved.accuracy, timestamp: saved.createdAt } : null);
    if (!target) {
      toast.error("Get your location first");
      return;
    }
    try {
      await saveLocation({
        lat: target.lat,
        lng: target.lng,
        accuracy: target.accuracy,
        source: "gps",
      });
      toast.success("Location shared — recorded with a timestamp");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not share location.");
    }
  };

  const start = async () => {
    setSessionBusy(true);
    try {
      await startSession({ timeoutMinutes: Number(timeoutMin) });
      toast.success(`Location sharing started for ${timeoutMin} minutes`);
      await locate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start sharing.");
    } finally {
      setSessionBusy(false);
    }
  };

  const updateNow = async () => {
    setSessionBusy(true);
    try {
      const f = await getPosition();
      setFix(f);
      await updateSession({ lat: f.lat, lng: f.lng, accuracy: f.accuracy });
      toast.success("Location updated");
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.includes("expired")
          ? "Session expired — start a new one."
          : err instanceof Error && err.message.includes("denied")
            ? "Location permission was denied."
            : "Couldn't update location right now.",
      );
    } finally {
      setSessionBusy(false);
    }
  };

  const stop = async () => {
    setSessionBusy(true);
    try {
      await stopSession();
      toast.success("Location sharing stopped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not stop sharing.");
    } finally {
      setSessionBusy(false);
    }
  };

  const display = fix ?? (saved ? { lat: saved.lat, lng: saved.lng, accuracy: saved.accuracy, timestamp: saved.createdAt } : null);
  const mapLink = display ? `https://maps.google.com/?q=${display.lat.toFixed(6)},${display.lng.toFixed(6)}` : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Location"
        subtitle="Your live coordinates, ready to include in any SOS alert. Location is only collected while you explicitly share it."
        actions={
          <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" onClick={locate} disabled={locating}>
            {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
            {fix ? "Refresh location" : "Get my location"}
          </Button>
        }
      />

      {/* Live sharing session */}
      <div
        className={
          session && !session.expired
            ? "rounded-3xl border border-emerald-400/30 bg-emerald-400/[0.07] p-6"
            : "rounded-3xl border border-border bg-card p-6"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Timer className={session && !session.expired ? "size-4 text-emerald-300" : "size-4 text-muted-foreground"} />
              Live location sharing
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {session && !session.expired
                ? `Active — started ${formatTime(session.startedAt)} · expires in ${formatRemaining(remainingMs)}`
                : "Share your location for a limited, clearly explained session. Nothing is collected unless you start one."}
            </p>
          </div>

          {session && !session.expired ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                onClick={updateNow}
                disabled={sessionBusy}
              >
                {sessionBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Update now
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20"
                onClick={stop}
                disabled={sessionBusy}
              >
                <XCircle className="size-3.5" />
                Stop sharing
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={timeoutMin} onValueChange={setTimeoutMin}>
                <SelectTrigger className="h-10 w-36 rounded-xl" aria-label="Sharing duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="h-10 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
                onClick={start}
                disabled={sessionBusy}
              >
                {sessionBusy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                Start sharing
              </Button>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          This is a web app: sharing only continues while this tab is open, and stops when the session
          expires. A future native app can extend this with true background tracking.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Map placeholder */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card lg:col-span-3">
          <div className="bg-grid absolute inset-0 opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/[0.06] via-transparent to-violet-500/[0.08]" />
          {display ? (
            <div className="relative flex h-[320px] flex-col items-center justify-center sm:h-[420px]">
              <div className="relative">
                <span className="animate-sos-ring absolute inset-0 rounded-full border-2 border-cyan-400/50" />
                <span className="relative flex size-14 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/15 backdrop-blur">
                  <MapPin className="size-6 text-sky-600" />
                </span>
              </div>
              <p className="mt-6 font-mono text-sm text-foreground/90">
                {display.lat.toFixed(6)}, {display.lng.toFixed(6)}
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                ±{Math.round(display.accuracy ?? 0)}m accuracy
              </p>
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
          ) : (
            <div className="flex h-[320px] flex-col items-center justify-center gap-3 px-6 text-center sm:h-[420px]">
              <LocateFixed className="size-8 text-muted-foreground/60" />
              <p className="max-w-xs text-sm text-muted-foreground">
                Your coordinates will appear here. Hit <span className="font-medium text-foreground">Get my location</span> to request a GPS fix.
              </p>
              {error && (
                <p className="max-w-sm rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="font-display text-base font-semibold">Current fix</h2>
            <dl className="mt-4 space-y-3">
              {[
                ["Latitude", display ? display.lat.toFixed(6) : "—"],
                ["Longitude", display ? display.lng.toFixed(6) : "—"],
                ["Accuracy", display ? `±${Math.round(display.accuracy ?? 0)} m` : "—"],
                ["Timestamp", display ? formatTime(display.timestamp) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="truncate font-mono text-sm">{v}</dd>
                </div>
              ))}
            </dl>
            <Button className="mt-5 w-full rounded-xl bg-sky-500 text-white hover:bg-sky-600" onClick={share}>
              <Share2 className="size-4" />
              Share my location
            </Button>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="font-display text-base font-semibold">Privacy</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              EAlert uses the browser's native geolocation API. Your location is only collected when
              you share it or trigger SOS — never in the background without a session.
            </p>
            <p className="mt-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <RefreshCw className="size-3.5" />
              swap-in: mapbox · google maps
            </p>
          </div>

          {saved && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">
              <MapPin className="size-4 shrink-0" />
              Last recorded check-in: {formatTime(saved.createdAt)}
            </div>
          )}
        </div>
      </div>

      {!saved && !fix && (
        <EmptyState
          kind="location"
          title="No location shared yet"
          description="Share your location to record a timestamped check-in that appears in your alert history."
        />
      )}
    </div>
  );
}
