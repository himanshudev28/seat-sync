/**
 * /auth/callback
 *
 * After Google OAuth the server sets the HttpOnly session cookie and redirects here (no token in
 * the URL). We confirm the session with /api/auth/me and go home; errors arrive as ?error=<code>.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { OAUTH_ERRORS } from "@/components/authErrors";


export default function AuthCallback() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev; one sign-in check is enough.
    if (started.current) return;
    started.current = true;
    const fail = (msg: string) => {
      setErrorMsg(msg);
      setStatus("error");
      toast({ title: "Sign in failed", description: msg, variant: "destructive" });
      // Not cleared on cleanup: StrictMode's dev re-run returns early and must not cancel it.
      setTimeout(() => navigate("/auth", { replace: true }), 3000);
    };

    const oauthError = new URLSearchParams(window.location.search).get("error");
    if (oauthError) {
      fail(OAUTH_ERRORS[oauthError] ?? `Google login failed: ${oauthError}`);
      return;
    }

    void refresh().then((signedIn) => {
      if (!signedIn) {
        fail("We couldn't confirm your Google sign-in. Please try again.");
        return;
      }
      toast({ title: "Signed in with Google 🎉", description: "Welcome to SeatSync!" });
      navigate("/", { replace: true });
    });
  }, [navigate, refresh]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center text-card-foreground"
        role={status === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {status === "loading" ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            <h1 className="font-display text-card-title">Signing you in</h1>
            <p className="text-sm text-muted-foreground">Completing Google sign-in. This only takes a moment.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
            </div>
            <h1 className="font-display text-card-title">Sign in failed</h1>
            <p className="text-sm text-destructive">{errorMsg}</p>
            <p className="text-sm text-muted-foreground">Taking you back to sign in…</p>
            <Button asChild className="w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
