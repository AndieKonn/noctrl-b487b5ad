import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function StaffLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextParam = params.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/staff/scan";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const redirectingRef = useRef(false);

  useEffect(() => {
    const goIfStaff = async (userId: string | null) => {
      if (!userId || redirectingRef.current) return;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "staff",
      });
      if (!error && data === true) {
        redirectingRef.current = true;
        navigate(safeNext, { replace: true });
      } else {
        setChecking(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void goIfStaff(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setChecking(false);
      else void goIfStaff(data.session.user.id);
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("Sign in failed");

      const { data: hasStaff, error: roleErr } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: "staff",
      });
      if (roleErr || hasStaff !== true) {
        await supabase.auth.signOut();
        throw new Error("This account is not a staff scanner.");
      }
      redirectingRef.current = true;
      navigate(safeNext, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      toast.error(msg);
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="glass w-full max-w-sm rounded-2xl p-7 sm:p-8">
        <div className="mb-5 flex items-center gap-2 text-primary">
          <ScanLine className="h-5 w-5" />
          <span className="font-display tracking-[0.3em] text-xs uppercase">
            NoCTRL · Door Crew
          </span>
        </div>
        <h1 className="font-display text-3xl tracking-wide">Staff Sign In</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For door scanners only. Need an account? Ask the admin.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
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
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? "Please wait..." : "Sign In"}
          </Button>
        </form>
      </div>
    </main>
  );
}
