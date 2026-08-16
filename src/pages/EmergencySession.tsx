import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ExternalLink,
  HeartHandshake,
  Loader2,
  LocateFixed,
  MapPin,
  MessageSquare,
  Phone,
  Siren,
  Square,
  UserRound,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { formatDistanceMeters } from "@/convex/lib/emergencyLogic";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { RecipientStatusTag } from "@/components/shared/status";
import { EmergencyVideoRoom } from "@/components/emergency/EmergencyVideoRoom";
import { useOnlineStatus } from "@/hooks/use-online";
import { formatTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const EMERGENCY_NUMBER =
  (import.meta.env.VITE_EMERGENCY_NUMBER as string | undefined) ?? "911";
const LOCATION_INTERVAL_MS = 5000;

type SessionData = NonNullable<
  ReturnType<typeof useQuery<typeof api.emergencySessions.getSession>>
>;

function mapsLink(lat: number, lng: number) {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 10000,
    });
  });
}

export default function EmergencySession() {
  const { id } = useParams();
  const sessionId = (id ?? "") as Id<"emergencySessions">;
  const data = useQuery(api.emergencySessions.getSession, { sessionId });
  const markOpened = useMutation(api.emergencySessions.markSessionOpened);
  const markResponding = useMutation(api.emergencySessions.markResponding);
  const updateLocation = useMutation(api.emergencySessions.updateEmergencyLocation);
  const updateResponderLocation = useMutation(api.emergencySessions.updateResponderLocation);
  const startVideo = useMutation(api.emergencySessions.startVideo);
  const joinVideo = useMutation(api.emergencySessions.joinVideo);
  const stopVideo = useMutation(api.emergencySessions.stopVideo);
  const endSession = useMutation(api.emergencySessions.endSession);
  const respondNearby = useMutation(api.emergencyNearby.respondNearby);
  const shareHelperLocation = useMutation(api.emergencyNearby.shareHelperLocation);
  const stopHelperLocation = useMutation(api.emergencyNearby.stopHelperLocation);
  const online = useOnlineStatus();

  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [responding, setResponding] = useState(false);
  const [respondWithLocation, setRespondWithLocation] = useState(false);
  const [shareResponderLocation, setShareResponderLocation] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoJoin, setVideoJoin] = useState<{ url?: string; token?: string; roomId?: string; provider?: string } | null>(null);
  const [locationStreaming, setLocationStreaming] = useState(false);
  const [lastSharedAt, setLastSharedAt] = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const myRole = data?.myRole ?? null;
  const isOpen =
    data?.session?.status === "active" || data?.session?.status === "responding";

  // Verified contacts: record that they opened the session (once).
  useEffect(() => {
    if (!sessionId || myRole !== "verified_contact" || !isOpen) return;
    markOpened({ sessionId }).catch(() => {});
  }, [sessionId, myRole, isOpen, markOpened]);

  // Owner: stream live location while "location sharing" is on.
  useEffect(() => {
    if (myRole !== "owner" || !locationStreaming || !isOpen) return;
    let cancelled = false;

    const push = async () => {
      try {
        const pos = await getPosition();
        if (cancelled) return;
        await updateLocation({
          sessionId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLastSharedAt(Date.now());
      } catch {
        // Keep the interval running — a single failure shouldn't kill the stream.
      }
    };
    push();
    const interval = setInterval(push, LOCATION_INTERVAL_MS);
    intervalRef.current = interval;
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [myRole, locationStreaming, isOpen, sessionId, updateLocation]);

  // Responder: share their own location while opted in.
  useEffect(() => {
    if (myRole !== "verified_contact" || !shareResponderLocation || !isOpen) return;
    let cancelled = false;
    const push = async () => {
      try {
        const pos = await getPosition();
        if (cancelled) return;
        await updateResponderLocation({
          sessionId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      } catch {
        // silent — a single failure shouldn't stop the stream
      }
    };
    push();
    const interval = setInterval(push, LOCATION_INTERVAL_MS);
    intervalRef.current = interval;
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [myRole, shareResponderLocation, isOpen, sessionId, updateResponderLocation]);

  // Nearby helper: share their own location while opted in (responding only).
  useEffect(() => {
    if (myRole !== "helper_nearby" || !shareResponderLocation || !isOpen) return;
    let cancelled = false;
    const push = async () => {
      try {
        const pos = await getPosition();
        if (cancelled) return;
        await shareHelperLocation({
          sessionId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      } catch {
        // silent — a single failure shouldn't stop the stream
      }
    };
    push();
    const interval = setInterval(push, LOCATION_INTERVAL_MS);
    intervalRef.current = interval;
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [myRole, shareResponderLocation, isOpen, sessionId, shareHelperLocation]);

  // Stop streams when the session closes.
  useEffect(() => {
    if (!isOpen) {
      setLocationStreaming(false);
      setShareResponderLocation(false);
    }
  }, [isOpen]);

  const handleEnd = async () => {
    setEnding(true);
    try {
      await endSession({ sessionId });
      toast.success("Emergency session ended.");
      setConfirmEnd(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not end the session.");
    } finally {
      setEnding(false);
    }
  };

  const handleRespond = async () => {
    setResponding(true);
    try {
      await markResponding({ sessionId, shareLocation: respondWithLocation });
      if (respondWithLocation) setShareResponderLocation(true);
      toast.success("You're marked as responding — they can see it now.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark responding.");
    } finally {
      setResponding(false);
    }
  };

  const handleStartVideo = async () => {
    setVideoBusy(true);
    setVideoJoin(null);
    try {
      // Request camera/microphone permission only on explicit action.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      // Stop the test stream — the provider will use its own connection.
      stream.getTracks().forEach((t) => t.stop());
      const res = await startVideo({ sessionId });
      if (!res.configured) {
        toast.info(res.error ?? "Live video isn't configured yet.");
        return;
      }
      setVideoJoin({
        url: res.url,
        token: res.token,
        roomId: res.roomId,
        provider: res.provider,
      });
      toast.success("Live video started.");
    } catch (err) {
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera or microphone permission was denied. Please allow camera and microphone access in your browser."
          : err instanceof Error
            ? err.message
            : "Could not start video.";
      toast.error(message);
    } finally {
      setVideoBusy(false);
    }
  };

  const handleJoinVideo = async () => {
    setVideoBusy(true);
    try {
      const res = await joinVideo({ sessionId });
      if (!res.configured) {
        toast.info(res.error ?? "Live video isn't configured.");
        return;
      }
      if (!res.active || !res.token) {
        toast.info(res.error ?? "No live video is active.");
        return;
      }
      setVideoJoin({ url: res.url, token: res.token, roomId: res.roomId, provider: res.provider });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join video.");
    } finally {
      setVideoBusy(false);
    }
  };

  const handleStopVideo = async () => {
    try {
      await stopVideo({ sessionId });
      setVideoJoin(null);
      toast.success("Video stopped.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not stop video.");
    }
  };

  const handleRespondNearby = async () => {
    setResponding(true);
    try {
      await respondNearby({ sessionId });
      if (respondWithLocation) setShareResponderLocation(true);
      toast.success("You're marked as helping — the sender can see you now.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark you as helping.");
    } finally {
      setResponding(false);
    }
  };

  const handleStopHelperLocation = async () => {
    try {
      await stopHelperLocation({ sessionId });
      setShareResponderLocation(false);
      toast.success("Location sharing stopped.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not stop sharing.");
    }
  };

  if (!id) {
    return (
      <div className="space-y-6">
        <PageHeader title="Emergency session" subtitle="This link doesn't point to an emergency session." />
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-violet-500" />
      </div>
    );
  }
  const session = data.session;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emergency session"
        subtitle="Live status and actions for this emergency."
      />

      {/* Status banner */}
      <div
        className={`relative overflow-hidden rounded-[1.75rem] border p-6 sm:p-8 ${
          isOpen
            ? "border-rose-200 bg-gradient-to-br from-rose-50 via-white to-white"
            : "border-border bg-card"
        }`}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-rose-200/50 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="relative flex size-16 items-center justify-center">
            {isOpen && (
              <>
                <span className="animate-sos-ring absolute inset-0 rounded-full border-2 border-rose-400/60" />
                <span
                  className="animate-sos-ring absolute inset-0 rounded-full border-2 border-rose-400/40"
                  style={{ animationDelay: "0.5s" }}
                />
              </>
            )}
            <span
              className={`flex size-14 items-center justify-center rounded-full ${
                isOpen ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30" : "bg-muted text-muted-foreground"
              }`}
            >
              <Siren className="size-7" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-rose-400">
              {isOpen ? "Emergency active" : `Session ${session?.status}`}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {isOpen ? `${data.owner.name ?? "This person"} needs help` : "Emergency session closed"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Started {formatTime(session?.startedAt)}</span>
              <span aria-hidden="true">·</span>
              {online ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <Wifi className="size-3.5" /> Connection live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <WifiOff className="size-3.5" /> Offline — reconnecting
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`tel:${EMERGENCY_NUMBER.replace(/\D/g, "")}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-500 px-4 font-semibold text-white transition-colors hover:bg-rose-600"
            >
              <Phone className="size-4" />
              Call {EMERGENCY_NUMBER}
            </a>
            {myRole === "owner" && isOpen && (
              <Button
                variant="outline"
                className="h-11 rounded-xl border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                onClick={() => setConfirmEnd(true)}
              >
                <Square className="size-4" />
                End emergency
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Owner: recipients + live location + video */}
      {myRole === "owner" && (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Live location */}
            <div className="rounded-3xl border border-border bg-card p-6">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <LocateFixed className="size-4 text-sky-600" /> Live location
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.locationUpdatedAt
                  ? `Last update ${timeAgo(data.locationUpdatedAt)} · accuracy ${Math.round(data.latestLocation?.accuracy ?? 0)} m`
                  : "No location shared yet."}
              </p>
              {isOpen && (
                <Button
                  className={`mt-4 w-full rounded-xl ${
                    locationStreaming
                      ? "border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                      : "bg-sky-500 text-white hover:bg-sky-600"
                  }`}
                  onClick={() => setLocationStreaming((v) => !v)}
                >
                  {locationStreaming ? (
                    <>
                      <Square className="size-4" /> Stop sharing location
                    </>
                  ) : (
                    <>
                      <LocateFixed className="size-4" /> Start live location
                    </>
                  )}
                </Button>
              )}
              {data.latestLocation && (
                <a
                  href={mapsLink(data.latestLocation.lat, data.latestLocation.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-700 transition-colors hover:bg-sky-100"
                >
                  <span className="font-mono text-xs">
                    {data.latestLocation.lat.toFixed(5)}, {data.latestLocation.lng.toFixed(5)}
                  </span>
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>

            {/* Live video */}
            <div className="rounded-3xl border border-border bg-card p-6">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Video className="size-4 text-violet-600" /> Emergency video
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional live video for your verified contacts. Camera and microphone are only used
                while you have it enabled.
              </p>
              {!data.videoConfig.configured ? (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Live video is not configured yet. Please configure the LiveKit server
                  (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) to enable it.
                </div>
              ) : videoJoin?.token && videoJoin.url ? (
                <div className="mt-4">
                  <EmergencyVideoRoom
                    url={videoJoin.url}
                    token={videoJoin.token}
                    roomName={videoJoin.roomId ?? ""}
                    displayName={data.owner.name ?? "You"}
                    canPublish
                    autoPublish
                    onLeave={handleStopVideo}
                  />
                </div>
              ) : data.session.videoActive ? (
                <div className="mt-4 space-y-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <span className="size-2 animate-pulse rounded-full bg-emerald-500" /> Live video active
                  </p>
                  <Button
                    className="w-full rounded-xl bg-violet-500 text-white hover:bg-violet-600"
                    onClick={handleStartVideo}
                    disabled={videoBusy}
                  >
                    {videoBusy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
                    Start video in this window
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                    onClick={handleStopVideo}
                  >
                    <VideoOff className="size-4" /> Stop video
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-4 w-full rounded-xl bg-violet-500 text-white hover:bg-violet-600"
                  onClick={handleStartVideo}
                  disabled={videoBusy}
                >
                  {videoBusy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
                  Start emergency video
                </Button>
              )}
            </div>

            {/* Responder status */}
            <div className="rounded-3xl border border-border bg-card p-6">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <HeartHandshake className="size-4 text-emerald-600" /> Responders
              </h2>
              {session.responderName ? (
                <>
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <UserRound className="size-4" />
                    </span>
                    {session.responderName} is responding.
                  </p>
                  {session.responderLocationShared && data.responderLocation && (
                    <a
                      href={mapsLink(data.responderLocation.lat, data.responderLocation.lng)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <span className="font-mono text-xs">
                        {data.responderLocation.lat.toFixed(5)}, {data.responderLocation.lng.toFixed(5)}
                      </span>
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No one has marked themselves as responding yet.
                </p>
              )}
            </div>
          </div>

          {/* Recipients */}
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-7">
            <h2 className="font-display text-base font-semibold">Recipients</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Per-contact delivery state. "App" means they were reached through the EAlert app.
            </p>
            <div className="mt-4 space-y-2.5">
              {data.recipients && data.recipients.length > 0 ? (
                data.recipients.map((r, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                        {r.appRecipient ? <MessageSquare className="size-4" /> : <Phone className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.contactName}</p>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {r.appRecipient ? "EAlert app" : r.channel ?? "sms"}
                        </p>
                        <AppDeliveryTag pushStatus={r.pushStatus} />
                      </div>
                    </div>
                    <RecipientStatusTag status={r.deliveryStatus} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No recipients were notified.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Verified contact view */}
      {myRole === "verified_contact" && (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Live location */}
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <MapPin className="size-4 text-sky-600" /> Live location
            </h2>
            {data.latestLocation ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last updated {timeAgo(data.locationUpdatedAt ?? data.latestLocation.timestamp)} ·
                  accuracy {Math.round(data.latestLocation.accuracy ?? 0)} m
                </p>
                <a
                  href={mapsLink(data.latestLocation.lat, data.latestLocation.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-700 transition-colors hover:bg-sky-100"
                >
                  <span className="font-mono text-xs">
                    {data.latestLocation.lat.toFixed(5)}, {data.latestLocation.lng.toFixed(5)}
                  </span>
                  <ExternalLink className="size-4" />
                </a>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {data.session.locationActive
                  ? "Waiting for the first location update…"
                  : "No live location is being shared right now."}
              </p>
            )}
          </div>

          {/* Video */}
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Video className="size-4 text-violet-600" /> Live video
            </h2>
            {videoJoin?.token && videoJoin.url ? (
              <div className="mt-3">
                <EmergencyVideoRoom
                  url={videoJoin.url}
                  token={videoJoin.token}
                  roomName={videoJoin.roomId ?? ""}
                  displayName="You"
                  canPublish
                  onLeave={() => setVideoJoin(null)}
                />
              </div>
            ) : data.session.videoActive && data.videoConfig.configured ? (
              <>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <span className="size-2 animate-pulse rounded-full bg-emerald-500" /> Live video active
                </p>
                <Button
                  className="mt-3 w-full rounded-xl bg-violet-500 text-white hover:bg-violet-600"
                  onClick={handleJoinVideo}
                  disabled={videoBusy}
                >
                  {videoBusy ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
                  Join live video
                </Button>
              </>
            ) : data.session.videoActive ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Video is active but the video provider isn't configured, so it can't be viewed here.
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Live video has not been enabled by the sender.
              </p>
            )}
          </div>

          {/* Responding */}
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <HeartHandshake className="size-4 text-emerald-600" /> Respond
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {session.responderId
                ? `${session.responderName ?? "Someone"} is already marked as responding.`
                : "Tell them you're on your way."}
            </p>
            {isOpen && !session.responderId && (
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={respondWithLocation}
                    onChange={(e) => setRespondWithLocation(e.target.checked)}
                    className="size-4 rounded border-border accent-emerald-500"
                  />
                  Also share my location with them during this emergency
                </label>
                <Button
                  className="w-full rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
                  onClick={handleRespond}
                  disabled={responding}
                >
                  {responding ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  I'm responding
                </Button>
              </div>
            )}
            {myRole === "verified_contact" && session.responderId && shareResponderLocation && isOpen && (
              <Button
                variant="outline"
                className="mt-4 w-full rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                onClick={() => setShareResponderLocation(false)}
              >
                <Square className="size-4" /> Stop sharing my location
              </Button>
            )}
            {myRole === "verified_contact" && data.owner.phone && (
              <a
                href={`tel:${data.owner.phone.replace(/[^+\d]/g, "")}`}
                className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold transition-colors hover:bg-violet-50"
              >
                <Phone className="size-4" /> Call {data.owner.name ?? "them"}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Nearby helper view: location only while active — never video/audio */}
      {myRole === "helper_nearby" && (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Emergency location (active only) */}
          <div className="rounded-3xl border border-border bg-card p-6 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <MapPin className="size-4 text-sky-600" /> Emergency location
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              You were alerted because you're near this emergency. The location is visible only
              while the emergency is active and is never stored with your alert.
            </p>
            {data.latestLocation ? (
              <>
                <p className="mt-3 text-xs text-muted-foreground">
                  Last updated {timeAgo(data.locationUpdatedAt ?? data.latestLocation.timestamp)} ·
                  accuracy {Math.round(data.latestLocation.accuracy ?? 0)} m
                </p>
                <a
                  href={mapsLink(data.latestLocation.lat, data.latestLocation.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-700 transition-colors hover:bg-sky-100"
                >
                  <span className="font-mono text-xs">
                    {data.latestLocation.lat.toFixed(5)}, {data.latestLocation.lng.toFixed(5)}
                  </span>
                  <ExternalLink className="size-4" />
                </a>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {isOpen
                  ? "Waiting for the first location update…"
                  : "This emergency has ended — location access is no longer available."}
              </p>
            )}
          </div>

          {/* Offer help */}
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <HeartHandshake className="size-4 text-emerald-600" /> Offer help
            </h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Emergency type
                </dt>
                <dd className="font-medium uppercase">{data.alertType}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Distance
                </dt>
                <dd className="font-medium">
                  {data.helper ? formatDistanceMeters(data.helper.distanceMeters) : "—"}
                </dd>
              </div>
            </dl>

            {isOpen && data.helper?.status === "notified" && (
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={respondWithLocation}
                    onChange={(e) => setRespondWithLocation(e.target.checked)}
                    className="size-4 rounded border-border accent-emerald-500"
                  />
                  Also share my live location while responding
                </label>
                <Button
                  className="w-full rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
                  onClick={handleRespondNearby}
                  disabled={responding}
                >
                  {responding ? <Loader2 className="size-4 animate-spin" /> : <HeartHandshake className="size-4" />}
                  I Can Help
                </Button>
              </div>
            )}

            {isOpen && data.helper?.status === "responding" && (
              <div className="mt-4 space-y-3">
                <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="size-4 shrink-0" />
                  You're responding — thank you!
                </p>
                {data.helper.shareLocation ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      The sender can see your live location while you respond.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      onClick={handleStopHelperLocation}
                    >
                      <Square className="size-4" /> Stop sharing my location
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    onClick={() => setShareResponderLocation(true)}
                  >
                    <LocateFixed className="size-4" /> Share my live location
                  </Button>
                )}
              </div>
            )}

            {!isOpen && (
              <p className="mt-4 text-sm text-muted-foreground">
                This emergency has ended and can no longer accept help.
              </p>
            )}

            <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              As a nearby helper you can see the location and offer help — you don't get access to
              video, audio or the sender's private contact details.
            </p>
          </div>
        </div>
      )}

      {/* Admin view: deliberately limited — no precise live location */}
      {myRole === "admin" && (
        <div className="rounded-3xl border border-border bg-card p-6 sm:p-7">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <BellRing className="size-4 text-violet-600" /> System view
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Admins can see that an emergency is active but not the precise live location, per EAlert's
            privacy rules.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card/70 px-3.5 py-2.5">
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</dt>
              <dd className="mt-0.5 font-medium">{session?.status}</dd>
            </div>
            <div className="rounded-xl border border-border bg-card/70 px-3.5 py-2.5">
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Alert</dt>
              <dd className="mt-0.5 font-mono text-xs">{data.alertId}</dd>
            </div>
          </dl>
        </div>
      )}

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ShieldNote />
        EAlert connects you with your trusted contacts. In a life-threatening emergency, contact your
        local emergency services ({EMERGENCY_NUMBER}).
      </p>

      {/* End emergency confirmation */}
      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent className="rounded-3xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">End this emergency session?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops live location and video sharing, notifies your contacts that the emergency
              has ended, and closes the session for everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep it active</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEnd}
              disabled={ending}
              className="rounded-xl bg-rose-500 text-white hover:bg-rose-600"
            >
              {ending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
              End emergency
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** App-to-app push delivery lifecycle: pending → sent → opened → responding. */
function AppDeliveryTag({ pushStatus }: { pushStatus?: string }) {
  const meta: Record<string, { label: string; className: string }> = {
    pending: { label: "Push pending", className: "border-amber-200 bg-amber-50 text-amber-700" },
    sent: { label: "Sent to device", className: "border-sky-200 bg-sky-50 text-sky-700" },
    delivered: { label: "Delivered", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    opened: { label: "Opened", className: "border-violet-200 bg-violet-50 text-violet-700" },
    active: { label: "Responding", className: "border-emerald-300 bg-emerald-100 text-emerald-700" },
  };
  if (!pushStatus) return null;
  const m = meta[pushStatus] ?? meta.pending;
  return (
    <span
      className={cn(
        "mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        m.className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}

function ShieldNote() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground/70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
