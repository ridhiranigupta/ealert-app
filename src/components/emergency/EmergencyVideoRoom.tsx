import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  LocalTrackPublication,
  LocalVideoTrack,
  MediaDeviceFailure,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  type Participant,
} from "livekit-client";
import {
  Camera,
  CameraOff,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * REAL LiveKit emergency video room (WebRTC).
 *
 * - Connects to the LiveKit room using a short-lived server-issued token.
 * - The sender (owner) auto-publishes their real camera + microphone.
 * - Verified contacts can join, see the sender's real stream, and can opt
 *   into publishing their own camera/microphone.
 * - Connection state is real (Connecting / Connected / Reconnecting /
 *   Disconnected / Error). Never simulated.
 * - Permission failures surface truthful, user-readable messages.
 */

type Phase =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "ended"
  | "error";

interface RemoteView {
  name: string;
  connected: boolean;
  videoTrack?: RemoteVideoTrack;
  hasMic: boolean;
  micMuted: boolean;
  isSpeaking: boolean;
}

interface EmergencyVideoRoomProps {
  /** LiveKit WebSocket URL from the server (never a secret). */
  url: string;
  /** Short-lived LiveKit access token issued by the Convex backend. */
  token: string;
  roomName: string;
  /** How this user's tile is labelled (falls back to the token name claim). */
  displayName: string;
  /** Whether this participant may publish camera/microphone tracks. */
  canPublish: boolean;
  /** Publish camera+mic immediately on connect (the sender). */
  autoPublish?: boolean;
  /** Called when the user leaves, or the room ends. */
  onLeave: () => void;
}

export function EmergencyVideoRoom({
  url,
  token,
  roomName,
  displayName,
  canPublish,
  autoPublish = false,
  onLeave,
}: EmergencyVideoRoomProps) {
  const roomRef = useRef<Room | null>(null);
  const leftRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const [remotes, setRemotes] = useState<Record<string, RemoteView>>({});
  const [toggleBusy, setToggleBusy] = useState(false);

  const upsertRemote = useCallback((identity: string, patch: Partial<RemoteView>) => {
    setRemotes((prev) => {
      const cur: RemoteView =
        prev[identity] ??
        {
          name: identity,
          connected: true,
          hasMic: false,
          micMuted: false,
          isSpeaking: false,
        };
      return { ...prev, [identity]: { ...cur, ...patch } };
    });
  }, []);

  const mediaFailureMessage = useCallback((err: unknown, source: Track.Source) => {
    const failure = MediaDeviceFailure.getFailure(err);
    if (failure === MediaDeviceFailure.PermissionDenied) {
      return source === Track.Source.Camera
        ? "Camera permission denied. Please allow camera access to start live video."
        : "Microphone permission denied. Please allow microphone access.";
    }
    if (failure === MediaDeviceFailure.NotFound) {
      return source === Track.Source.Camera
        ? "No camera was found on this device."
        : "No microphone was found on this device.";
    }
    if (failure === MediaDeviceFailure.DeviceInUse) {
      return "Your camera or microphone is being used by another application.";
    }
    return source === Track.Source.Camera
      ? "Could not access the camera."
      : "Could not access the microphone.";
  }, []);

  // Connect once, wire every real event, and tear down cleanly.
  useEffect(() => {
    let disposed = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    const onConnectionState = (state: ConnectionState) => {
      if (disposed) return;
      if (state === ConnectionState.Connected) {
        setPhase("connected");
        setError(null);
      } else if (state === ConnectionState.Reconnecting) {
        setPhase("reconnecting");
      } else if (state === ConnectionState.Disconnected) {
        setPhase(leftRef.current ? "disconnected" : "ended");
        setCameraOn(false);
        setMicOn(false);
      }
    };

    room.on(RoomEvent.ConnectionStateChanged, onConnectionState);
    room.on(RoomEvent.Disconnected, () => {
      if (disposed) return;
      setPhase(leftRef.current ? "disconnected" : "ended");
      setCameraOn(false);
      setMicOn(false);
    });

    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (disposed) return;
      if (pub.source === Track.Source.Camera && track instanceof RemoteVideoTrack) {
        upsertRemote(participant.identity, {
          name: participant.name ?? participant.identity,
          videoTrack: track,
          connected: true,
        });
      } else if (pub.source === Track.Source.Microphone) {
        upsertRemote(participant.identity, {
          name: participant.name ?? participant.identity,
          hasMic: true,
          micMuted: pub.isMuted,
          connected: true,
        });
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
      if (disposed) return;
      if (pub.source === Track.Source.Camera) {
        upsertRemote(participant.identity, { videoTrack: undefined });
      } else if (pub.source === Track.Source.Microphone) {
        upsertRemote(participant.identity, { hasMic: false, micMuted: false });
      }
    });

    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      if (disposed) return;
      if (pub.source === Track.Source.Microphone) {
        upsertRemote(participant.identity, { micMuted: true });
      }
    });

    room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      if (disposed) return;
      if (pub.source === Track.Source.Microphone) {
        upsertRemote(participant.identity, { micMuted: false });
      }
    });

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      if (disposed) return;
      upsertRemote(participant.identity, {
        name: participant.name ?? participant.identity,
        connected: true,
      });
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (disposed) return;
      setRemotes((prev) => {
        const next = { ...prev };
        delete next[participant.identity];
        return next;
      });
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      if (disposed) return;
      const speaking = new Set(speakers.map((s) => s.identity));
      setRemotes((prev) => {
        let changed = false;
        const next: Record<string, RemoteView> = {};
        for (const [identity, view] of Object.entries(prev)) {
          const isSpeaking = speaking.has(identity);
          if (view.isSpeaking !== isSpeaking) {
            changed = true;
            next[identity] = { ...view, isSpeaking };
          } else {
            next[identity] = view;
          }
        }
        return changed ? next : prev;
      });
    });

    room.on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
      if (disposed) return;
      if (pub.source === Track.Source.Camera && pub.track instanceof LocalVideoTrack) {
        setLocalVideo(pub.track);
        setCameraOn(true);
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      if (disposed) return;
      if (pub.source === Track.Source.Camera) {
        setLocalVideo(null);
        setCameraOn(false);
      }
    });

    room.on(RoomEvent.MediaDevicesError, () => {
      if (disposed) return;
      setError(
        "Unable to access the camera or microphone. Check your device permissions and try again.",
      );
    });

    const publishInitial = async () => {
      const lp = room.localParticipant;
      if (autoPublish && canPublish) {
        try {
          await lp.setCameraEnabled(true, { resolution: { width: 1280, height: 720 } });
        } catch (err) {
          if (disposed) return;
          setError(mediaFailureMessage(err, Track.Source.Camera));
        }
        try {
          await lp.setMicrophoneEnabled(true);
          if (!disposed) setMicOn(true);
        } catch (err) {
          if (disposed) return;
          setError(mediaFailureMessage(err, Track.Source.Microphone));
        }
      }
    };

    (async () => {
      try {
        await room.connect(url, token, { autoSubscribe: true });
        if (disposed) return;
        // Seed participants that were already in the room (e.g. late joiners).
        room.remoteParticipants.forEach((participant) => {
          upsertRemote(participant.identity, {
            name: participant.name ?? participant.identity,
            connected: true,
          });
        });
        await publishInitial();
      } catch {
        if (disposed) return;
        setPhase("error");
        setError(
          "Unable to connect to live emergency video. Please check your internet connection.",
        );
      }
    })();

    return () => {
      disposed = true;
      try {
        room.localParticipant?.trackPublications.forEach((pub) => {
          pub.track?.stop();
        });
      } catch {
        // best-effort cleanup
      }
      try {
        room.disconnect();
      } catch {
        // already disconnected
      }
      roomRef.current = null;
    };
  }, [url, token, autoPublish, canPublish, upsertRemote, mediaFailureMessage]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canPublish || toggleBusy) return;
    setToggleBusy(true);
    try {
      if (cameraOn) {
        await room.localParticipant.setCameraEnabled(false);
        setCameraOn(false);
        setLocalVideo(null);
      } else {
        await room.localParticipant.setCameraEnabled(true, {
          resolution: { width: 1280, height: 720 },
        });
        setCameraOn(true);
        setError((prev) => (prev?.startsWith("Camera") ? null : prev));
      }
    } catch (err) {
      setError(mediaFailureMessage(err, Track.Source.Camera));
    } finally {
      setToggleBusy(false);
    }
  }, [cameraOn, canPublish, toggleBusy, mediaFailureMessage]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canPublish || toggleBusy) return;
    setToggleBusy(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn((v) => !v);
    } catch (err) {
      setError(mediaFailureMessage(err, Track.Source.Microphone));
    } finally {
      setToggleBusy(false);
    }
  }, [micOn, canPublish, toggleBusy, mediaFailureMessage]);

  const handleLeave = useCallback(() => {
    leftRef.current = true;
    const room = roomRef.current;
    try {
      room?.localParticipant?.trackPublications.forEach((pub) => pub.track?.stop());
      room?.disconnect();
    } catch {
      // ignore
    }
    onLeave();
  }, [onLeave]);

  if (phase === "error") {
    return (
      <RoomPanel
        title="Emergency video unavailable"
        roomName={roomName}
        status={{ label: "Error", tone: "rose" }}
        body={
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {error ?? "Unable to connect to the emergency video room."}
            </p>
            <Button rose onClick={handleLeave}>
              <PhoneOff className="size-4" /> Close
            </Button>
          </div>
        }
      />
    );
  }

  if (phase === "ended" || phase === "disconnected") {
    return (
      <RoomPanel
        title="Emergency video ended"
        roomName={roomName}
        status={{ label: phase === "ended" ? "Ended" : "Disconnected", tone: "rose" }}
        body={
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {phase === "ended"
                ? "The emergency video session has ended."
                : "You left the emergency video session."}
            </p>
            <Button rose onClick={handleLeave}>
              <PhoneOff className="size-4" /> Close
            </Button>
          </div>
        }
      />
    );
  }

  const remoteList = Object.values(remotes).filter((r) => r.connected);
  const remoteCount = remoteList.length;
  const status =
    phase === "connecting"
      ? { label: "Connecting…", tone: "violet" as const }
      : phase === "reconnecting"
        ? { label: "Reconnecting…", tone: "amber" as const }
        : { label: "Connected", tone: "emerald" as const };

  return (
    <RoomPanel title="Live emergency video" roomName={roomName} status={status}>
      {/* Video stage */}
      <div className="rounded-2xl bg-slate-950 p-3 sm:p-4">
        {error && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            <CameraOff className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div
          className={cn(
            "grid gap-3",
            remoteCount >= 2 && "sm:grid-cols-2",
            remoteCount >= 5 && "lg:grid-cols-3",
          )}
        >
          {canPublish && (
            <VideoTile
              label={`${displayName} (You)`}
              track={localVideo}
              cameraOff={!cameraOn}
              micMuted={!micOn}
              isLocal
              speaking={false}
            />
          )}
          {remoteList.map((remote) => (
            <VideoTile
              key={remote.name}
              label={remote.name}
              track={remote.videoTrack}
              cameraOff={!remote.videoTrack}
              micMuted={remote.micMuted}
              hasMic={remote.hasMic}
              speaking={remote.isSpeaking}
            />
          ))}
          {remoteCount === 0 && (
            <div className="flex aspect-video min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-slate-300">
              <Loader2 className="size-6 animate-spin text-violet-300" />
              <p className="px-4 text-center text-sm">
                {canPublish
                  ? "Waiting for a verified contact to join…"
                  : "Waiting for the sender's video…"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 border-t border-border bg-card/60 px-4 py-4">
        {canPublish ? (
          <>
            <button
              type="button"
              onClick={toggleCamera}
              disabled={toggleBusy}
              aria-pressed={cameraOn}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60",
                cameraOn
                  ? "bg-violet-500 text-white hover:bg-violet-600"
                  : "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
              )}
            >
              {cameraOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
              {cameraOn ? "Disable camera" : "Enable camera"}
            </button>
            <button
              type="button"
              onClick={toggleMic}
              disabled={toggleBusy}
              aria-pressed={micOn}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60",
                micOn
                  ? "bg-violet-500 text-white hover:bg-violet-600"
                  : "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
              )}
            >
              {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {micOn ? "Mute microphone" : "Unmute microphone"}
            </button>
          </>
        ) : (
          <p className="px-2 text-center text-xs text-muted-foreground">
            You're connected as a verified responder. Use the buttons below if you want to share
            your camera or microphone too.
          </p>
        )}
        <button
          type="button"
          onClick={handleLeave}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
        >
          <PhoneOff className="size-4" />
          {canPublish ? "End video" : "Leave video"}
        </button>
      </div>
    </RoomPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function RoomPanel({
  title,
  roomName,
  status,
  children,
  body,
}: {
  title: string;
  roomName: string;
  status: { label: string; tone: "violet" | "emerald" | "amber" | "rose" };
  children?: React.ReactNode;
  body?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Video className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {roomName}
            </p>
          </div>
        </div>
        <StatusPill label={status.label} tone={status.tone} />
      </div>
      {body ? <div className="p-5">{body}</div> : children}
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "violet" | "emerald" | "amber" | "rose";
}) {
  const tones: Record<string, string> = {
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider",
        tones[tone],
      )}
    >
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      {label}
    </span>
  );
}

function Button({
  children,
  onClick,
  rose,
}: {
  children: React.ReactNode;
  onClick: () => void;
  rose?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
        rose
          ? "bg-rose-500 text-white hover:bg-rose-600"
          : "bg-violet-500 text-white hover:bg-violet-600",
      )}
    >
      {children}
    </button>
  );
}

