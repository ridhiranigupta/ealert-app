import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Camera,
  Fingerprint,
  History,
  KeyRound,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileAvatar } from "@/components/shared/ProfileAvatar";
import { useAuth } from "@/hooks/use-auth";
import { formatTime } from "@/lib/format";

const bloodGroups = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Unknown"];
const MAX_PHOTO_BYTES = 1_500_000;

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const data = useQuery(api.profiles.getProfile);
  const activity = useQuery(api.activityLogs.listMine);
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const updateAccount = useMutation(api.users.updateAccount);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const logEvent = useMutation(api.activityLogs.logEvent);

  const profile = data?.profile;

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    country: "",
    workplace: "",
    fatherName: "",
    motherName: "",
    dob: "",
    bloodGroup: "",
    medicalInfo: "",
    emergencyNote: "",
    photo: "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName ?? "",
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      address: profile.address ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
      country: profile.country ?? "",
      workplace: profile.workplace ?? "",
      fatherName: profile.fatherName ?? "",
      motherName: profile.motherName ?? "",
      dob: profile.dob ?? "",
      bloodGroup: profile.bloodGroup ?? "",
      medicalInfo: profile.medicalInfo ?? "",
      emergencyNote: profile.emergencyNote ?? "",
      photo: profile.photo ?? "",
    });
  }, [profile]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Photo is too large — please use an image under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, photo: String(reader.result) }));
      toast.success("Photo ready to save");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertProfile({
        fullName: form.fullName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        country: form.country || undefined,
        workplace: form.workplace || undefined,
        fatherName: form.fatherName || undefined,
        motherName: form.motherName || undefined,
        dob: form.dob || undefined,
        bloodGroup: form.bloodGroup || undefined,
        medicalInfo: form.medicalInfo || undefined,
        emergencyNote: form.emergencyNote || undefined,
        photo: form.photo || undefined,
      });
      await updateAccount({
        name: form.fullName || undefined,
        phone: form.phone || undefined,
      });
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      await signOut();
      toast.success("Account deleted. Take care.");
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete account.");
      setDeleting(false);
    }
  };

  const photoDisplay = form.photo || user?.image;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Profile & settings"
        subtitle="Your private safety profile. This data is only visible to you — never in lists or to other members."
        actions={
          <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Photo card */}
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="flex justify-center">
              <ProfileAvatar name={form.fullName || user?.name} image={photoDisplay} className="size-24 text-2xl" ring index={0} />
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} aria-label="Upload profile photo" />
            <Button variant="outline" size="sm" className="mt-4 rounded-xl border-white/12 bg-white/[0.03] hover:bg-white/[0.08]" onClick={() => fileRef.current?.click()}>
              <Camera className="size-4" />
              Update photo
            </Button>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Profile photos are stored privately. Tip: keep it under 1.5 MB for now.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Fingerprint className="size-4 text-violet-300" /> Security
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Password</span>
                <span className="flex items-center gap-1.5 font-mono text-xs text-emerald-300">
                  <Lock className="size-3.5" /> hashed (scrypt)
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Magic code login</span>
                <span className="font-mono text-xs text-cyan-300">enabled</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Two-factor</span>
                <span className="font-mono text-xs text-muted-foreground">soon</span>
              </li>
            </ul>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs text-muted-foreground">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-300" />
              Forgot your password? Use "Sign in with a code" on the login page.
            </div>
          </div>

          <div className="rounded-3xl border border-rose-400/20 bg-rose-500/[0.04] p-6">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-rose-300">
              <Trash2 className="size-4" /> Danger zone
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Permanently delete your account, safety profile, contacts and alert history.
            </p>
            <Button variant="outline" className="mt-4 w-full rounded-xl border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200" onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          </div>
        </div>

        {/* Safety profile form */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <UserRound className="size-4 text-violet-300" /> Personal details
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <Input value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} placeholder="Alex Morgan" className="h-10 rounded-xl" />
              </Field>
              <Field label="Phone number">
                <Input type="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="+1 555 000 1234" className="h-10 rounded-xl" />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="you@example.com" className="h-10 rounded-xl" />
              </Field>
              <Field label="Date of birth">
                <Input type="date" value={form.dob} onChange={(e) => set("dob")(e.target.value)} className="h-10 rounded-xl [color-scheme:dark]" />
              </Field>
              <Field label="Blood group" className="sm:col-span-1">
                <Select value={form.bloodGroup || undefined} onValueChange={set("bloodGroup")}>
                  <SelectTrigger className="h-10 w-full rounded-xl">
                    <SelectValue placeholder="Select blood group" />
                  </SelectTrigger>
                  <SelectContent>
                    {bloodGroups.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Workplace / college">
                <Input value={form.workplace} onChange={(e) => set("workplace")(e.target.value)} placeholder="Acme Corp" className="h-10 rounded-xl" />
              </Field>
              <Field label="Father's name" className="sm:col-span-1">
                <Input value={form.fatherName} onChange={(e) => set("fatherName")(e.target.value)} placeholder="Optional" className="h-10 rounded-xl" />
              </Field>
              <Field label="Mother's name">
                <Input value={form.motherName} onChange={(e) => set("motherName")(e.target.value)} placeholder="Optional" className="h-10 rounded-xl" />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={form.address} onChange={(e) => set("address")(e.target.value)} placeholder="Street, building, area" className="h-10 rounded-xl" />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => set("city")(e.target.value)} placeholder="City" className="h-10 rounded-xl" />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={(e) => set("state")(e.target.value)} placeholder="State" className="h-10 rounded-xl" />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(e) => set("country")(e.target.value)} placeholder="Country" className="h-10 rounded-xl" />
              </Field>
              <Field label="Medical / safety information" className="sm:col-span-2">
                <Textarea value={form.medicalInfo} onChange={(e) => set("medicalInfo")(e.target.value)} placeholder="Allergies, conditions, medications…" className="min-h-20 rounded-xl" />
              </Field>
              <Field label="Note for contacts in an emergency" className="sm:col-span-2">
                <Textarea value={form.emergencyNote} onChange={(e) => set("emergencyNote")(e.target.value)} placeholder="What should your contacts know first?" className="min-h-20 rounded-xl" />
              </Field>
            </div>
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] px-3.5 py-3 text-xs leading-relaxed text-violet-200/90">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet-300" />
              Sensitive details like your address, family names and medical notes are stored privately and never shown in lists. Admins can only view them for moderation.
            </div>
          </div>

          {/* Recent activity */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-7">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <History className="size-4 text-cyan-300" /> Recent activity
            </h2>
            {activity && activity.length > 0 ? (
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {activity.slice(0, 6).map((a) => (
                  <li key={a._id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-mono text-xs">{a.action.replace(/_/g, " ")}</span>
                    <span className="flex items-center gap-2">
                      <span className={`font-mono text-[10px] uppercase ${a.result === "success" ? "text-emerald-300" : a.result === "cancelled" ? "text-muted-foreground" : "text-rose-300"}`}>
                        {a.result}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{formatTime(a.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No activity recorded yet.</p>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-3xl border-white/10 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your safety profile, emergency contacts, alert history,
              locations and notifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep my account</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="rounded-xl bg-rose-500 text-white hover:bg-rose-600">
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
