import { motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  HeartHandshake,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { Logo } from "@/components/brand/Logo";
import { HeroIllustration, IllustrationCard } from "@/lib/illustrations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

function SectionTitle({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="mx-auto max-w-2xl text-center"
    >
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-violet-600">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{sub}</p>
    </motion.div>
  );
}

const features = [
  {
    icon: Zap,
    title: "One-tap SOS",
    body: "Hold the SOS button for three seconds and your emergency contacts are alerted instantly — no menus, no typing.",
    tone: "text-rose-300 bg-rose-500/15",
    glow: "from-rose-500/25",
  },
  {
    icon: HeartHandshake,
    title: "Emergency contacts",
    body: "Keep up to ten trusted people — family, partners, friends — and mark who to reach first.",
    tone: "text-violet-700 bg-violet-100",
    glow: "from-violet-500/25",
  },
  {
    icon: MapPin,
    title: "Live location sharing",
    body: "Alerts carry your exact coordinates, with accuracy and a map link so help can actually find you.",
    tone: "text-sky-700 bg-sky-100",
    glow: "from-cyan-400/25",
  },
  {
    icon: BellRing,
    title: "Emergency notifications",
    body: "Every alert, cancelled SOS and safety update lands in your notification center with clear statuses.",
    tone: "text-amber-700 bg-amber-100",
    glow: "from-amber-400/25",
  },
  {
    icon: ShieldCheck,
    title: "Personal safety profile",
    body: "Blood group, medical notes, family details — kept private and only shown to you and your admins when needed.",
    tone: "text-emerald-300 bg-emerald-400/15",
    glow: "from-emerald-400/25",
  },
  {
    icon: Lock,
    title: "Secure account",
    body: "Hashed passwords, role-based access, audit logs and input validation — security handled properly from day one.",
    tone: "text-fuchsia-300 bg-fuchsia-500/15",
    glow: "from-fuchsia-500/25",
  },
];

const steps = [
  {
    n: "01",
    title: "Create your safety profile",
    body: "Tell us who you are, your medical essentials and what your contacts should know in an emergency.",
  },
  {
    n: "02",
    title: "Add trusted contacts",
    body: "Add up to ten people — family, partner, close friends — and set who should be reached first.",
  },
  {
    n: "03",
    title: "Press SOS when you need help",
    body: "Hold the button for three seconds. A countdown lets you confirm or cancel before anything is sent.",
  },
  {
    n: "04",
    title: "Contacts get alerted with your location",
    body: "Your emergency message and live coordinates reach your contacts immediately, with a map link.",
  },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
        <div className="absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="absolute right-[-120px] top-1/3 h-80 w-80 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="absolute bottom-0 left-[-100px] h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" aria-label="EAlert home">
            <Logo />
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex" aria-label="Main">
            {[
              ["How it works", "#how"],
              ["Features", "#features"],
              ["Safety", "#safety"],
              ["About", "#about"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden rounded-xl sm:inline-flex">
              <Link to="/auth?mode=signin">Sign in</Link>
            </Button>
            <Button asChild className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/auth?mode=signup">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest text-violet-700">
              <Sparkles className="size-3.5" />
              Emergency alert system · v1
            </p>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              Your safety,{" "}
              <span className="text-gradient">one tap away.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              EAlert helps you reach your trusted emergency contacts and share
              your live location the moment you need help — built for anyone who
              wants a calm, reliable way to call for it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-2xl bg-primary px-7 text-primary-foreground shadow-lg shadow-violet-500/25 hover:bg-primary/90">
                <Link to="/auth?mode=signup">
                  Get started free
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-2xl border-border bg-card hover:bg-violet-50">
                <a href="#how">Learn more</a>
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-8 border-t border-border pt-6">
              {[
                ["3s", "hold to alert"],
                ["10", "max contacts"],
                ["24/7", "always ready"],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="font-display text-2xl font-bold">{v}</p>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
          >
            <HeroIllustration className="mx-auto max-w-md lg:max-w-none" />
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionTitle
          eyebrow="Features"
          title="Everything you need when it matters"
          sub="A complete safety toolkit — from the instant SOS trigger to the details your contacts need to find you."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.06 }}
              className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-violet-200 hover:bg-violet-50/60"
            >
              <div className={cn("pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br opacity-40 blur-2xl transition-opacity group-hover:opacity-80", f.glow)} />
              <div className={cn("flex size-11 items-center justify-center rounded-2xl", f.tone)}>
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionTitle
          eyebrow="How it works"
          title="From setup to SOS in four steps"
          sub="Two minutes of setup today can save critical minutes later. Here's how EAlert works."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.08 }}
              className="relative rounded-3xl border border-border bg-card p-6"
            >
              <span className="font-mono text-4xl font-bold text-violet-200">{s.n}</span>
              <h3 className="mt-3 font-display text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              {i < steps.length - 1 && (
                <ArrowRight className="absolute -right-3.5 top-1/2 hidden size-5 -translate-y-1/2 text-violet-600 lg:block" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Safety */}
      <section id="safety" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="order-2 lg:order-1"
          >
            <IllustrationCard kind="security" className="mx-auto max-w-md">
              <div className="relative px-8 pb-8 pt-2">
                <div className="relative mx-auto max-w-xs">
                  <AnimatedSafetyArt />
                </div>
              </div>
            </IllustrationCard>
          </motion.div>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="order-1 lg:order-2"
          >
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-violet-600">Safety</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Fast communication, when seconds count
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              In an emergency, the hardest part is often just telling someone
              where you are and what you need. EAlert removes that friction: a
              single deliberate gesture composes your alert, attaches your live
              coordinates and routes it to the people you trust most.
            </p>
            <ul className="mt-7 space-y-4">
              {[
                ["Deliberate by design", "A 3-second hold and countdown means accidental taps never fire a real alert."],
                ["Private by default", "Your medical and family details stay in your profile — never shown in lists or to other users."],
                ["Honest by default", "Until a messaging provider is connected, alerts run in safe demo mode and never leave the app."],
              ].map(([t, b]) => (
                <li key={t} className="flex gap-3.5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                    <ShieldCheck className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{t}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{b}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* About strip */}
      <section id="about" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="glass relative overflow-hidden rounded-[2rem] px-6 py-12 text-center sm:px-12"
        >
          <div className="pointer-events-none absolute -top-20 left-1/2 h-48 w-[480px] -translate-x-1/2 rounded-full bg-violet-300/50 blur-3xl" />
          <h2 className="relative font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Made for people, trusted by communities
          </h2>
          <p className="relative mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            EAlert is built for individuals and the people who care about them.
            Whether you're a parent, a student, or part of a team or community,
            everyone gets the same calm, dependable way to ask for help.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-2xl bg-primary px-7 text-primary-foreground hover:bg-primary/90">
              <Link to="/auth?mode=signup">
                Create your safety profile
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Your safety, one tap away. A calm, reliable emergency alert
                companion.
              </p>
            </div>
            {[
              ["Product", ["How it works", "Features", "Safety", "About"]],
              ["Company", ["Privacy", "Terms", "Contact"]],
              ["Support", ["Help center", "Safety information", "Status"]],
            ].map(([title, links]) => (
              <div key={title as string}>
                <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{title as string}</p>
                <ul className="mt-4 space-y-2.5">
                  {(links as string[]).map((l) => (
                    <li key={l}>
                      <a href="#top" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} EAlert App. Built with care.
            </p>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/60">
              status: operational
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AnimatedSafetyArt() {
  return (
    <div className="flex items-center justify-center gap-4">
      <span className="animate-float-y rounded-2xl border border-border bg-card px-4 py-3 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">encrypted</p>
        <p className="mt-1 text-sm font-semibold text-emerald-300">AES-256</p>
      </span>
      <span className="animate-float-y rounded-2xl border border-border bg-card px-4 py-3 text-center" style={{ animationDelay: "0.8s" }}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">role</p>
        <p className="mt-1 text-sm font-semibold text-violet-600">admin · user</p>
      </span>
      <span className="animate-float-y rounded-2xl border border-border bg-card px-4 py-3 text-center" style={{ animationDelay: "1.6s" }}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">audit</p>
        <p className="mt-1 text-sm font-semibold text-sky-600">logged</p>
      </span>
    </div>
  );
}
