import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  MessageSquareText,
  Pencil,
  Phone,
  ShieldCheck,
  Star,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
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

const channelLabel: Record<string, string> = { sms: "SMS", email: "Email", push: "Push" };

export function EmergencyContactCard({
  contact,
  index,
  total,
  onEdit,
  onRemove,
  onSetPrimary,
  onMove,
  onTest,
  onInvite,
  testing,
  inviting,
  busy,
}: {
  contact: Contact;
  index: number;
  total: number;
  onEdit: (contact: Contact) => void;
  onRemove: (contact: Contact) => void;
  onSetPrimary: (id: Id<"emergencyContacts">) => void;
  onMove: (id: Id<"emergencyContacts">, direction: "up" | "down") => void;
  onTest: (contact: Contact) => void;
  onInvite?: (contact: Contact) => void;
  testing: boolean;
  inviting?: boolean;
  busy?: boolean;
}) {
  const active = contact.active !== false;
  const channels = contact.channels && contact.channels.length > 0 ? contact.channels : ["sms", "email"].filter((c) => c !== "email" || contact.email);

  const handleCall = () => {
    if (typeof window !== "undefined" && contact.phone) {
      window.location.href = `tel:${contact.phone.replace(/[^+\d]/g, "")}`;
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/60",
        contact.isPrimary && "border-violet-200 bg-violet-50",
        !active && "opacity-60",
      )}
    >
      {contact.isPrimary && (
        <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-violet-200/70 blur-2xl" />
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
              <Badge variant="outline" className="hidden shrink-0 border-violet-200 bg-violet-50 text-violet-700 sm:inline-flex">
                Primary
              </Badge>
            )}
            {!active && (
              <Badge variant="outline" className="shrink-0 border-muted-foreground/30 bg-muted/40 text-muted-foreground">
                Paused
              </Badge>
            )}
            {contact.verified ? (
              <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldCheck className="size-3" />
                EAlert verified
              </Badge>
            ) : contact.contactUserId ? (
              <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-700">
                Invitation pending
              </Badge>
            ) : null}
          </div>
          <p className="text-xs font-medium text-muted-foreground">{contact.relationship}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-foreground/80">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3 text-sky-600" />
              {contact.phone}
            </span>
            {contact.email && (
              <span className="inline-flex items-center gap-1.5 truncate text-muted-foreground">
                <Mail className="size-3 text-violet-600" />
                {contact.email}
              </span>
            )}
          </div>
          {channels.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <MessageSquareText className="size-3 text-muted-foreground/70" />
              {channels.map((c) => (
                <span key={c} className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {channelLabel[c] ?? c}
                </span>
              ))}
            </div>
          )}
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
            {!contact.verified && onInvite && (
              <DropdownMenuItem onSelect={() => onInvite(contact)} disabled={inviting} className="cursor-pointer">
                <UserRoundPlus className="mr-2 size-4" />
                {contact.contactUserId ? "Re-send EAlert invite" : "Invite to EAlert"}
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
              className="cursor-pointer text-rose-600 focus:text-rose-600"
            >
              <Trash2 className="mr-2 size-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Priority {contact.priority}
        </span>
        <div className="flex items-center gap-2">
          {!contact.verified && onInvite && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              onClick={() => onInvite(contact)}
              disabled={inviting || !active}
              title="Connect this contact to their EAlert account"
            >
              {inviting ? <Loader2 className="size-3.5 animate-spin" /> : <UserRoundPlus className="size-3.5" />}
              Invite
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-border bg-card text-muted-foreground hover:bg-violet-50"
            onClick={() => onTest(contact)}
            disabled={testing || !active}
            title="Send a test notification through the contact's channels"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquareText className="size-3.5" />}
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
            onClick={handleCall}
          >
            <Phone className="size-3.5" />
            Call
          </Button>
        </div>
      </div>
    </div>
  );
}
