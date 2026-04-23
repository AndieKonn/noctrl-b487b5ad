// Admin-only edge function to manage staff scanner accounts.
// Actions: list | create | delete
// All actions require the caller to be authenticated AND have the 'admin' role
// in public.user_roles. Uses the service-role key to perform user
// administration via the Supabase Admin API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Action =
  | { action: "list" }
  | { action: "create"; email: string; password: string; full_name?: string }
  | { action: "delete"; user_id: string };

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  // Verify caller
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const callerId = claimsData.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Check admin role
  const { data: isAdminData, error: roleErr } = await admin.rpc("has_role", {
    _user_id: callerId,
    _role: "admin",
  });
  if (roleErr || isAdminData !== true) return json({ error: "Forbidden" }, 403);

  let body: Action;
  try {
    body = (await req.json()) as Action;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    if (body.action === "list") {
      // Get all user_ids with staff role
      const { data: roles, error: rolesErr } = await admin
        .from("user_roles")
        .select("user_id, created_at")
        .eq("role", "staff")
        .order("created_at", { ascending: false });
      if (rolesErr) return json({ error: rolesErr.message }, 500);

      const staff = await Promise.all(
        (roles ?? []).map(async (r) => {
          const { data } = await admin.auth.admin.getUserById(r.user_id);
          return {
            user_id: r.user_id,
            email: data?.user?.email ?? null,
            full_name:
              (data?.user?.user_metadata?.full_name as string | undefined) ?? null,
            created_at: r.created_at,
            last_sign_in_at: data?.user?.last_sign_in_at ?? null,
          };
        }),
      );

      return json({ staff });
    }

    if (body.action === "create") {
      if (!isEmail(body.email)) return json({ error: "Invalid email" }, 400);
      if (typeof body.password !== "string" || body.password.length < 8) {
        return json({ error: "Password must be at least 8 characters" }, 400);
      }
      const fullName =
        typeof body.full_name === "string" ? body.full_name.trim().slice(0, 120) : "";

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "staff" },
        app_metadata: { role: "staff" },
      });
      if (createErr || !created.user) {
        return json({ error: createErr?.message ?? "Could not create user" }, 400);
      }

      const { error: roleInsertErr } = await admin
        .from("user_roles")
        .insert({ user_id: created.user.id, role: "staff" });
      if (roleInsertErr) {
        // Roll back the auth user so we don't leave an account without the role
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: roleInsertErr.message }, 400);
      }

      return json({
        user: {
          user_id: created.user.id,
          email: created.user.email,
          full_name: fullName,
        },
      });
    }

    if (body.action === "delete") {
      if (typeof body.user_id !== "string" || body.user_id.length < 8) {
        return json({ error: "Invalid user_id" }, 400);
      }
      // Safety: only allow deletion of users that actually have ONLY the staff role
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", body.user_id);
      const roleNames = (roles ?? []).map((r) => r.role);
      if (roleNames.includes("admin")) {
        return json({ error: "Refusing to delete an admin via this endpoint" }, 400);
      }
      if (!roleNames.includes("staff")) {
        return json({ error: "Target is not a staff user" }, 400);
      }

      const { error: delRoleErr } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", body.user_id);
      if (delRoleErr) return json({ error: delRoleErr.message }, 400);

      const { error: delUserErr } = await admin.auth.admin.deleteUser(body.user_id);
      if (delUserErr) return json({ error: delUserErr.message }, 400);

      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
