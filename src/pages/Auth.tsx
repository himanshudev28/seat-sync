import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/providers/AuthProvider";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, authStatusMessage, oauthErrorMessage } from "@/components/authErrors";
import { AlertCircle, Eye, EyeOff, Github } from "lucide-react";

function getPasswordStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length === 0) return { label: "", color: "bg-muted", width: "0%" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: "Weak", color: "bg-destructive", width: "25%" };
  if (score === 2) return { label: "Fair", color: "bg-warning", width: "50%" };
  if (score === 3) return { label: "Good", color: "bg-primary/60", width: "75%" };
  return { label: "Strong", color: "bg-success", width: "100%" };
}

interface PasswordInputProps {
  id: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  showPassword: boolean;
  onToggle: () => void;
  describedBy?: string;
  invalid?: boolean;
}

function PasswordInput({ id, placeholder, value, onChange, required, minLength, maxLength, showPassword, onToggle, describedBy, invalid }: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="pr-12"
      />
      <button
        type="button"
        className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
        aria-pressed={showPassword}
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function friendlyError(msg: string): string {
  if (/duplicate|already exists|E11000/i.test(msg)) return "An account with this email already exists.";
  if (/invalid credentials|incorrect password|not found/i.test(msg)) return "Incorrect email or password.";
  if (/network|fetch|failed to fetch/i.test(msg)) return "Network error — please check your connection.";
  if (/password.*short|at least \d+ char/i.test(msg)) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return msg;
}

const GoogleIcon = () => (
  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

/** Ticket perforation — a dashed tear line across the form. */
const OrDivider = () => (
  <div className="relative h-px" aria-hidden="true">
    <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
    <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
      or
    </span>
  </div>
);

const SocialButtons = () => (
  <div className="grid grid-cols-1 gap-3 w-full">
    <Button
      type="button"
      variant="outline"
      className="w-full h-11 rounded-xl"
      onClick={() => { window.location.href = "/api/auth/google"; }}
      id="btn-google-signin"
    >
      <GoogleIcon />
      Continue with Google
    </Button>
    <Button
      type="button"
      variant="outline"
      className="w-full h-11 rounded-xl"
      onClick={() => toast({ title: "Coming soon", description: "GitHub login will be available soon." })}
      id="btn-github-signin"
    >
      <Github className="h-4 w-4 mr-2" aria-hidden="true" /> Continue with GitHub
    </Button>
  </div>
);

const FormError = ({ id, message }: { id: string; message: string }) =>
  message ? (
    <p id={id} role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  ) : null;

const TABS = [
  { id: "signin", label: "Sign In" },
  { id: "signup", label: "Sign Up" },
] as const;

/**
 * The brand panel is the product's own seat map rather than the usual
 * feature-bullets-and-stats column: "." open, "x" taken, "@" yours.
 * 12 seats per row with a centre aisle, drawn raked toward the stage.
 */
const HOUSE_PLAN = [
  "..x....x....",
  ".x...x....x.",
  "..x.....x...",
  "...x..@...x.",
  ".x....x...x.",
  "..x..x.....x",
];

// Deliberately near-monochrome: coral is spent on exactly one seat, so "yours"
// is the only thing the eye lands on.
const SEAT_STYLE: Record<string, string> = {
  ".": "border border-foreground/30 bg-foreground/[0.04]",
  x: "border border-foreground/10 bg-foreground/10",
  "@": "border border-primary bg-primary",
};

const LEGEND = [
  { key: ".", label: "Open" },
  { key: "x", label: "Taken" },
  { key: "@", label: "Yours" },
];

const SeatMap = () => (
  <div className="[perspective:760px] w-fit">
    <div
      className="flex flex-col items-center gap-2.5"
      style={{ transform: "rotateX(34deg)" }}
    >
      {/* Stage — the thing every seat is angled toward */}
      <div className="relative w-[70%] mb-4">
        <div className="h-[3px] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="absolute inset-x-0 -top-6 h-12 bg-primary/40 blur-[26px] rounded-full" />
        <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.4em] text-primary">
          Stage
        </p>
      </div>

      {HOUSE_PLAN.map((row, r) => (
        // Rows nearer the viewer sit brighter — the depth cue the rake alone
        // doesn't give. Set on the row, since the seats' own animation would
        // override an inline opacity.
        <div
          key={r}
          className="flex gap-[7px]"
          style={{ opacity: 0.72 + r * 0.056 }}
        >
          {row.split("").map((seat, c) => (
            <span
              key={c}
              className={`h-[22px] w-[22px] rounded-[5px] animate-seatIn ${SEAT_STYLE[seat]} ${c === 6 ? "ml-4" : ""}`}
              style={{ animationDelay: `${140 + r * 70 + c * 14}ms` }}
            >
              {/* The pulse lives on its own layer so it doesn't fight the
                  entrance animation for the `animation` shorthand. */}
              {seat === "@" && (
                <span className="block h-full w-full rounded-[5px] animate-seatPulse" />
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { user, setSessionUser } = useAuth();
  // Where to go after signing in: the page a route guard bounced us from, else home.
  const from = (location.state as { from?: { pathname: string; search?: string; hash?: string } | string } | null)?.from;
  const dest = typeof from === "string" ? from : from ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}` : "/";
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminExists, setAdminExists] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  // An OAuth failure lands here as ?error=<code>; show it where the form shows errors.
  const [showResetHelp, setShowResetHelp] = useState(false);
  const [formError, setFormError] = useState(() => oauthErrorMessage(params.get("error")));

  const strength = getPasswordStrength(password);

  useEffect(() => {
    if (user) navigate(dest, { replace: true });
    const checkAdminExists = async () => {
      try {
        const response = await fetch("/api/auth/check-admin");
        if (!response.ok) throw new Error("Failed to check admin");
        const data = await response.json();
        setAdminExists(data.adminExists);
      } catch {
        setAdminExists(true);
      }
    };
    checkAdminExists();
  }, [user, navigate, dest]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) {
      toast({ title: "Terms required", description: "Please accept the Terms & Privacy Policy to continue.", variant: "destructive" });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      setFormError(`Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters for your password.`);
      return;
    }
    setLoading(true);
    setFormError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName }),
      });
      const statusMsg = authStatusMessage(response);
      if (statusMsg) throw new Error(statusMsg);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registration failed");
      setSessionUser(data.user ?? data);
      toast({ title: "Welcome to SeatSync!", description: "Your account has been created." });
      navigate(dest === "/" ? "/events" : dest, { replace: true });
    } catch (error: any) {
      setFormError(friendlyError(error.message));
      toast({ title: "Sign up failed", description: friendlyError(error.message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const statusMsg = authStatusMessage(response);
      if (statusMsg) throw new Error(statusMsg);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed");
      setSessionUser(data.user ?? data);
      toast({ title: "Welcome back!", description: "You've successfully signed in." });
      navigate(dest, { replace: true });
    } catch (error: any) {
      setFormError(friendlyError(error.message));
      toast({ title: "Sign in failed", description: friendlyError(error.message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const togglePassword = () => setShowPassword((v) => !v);

  // Radix Tabs was dropped for a custom switcher, so re-implement the arrow-key
  // navigation it used to provide.
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = activeTab === "signin" ? "signup" : "signin";
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    // The app shell renders this inside <main className="pt-20"> under a fixed
    // 5rem header, so min-h-screen would overflow the viewport by exactly that
    // much and clip the brand panel. Subtract it.
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-background px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      {/* Both halves live inside ONE rounded surface so the page reads as a
          single object rather than a dark slab butted against a light one.
          Below lg the brand panel is hidden, so the card hugs the form instead
          of stretching to full height and leaving dead space under a short
          sign-in form — `self-center lg:self-stretch`. */}
      <div className="flex w-full max-w-6xl self-center lg:self-stretch overflow-hidden rounded-3xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-24px_rgba(0,0,0,0.22)]">

      {/* ── Left: Brand Panel — the house before the show ──────────────── */}
      {/* No logo here — the site header already shows it right above. */}
      <div className="hidden lg:flex lg:w-[46%] flex-col justify-center gap-8 bg-gradient-to-b from-surface-secondary to-background relative overflow-hidden px-12 xl:px-14 py-8">
        {/* Warm house light spilling from the stage — kept low so the seat map
            stays legible rather than drowning in haze. */}
        <div className="absolute top-[4%] left-1/2 -translate-x-1/2 w-[560px] h-[280px] bg-primary/[0.14] rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.04] pointer-events-none" />

        <div className="relative z-10">
          <SeatMap />
        </div>

        <div className="relative z-10">
          <p className="font-display text-[2.4rem] xl:text-[2.7rem] font-bold text-foreground leading-[1.05] tracking-tight">
            Your seat is<br />
            <span className="text-primary">waiting.</span>
          </p>
          <p className="text-muted-foreground text-[15px] leading-relaxed max-w-[320px] mt-4">
            See every seat in the house as it fills. Pick the one you actually want — it's held the moment you tap it.
          </p>

          {/* Legend — the same vocabulary the real booking screen uses */}
          <div className="flex items-center gap-5 mt-7 pt-6 border-t border-border">
            {LEGEND.map(({ key, label }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`h-3.5 w-3.5 rounded-[4px] ${SEAT_STYLE[key]}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Form Panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-8 sm:px-12 relative">
        <div className="absolute top-0 right-0 w-[420px] h-[380px] bg-primary/[0.06] blur-[110px] pointer-events-none rounded-full" />

        <div className="relative z-10 w-full max-w-[400px] animate-fadeInScale">
          <div>

            {/* Welcome headline */}
            <div className="mb-6">
              <h1 className="font-display text-[1.7rem] font-bold text-foreground leading-tight tracking-tight">
                {activeTab === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                {activeTab === "signin"
                  ? "Sign in to pick up where you left off."
                  : "It takes about thirty seconds."}
              </p>
            </div>

          {/* Tab switcher */}
          <div
            role="tablist"
            aria-label="Authentication"
            onKeyDown={handleTabKeyDown}
            className="flex gap-1 bg-muted border border-border rounded-xl p-1 mb-6"
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                ref={(el) => { tabRefs.current[id] = el; }}
                role="tab"
                type="button"
                id={`tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`panel-${id}`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => { setActiveTab(id); setFormError(""); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card ${
                  activeTab === id
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Sign In Form ── */}
          {activeTab === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4 animate-fadeIn"
              role="tabpanel" id="panel-signin" aria-labelledby="tab-signin">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                  aria-describedby={formError ? "signin-error" : undefined} aria-invalid={formError ? true : undefined} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {/* No email service yet, so no fake "reset link sent": say what actually works. */}
                  <button type="button"
                    className="inline-flex min-h-6 items-center px-1 py-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-expanded={showResetHelp} aria-controls="reset-help"
                    onClick={() => setShowResetHelp((v) => !v)}>
                    Forgot password?
                  </button>
                </div>
                {showResetHelp && (
                  <p id="reset-help" className="rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
                    Ask the event organiser to reset your password for you.
                  </p>
                )}
                <PasswordInput id="password" placeholder="Enter your password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required
                  showPassword={showPassword} onToggle={togglePassword}
                  describedBy={formError ? "signin-error" : undefined} invalid={Boolean(formError)} />
                <FormError id="signin-error" message={formError} />
              </div>
              <Button type="submit" className="w-full h-11 rounded-xl font-semibold text-sm" disabled={loading} id="btn-signin">
                {loading ? "Signing in…" : "Sign In"}
              </Button>
              <div className="pt-2">
                <OrDivider />
                <div className="mt-6">
                  <SocialButtons />
                </div>
              </div>
              {!adminExists && (
                <div className="text-center">
                  <Link to="/admin-setup" className="text-sm text-primary hover:underline">
                    Set up admin account
                  </Link>
                </div>
              )}
            </form>
          )}

          {/* ── Sign Up Form ── */}
          {activeTab === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4 animate-fadeIn"
              role="tabpanel" id="panel-signup" aria-labelledby="tab-signup">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" placeholder="John"
                    value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" placeholder="Doe"
                    value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emailSignup">Email</Label>
                <Input id="emailSignup" type="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="passwordSignup">Password</Label>
                <PasswordInput id="passwordSignup" placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH}
                  showPassword={showPassword} onToggle={togglePassword}
                  describedBy={formError ? "signup-error password-hint" : "password-hint"} invalid={Boolean(formError)} />
                <p id="password-hint" className="text-xs text-muted-foreground">{MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters.</p>
                {password.length > 0 && (
                  <div className="space-y-1 pt-0.5">
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                        style={{ width: strength.width }} />
                    </div>
                    <p className={`text-xs font-medium ${
                      strength.label === "Weak" ? "text-destructive" :
                      strength.label === "Fair" ? "text-warning" :
                      strength.label === "Good" ? "text-foreground" : "text-success"
                    }`}>{strength.label} password</p>
                  </div>
                )}
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="terms" checked={agreedToTerms}
                  onCheckedChange={(v) => setAgreedToTerms(Boolean(v))}
                  className="mt-0.5 border-border data-[state=checked]:border-primary" />
                <Label htmlFor="terms" className="text-sm font-normal cursor-pointer leading-snug">
                  I agree to the{" "}
                  <button type="button" className="text-primary hover:underline"
                    onClick={() => toast({ title: "Terms & Conditions", description: "Available at /terms (coming soon)." })}>
                    Terms of Service
                  </button>{" "}&{" "}
                  <button type="button" className="text-primary hover:underline"
                    onClick={() => toast({ title: "Privacy Policy", description: "Available at /privacy (coming soon)." })}>
                    Privacy Policy
                  </button>
                </Label>
              </div>
              <FormError id="signup-error" message={formError} />
              <Button type="submit" className="w-full h-11 rounded-xl font-semibold text-sm"
                disabled={loading || !agreedToTerms} id="btn-signup">
                {loading ? "Creating Account…" : "Create Account"}
              </Button>
              <div className="pt-2">
                <OrDivider />
                <div className="mt-6">
                  <SocialButtons />
                </div>
              </div>
            </form>
          )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
