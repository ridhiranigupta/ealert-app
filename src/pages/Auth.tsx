import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { AnimatedIllustration } from "@/lib/illustrations";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  User as UserIcon,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getDeviceInfo } from "@/lib/device";

interface AuthProps {
  redirectAfterAuth?: string;
}

export function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type Mode = "signin" | "signup" | "magic" | "otp";

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const logEvent = useMutation(api.activityLogs.logEvent);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);
  const customRedirect = useRef<string | null>(null);

  const initialMode: Mode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicEmail, setMagicEmail] = useState("");

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(customRedirect.current ?? redirect, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const validateSignUp = (): string | null => {
    if (!name.trim()) return "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Please enter a valid email address.";
    if (phone.trim().replace(/\D/g, "").length < 7) return "Please enter a valid phone number.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      await signIn("password", { email, password });
      toast.success("Welcome back");
    } catch {
      setError("Invalid email or password. Try a magic code instead.");
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const validationError = validateSignUp();
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      customRedirect.current = "/setup";
      await signIn("password", {
        email,
        password,
        name: name.trim(),
        phone: phone.trim(),
        flow: "signUp",
      });
      logEvent({ action: "register", device: getDeviceInfo() }).catch(() => {});
      toast.success("Account created — let's set up your safety profile");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("already exists")
          ? "An account with this email already exists. Sign in instead."
          : message || "Could not create your account. Please try again.",
      );
      customRedirect.current = null;
      setIsLoading(false);
    }
  };

  const handleMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const target = mode === "otp" ? magicEmail : email;
      if (!/^\S+@\S+\.\S+$/.test(target)) {
        setError("Please enter a valid email address.");
        setIsLoading(false);
        return;
      }
      setMagicEmail(target);
      await signIn("email-otp", { email: target });
      setMode("otp");
      setIsLoading(false);
    } catch {
      setError("Could not send the code. Check the email and try again.");
      setIsLoading(false);
    }
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", { email: magicEmail, code: otp });
      toast.success("Verified — you're in");
    } catch {
      setError("That code didn't work. Please try again.");
      setOtp("");
      setIsLoading(false);
    }
  };

  const handleGuest = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
    } catch {
      setError("Guest sign-in is unavailable right now.");
      setIsLoading(false);
    }
  };

  const handleGoogle = () => {
    toast.info("Google sign-in will be enabled once credentials are configured.");
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setOtp("");
  };

  const passwordStrength = password.length === 0 ? 0 : password.length < 8 ? 1 : /[A-Z]/.test(password) && /\d/.test(password) ? 3 : 2;

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/3 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-6xl items-center gap-14 px-4 py-10 sm:px-6">
        {/* Left panel */}
        <div className="hidden flex-1 lg:block">
          <button type="button" onClick={() => navigate("/")} aria-label="Back to home" className="mb-8 inline-block">
            <Logo />
          </button>
          <AnimatedIllustration kind="login" className="mx-auto max-w-md" />
          <div className="mx-auto mt-6 max-w-md space-y-3">
            <p className="font-display text-2xl font-bold leading-snug">
              Your safety, <span className="text-gradient">one tap away.</span>
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-violet-300" /> Hashed passwords & role-based access
              </li>
              <li className="flex items-center gap-2.5">
                <Smartphone className="size-4 text-cyan-300" /> SOS with live location sharing
              </li>
              <li className="flex items-center gap-2.5">
                <Lock className="size-4 text-emerald-300" /> Private by default — your data stays yours
              </li>
            </ul>
          </div>
        </div>

        {/* Form panel */}
        <div className="mx-auto w-full max-w-md flex-1">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <button type="button" onClick={() => navigate("/")} aria-label="Back to home">
              <Logo />
            </button>
          </div>

          <Card className="glass-strong rounded-3xl border-white/12 shadow-2xl">
            {mode === "signin" && (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-display text-2xl">Welcome back</CardTitle>
                  <CardDescription>Sign in to your EAlert account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="h-11 rounded-xl pl-10"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password">Password</Label>
                      <button
                        type="button"
                        onClick={() => switchMode("magic")}
                        className="text-xs font-medium text-violet-300 hover:text-violet-200"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-11 rounded-xl pl-10 pr-10"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                  {error && (
                    <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
                      {error}
                    </p>
                  )}
                  <Button className="h-11 w-full rounded-xl" onClick={handleSignIn} disabled={isLoading}>
                    {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                    Sign in
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                  </div>

                  <div className="grid gap-2.5">
                    <Button variant="outline" className="h-11 rounded-xl border-white/12 bg-white/[0.03] hover:bg-white/[0.08]" onClick={handleGoogle}>
                      <GoogleG />
                      Continue with Google
                    </Button>
                    <Button variant="outline" className="h-11 rounded-xl border-white/12 bg-white/[0.03] hover:bg-white/[0.08]" onClick={handleGuest}>
                      <UserIcon className="size-4 text-muted-foreground" />
                      Continue as guest
                    </Button>
                  </div>
                </CardContent>
                <CardFooter className="justify-center pb-6">
                  <p className="text-sm text-muted-foreground">
                    New to EAlert?{" "}
                    <button type="button" onClick={() => switchMode("signup")} className="font-semibold text-violet-300 hover:text-violet-200">
                      Create an account
                    </button>
                  </p>
                </CardFooter>
              </>
            )}

            {mode === "signup" && (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-display text-2xl">Create your account</CardTitle>
                  <CardDescription>Two minutes now can save minutes later</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full name</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" className="h-11 rounded-xl pl-10" autoComplete="name" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11 rounded-xl pl-10" autoComplete="email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Phone number</Label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="signup-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 1234" className="h-11 rounded-xl pl-10" autoComplete="tel" />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="signup-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" className="h-11 rounded-xl pl-9 pr-9" autoComplete="new-password" />
                        <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      {password.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3].map((i) => (
                            <span key={i} className={cn("h-1 flex-1 rounded-full", i <= passwordStrength ? (passwordStrength === 1 ? "bg-rose-400" : passwordStrength === 2 ? "bg-amber-400" : "bg-emerald-400") : "bg-white/10")} />
                          ))}
                          <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {passwordStrength === 0 ? "" : passwordStrength === 1 ? "weak" : passwordStrength === 2 ? "okay" : "strong"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm">Confirm password</Label>
                      <Input id="signup-confirm" type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" className="h-11 rounded-xl" autoComplete="new-password" />
                    </div>
                  </div>
                  {error && (
                    <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
                      {error}
                    </p>
                  )}
                  <Button className="h-11 w-full rounded-xl" onClick={handleSignUp} disabled={isLoading}>
                    {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                    Create account
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                    By creating an account you agree to our Terms and Privacy Policy. Your safety data stays private.
                  </p>
                </CardContent>
                <CardFooter className="justify-center pb-6">
                  <p className="text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <button type="button" onClick={() => switchMode("signin")} className="font-semibold text-violet-300 hover:text-violet-200">
                      Sign in
                    </button>
                  </p>
                </CardFooter>
              </>
            )}

            {mode === "magic" && (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-display text-2xl">Sign in with a code</CardTitle>
                  <CardDescription>We'll email you a one-time code — no password needed</CardDescription>
                </CardHeader>
                <form onSubmit={handleMagic}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="magic-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="magic-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11 rounded-xl pl-10" autoComplete="email" />
                      </div>
                    </div>
                    {error && (
                      <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
                        {error}
                      </p>
                    )}
                    <Button type="submit" className="h-11 w-full rounded-xl" disabled={isLoading}>
                      {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                      Send code
                    </Button>
                  </CardContent>
                </form>
                <CardFooter className="justify-center pb-6">
                  <button type="button" onClick={() => switchMode("signin")} className="text-sm font-medium text-violet-300 hover:text-violet-200">
                    Back to password sign-in
                  </button>
                </CardFooter>
              </>
            )}

            {mode === "otp" && (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-display text-2xl">Check your email</CardTitle>
                  <CardDescription>We sent a 6-digit code to {magicEmail || email}</CardDescription>
                </CardHeader>
                <form onSubmit={handleOtp}>
                  <CardContent className="space-y-4">
                    <div className="flex justify-center">
                      <InputOTP value={otp} onChange={setOtp} maxLength={6} disabled={isLoading}>
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, i) => (
                            <InputOTPSlot key={i} index={i} className="size-11 rounded-xl border-white/15" />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error && (
                      <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-center text-sm text-rose-300">
                        {error}
                      </p>
                    )}
                    <Button type="submit" className="h-11 w-full rounded-xl" disabled={isLoading || otp.length !== 6}>
                      {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                      Verify and sign in
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                      Didn't get it?{" "}
                      <button type="button" onClick={() => switchMode("magic")} className="font-medium text-violet-300 hover:text-violet-200">
                        Resend code
                      </button>
                    </p>
                  </CardContent>
                </form>
                <CardFooter className="justify-center pb-6">
                  <button type="button" onClick={() => switchMode("signin")} className="text-sm font-medium text-violet-300 hover:text-violet-200">
                    Use a different email
                  </button>
                </CardFooter>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
