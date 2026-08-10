import { ArrowRight, Home } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { AnimatedIllustration } from "@/lib/illustrations";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/3 h-80 w-80 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <div className="mb-8">
        <Logo />
      </div>

      <div className="w-52">
        <AnimatedIllustration kind="error" className="w-52" />
      </div>

      <p className="mt-4 font-mono text-xs uppercase tracking-[0.3em] text-violet-600">Error 404</p>
      <h1 className="mt-3 text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
        This signal went dark
      </h1>
      <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        The page you're looking for doesn't exist or was moved. Your safety net is still here —
        let's get you back to it.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="rounded-xl bg-primary px-6 text-primary-foreground hover:bg-primary/90">
          <Link to="/">
            <Home className="size-4" />
            Back home
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl border-border bg-card hover:bg-violet-50">
          <Link to="/dashboard">
            My dashboard
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
