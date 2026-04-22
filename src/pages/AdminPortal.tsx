import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminPortal() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const redirectingRef = useRef(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !redirectingRef.current) {
        redirectingRef.current = true;
        setTimeout(() => navigate("/admin-portal/dashboard"), 0);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !redirectingRef.current) {
        redirectingRef.current = true;
        navigate("/admin-portal/dashboard");
      } else {
        setChecking(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin-portal` },
        });
        if (error) throw error;

        const existingAccount = !data.session && (data.user?.identities?.length ?? 0) === 0;
        if (existingAccount) {
          toast.error(
            "This email already has an account. Sign in instead — Supabase will not send a new confirmation email for an existing user.",
          );
          setMode("signin");
          return;
        }

        if (!data.session) {
          toast.success("Check your email to confirm the account, then sign in.");
          setMode("signin");
          return;
        }

        toast.success("Account created. Signing you in...");
      }

      try {
        await supabase.rpc("ensure_admin_role");
      } catch {
        // ignore
      }
      if (!redirectingRef.current) {
        redirectingRef.current = true;
        navigate("/admin-portal/dashboard");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glass w-full max-w-sm rounded-2xl p-8">
        <h1 className="font-display text-3xl tracking-wide">
          Admin {mode === "signin" ? "Sign In" : "Sign Up"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Restricted to authorized accounts only.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "First time? Create the admin account"
            : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
