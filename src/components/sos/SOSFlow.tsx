import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlarmClockOff,
  ArrowRight,
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  Phone,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { makeClientAlertId } from "@/convex/lib/alertLogic";
import { Link } from "react-router";
import { AnimatedIllustration } from "@/lib/illustrations";
import { cn } from "@/lib/utils";

const HOLD_MS = 3000;
const COUNTDOWN_S = 3;

/** Regional emergency number (configurable per deployment, no auto-call). */
const EMERGENCY_NUMBER = (import.meta.env.VITE_EMERGENCY_NUMBER as string | undefined) ?? "911";

/* ------------------------------------------------------------------ */
/* Geolocation helper (browser API, no keys required)                  */
/* ------------------------------------------------------------------ */

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 15000,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

type Stage =
  | "idle"
  | "confirm"
  | "locating"
  | "location-error"
  | "sending"
  | "success"
  | "error"
  | "offline";

export interface SOSResult {
  recipients: number;
  channel?: string;
  status?: string;
  delivered?: number;
  queued?: number;
  failed?: number;
  existing?: boolean;
  sessionId?: string;
}

interface SOSFlowValue {
  stage: Stage;
  startSOS: () => void;
  close: () => void;
}

const SOSFlowContext = createContext<SOSFlowValue | null>(null);

