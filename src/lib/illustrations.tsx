import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Central illustration registry                                       */
/*                                                                     */
/* Every illustration in the app is referenced here by a stable key.   */
/* To replace a placeholder with real AI-generated art, set `asset`    */
/* (image URL, GIF, WebM/MP4, or Lottie JSON URL) — the page layout    */
/* does not change.                                                    */
/* ------------------------------------------------------------------ */

export type IllustrationKind =
  | "hero"
  | "login"
  | "sos"
  | "contacts"
  | "location"
  | "security"
  | "notifications"
  | "alerts"
  | "empty"
  | "onboarding"
  | "success"
  | "admin"
  | "error";

export type IllustrationAsset =
  | { type: "image"; src: string; alt?: string }
  | { type: "video"; src: string; poster?: string; alt?: string }
  | { type: "lottie"; src: string; alt?: string };

export interface IllustrationConfig {
  /** Human-readable description (also used as the default alt text). */
  label: string;
  /** Gentle ambient animation applied to the placeholder art. */
  animation: "float" | "breathe" | "pulse" | "heartbeat" | "none";
  /**
   * Optional external asset. When provided it replaces the built-in SVG
   * placeholder entirely:
   *   asset: { type: "image", src: "/art/hero.webp" }
   *   asset: { type: "video", src: "/art/hero.webm", poster: "/art/hero.jpg" }
   *   asset: { type: "lottie", src: "/art/hero.json" }
   */
  asset?: IllustrationAsset;
}

const PLACEHOLDER_ART: Record<IllustrationKind, IllustrationConfig> = {
  hero: { label: "Person sending an SOS from their phone with location pins nearby", animation: "float" },
  login: { label: "Shield with a heartbeat welcoming you to EAlert", animation: "breathe" },
  sos: { label: "SOS shield with a pulsing heartbeat signal", animation: "heartbeat" },
  contacts: { label: "Two trusted contacts connected by a phone call", animation: "float" },
  location: { label: "Map with a location pin and route", animation: "float" },
  security: { label: "Locked shield — your data stays private", animation: "breathe" },
  notifications: { label: "Notification bell with an unread dot", animation: "float" },
  alerts: { label: "Alert bell sending out waves", animation: "pulse" },
  empty: { label: "Quiet spot with a small location pin", animation: "breathe" },
  onboarding: { label: "Phone with a checklist of safety steps", animation: "float" },
  success: { label: "Shield with a checkmark, mission complete", animation: "heartbeat" },
  admin: { label: "Shield over a rising chart", animation: "float" },
  error: { label: "Signal interrupted — something went wrong", animation: "none" },
};

export const ILLUSTRATION_CONFIG: Readonly<Record<IllustrationKind, IllustrationConfig>> =
  PLACEHOLDER_ART;

export function getIllustration(kind: IllustrationKind): IllustrationConfig {
  return ILLUSTRATION_CONFIG[kind] ?? PLACEHOLDER_ART.hero;
}

/* ------------------------------------------------------------------ */
/* Placeholder SVG art (pastel, on-dark, consistent visual language)   */
/* ------------------------------------------------------------------ */

const C = {
  violet: "#8B5CF6",
  lavender: "#C4B5FD",
  lavenderSoft: "#A78BFA",
  cyan: "#22D3EE",
  cyanSoft: "#67E8F9",
  coral: "#FB7185",
  coralSoft: "#FDA4AF",
  mint: "#6EE7B7",
  yellow: "#FCD34D",
  white: "#FFFFFF",
  ink: "#1E1B33",
};

function SoftCircle({ cx, cy, r, fill, opacity = 1, className }: { cx: number; cy: number; r: number; fill: string; opacity?: number; className?: string }) {
  return <circle cx={cx} cy={cy} r={r} fill={fill} opacity={opacity} className={className} />;
}

function Sparkle({ x, y, s = 1, fill = C.yellow, className }: { x: number; y: number; s?: number; fill?: string; className?: string }) {
  return (
    <path
      d={`M${x} ${y - 6 * s} L${x + 2 * s} ${y - 2 * s} L${x + 6 * s} ${y} L${x + 2 * s} ${y + 2 * s} L${x} ${y + 6 * s} L${x - 2 * s} ${y + 2 * s} L${x - 6 * s} ${y} L${x - 2 * s} ${y - 2 * s} Z`}
      fill={fill}
      className={className}
    />
  );
}

