import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  HeartHandshake,
  Loader2,
  PartyPopper,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ProfileAvatar } from "@/components/shared/ProfileAvatar";
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
import { useAuth } from "@/hooks/use-auth";
import { AnimatedIllustration } from "@/lib/illustrations";
import { emptyContactValues, relationships, type ContactFormValues } from "@/lib/contact-form";
import { cn } from "@/lib/utils";

const bloodGroups = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Unknown"];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const addContact = useMutation(api.emergencyContacts.add);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — profile essentials
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  // Step 2 — safety essentials
  const [bloodGroup, setBloodGroup] = useState("");
  const [medicalInfo, setMedicalInfo] = useState("");

  // Step 3 — contacts
  const [contacts, setContacts] = useState<ContactFormValues[]>([]);

  const steps = ["Profile", "Safety", "Contacts"];

  const handleNext = async () => {
    if (step === 0) {
      if (!fullName.trim() || phone.trim().replace(/\D/g, "").length < 7) {
        toast.error("Please add your full name and a valid phone number.");
        return;
      }
    }
    if (step === 1) {
      if (!bloodGroup) {
        toast.error("Please pick your blood group (or choose Unknown).");
        return;
      }
    }
    if (step === 2) {
      const contactsToAdd = contacts.filter((c) => c.name && c.phone);
      if (contactsToAdd.length === 0) {
        toast.error("Add at least one emergency contact, or skip for now.");
        return;
      }
      setSaving(true);
      try {
        await upsertProfile({
          fullName: fullName.trim(),
          phone: phone.trim(),
          city: city.trim() || undefined,
          bloodGroup,
          medicalInfo: medicalInfo.trim() || undefined,
          completeSetup: true,
        });
        for (let i = 0; i < contactsToAdd.length; i++) {
          await addContact({
            name: contactsToAdd[i].name,
            relationship: contactsToAdd[i].relationship || "Other",
            phone: contactsToAdd[i].phone,
            email: contactsToAdd[i].email || undefined,
            isPrimary: i === 0,
          });
        }
        setStep(3);
        toast.success("Safety profile complete — you're ready");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setSaving(false);
      }
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleSkipAll = async () => {
    setSaving(true);
    try {
      await upsertProfile({ completeSetup: true });
      toast.success("You can finish your profile anytime from Settings");
      navigate("/dashboard");
    } finally {
      setSaving(false);
    }
  };

  const updateContact = (i: number, patch: Partial<ContactFormValues>) => {
    setContacts((list) => list.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 inline size-4" /> Back to dashboard
        </Link>
        <button
          type="button"
          onClick={handleSkipAll}
          disabled={saving}
          className="text-sm font-medium text-violet-300 hover:text-violet-200"
        >
          Skip for now
        </button>
      </div>

      {/* Progress */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          {steps.map((label, i) => (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border font-mono text-xs font-semibold transition-all",
                    i < step || step === 3
                      ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                      : i === step
                        ? "border-violet-400/50 bg-violet-500/15 text-violet-200"
                        : "border-white/10 bg-white/[0.03] text-muted-foreground",
                  )}
                >
                  {i < step || step === 3 ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={cn("text-[10px] font-medium uppercase tracking-wider", i <= step ? "text-foreground/80" : "text-muted-foreground")}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn("mx-2 mb-5 h-0.5 flex-1 rounded-full", i < step ? "bg-emerald-400/40" : "bg-white/10")} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
              <StepShell
                icon={<ShieldCheck className="size-5" />}
                title="Let's get to know you"
                sub="Your safety profile helps contacts and responders understand your situation fast."
              >
                <div className="mb-6 flex items-center gap-4">
                  <ProfileAvatar name={fullName || user?.name} image={user?.image} className="size-16 text-xl" ring index={0} />
                  <div>
                    <p className="text-sm font-semibold">{fullName || user?.name || "Your name"}</p>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">profile photo</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="ob-name">Full name</Label>
                    <Input id="ob-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Morgan" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ob-phone">Phone number</Label>
                    <Input id="ob-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 1234" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ob-city">City</Label>
                    <Input id="ob-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Austin, TX" className="h-11 rounded-xl" />
                  </div>
                </div>
              </StepShell>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
              <StepShell
                icon={<Sparkles className="size-5" />}
                title="Safety essentials"
                sub="Medical details included in your alert can help responders help you faster."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ob-blood">Blood group</Label>
                    <Select value={bloodGroup} onValueChange={setBloodGroup}>
                      <SelectTrigger id="ob-blood" className="h-11 w-full rounded-xl">
                        <SelectValue placeholder="Select blood group" />
                      </SelectTrigger>
                      <SelectContent>
                        {bloodGroups.map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ob-medical">Medical / safety notes (optional)</Label>
                    <Input id="ob-medical" value={medicalInfo} onChange={(e) => setMedicalInfo(e.target.value)} placeholder="Allergies, conditions, notes…" className="h-11 rounded-xl" />
                  </div>
                </div>
                <p className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-4 shrink-0 text-emerald-300" />
                  This information stays private — only you can view it, and it's never shown in lists.
                </p>
              </StepShell>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
              <StepShell
                icon={<HeartHandshake className="size-5" />}
                title="Who should we reach?"
                sub="Add up to 10 trusted people. The first one you add becomes your primary contact."
              >
                <div className="space-y-4">
                  {contacts.map((c, i) => (
                    <div key={i} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`oc-name-${i}`}>Name</Label>
                        <Input id={`oc-name-${i}`} value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} placeholder="Full name" className="h-10 rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`oc-rel-${i}`}>Relationship</Label>
                        <Select value={c.relationship} onValueChange={(v) => updateContact(i, { relationship: v })}>
                          <SelectTrigger id={`oc-rel-${i}`} className="h-10 w-full rounded-xl">
                            <SelectValue placeholder="Relationship" />
                          </SelectTrigger>
                          <SelectContent>
                            {relationships.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`oc-phone-${i}`}>Phone</Label>
                        <Input id={`oc-phone-${i}`} type="tel" value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} placeholder="+1 555 000 1234" className="h-10 rounded-xl" />
                      </div>
                      {i === 0 && (
                        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-violet-300 sm:col-span-2">
                          <ShieldCheck className="size-3.5" /> primary contact
                        </p>
                      )}
                    </div>
                  ))}
                  {contacts.length < 2 && (
                    <button
                      type="button"
                      onClick={() => setContacts((l) => [...l, { ...emptyContactValues }])}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
                    >
                      + Add another contact
                    </button>
                  )}
                </div>
              </StepShell>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="text-center">
              <div className="mx-auto w-44">
                <AnimatedIllustration kind="success" className="w-44" />
              </div>
              <h2 className="mt-4 font-display text-3xl font-bold">You're all set! 🎉</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Your safety profile is complete and {contacts.filter((c) => c.name && c.phone).length} contact
                {contacts.filter((c) => c.name && c.phone).length === 1 ? " is" : "s are"} ready to be
                alerted. Remember — hold the SOS button for 3 seconds when you need help.
              </p>
              <Button asChild size="lg" className="mt-8 rounded-2xl bg-primary px-8 text-primary-foreground hover:bg-primary/90">
                <Link to="/dashboard">
                  Go to my dashboard <ArrowRight className="size-4" />
                </Link>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {step < 3 && (
        <div className="mt-10 flex justify-end">
          <Button size="lg" className="rounded-2xl bg-primary px-8 text-primary-foreground hover:bg-primary/90" onClick={handleNext} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : step === 2 ? <PartyPopper className="size-4" /> : <ArrowRight className="size-4" />}
            {step === 2 ? "Finish setup" : "Continue"}
          </Button>
        </div>
      )}
    </div>
  );
}

function StepShell({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
        {icon}
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>
      <div className="mt-7">{children}</div>
    </div>
  );
}
