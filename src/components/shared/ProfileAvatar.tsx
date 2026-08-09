import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(name?: string | null): string {
  if (!name) return "EA";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const gradients = [
  "from-violet-500 to-fuchsia-400",
  "from-cyan-400 to-sky-500",
  "from-rose-400 to-pink-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
];

export function ProfileAvatar({
  name,
  image,
  className,
  ring = false,
  index = 0,
}: {
  name?: string | null;
  image?: string | null;
  className?: string;
  ring?: boolean;
  index?: number;
}) {
  const gradient = gradients[index % gradients.length];
  return (
    <Avatar
      className={cn(
        ring &&
          "ring-2 ring-white/20 ring-offset-2 ring-offset-background shadow-lg",
        className,
      )}
    >
      {image ? (
        <AvatarImage src={image} alt={name ?? "avatar"} />
      ) : (
        <AvatarFallback
          className={cn(
            "bg-gradient-to-br font-display font-semibold text-white",
            gradient,
          )}
        >
          {initials(name)}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
