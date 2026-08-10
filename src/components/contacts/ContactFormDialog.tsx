import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { channelOptions, ContactFormValues, emptyContactValues, relationships, type ContactChannel } from "@/lib/contact-form";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function ContactFormDialog({
  open,
  onOpenChange,
  editing,
  contactCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Doc<"emergencyContacts"> | null;
  contactCount: number;
}) {
  const addContact = useMutation(api.emergencyContacts.add);
  const updateContact = useMutation(api.emergencyContacts.update);
  const [values, setValues] = useState<ContactFormValues>(emptyContactValues);
  const [isPrimary, setIsPrimary] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(
        editing
          ? {
              name: editing.name,
              relationship: editing.relationship,
              phone: editing.phone,
              email: editing.email ?? "",
              active: editing.active !== false,
              channels: (editing.channels ?? []) as ContactChannel[],
            }
          : emptyContactValues,
      );
      setIsPrimary(editing?.isPrimary ?? false);
      setIsActive(editing?.active !== false);
      setError(null);
    }
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const name = values.name.trim();
    const relationship = values.relationship;
    const phone = values.phone.trim();

    if (!name || !relationship || !phone) {
      setError("Name, relationship and phone number are required.");
      return;
    }
    if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) {
      setError("That email address doesn't look right.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateContact({
          id: editing._id,
          name,
          relationship,
          phone,
          email: values.email || undefined,
          isPrimary,
          active: isActive,
          channels: values.channels,
        });
        toast.success(`${name} updated`);
      } else {
        await addContact({
          name,
          relationship,
          phone,
          email: values.email || undefined,
          isPrimary,
          active: isActive,
          channels: values.channels,
        });
        toast.success(`${name} added to your emergency contacts`);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the contact.");
    } finally {
      setSaving(false);
    }
  };

  const atLimit = contactCount >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border-border bg-card sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl">
            {editing ? "Edit emergency contact" : "Add emergency contact"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update their details — changes apply to future alerts."
              : `Trusted people who should be notified in an emergency (${contactCount}/10).`}
          </DialogDescription>
        </DialogHeader>

        {atLimit && !editing ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
            You've reached the limit of 10 emergency contacts. Remove one to add another.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-name">Full name</Label>
                <Input
                  id="contact-name"
                  value={values.name}
                  onChange={(e) => setValues({ ...values, name: e.target.value })}
                  placeholder="Alex Morgan"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-relationship">Relationship</Label>
                <Select
                  value={values.relationship}
                  onValueChange={(v) => setValues({ ...values, relationship: v })}
                >
                  <SelectTrigger id="contact-relationship" className="w-full">
                    <SelectValue placeholder="Choose relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {relationships.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone number</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={values.phone}
                onChange={(e) => setValues({ ...values, phone: e.target.value })}
                placeholder="+1 555 000 1234"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">Email (optional)</Label>
              <Input
                id="contact-email"
                type="email"
                value={values.email}
                onChange={(e) => setValues({ ...values, email: e.target.value })}
                placeholder="alex@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Notification channels</Label>
              <div className="grid grid-cols-3 gap-2">
                {channelOptions.map((c) => {
                  const active = values.channels.includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        setValues({
                          ...values,
                          channels: active
                            ? values.channels.filter((x) => x !== c.value)
                            : [...values.channels, c.value],
                        })
                      }
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-violet-300 bg-violet-100 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-violet-300",
                      )}
                      aria-pressed={active}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {active && <Check className="size-3.5 text-violet-600" />}
                        {c.label}
                      </span>
                      <span className="text-[10px]">{c.hint}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use SMS (plus email when one is set).
              </p>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-sm">
                <span className="block font-medium">Primary emergency contact</span>
                <span className="block text-xs text-muted-foreground">
                  Marked as the first person to reach
                </span>
              </span>
              <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-sm">
                <span className="block font-medium">Active</span>
                <span className="block text-xs text-muted-foreground">
                  Inactive contacts are kept but not alerted during SOS
                </span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>

            {error && (
              <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            )}

            <DialogFooter className="sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="rounded-xl bg-primary text-primary-foreground">
                {saving ? "Saving…" : editing ? "Save changes" : "Add contact"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