function Shield({ id, x = 90, y = 70, w = 60, h = 72 }: { id: string; x?: number; y?: number; w?: number; h?: number }) {
  return (
    <path
      d={`M${x} ${y} C ${x + w / 2} ${y + 8} ${x + w} ${y + 12} ${x + w} ${y + 12} L ${x + w} ${y + 26} C ${x + w} ${y + 52} ${x + w * 0.78} ${y + 62} ${x + w / 2} ${y + 66} C ${x + w * 0.22} ${y + 62} ${x} ${y + 52} ${x} ${y + 26} L ${x} ${y + 12} C ${x} ${y + 12} ${x + w / 2} ${y + 8} ${x} ${y} Z`}
      fill={`url(#${id})`}
    />
  );
}

function Heartbeat({ x1 = 86, y1 = 100, x2 = 154, xWidth = 68, yBase = 104, className }: { x1?: number; y1?: number; x2?: number; xWidth?: number; yBase?: number; className?: string }) {
  return (
    <polyline
      points={`${x1},${yBase} ${x1 + xWidth * 0.22},${yBase} ${x1 + xWidth * 0.32},${yBase - 10} ${x1 + xWidth * 0.42},${yBase + 8} ${x1 + xWidth * 0.52},${yBase - 12} ${x1 + xWidth * 0.6},${yBase} ${x2},${yBase}`}
      fill="none"
      stroke={C.white}
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    />
  );
}

function Pin({ x, y, fill = C.cyan, className }: { x: number; y: number; fill?: string; className?: string }) {
  return (
    <g className={className}>
      <path
        d={`M${x} ${y + 22} C ${x - 16} ${y + 6} ${x - 12} ${y - 10} ${x} ${y - 12} C ${x + 12} ${y - 10} ${x + 16} ${y + 6} ${x} ${y + 22} Z`}
        fill={fill}
      />
      <circle cx={x} cy={y} r={5.5} fill={C.ink} />
    </g>
  );
}

function Heart({ x, y, s = 1, fill = C.coralSoft, className }: { x: number; y: number; s?: number; fill?: string; className?: string }) {
  return (
    <path
      d={`M${x} ${y + 8 * s} C ${x - 9 * s} ${y + 1 * s} ${x - 6 * s} ${y - 8 * s} ${x} ${y - 4 * s} C ${x + 6 * s} ${y - 8 * s} ${x + 9 * s} ${y + 1 * s} ${x} ${y + 8 * s} Z`}
      fill={fill}
      className={className}
    />
  );
}

