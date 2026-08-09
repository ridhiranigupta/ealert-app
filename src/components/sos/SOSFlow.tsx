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
  ShieldCheck,
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
import { AnimatedIllustration } from "@/lib/illustrations";
import { cn } from "@/lib/utils";

const HOLD_MS = 3000;
const COUNTDOWN_S = 3;

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

type Stage = "idle" | "confirm" | "locating" | "location-error" | "sending" | "success" | "error";

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

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function SOSFlowProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<Stage>("idle");
  const triggerSOS = useMutation(api.alerts.triggerSOS);
  const recordCancelled = useMutation(api.alerts.recordCancelledSOS);
  const contacts = useQuery(api.emergencyContacts.list);

  const locationRef = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const resultRef = useRef<{ recipients: number; channel?: string } | null>(null);

  const startSOS = useCallback(() => {
    locationRef.current = null;
    resultRef.current = null;
    setStage("confirm");
  }, []);

  const close = useCallback(() => {
    if (stage === "confirm" || stage === "locating" || stage === "location-error") {
      // A cancelled SOS is recorded so history stays honest.
      recordCancelled().catch(() => {});
      toast("SOS cancelled", { description: "No alert was sent. Stay safe." });
    }
    setStage("idle");
  }, [stage, recordCancelled]);

  const send = useCallback(
    async (withLocation: boolean) => {
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
          lat: locationRef.current?.lat,
          lng: locationRef.current?.lng,
          accuracy: locationRef.current?.accuracy,
          locationLabel: locationRef.current
            ? `${locationRef.current.lat.toFixed(5)}, ${locationRef.current.lng.toFixed(5)}`
            : undefined,
        });
        resultRef.current = { recipients: result.recipientsCount, channel: result.channel };
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
        onClose={close}
        onSend={() => send(true)}
        onSendWithoutLocation={() => send(false)}
        contactCount={contacts?.length ?? 0}
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
  onClose,
  onSend,
  onSendWithoutLocation,
  contactCount,
  result,
}: {
  stage: Stage;
  onClose: () => void;
  onSend: () => void;
  onSendWithoutLocation: () => void;
  contactCount: number;
  result: { recipients: number; channel?: string } | null;
}) {
  const [countdown, setCountdown] = useState(COUNTDOWN_S);

  // Countdown auto-sends when it reaches zero.
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

  return (
    <AnimatePresence>
      {stage !== "idle" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
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

                <div className="mx-auto mt-5 h-2 w-full max-w-[240px] overflow-hidden rounded-full bg-white/10">
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
                    className="h-12 rounded-xl border-white/15 bg-white/5 hover:bg-white/10"
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
              </>
            )}

            {stage === "locating" && (
              <>
                <div className="relative mx-auto flex size-24 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
                  <LocateFixed className="size-9 animate-pulse text-cyan-300" />
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
                  <MapPin className="size-9 text-amber-300" />
                </div>
                <h2 className="mt-4 font-display text-xl font-bold">Location unavailable</h2>
                <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  We couldn't access your location (permission denied or unavailable).
                  You can still send the alert without coordinates.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button variant="outline" className="h-12 rounded-xl border-white/15" onClick={onClose}>
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

            {stage === "sending" && (
              <>
                <div className="relative mx-auto w-40">
                  <AnimatedIllustration kind="alerts" className="w-40" />
                </div>
                <h2 className="mt-2 font-display text-2xl font-bold">Sending your alert…</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Notifying your emergency contacts now.
                </p>
                <Loader2 className="mx-auto mt-5 size-5 animate-spin text-rose-400" />
              </>
            )}

            {stage === "success" && (
              <>
                <div className="relative mx-auto w-36">
                  <AnimatedIllustration kind="success" className="w-36" />
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold text-emerald-300">
                  Alert sent
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Your SOS alert was dispatched to{" "}
                  <span className="font-semibold text-foreground">
                    {result?.recipients ?? contactCount}
                  </span>{" "}
                  contact{result?.recipients === 1 ? "" : "s"}.
                  {result?.recipients === 0 &&
                    " Add emergency contacts so help can reach you faster next time."}
                </p>
                {result?.channel && result.channel !== "demo" && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 font-mono text-xs text-cyan-300">
                    <CheckCircle2 className="size-3.5" />
                    channel: {result.channel}
                  </p>
                )}
                <Button
                  className="mt-6 h-12 w-full rounded-xl bg-emerald-500 font-semibold text-white hover:bg-emerald-600"
                  onClick={onClose}
                >
                  <ShieldCheck className="size-4" />
                  I'm safe — got it
                </Button>
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
                  <Button variant="outline" className="h-12 rounded-xl border-white/15" onClick={onClose}>
                    Close
                  </Button>
                  <Button className="h-12 rounded-xl bg-rose-500 font-semibold text-white" onClick={onSend}>
                    Retry
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
      {/* Pulse rings */}
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
        {/* Progress ring */}
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
