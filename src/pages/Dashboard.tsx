import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  ExternalLink,
  HeartHandshake,
  Loader2,
  MapPin,
  ScrollText,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertCard } from "@/components/alerts/AlertCard";
import { SOSButton } from "@/components/sos/SOSFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceMeters } from "@/convex/lib/emergencyLogic";
import { formatRelative, greeting } from "@/lib/format";

function profileCompletion(profile: {
  fullName?: string;
  phone?: string;
  email?: string;
  city?: string;
  bloodGroup?: string;
  medicalInfo?: string;
  workplace?: string;
}) {
  const fields = [
    profile.fullName,
    profile.phone,
    profile.email,
    profile.city,
    profile.bloodGroup,
    profile.medicalInfo,
    profile.workplace,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

export default function Dashboard() {
  const { user } = useAuth();
  const contacts = useQuery(api.emergencyContacts.list);
  const alerts = useQuery(api.alerts.listMine);
  const counts = useQuery(api.alerts.recentCounts);
  const unread = useQuery(api.notifications.unreadCount);
  const profile = useQuery(api.profiles.getProfile);
  const latestLocation = useQuery(api.locations.latest);
  const activeSession = useQuery(api.emergencySessions.myActiveSession);
  const contactSessions = useQuery(api.emergencySessions.listSessionsForContact);
  const nearbyEmergencies = useQuery(api.emergencyNearby.myNearbyEmergencies);
  const verificationStatus = useQuery(api.verification.getVerificationStatus);
  const respondNearby = useMutation(api.emergencyNearby.respondNearby);
  const navigate = useNavigate();
  const [helpingId, setHelpingId] = useState<string | null>(null);

  const activeNearby = nearbyEmergencies?.filter((n) => n.isOpen) ?? [];

  const completion = profile?.profile ? profileCompletion(profile.profile) : 0;
  const firstName = user?.name?.split(/\s+/)[0] ?? "there";

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col gap-2"
      >
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-violet-600">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {greeting()}, {firstName}
        </h1>
        <p className="text-muted-foreground">Stay safe. We're here when you need us.</p>
      </motion.div>

      {/* Emergencies where I'm a verified contact */}
      {contactSessions && contactSessions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="overflow-hidden rounded-[1.5rem] border border-rose-200 bg-gradient-to-br from-rose-50 via-rose-50/40 to-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex size-14 shrink-0 items-center justify-center">
              <span className="animate-sos-ring absolute inset-0 rounded-full border-2 border-rose-400/60" />
              <span className="flex size-11 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30">
                <Siren className="size-6" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold text-rose-700">Someone needs your help</p>
              <p className="text-xs text-muted-foreground">
                You're a verified emergency contact for {contactSessions.length} active EAlert
                emergency{contactSessions.length === 1 ? "" : "ies"} — open the session to see
                their live status and respond.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {contactSessions.map((s) => (
              <div
                key={s._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200/80 bg-white/80 px-4 py-3 transition-colors hover:bg-white"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-500">
                    <HeartHandshake className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.ownerName}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Started {formatRelative(s.startedAt)} · {s.status}
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" className="rounded-xl bg-rose-500 text-white hover:bg-rose-600">
                  <Link to={`/emergency/${s._id}`}>
                    Open emergency <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Nearby emergencies where I'm a helper */}
      {activeNearby.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="overflow-hidden rounded-[1.5rem] border border-sky-200 bg-gradient-to-br from-sky-50 via-sky-50/40 to-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex size-14 shrink-0 items-center justify-center">
              <span className="animate-sos-ring absolute inset-0 rounded-full border-2 border-sky-400/60" />
              <span className="flex size-11 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg shadow-sky-500/30">
                <MapPin className="size-6" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold text-sky-700">
                Nearby emergency{activeNearby.length === 1 ? "" : "ies"} in your area
              </p>
              <p className="text-xs text-muted-foreground">
                An EAlert user nearby needs help. You can see the location while it's active —
                your limited view never includes video or private contact details.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {activeNearby.map((n) => (
              <div
                key={n.sessionId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200/80 bg-white/80 px-4 py-3 transition-colors hover:bg-white"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                    <Siren className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {n.ownerFirstName} needs help
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {n.emergencyType} · {formatDistanceMeters(n.distanceMeters)} away
                    </p>
                    {n.location && (
                      <a
                        href={`https://maps.google.com/?q=${n.location.lat.toFixed(6)},${n.location.lng.toFixed(6)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-[11px] text-sky-700 transition-colors hover:bg-sky-100"
                      >
                        {n.location.lat.toFixed(4)}, {n.location.lng.toFixed(4)}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.status === "notified" ? (
                    <Button
                      size="sm"
                      className="rounded-xl bg-emerald-500 text-white hover:bg-emerald-600"
                      disabled={helpingId === n.sessionId}
                      onClick={async () => {
                        setHelpingId(n.sessionId);
                        try {
                          await respondNearby({ sessionId: n.sessionId });
                          navigate(`/emergency/${n.sessionId}`);
                        } catch {
                          setHelpingId(null);
                        }
                      }}
                    >
                      {helpingId === n.sessionId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <HeartHandshake className="size-4" />
                      )}
                      I Can Help
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      <HeartHandshake className="size-3.5" /> Responding
                    </span>
                  )}
                  <Button asChild size="sm" variant="outline" className="rounded-xl border-sky-200 bg-white text-sky-700 hover:bg-sky-50">
                    <Link to={`/emergency/${n.sessionId}`}>View</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Active emergency session */}
      {activeSession && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-rose-300 bg-gradient-to-r from-rose-100 to-white px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex size-11 items-center justify-center">
              <span className="animate-sos-ring absolute inset-0 rounded-full border-2 border-rose-400/60" />
              <span className="flex size-9 items-center justify-center rounded-full bg-rose-500 text-white shadow-md shadow-rose-500/30">
                <Siren className="size-5" />
              </span>
            </span>
            <div>
              <p className="font-display text-base font-bold text-rose-700">An emergency session is active</p>
              <p className="text-xs text-muted-foreground">
                Started {formatRelative(activeSession.startedAt)} — your contacts have been notified.
              </p>
            </div>
          </div>
          <Button asChild className="rounded-xl bg-rose-500 text-white hover:bg-rose-600">
            <Link to={`/emergency/${activeSession._id}`}>
              Open session <ArrowRight className="size-4" />
            </Link>
          </Button>
        </motion.div>
      )}

      {/* Verification warning */}
      {verificationStatus && !verificationStatus.phoneVerified && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-[1.5rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-amber-50/40 to-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold text-amber-700">Phone verification required</p>
              <p className="text-xs text-muted-foreground">
                Verify your phone number to unlock SOS, emergency contacts, and nearby helpers.
              </p>
            </div>
            <Button asChild size="sm" className="rounded-xl bg-amber-500 text-white hover:bg-amber-600">
              <Link to="/profile">Verify now <ArrowRight className="size-4" /></Link>
            </Button>
          </div>
        </motion.div>
      )}

      {/* SOS */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className={`relative overflow-hidden rounded-[2rem] border bg-card px-6 py-10 text-center ${verificationStatus && !verificationStatus.phoneVerified ? "border-amber-200 opacity-60" : "border-border"}`}
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-rose-500/15 blur-3xl" />
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-rose-300">
          Emergency trigger
        </p>
        <div className="mt-6 flex justify-center">
          <SOSButton />
        </div>
        <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
          Press and hold for <span className="font-semibold text-foreground">3 seconds</span> to
          alert your emergency contacts with your live location. A countdown lets
          you confirm or cancel before anything is sent.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-mono text-[11px] text-muted-foreground">
            <HeartHandshake className="size-3.5 text-violet-600" />
            {(contacts?.length ?? 0)}/10 contacts
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-mono text-[11px] text-muted-foreground">
            <BellRing className="size-3.5 text-sky-600" />
            {(unread ?? 0)} unread
          </span>
        </div>
      </motion.section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={HeartHandshake} label="Contacts" value={contacts?.length ?? "—"} hint="trusted people" tone="lavender" />
        <StatCard icon={ScrollText} label="Alerts sent" value={counts?.sent ?? "—"} hint="lifetime" tone="coral" />
        <StatCard icon={MapPin} label="Location" value={latestLocation ? "Shared" : "Pending"} hint={latestLocation ? "last check-in" : "no check-in yet"} tone="cyan" />
        <StatCard icon={ShieldCheck} label="Profile" value={`${completion}%`} hint="safety profile" tone="mint" />
      </section>

      {/* Completion + quick actions */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-6 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Safety readiness</h2>
            <Siren className="size-5 text-violet-600" />
          </div>
          <div className="mt-5">
            <div className="flex items-end justify-between">
              <p className="font-display text-4xl font-bold">{completion}%</p>
              <p className="text-xs text-muted-foreground">{completion === 100 ? "fully ready" : "almost there"}</p>
            </div>
            <Progress value={completion} className="mt-3 h-2.5 rounded-full bg-violet-100 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-sky-400" />
          </div>
          <ul className="mt-5 space-y-2 text-sm">
            {[
              { done: Boolean(profile?.profile?.fullName), label: "Profile details" },
              { done: Boolean(profile?.profile?.bloodGroup), label: "Blood group & medical info" },
              { done: (contacts?.length ?? 0) > 0, label: "At least one contact" },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-2.5">
                <span className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-muted-foreground"}`}>
                  {item.done ? "✓" : "•"}
                </span>
                <span className={item.done ? "text-muted-foreground" : "text-foreground/80"}>{item.label}</span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="mt-5 w-full rounded-xl border-border bg-card hover:bg-violet-50">
            <Link to="/profile">
              {completion === 100 ? "Review profile" : "Complete profile"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Quick actions</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: HeartHandshake, label: "Manage contacts", to: "/contacts", tone: "text-violet-600" },
              { icon: MapPin, label: "Share location", to: "/location", tone: "text-sky-600" },
              { icon: ScrollText, label: "Alert history", to: "/alerts", tone: "text-rose-300" },
              { icon: BellRing, label: "Notifications", to: "/notifications", tone: "text-amber-600" },
            ].map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/60"
              >
                <a.icon className={`size-5 ${a.tone} transition-transform group-hover:scale-110`} />
                <span className="text-sm font-medium">{a.label}</span>
              </Link>
            ))}
            <Link
              to="/setup"
              className="group flex flex-col items-start gap-3 rounded-2xl border border-dashed border-violet-200/70 bg-card/70 p-4 transition-all hover:-translate-y-0.5 hover:border-violet-300"
            >
              <Siren className="size-5 text-emerald-300 transition-transform group-hover:scale-110" />
              <span className="text-sm font-medium">Finish setup</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Recent alerts */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Recent alerts</h2>
          <Link to="/alerts" className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:text-violet-700">
            View all <ArrowRight className="size-4" />
          </Link>
        </div>
        {alerts && alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.slice(0, 3).map((alert, i) => (
              <AlertCard key={alert._id} alert={alert} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState
            kind="alerts"
            title="No alerts yet"
            description="Your emergency activity will appear here. When you trigger an SOS, this is where you can review what was sent."
            action={
              <Button asChild className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                <Link to="/contacts">Add emergency contacts first</Link>
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
