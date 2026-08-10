import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, HeartHandshake, Plus, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { EmergencyContactCard } from "@/components/contacts/EmergencyContactCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export default function Contacts() {
  const contacts = useQuery(api.emergencyContacts.list);
  const removeContact = useMutation(api.emergencyContacts.remove);
  const setPrimary = useMutation(api.emergencyContacts.setPrimary);
  const movePriority = useMutation(api.emergencyContacts.movePriority);
  const sendTest = useMutation(api.emergencyContacts.sendTest);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"emergencyContacts"> | null>(null);
  const [removing, setRemoving] = useState<Doc<"emergencyContacts"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const count = contacts?.length ?? 0;
  const activeCount = contacts?.filter((c) => c.active !== false).length ?? 0;

  const handleEdit = (contact: Doc<"emergencyContacts">) => {
    setEditing(contact);
    setDialogOpen(true);
  };

  const handleRemove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await removeContact({ id: removing._id });
      toast.success(`${removing.name} removed`);
      setRemoving(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the contact.");
    } finally {
      setBusy(false);
    }
  };

  const handleSetPrimary = async (id: Id<"emergencyContacts">) => {
    setBusy(true);
    try {
      await setPrimary({ id });
      toast.success("Primary contact updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update primary contact.");
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (id: Id<"emergencyContacts">, direction: "up" | "down") => {
    setBusy(true);
    try {
      await movePriority({ id, direction });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reorder.");
    } finally {
      setBusy(false);
    }
  };

  const handleQuickAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleTest = async (contact: Doc<"emergencyContacts">) => {
    setTestingId(contact._id);
    try {
      const res = await sendTest({ id: contact._id });
      if (res.status === "queued") {
        toast.info(
          `${contact.name}: provider not configured — nothing was sent. Add SMS/email credentials to enable real delivery.`,
        );
      } else if (res.status === "failed") {
        toast.error(`${contact.name}: test failed${res.error ? ` (${res.error})` : ""}`);
      } else {
        toast.success(`Test ${res.status} to ${contact.name} via ${res.channel ?? "unknown channel"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the test.");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Emergency contacts"
        subtitle="The people who should be alerted when you press SOS. Priority order decides who's reached first."
        actions={
          <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleQuickAdd}>
            <Plus className="size-4" />
            Add contact
          </Button>
        }
      />

      {count > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          {activeCount}/10 active contacts{activeCount !== count ? ` (${count - activeCount} paused)` : ""} — the higher the priority, the sooner they're notified. Paused contacts are kept but not alerted.
        </div>
      )}

      {contacts === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-border bg-card/70" />
          ))}
        </div>
      ) : count === 0 ? (
        <EmptyState
          kind="contacts"
          title="No emergency contacts yet"
          description="Add trusted people — family, partner, close friends — who should be contacted during an emergency."
          action={
            <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleQuickAdd}>
              <UserRoundPlus className="size-4" />
              Add your first contact
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact, i) => (
            <EmergencyContactCard
              key={contact._id}
              contact={contact}
              index={i}
              total={count}
              onEdit={handleEdit}
              onRemove={setRemoving}
              onSetPrimary={handleSetPrimary}
              onMove={handleMove}
              onTest={handleTest}
              testing={testingId === contact._id}
              busy={busy}
            />
          ))}
          {count < 10 && (
            <button
              type="button"
              onClick={handleQuickAdd}
              className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-violet-200/70 text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:text-foreground"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-violet-100">
                <Plus className="size-5" />
              </span>
              <span className="text-sm font-medium">Add another contact</span>
            </button>
          )}
        </div>
      )}

      <ContactFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        contactCount={count}
      />

      <AlertDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent className="rounded-3xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer receive your emergency alerts. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={busy}
              className="rounded-xl bg-rose-500 text-white hover:bg-rose-600"
            >
              Remove contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5">
        <HeartHandshake className="size-4 shrink-0 text-violet-600" />
        <p className="text-sm text-muted-foreground">
          Contacts are only alerted when you trigger SOS — they can't see your profile or location otherwise.
        </p>
      </div>
    </div>
  );
}
