import { cn } from "@/lib/utils";
import { useId } from "react";

/**
 * EAlert logo: rounded shield + heartbeat signal + location pin.
 * Pure SVG so it stays crisp everywhere; gradient ids are unique per mount.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="55%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#67E8F9" />
        </linearGradient>
        <linearGradient id={`lg2-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#67E8F9" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill={`url(#lg-${id})`} />
      <path
        d="M24 9.5c2.6 1 5.6 1.6 8.5 1.9v8.9c0 6.3-3.4 10.9-8.5 12.7-5.1-1.8-8.5-6.4-8.5-12.7v-8.9c2.9-.3 5.9-.9 8.5-1.9z"
        fill="#1E1B33"
        opacity="0.85"
      />
      <path
        d="M17.5 23.5h2.6l2-3.4 2.8 6 2.2-4.2 1.6 1.6h3.8"
        fill="none"
        stroke="#FDF4FF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="34.5" cy="34.5" r="5.5" fill={`url(#lg2-${id})`} stroke="#0d0b1c" strokeWidth="1.5" />
      <circle cx="34.5" cy="34.5" r="2" fill="#0d0b1c" />
    </svg>
  );
}

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {showWordmark && (
        <span className="font-display text-lg font-bold tracking-tight">
          E<span className="text-gradient">Alert</span>
        </span>
      )}
    </span>
  );
}