function Art({ kind, id }: { kind: IllustrationKind; id: string }) {
  const grad = `ealert-grad-${id}`;
  const grad2 = `ealert-grad2-${id}`;
  const grad3 = `ealert-grad3-${id}`;

  const defs = (
    <defs>
      <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={C.violet} />
        <stop offset="100%" stopColor={C.lavender} />
      </linearGradient>
      <linearGradient id={grad2} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={C.cyan} />
        <stop offset="100%" stopColor={C.cyanSoft} />
      </linearGradient>
      <linearGradient id={grad3} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={C.coral} />
        <stop offset="100%" stopColor={C.coralSoft} />
      </linearGradient>
      <radialGradient id={`ealert-glow-${id}`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor={C.violet} stopOpacity="0.5" />
        <stop offset="100%" stopColor={C.violet} stopOpacity="0" />
      </radialGradient>
    </defs>
  );

  switch (kind) {
    case "hero":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <SoftCircle cx={120} cy={122} r={64} fill={C.ink} opacity={0.92} className="animate-breathe" />
          <Shield id={grad} x={92} y={82} w={56} h={70} />
          <Heartbeat x1={96} y1={112} x2={144} xWidth={48} yBase={114} />
          <Pin x={60} y={86} className="animate-float-y" />
          <Pin x={182} y={96} fill={C.coral} className="animate-float-y" />
          <SoftCircle cx={46} cy={140} r={14} fill={C.mint} opacity={0.85} />
          <SoftCircle cx={196} cy={150} r={10} fill={C.yellow} opacity={0.9} />
          <Sparkle x={120} y={52} s={1.1} />
          <Sparkle x={170} y={70} s={0.7} fill={C.cyanSoft} />
          <Sparkle x={72} y={60} s={0.6} fill={C.coralSoft} />
        </g>
      );
    case "login":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <Shield id={grad} x={88} y={74} w={64} h={80} />
          <Heartbeat x1={92} y1={108} x2={148} xWidth={56} yBase={110} />
          <Pin x={120} y={156} fill={C.cyan} />
          <Sparkle x={90} y={60} s={0.9} />
          <Sparkle x={158} y={66} s={0.7} fill={C.cyanSoft} />
        </g>
      );
    case "sos":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={98} fill={`url(#ealert-glow-${id})`} />
          <circle cx={120} cy={118} r={66} fill="none" stroke={C.coral} strokeOpacity="0.5" strokeWidth={2.5} className="animate-sos-ring" />
          <circle cx={120} cy={118} r={66} fill="none" stroke={C.coral} strokeOpacity="0.35" strokeWidth={2.5} className="animate-sos-ring" style={{ animationDelay: "0.6s" }} />
          <SoftCircle cx={120} cy={118} r={54} fill={C.ink} opacity={0.95} />
          <Shield id={grad3} x={94} y={82} w={52} h={66} />
          <Heartbeat x1={98} y1={108} x2={142} xWidth={44} yBase={110} className="animate-heartbeat" />
          <circle cx={196} cy={70} r={5} fill={C.coralSoft} className="animate-pulse-soft" />
          <circle cx={44} cy={164} r={4} fill={C.cyanSoft} className="animate-pulse-soft" />
        </g>
      );
    case "contacts":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <SoftCircle cx={96} cy={108} r={34} fill={`url(#${grad})`} />
          <SoftCircle cx={150} cy={104} r={30} fill={`url(#${grad2})`} />
          <circle cx={96} cy={168} r={22} fill={C.violet} opacity={0.85} />
          <circle cx={150} cy={166} r={20} fill={C.cyan} opacity={0.85} />
          <rect x={106} y={132} width={30} height={26} rx={8} fill={C.white} opacity={0.95} />
          <path d="M116 140 v6 M124 140 v6 M116 146 l8 4 M124 146 l-8 4" stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" fill="none" />
          <Heart x={64} y={84} s={1.1} className="animate-float-y" />
          <Heart x={172} y={92} s={0.8} fill={C.coral} />
          <Sparkle x={120} y={58} s={0.8} fill={C.yellow} />
        </g>
      );
    case "location":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <rect x={52} y={56} width={136} height={124} rx={22} fill={C.ink} opacity={0.95} />
          <g stroke={C.white} strokeOpacity={0.14} strokeWidth={1}>
            {[72, 92, 112, 132, 152, 172].map((y) => (
              <line key={y} x1={60} y1={y} x2={180} y2={y} />
            ))}
            {[72, 92, 112, 132, 152, 172].map((x) => (
              <line key={x} x1={x} y1={64} x2={x} y2={172} />
            ))}
          </g>
          <path d="M76 148 C 96 148 96 120 118 122 C 140 124 138 96 160 94" fill="none" stroke={C.cyanSoft} strokeWidth={3} strokeDasharray="6 7" strokeLinecap="round" />
          <Pin x={118} y={112} className="animate-float-y" />
          <SoftCircle cx={118} cy={134} r={26} fill={C.cyan} opacity={0.14} className="animate-breathe" />
          <Sparkle x={176} y={64} s={0.6} fill={C.mint} />
        </g>
      );
    case "security":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <Shield id={grad} x={84} y={70} w={72} h={88} />
          <circle cx={120} cy={108} r={20} fill={C.ink} opacity={0.9} />
          <rect x={112} y={108} width={16} height={20} rx={6} fill={C.cyanSoft} />
          <Sparkle x={86} y={60} s={1} />
          <Sparkle x={160} y={66} s={0.7} fill={C.mint} />
          <Sparkle x={146} y={150} s={0.6} fill={C.coralSoft} />
          <SoftCircle cx={60} cy={150} r={12} fill={C.mint} opacity={0.6} />
        </g>
      );
    case "notifications":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <circle cx={120} cy={100} r={40} fill={C.ink} opacity={0.95} />
          <path d="M96 106 C 96 84 106 74 120 74 C 134 74 144 84 144 106 L 146 122 C 147 130 151 134 154 138 L 86 138 C 89 134 93 130 94 122 Z" fill={`url(#${grad2})`} />
          <rect x={110} y={142} width={20} height={6} rx={3} fill={C.lavender} />
          <circle cx={148} cy={86} r={8} fill={C.coralSoft} className="animate-pulse-soft" />
          <SoftCircle cx={60} cy={60} r={10} fill={C.mint} opacity={0.7} />
          <Sparkle x={170} y={140} s={0.7} fill={C.yellow} />
        </g>
      );
    case "alerts":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <circle cx={120} cy={100} r={34} fill={C.ink} opacity={0.95} />
          <path d="M100 106 C 100 88 108 80 120 80 C 132 80 140 88 140 106 L 141 120 C 142 127 146 130 148 134 L 92 134 C 94 130 98 127 99 120 Z" fill={`url(#${grad3})`} />
          <rect x={112} y={136} width={16} height={5} rx={2.5} fill={C.coralSoft} />
          <circle cx={120} cy={98} r={4} fill={C.white} />
          <path d="M120 104 L120 96 M120 110 L120 107" stroke={C.white} strokeWidth={3} strokeLinecap="round" />
          <circle cx={120} cy={118} r={52} fill="none" stroke={C.coral} strokeOpacity={0.4} strokeWidth={2} className="animate-sos-ring" />
          <circle cx={120} cy={118} r={62} fill="none" stroke={C.coral} strokeOpacity={0.2} strokeWidth={2} className="animate-sos-ring" style={{ animationDelay: "0.7s" }} />
        </g>
      );
    case "empty":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={86} fill={`url(#ealert-glow-${id})`} />
          <SoftCircle cx={120} cy={116} r={46} fill={C.ink} opacity={0.9} />
          <circle cx={86} cy={104} r={18} fill={C.lavender} opacity={0.85} />
          <circle cx={118} cy={96} r={22} fill={C.violet} opacity={0.85} />
          <circle cx={152} cy={104} r={16} fill={C.cyan} opacity={0.85} />
          <circle cx={118} cy={100} r={20} fill={C.ink} />
          <Pin x={118} y={118} fill={C.cyan} />
          <SoftCircle cx={66} cy={150} r={10} fill={C.mint} opacity={0.7} />
          <SoftCircle cx={172} cy={152} r={8} fill={C.yellow} opacity={0.8} />
          <Sparkle x={100} y={66} s={0.7} fill={C.coralSoft} />
        </g>
      );
    case "onboarding":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <rect x={78} y={54} width={84} height={132} rx={20} fill={C.ink} opacity={0.96} />
          <rect x={84} y={60} width={72} height={120} rx={14} fill={C.white} opacity={0.06} />
          <circle cx={120} cy={70} r={4} fill={C.lavender} />
          {[86, 106, 126, 146].map((y, i) => (
            <g key={y}>
              <rect x={92} y={y} width={56} height={12} rx={6} fill={C.white} opacity={i === 0 ? 0.5 : 0.22} />
              {i === 0 && <path d="M96 104 l4 4 l8 -9" stroke={C.mint} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            </g>
          ))}
          <Sparkle x={178} y={70} s={0.8} fill={C.yellow} />
          <Sparkle x={64} y={90} s={0.6} fill={C.cyanSoft} />
          <Heart x={172} y={150} s={0.9} />
        </g>
      );
    case "success":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <Shield id={grad2} x={88} y={74} w={64} h={80} />
          <path d="M104 118 l11 11 l22 -24" fill="none" stroke={C.white} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" className="animate-heartbeat" />
          <Sparkle x={86} y={62} s={1} />
          <Sparkle x={160} y={58} s={0.7} fill={C.yellow} />
          <Sparkle x={166} y={146} s={0.6} fill={C.mint} />
        </g>
      );
    case "admin":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <rect x={58} y={96} width={124} height={76} rx={16} fill={C.ink} opacity={0.95} />
          {[
            { h: 30, c: C.violet },
            { h: 46, c: C.cyan },
            { h: 24, c: C.coralSoft },
            { h: 58, c: C.mint },
          ].map((b, i) => (
            <rect key={i} x={70 + i * 26} y={160 - b.h} width={16} height={b.h} rx={5} fill={b.c} opacity={0.9} />
          ))}
          <Shield id={grad} x={92} y={58} w={56} h={62} />
          <path d="M96 84 l10 10 l20 -22" fill="none" stroke={C.white} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
          <Sparkle x={176} y={60} s={0.7} fill={C.yellow} />
        </g>
      );
    case "error":
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <Shield id={grad3} x={90} y={74} w={60} h={78} />
          <path d="M108 106 l24 24 M132 106 l-24 24" stroke={C.white} strokeWidth={5} strokeLinecap="round" />
          <SoftCircle cx={62} cy={150} r={10} fill={C.mint} opacity={0.7} />
          <SoftCircle cx={178} cy={148} r={8} fill={C.yellow} opacity={0.8} />
        </g>
      );
    default:
      return (
        <g>
          {defs}
          <SoftCircle cx={120} cy={118} r={96} fill={`url(#ealert-glow-${id})`} />
          <Shield id={grad} x={90} y={78} w={60} h={76} />
          <Heartbeat x1={94} y1={108} x2={146} xWidth={52} yBase={110} />
        </g>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

const animationVariants = {
  float: {
    animate: { y: [0, -10, 0] },
    transition: { duration: 5.5, repeat: Infinity, ease: "easeInOut" as const },
  },
  breathe: {
    animate: { scale: [1, 1.035, 1] },
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const },
  },
  pulse: {
    animate: { opacity: [0.85, 1, 0.85], scale: [1, 1.02, 1] },
    transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" as const },
  },
  heartbeat: {
    animate: { scale: [1, 1.05, 1, 1.03, 1] },
    transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" as const },
  },
  none: {},
};

