// Verifies a 6-digit code for an email. On success returns a short-lived
// signed token (just an opaque DB id) that the booking flow includes when
// creating the booking. This proves the email was confirmed.
//
// Body: { email: string, code: string }
// Returns: { ok: true, verification_id: string }

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

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Server not configured" }, 500);

  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6}$/.test(code)) {
    return json({ error: "Invalid email or code" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: fetchErr } = await admin
    .from("email_verifications")
    .select("id, code_hash, expires_at, attempts, verified_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr || !row) {
    return json({ error: "No verification found. Send a new code." }, 404);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return json({ error: "Code expired. Send a new one." }, 410);
  }
  if ((row.attempts ?? 0) >= 5) {
    return json({ error: "Too many attempts. Send a new code." }, 429);
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== row.code_hash) {
    await admin
      .from("email_verifications")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id);
    return json({ error: "Incorrect code" }, 401);
  }

  // Mark verified
  await admin
    .from("email_verifications")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", row.id);

  return json({ ok: true, verification_id: row.id });
});
