
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { EmptyState } from "@/components/ui/empty-state";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, authStatusMessage } from "@/components/authErrors";

export default function AdminSetup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupDisabled, setSetupDisabled] = useState(false);
  const [setupToken, setSetupToken] = useState("");

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate inputs
    if (!email || !password || !confirmPassword) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      toast({
        title: "Error",
        description: `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/admin-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Required by the server when ADMIN_SETUP_TOKEN is set; the endpoint is hidden (404) otherwise.
          ...(setupToken.trim() ? { "x-admin-setup-token": setupToken.trim() } : {}),
        },
        body: JSON.stringify({
          email,
          password,
          first_name: firstName || "Admin",
          last_name: lastName || "User",
        }),
      });

      // The server hides this endpoint (404) unless ADMIN_SETUP_TOKEN is set: setup is switched off here.
      if (response.status === 404) {
        setSetupDisabled(true);
        return;
      }
      const statusMsg = authStatusMessage(response);
      if (statusMsg) throw new Error(statusMsg);
      if (response.status === 401 || response.status === 403) {
        throw new Error("That setup token isn't right. Check it with whoever deployed SeatSync.");
      }

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to create admin user");

      toast({
        title: "Success",
        description: "Admin user created successfully. You can now log in.",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create admin user",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (setupDisabled) {
    return (
      <main className="container mx-auto py-12 sm:py-24 px-4">
        <h1 className="sr-only">Admin setup</h1>
        <Card className="max-w-md mx-auto">
          <EmptyState
            as="h2"
            icon={<ShieldCheck />}
            title="Admin setup is disabled on this site"
            description="An admin already manages SeatSync, so new admin accounts can't be created from here."
            action={
              <Button asChild size="pill">
                <Link to="/">Back to home</Link>
              </Button>
            }
          />
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto py-12 sm:py-24 px-4">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="font-display text-section">Admin Setup</h1>
          <CardDescription>
            Create your initial admin account to manage the event system
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSetupAdmin}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  placeholder="Admin"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  placeholder="User"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Admin Email</Label>
              <Input
                id="email"
                autoComplete="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                autoComplete="new-password"
                type="password"
                placeholder="Create a secure password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={MAX_PASSWORD_LENGTH}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                autoComplete="new-password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={MAX_PASSWORD_LENGTH}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setupToken">Setup token</Label>
              <Input
                id="setupToken"
                type="password"
                autoComplete="off"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                aria-describedby="setupToken-hint"
              />
              <p id="setupToken-hint" className="text-xs text-muted-foreground">
                The one-time token set on the server by whoever deployed SeatSync.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full min-h-11" disabled={loading} aria-busy={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Creating Admin User...</> : "Create Admin User"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
