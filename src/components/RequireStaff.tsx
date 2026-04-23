import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gate that allows access only to authenticated users with the `staff` role.
 * Anyone else (signed-out, admin-only, regular user) is redirected to /staff/login.
 */
export default function RequireStaff({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async (userId: string | null) => {
      if (!userId) {
        if (!cancelled) {
          setAuthorized(false);
          setChecking(false);
          navigate("/staff/login", { replace: true });
        }
        return;
      }
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "staff",
      });
      if (cancelled) return;
      if (error || data !== true) {
        await supabase.auth.signOut();
        setAuthorized(false);
        setChecking(false);
        navigate("/staff/login", { replace: true });
        return;
      }
      setAuthorized(true);
      setChecking(false);
    };

    // Listen first, then read existing session
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void check(session?.user?.id ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      void check(data.session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (checking || !authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}