export function AnimatedIllustration({
  kind,
  className,
  animate = true,
  eager = false,
}: {
  kind: IllustrationKind;
  className?: string;
  animate?: boolean;
  eager?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const config = getIllustration(kind);
  const alt = config.asset?.alt ?? config.label;

  // External AI-generated asset (image / GIF / WebM / MP4 / Lottie).
  if (config.asset) {
    const asset = config.asset;
    if (asset.type === "video") {
      return (
        <video
          className={cn("pointer-events-none h-auto w-full", className)}
          src={asset.src}
          poster={asset.poster}
          autoPlay
          muted
          loop
          playsInline
          aria-label={alt}
        />
      );
    }
    if (asset.type === "image") {
      return (
        <img
          className={cn("pointer-events-none h-auto w-full select-none", className)}
          src={asset.src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
        />
      );
    }
    // Lottie: drop a render target that a future Lottie player can hydrate.
    return (
      <div
        className={cn("pointer-events-none", className)}
        data-lottie-src={asset.src}
        role="img"
        aria-label={alt}
      />
    );
  }

  const variant = animate ? animationVariants[config.animation] : undefined;

  return (
    <motion.div
      className={cn("pointer-events-none select-none", className)}
      role="img"
      aria-label={alt}
      animate={variant?.animate}
      transition={variant?.transition}
      initial={animate ? { opacity: 0, y: 12 } : undefined}
      whileInView={animate ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, margin: "-40px" }}
    >
      <svg
        viewBox="0 0 240 240"
        className="h-auto w-full"
        aria-hidden="true"
      >
        <Art kind={kind} id={id} />
      </svg>
    </motion.div>
  );
}

/** Soft glass card that hosts an illustration + optional content. */
export function IllustrationCard({
  kind,
  className,
  children,
  illustrationClassName,
}: {
  kind: IllustrationKind;
  className?: string;
  children?: React.ReactNode;
  illustrationClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02]",
        className,
      )}
    >
      <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-violet-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 size-64 rounded-full bg-cyan-400/15 blur-3xl" />
      <AnimatedIllustration kind={kind} className={illustrationClassName} />
      {children}
    </div>
  );
}

