import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ProfileAvatar } from "@/components/shared/ProfileAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type Contact = Doc<"emergencyContacts">;

export function EmergencyContactCard({
  contact,
  index,
  total,
  onEdit,
  onRemove,
  onSetPrimary,
  onMove,
  busy,
}: {
  contact: Contact;
  index: number;
  total: number;
  onEdit: (contact: Contact) => void;
  onRemove: (contact: Contact) => void;
  onSetPrimary: (id: Id<"emergencyContacts">) => void;
  onMove: (id: Id<"emergencyContacts">, direction: "up" | "down") => void;
  busy?: boolean;
}) {
  const handleCall = () => {
    if (typeof window !== "undefined" && contact.phone) {
      window.location.href = `tel:${contact.phone.replace(/[^+\d]/g, "")}`;
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]",
        contact.isPrimary && "border-violet-400/35 bg-violet-500/[0.07]",
      )}
    >
      {contact.isPrimary && (
        <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-violet-500/20 blur-2xl" />
      )}

      <div className="flex items-start gap-4">
        <div className="relative">
          <ProfileAvatar name={contact.name} image={contact.image} className="size-12 text-base" ring={contact.isPrimary} index={index} />
          {contact.isPrimary && (
            <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-violet-500 text-white shadow-md">
              <ShieldCheck className="size-3" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-semibold">{contact.name}</h3>
            {contact.isPrimary && (
              <Badge variant="outline" className="hidden shrink-0 border-violet-400/40 bg-violet-400/10 text-violet-300 sm:inline-flex">
                Primary
              </Badge>
            )}
          </div>
          <p className="text-xs font-medium text-muted-foreground">{contact.relationship}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-foreground/80">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3 text-cyan-300" />
              {contact.phone}
            </span>
            {contact.email && (
              <span className="inline-flex items-center gap-1.5 truncate text-muted-foreground">
                <Mail className="size-3 text-violet-300" />
                {contact.email}
              </span>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-60 transition-opacity hover:opacity-100"
              aria-label={`Actions for ${contact.name}`}
            >
              <span className="text-lg leading-none">⋯</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => onEdit(contact)} className="cursor-pointer">
              <Pencil className="mr-2 size-4" />
              Edit contact
            </DropdownMenuItem>
            {!contact.isPrimary && (
              <DropdownMenuItem onSelect={() => onSetPrimary(contact._id)} className="cursor-pointer">
                <Star className="mr-2 size-4" />
                Make primary
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={index === 0 || busy}
              onSelect={() => onMove(contact._id, "up")}
              className="cursor-pointer"
            >
              <ChevronUp className="mr-2 size-4" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === total - 1 || busy}
              onSelect={() => onMove(contact._id, "down")}
              className="cursor-pointer"
            >
              <ChevronDown className="mr-2 size-4" />
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onRemove(contact)}
              className="cursor-pointer text-rose-400 focus:text-rose-400"
            >
              <Trash2 className="mr-2 size-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Priority {contact.priority}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-200"
          onClick={handleCall}
        >
          <Phone className="size-3.5" />
          Call
        </Button>
      </div>
    </div>
  );
}