function VideoTile({
  label,
  track,
  cameraOff,
  micMuted,
  hasMic = true,
  speaking,
  isLocal = false,
}: {
  label: string;
  track?: RemoteVideoTrack | LocalVideoTrack | null;
  cameraOff: boolean;
  micMuted: boolean;
  hasMic?: boolean;
  speaking: boolean;
  isLocal?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (track) {
      try {
        track.attach(el);
        el.play().catch(() => {});
        return () => {
          try {
            track.detach(el);
          } catch {
            // already detached
          }
        };
      } catch {
        el.srcObject = null;
      }
    } else {
      el.srcObject = null;
    }
  }, [track]);

  return (
    <div
      className={cn(
        "relative aspect-video min-h-44 overflow-hidden rounded-xl bg-slate-900 ring-2 ring-transparent transition-shadow",
        speaking && "ring-2 ring-emerald-400",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity",
          cameraOff && "opacity-0",
        )}
      />
      {cameraOff && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
          <CameraOff className="size-7" />
          <span className="text-xs font-medium">Camera off</span>
        </div>
      )}

      {/* Name + status */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
        <span className="truncate text-xs font-semibold text-white">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {hasMic &&
            (micMuted ? (
              <MicOff className="size-3.5 text-rose-300" />
            ) : (
              <Mic className="size-3.5 text-emerald-300" />
            ))}
          {speaking && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              <Volume2 className="size-3" /> Speaking
            </span>
          )}
        </span>
      </div>

      {isLocal && (
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white">
          You
        </span>
      )}
    </div>
  );
}
