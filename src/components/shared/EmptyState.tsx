import type { ReactNode } from "react";
import { EmptyStateIllustration, type IllustrationKind } from "@/lib/illustrations";
import { cn } from "@/lib/utils";

export function EmptyState({
  kind = "empty",
  title,
  description,
  action,
  className,
}: {
  kind?: IllustrationKind;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-violet-200/70 bg-card/70 px-6 py-14 text-center",
        className,
      )}
    >
      <EmptyStateIllustration kind={kind} />
      <div className="max-w-sm space-y-1.5">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
