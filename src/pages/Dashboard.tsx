import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  HeartHandshake,
  MapPin,
  ScrollText,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Link } from "react-router";
import { AlertCard } from "@/components/alerts/AlertCard";
import { SOSButton } from "@/components/sos/SOSFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { greeting } from "@/lib/format";

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
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-violet-300">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {greeting()}, {firstName}
        </h1>
        <p className="text-muted-foreground">Stay safe. We're here when you need us.</p>
      </motion.div>

      {/* SOS */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] px-6 py-10 text-center"
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-muted-foreground">
            <HeartHandshake className="size-3.5 text-violet-300" />
            {(contacts?.length ?? 0)}/10 contacts
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-muted-foreground">
            <BellRing className="size-3.5 text-cyan-300" />
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
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Safety readiness</h2>
            <Siren className="size-5 text-violet-300" />
          </div>
          <div className="mt-5">
            <div className="flex items-end justify-between">
              <p className="font-display text-4xl font-bold">{completion}%</p>
              <p className="text-xs text-muted-foreground">{completion === 100 ? "fully ready" : "almost there"}</p>
            </div>
            <Progress value={completion} className="mt-3 h-2.5 rounded-full bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-cyan-400" />
          </div>
          <ul className="mt-5 space-y-2 text-sm">
            {[
              { done: Boolean(profile?.profile?.fullName), label: "Profile details" },
              { done: Boolean(profile?.profile?.bloodGroup), label: "Blood group & medical info" },
              { done: (contacts?.length ?? 0) > 0, label: "At least one contact" },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-2.5">
                <span className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${item.done ? "bg-emerald-400/20 text-emerald-300" : "bg-white/10 text-muted-foreground"}`}>
                  {item.done ? "✓" : "•"}
                </span>
                <span className={item.done ? "text-muted-foreground" : "text-foreground/80"}>{item.label}</span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="mt-5 w-full rounded-xl border-white/12 bg-white/[0.03] hover:bg-white/[0.08]">
            <Link to="/profile">
              {completion === 100 ? "Review profile" : "Complete profile"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Quick actions</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: HeartHandshake, label: "Manage contacts", to: "/contacts", tone: "text-violet-300" },
              { icon: MapPin, label: "Share location", to: "/location", tone: "text-cyan-300" },
              { icon: ScrollText, label: "Alert history", to: "/alerts", tone: "text-rose-300" },
              { icon: BellRing, label: "Notifications", to: "/notifications", tone: "text-amber-300" },
            ].map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]"
              >
                <a.icon className={`size-5 ${a.tone} transition-transform group-hover:scale-110`} />
                <span className="text-sm font-medium">{a.label}</span>
              </Link>
            ))}
            <Link
              to="/setup"
              className="group flex flex-col items-start gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25"
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
          <Link to="/alerts" className="inline-flex items-center gap-1 text-sm font-medium text-violet-300 hover:text-violet-200">
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