export function useSOSFlow() {
  const value = useContext(SOSFlowContext);
  if (!value) throw new Error("useSOSFlow must be used within SOSFlowProvider");
  return value;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function SOSFlowProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>("idle");
  const triggerSOS = useMutation(api.alerts.triggerSOS);
  const recordCancelled = useMutation(api.alerts.recordCancelledSOS);
  const contacts = useQuery(api.emergencyContacts.list);
  const online = useOnlineStatus();

  const locationRef = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const resultRef = useRef<SOSResult | null>(null);
  // One idempotency key per SOS action — reused on retry so the server
  // never creates duplicate alerts for the same action.
  const clientAlertIdRef = useRef<string | null>(null);

  const startSOS = useCallback(() => {
    locationRef.current = null;
    resultRef.current = null;
    clientAlertIdRef.current = makeClientAlertId();
    setStage("confirm");
  }, []);

  const close = useCallback(() => {
    if (stage === "confirm" || stage === "locating" || stage === "location-error") {
      recordCancelled().catch(() => {});
      toast("SOS cancelled", { description: "No alert was sent. Stay safe." });
    }
    clientAlertIdRef.current = null;
    setStage("idle");
  }, [stage, recordCancelled]);

  const send = useCallback(
    async (withLocation: boolean) => {
      // Honest offline handling: never claim an alert was sent offline.
      if (!navigator.onLine) {
        setStage("offline");
        return;
      }

      if (withLocation) {
        setStage("locating");
        try {
          const pos = await getCurrentPosition();
          locationRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
        } catch {
          setStage("location-error");
          return;
        }
      }
      setStage("sending");
      try {
        const result = await triggerSOS({
          clientAlertId: clientAlertIdRef.current ?? undefined,
          lat: locationRef.current?.lat,
          lng: locationRef.current?.lng,
          accuracy: locationRef.current?.accuracy,
          locationLabel: locationRef.current
            ? `${locationRef.current.lat.toFixed(5)}, ${locationRef.current.lng.toFixed(5)}`
            : undefined,
        });
        resultRef.current = {
          recipients: result.recipientsCount,
          channel: result.channel,
          status: result.status,
          delivered: result.delivered,
          queued: result.queued,
          failed: result.failed,
          existing: result.existing,
          sessionId: result.sessionId as string | undefined,
        };
        setStage("success");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not send the alert.");
        setStage("error");
      }
    },
    [triggerSOS],
  );

  const value = useMemo(
    () => ({ stage, startSOS, close }),
    [stage, startSOS, close],
  );

  return (
    <SOSFlowContext.Provider value={value}>
      {children}
      <SOSModal
        stage={stage}
        online={online}
        onClose={close}
        onSend={() => send(true)}
        onSendWithoutLocation={() => send(false)}
        contactCount={contacts?.length ?? 0}
        primaryPhone={contacts?.find((c) => c.isPrimary)?.phone}
        result={resultRef.current}
      />
    </SOSFlowContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

function SOSModal({
  stage,
  online,
  onClose,
  onSend,
  onSendWithoutLocation,
  contactCount,
  primaryPhone,
  result,
}: {
  stage: Stage;
  online: boolean;
  onClose: () => void;
  onSend: () => void;
  onSendWithoutLocation: () => void;
  contactCount: number;
  primaryPhone?: string;
  result: SOSResult | null;
}) {
  const [countdown, setCountdown] = useState(COUNTDOWN_S);

  useEffect(() => {
    if (stage !== "confirm") return;
    setCountdown(COUNTDOWN_S);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage === "confirm" && countdown === 0) onSend();
  }, [stage, countdown, onSend]);

  useEffect(() => {
    if (stage !== "confirm") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, onClose]);

  const delivered = result?.delivered ?? 0;
  const queuedOnly = (result?.queued ?? 0) > 0 && delivered === 0;

  return (
    <AnimatePresence>
      {stage !== "idle" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-violet-950/45 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="SOS emergency flow"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="glow-red relative w-full max-w-md overflow-hidden rounded-[2rem] border border-rose-400/25 bg-card p-7 text-center shadow-2xl"
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-rose-500/25 blur-3xl" />

            {stage === "confirm" && (
              <>
                <div className="relative mx-auto w-40">
                  <AnimatedIllustration kind="sos" className="w-40" />
                </div>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">
                  Emergency alert in {Math.max(countdown, 0)}s
                </h2>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Your trusted contacts will be notified with your location.
                  {contactCount === 0 &&
                    " You haven't added contacts yet — the alert will still be recorded."}
                </p>

                <div className="mx-auto mt-5 h-2 w-full max-w-[240px] overflow-hidden rounded-full bg-rose-100">
                  <motion.div
                    key={countdown}
                    initial={{ width: `${((COUNTDOWN_S - 1) / COUNTDOWN_S) * 100}%` }}
                    animate={{ width: `${(countdown / COUNTDOWN_S) * 100}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-600"
                  />
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {Math.max(countdown, 0)} / {COUNTDOWN_S}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-12 rounded-xl border-rose-200 bg-white hover:bg-rose-50"
                    onClick={onClose}
                  >
                    <AlarmClockOff className="size-4" />
                    Cancel
                  </Button>
                  <Button
                    className="h-12 rounded-xl bg-rose-500 font-semibold text-white hover:bg-rose-600"
                    onClick={onSend}
                  >
                    Send now
                    <ArrowRight className="size-4" />
                  </Button>
                </div>

                {!online && (
                  <p className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <WifiOff className="size-3.5" />
                    You're offline — the alert can't be transmitted until your connection returns.
                  </p>
                )}
              </>
            )}

            {stage === "locating" && (
              <>
                <div className="relative mx-auto flex size-24 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
                  <LocateFixed className="size-9 animate-pulse text-sky-600" />
                </div>
                <h2 className="mt-4 font-display text-xl font-bold">Getting your location…</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The alert will include your exact coordinates.
                </p>
                <Loader2 className="mx-auto mt-5 size-5 animate-spin text-muted-foreground" />
              </>
            )}

            {stage === "location-error" && (
              <>
                <div className="relative mx-auto flex size-24 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10">
                  <MapPin className="size-9 text-amber-600" />
                </div>
                <h2 className="mt-4 font-display text-xl font-bold">Location unavailable</h2>
                <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  We couldn't access your location (permission denied or unavailable).
                  You can still send the alert without coordinates.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button variant="outline" className="h-12 rounded-xl border-border" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    className="h-12 rounded-xl bg-rose-500 font-semibold text-white hover:bg-rose-600"
                    onClick={onSendWithoutLocation}
                  >
                    Send anyway
                  </Button>
                </div>
              </>
            )}

            {stage === "offline" && (
              <>
                <div className="relative mx-auto flex size-24 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10">
                  <WifiOff className="size-9 text-amber-600" />
                </div>
                <h2 className="mt-4 font-display text-xl font-bold">No internet connection</h2>
                <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Your alert could not be transmitted while you're offline. Reconnect and retry —
                  or reach someone directly:
                </p>
                <div className="mt-5 grid gap-2.5">
                  <a
                    href={`tel:${EMERGENCY_NUMBER.replace(/\D/g, "")}`}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-rose-500 font-semibold text-white transition-colors hover:bg-rose-600"
                  >
                    <Phone className="size-4" />
                    Call {EMERGENCY_NUMBER} (emergency services)
                  </a>
                  {primaryPhone && (
                    <a
                      href={`tel:${primaryPhone.replace(/[^+\d]/g, "")}`}
                      className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card font-semibold text-foreground transition-colors hover:bg-violet-50"
                    >
                      <Phone className="size-4" />
                      Call primary contact
                    </a>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="mt-4 h-12 w-full rounded-xl border-border"
                  onClick={onSend}
                  disabled={!online}
                >
                  <RefreshCwSmall />
                  {online ? "Retry now" : "Reconnect to retry"}
                </Button>
              </>
            )}

            {stage === "sending" && (
              <>
                <div className="relative mx-auto w-40">
                  <AnimatedIllustration kind="alerts" className="w-40" />
                </div>
                <h2 className="mt-2 font-display text-2xl font-bold">Sending your alert…</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Notifying your emergency contacts now.
                </p>
                <Loader2 className="mx-auto mt-5 size-5 animate-spin text-rose-500" />
              </>
            )}

            {stage === "success" && (
              <>
                <div className="relative mx-auto w-36">
                  <AnimatedIllustration kind={queuedOnly ? "security" : "success"} className="w-36" />
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold">
                  {queuedOnly ? "Alert recorded" : "Alert sent"}
                </h2>

                {delivered > 0 ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Delivered to <span className="font-semibold text-foreground">{delivered}</span> of{" "}
                    <span className="font-semibold text-foreground">{result?.recipients ?? 0}</span>{" "}
                    contact{result?.recipients === 1 ? "" : "s"}.
                    {(result?.failed ?? 0) > 0 && (
                      <span className="mt-1 block text-rose-600">
                        {result?.failed} could not be reached.
                      </span>
                    )}
                  </p>
                ) : queuedOnly ? (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-amber-700">
                      No SMS or email provider is configured, so nothing was sent outside the app.
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      Your alert and recipients are recorded. Add SMS/email provider credentials to
                      enable real delivery.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-rose-600">
                    No contact could be reached. Check your contacts and try again.
                  </p>
                )}

                {result?.channel && result.channel !== "none" && result.channel !== "demo" && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 font-mono text-xs text-sky-700">
                    <CheckCircle2 className="size-3.5" />
                    channel: {result.channel}
                  </p>
                )}

                <div className="mt-6 grid gap-2.5">
                  {result?.sessionId ? (
                    <Button
                      className="h-12 w-full rounded-xl bg-rose-500 font-semibold text-white hover:bg-rose-600"
                      onClick={onClose}
                    >
                      <Link to={`/emergency/${result.sessionId}`} className="flex w-full items-center justify-center gap-2">
                        <Siren className="size-4" />
                        Open emergency session
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      className="h-12 w-full rounded-xl bg-emerald-500 font-semibold text-white hover:bg-emerald-600"
                      onClick={onClose}
                    >
                      <ShieldCheck className="size-4" />
                      I'm safe — got it
                    </Button>
                  )}
                  <a
                    href={`tel:${EMERGENCY_NUMBER.replace(/\D/g, "")}`}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                  >
                    <Phone className="size-4" />
                    Call {EMERGENCY_NUMBER} if this is an emergency
                  </a>
                </div>
              </>
            )}

            {stage === "error" && (
              <>
                <div className="relative mx-auto w-36">
                  <AnimatedIllustration kind="error" className="w-36" />
                </div>
                <h2 className="mt-1 font-display text-xl font-bold">Something went wrong</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The alert could not be sent. Please try again or call a contact directly.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button variant="outline" className="h-12 rounded-xl border-border" onClick={onClose}>
                    Close
                  </Button>
                  <Button className="h-12 rounded-xl bg-rose-500 font-semibold text-white" onClick={onSend}>
                    Retry
                  </Button>
                </div>
              </>
            )}

            <p className="mt-5 text-[10px] leading-relaxed text-muted-foreground/70">
              EAlert helps you contact trusted people. In a life-threatening emergency, contact your
              local emergency services.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RefreshCwSmall() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Hold-to-trigger SOS button                                          */
/* ------------------------------------------------------------------ */

export function SOSButton({
  size = "lg",
  className,
}: {
  size?: "lg" | "sm";
  className?: string;
}) {
  const { startSOS } = useSOSFlow();
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const firedRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (firedRef.current) return;
    setProgress(0);
  }, []);

  const begin = useCallback(() => {
    firedRef.current = false;
    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const p = Math.min(elapsed / HOLD_MS, 1);
      setProgress(p);
      if (p >= 1) {
        firedRef.current = true;
        setProgress(0);
        startSOS();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [startSOS]);

  useEffect(() => stop, [stop]);

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - progress);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      {size === "lg" && (
        <>
          <span className="animate-sos-ring absolute inset-0 rounded-full border-2 border-rose-500/50" />
          <span
            className="animate-sos-ring absolute inset-0 rounded-full border-2 border-rose-500/40"
            style={{ animationDelay: "0.6s" }}
          />
        </>
      )}
      <button
        type="button"
        aria-label="Press and hold for 3 seconds to trigger an SOS alert"
        className={cn(
          "group relative touch-none select-none rounded-full bg-gradient-to-br from-rose-500 via-rose-600 to-red-700 font-display font-bold text-white shadow-2xl",
          "transition-transform duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-400/50",
          size === "lg" ? "h-44 w-44" : "size-16",
          className,
        )}
        style={{ boxShadow: "0 18px 60px -12px rgba(244,63,94,0.6)" }}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          begin();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          stop();
        }}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg className="pointer-events-none absolute inset-0 size-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="5" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#FECDD3"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            className="transition-[stroke-dashoffset] duration-75 ease-linear"
          />
        </svg>
        <span className="relative flex flex-col items-center gap-0.5">
          <span className={cn("leading-none", size === "lg" ? "text-5xl" : "text-lg")}>SOS</span>
          {size === "lg" && (
            <span className="mt-1 text-[11px] font-medium uppercase tracking-widest text-rose-100/90">
              Hold for 3 seconds
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

/** Compact link-style trigger used in nav contexts. */
export function SOSQuickTrigger({ className }: { className?: string }) {
  const { startSOS } = useSOSFlow();
  return (
    <button
      type="button"
      onClick={startSOS}
      aria-label="Trigger SOS"
      className={cn(
        "flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-700 font-display text-sm font-bold text-white shadow-lg shadow-rose-500/40 transition-transform hover:scale-105 active:scale-95",
        className,
      )}
    >
      SOS
    </button>
  );
}
