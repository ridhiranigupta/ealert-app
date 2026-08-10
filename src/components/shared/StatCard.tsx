import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  lavender: "from-violet-200 to-fuchsia-100 text-violet-600",
  cyan: "from-sky-200 to-sky-100 text-sky-600",
  coral: "from-rose-500/25 to-pink-500/10 text-rose-300",
  mint: "from-emerald-400/25 to-teal-500/10 text-emerald-300",
  amber: "from-amber-200 to-orange-100 text-amber-600",
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "lavender",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/60",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-90",
          tones[tone].split(" ")[0],
        )}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight">
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
            tones[tone],
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