/** Compact illustration for empty states. */
export function EmptyStateIllustration({
  kind = "empty",
  className,
}: {
  kind?: IllustrationKind;
  className?: string;
}) {
  return (
    <AnimatedIllustration
      kind={kind}
      className={cn("w-36 sm:w-44", className)}
    />
  );
}

/** Large hero illustration with floating info chips. */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <IllustrationCard kind="hero" className="glow-lavender">
        <div className="relative mx-auto max-w-md px-6 pb-8 pt-2 sm:px-10">
          <AnimatedIllustration kind="hero" />
        </div>
      </IllustrationCard>
      <div className="glass animate-float-y absolute -left-2 top-8 hidden items-center gap-2 rounded-2xl px-4 py-2.5 shadow-lg sm:flex">
        <span className="flex size-2.5 rounded-full bg-emerald-400" />
        <span className="font-mono text-xs font-medium text-foreground/80">SOS · READY</span>
      </div>
      <div
        className="glass animate-float-y absolute -right-2 bottom-10 hidden items-center gap-2 rounded-2xl px-4 py-2.5 shadow-lg sm:flex"
        style={{ animationDelay: "1.2s" }}
      >
        <span className="size-3 rounded-full bg-cyan-400" />
        <span className="font-mono text-xs font-medium text-foreground/80">LOC · SHARED</span>
      </div>
    </div>
  );
}
