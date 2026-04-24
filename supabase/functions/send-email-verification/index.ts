// Sends a 6-digit verification code to the booking email via Resend.
// The code is stored hashed in a short-lived row in `email_verifications`.
//
// Body: { email: string }
// Returns: { ok: true } on success.

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

const isEmail = (v: unknown): v is string =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildEmailHtml(code: string) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#16150f;font-family:'Inter',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#f7f3e3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16150f;background-image:radial-gradient(ellipse at top, rgba(245,214,61,0.18), transparent 60%);padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:rgba(31,30,21,0.85);border:1px solid rgba(245,214,61,0.25);border-radius:18px;overflow:hidden;">
        <tr><td style="padding:32px 32px 18px 32px;border-bottom:1px solid rgba(245,214,61,0.18);">
          <div style="font-family:'Bebas Neue','Inter',sans-serif;font-size:13px;letter-spacing:6px;color:#f5d63d;font-weight:700;text-transform:uppercase;">NoCTRL Events</div>
          <h1 style="margin:10px 0 0 0;font-family:'Bebas Neue','Inter',sans-serif;font-size:34px;color:#f5d63d;font-weight:400;letter-spacing:2px;text-transform:uppercase;line-height:1;">Verify your email</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 20px 0;font-size:15px;color:#d8d2b8;line-height:1.6;">
            Use this code to confirm your email and continue to payment. The code expires in 10 minutes.
          </p>
          <div style="text-align:center;background:rgba(20,19,13,0.7);border:1px solid rgba(245,214,61,0.3);border-radius:12px;padding:22px;margin:0 0 22px 0;">
            <div style="font-family:'Courier New',monospace;font-size:38px;font-weight:700;letter-spacing:10px;color:#f5d63d;">${code}</div>
          </div>
          <p style="margin:0;font-size:12px;color:#9a9079;line-height:1.5;">
            Didn't request this? Ignore this email — no booking has been made.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid rgba(245,214,61,0.18);text-align:center;background:rgba(20,19,13,0.5);">
          <p style="margin:0;font-family:'Bebas Neue','Inter',sans-serif;font-size:12px;color:#bfb38a;letter-spacing:3px;text-transform:uppercase;">NoCTRL · Lose Control</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE || !RESEND_API_KEY) {
    return json({ error: "Server not configured" }, 500);
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isEmail(email)) return json({ error: "Invalid email" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Generate a 6-digit code, store its hash, expire in 10 minutes
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Clean up old codes for this email, then insert a fresh one
  await admin.from("email_verifications").delete().eq("email", email);

  const { error: insertErr } = await admin.from("email_verifications").insert({
    email,
    code_hash: codeHash,
    expires_at: expiresAt,
    attempts: 0,
  });
  if (insertErr) {
    console.error("Insert verification failed", insertErr);
    return json({ error: "Could not create verification" }, 500);
  }

  // Send the email
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NoCTRL <onboarding@resend.dev>",
      to: [email],
      subject: `Your NoCTRL verification code: ${code}`,
      html: buildEmailHtml(code),
    }),
  });

  if (!emailRes.ok) {
    const text = await emailRes.text();
    console.error("Resend send failed", emailRes.status, text);
    return json({ error: "Could not send verification email" }, 502);
  }

  return json({ ok: true });
});
