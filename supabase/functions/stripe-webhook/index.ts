// Stripe webhook. On successful payment:
//  - mark the booking as paid
//  - generate N ticket rows (1 for reservations, N for entrance) with their
//    own QR codes
//  - email all QR codes to the buyer (one big confirmation email with each
//    QR inline)

import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import QRCode from "https://esm.sh/qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const VERIFY_BASE = "https://noctrl.lovable.app/verify";

function generateTicketCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 10).toString()).join("");
}

function buildEmailHtml(opts: {
  fullName: string;
  eventTitle: string;
  tierLabel: string;
  guests: number;
  ticketCount: number;
  eventDate: string | null;
  ticketCodes: string[];
}) {
  const tierLabel = opts.tierLabel;
  const dateLine = opts.eventDate
    ? `<tr><td style="padding:8px 0;color:#bfb38a;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Date</td><td style="padding:8px 0;color:#f7f3e3;text-align:right;font-weight:700;font-size:15px;">${opts.eventDate}</td></tr>`
    : "";

  const qrBlocks = opts.ticketCodes
    .map((code, i) => {
      const cid = `ticket-qr-${i}`;
      const labelLine = opts.ticketCount > 1
        ? `<p style="margin:14px 0 4px 0;font-family:'Bebas Neue','Inter',sans-serif;font-size:14px;color:#f5d63d;letter-spacing:4px;text-transform:uppercase;">Ticket ${i + 1} of ${opts.ticketCount}</p>`
        : `<p style="margin:18px 0 0 0;font-family:'Bebas Neue','Inter',sans-serif;font-size:14px;color:#f5d63d;letter-spacing:4px;text-transform:uppercase;">Scan At The Door</p>`;
      return `
      <tr><td align="center" style="padding:8px 32px 24px 32px;">
        <div style="background:#f7f3e3;display:inline-block;padding:18px;border-radius:14px;border:2px solid #f5d63d;box-shadow:0 0 40px rgba(245,214,61,0.35);">
          <img src="cid:${cid}" alt="Ticket QR Code" width="240" height="240" style="display:block;width:240px;height:240px;" />
        </div>
        ${labelLine}
        <p style="margin:6px 0 0 0;font-family:'Courier New',monospace;font-size:12px;color:#bfb38a;letter-spacing:1px;">${code}</p>
      </td></tr>`;
    })
    .join("");

  const intro = opts.ticketCount > 1
    ? `Payment confirmed for <span style="color:#f5d63d;font-weight:700;">${opts.eventTitle}</span>.
       You bought ${opts.ticketCount} entrance tickets — each ticket below can be used by one person at the door. Show one QR per person.`
    : `Payment confirmed for <span style="color:#f5d63d;font-weight:700;">${opts.eventTitle}</span>.
       Flash the QR below at the door — that's your ticket in.`;

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#16150f;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f7f3e3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16150f;background-image:radial-gradient(ellipse at top, rgba(245,214,61,0.18), transparent 60%),radial-gradient(ellipse at bottom right, rgba(232,184,42,0.12), transparent 60%);padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:rgba(31,30,21,0.85);border:1px solid rgba(245,214,61,0.25);border-radius:18px;overflow:hidden;box-shadow:0 0 80px rgba(245,214,61,0.18);">
        <tr><td style="padding:32px 32px 18px 32px;border-bottom:1px solid rgba(245,214,61,0.18);">
          <div style="font-family:'Bebas Neue','Inter',sans-serif;font-size:14px;letter-spacing:6px;color:#f5d63d;font-weight:700;text-transform:uppercase;">NoCTRL Events</div>
          <h1 style="margin:10px 0 0 0;font-family:'Bebas Neue','Inter',sans-serif;font-size:42px;color:#f5d63d;font-weight:400;letter-spacing:2px;text-transform:uppercase;line-height:1;">You're In.</h1>
        </td></tr>
        <tr><td style="padding:28px 32px 8px 32px;">
          <p style="margin:0 0 14px 0;font-size:16px;color:#f7f3e3;line-height:1.5;">Hey ${opts.fullName},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#d8d2b8;line-height:1.65;">${intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(20,19,13,0.7);border:1px solid rgba(245,214,61,0.2);border-radius:12px;padding:18px 20px;margin:0 0 24px 0;">
            <tr><td style="padding:8px 0;color:#bfb38a;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Tier</td><td style="padding:8px 0;color:#f7f3e3;text-align:right;font-weight:700;font-size:15px;">${tierLabel}</td></tr>
            <tr><td style="padding:8px 0;color:#bfb38a;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${opts.tier === "entrance" ? "Tickets" : "Guests"}</td><td style="padding:8px 0;color:#f7f3e3;text-align:right;font-weight:700;font-size:15px;">${opts.guests}</td></tr>
            ${dateLine}
          </table>
        </td></tr>
        ${qrBlocks}
        <tr><td style="padding:22px 32px 28px 32px;border-top:1px solid rgba(245,214,61,0.18);text-align:center;background:rgba(20,19,13,0.5);">
          <p style="margin:0;font-family:'Bebas Neue','Inter',sans-serif;font-size:13px;color:#bfb38a;letter-spacing:3px;text-transform:uppercase;">NoCTRL · Lose Control</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("Signature verification failed", err);
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const ticketCode = session.metadata?.ticket_code;
      const paid =
        session.payment_status === "paid" ||
        session.payment_status === "no_payment_required";

      if (ticketCode && paid) {
        const { data: booking, error: fetchErr } = await supabase
          .from("bookings")
          .select(
            "id, ticket_code, full_name, email, tier, tier_id, number_of_guests, event_date, event_id, payment_status",
          )
          .eq("ticket_code", ticketCode)
          .maybeSingle();

        if (fetchErr || !booking) {
          console.error("Booking lookup failed", fetchErr);
          return new Response(JSON.stringify({ error: "Booking not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let eventTitle = "NoCTRL Event";
        if (booking.event_id) {
          const { data: ev } = await supabase
            .from("events")
            .select("title")
            .eq("id", booking.event_id)
            .maybeSingle();
          if (ev?.title) eventTitle = ev.title;
        }

        // Determine category from tier_id (preferred) or legacy tier enum
        let isEntrance = booking.tier === "entrance";
        let tierLabelStr = isEntrance ? "Entrance Ticket"
          : booking.tier === "vip" ? "VIP Reservation" : "Standard Reservation";
        if (booking.tier_id) {
          const { data: t } = await supabase
            .from("event_tiers")
            .select("name, category")
            .eq("id", booking.tier_id)
            .maybeSingle();
          if (t) {
            isEntrance = t.category === "entrance";
            tierLabelStr = t.name;
          }
        }
        const ticketCount = isEntrance ? Math.max(1, booking.number_of_guests) : 1;

        // Make sure we don't double-create on webhook retry
        const { data: existing } = await supabase
          .from("tickets")
          .select("ticket_code, qr_code_data_url")
          .eq("booking_id", booking.id)
          .order("created_at", { ascending: true });

        let ticketRows: { ticket_code: string; qr_code_data_url: string }[];
        if (existing && existing.length === ticketCount) {
          ticketRows = existing as { ticket_code: string; qr_code_data_url: string }[];
        } else {
          // Generate fresh codes + QRs. Reuse the booking's primary ticket_code as
          // the first one so /verify links from earlier flows still resolve.
          const codes: string[] = [];
          for (let i = 0; i < ticketCount; i++) {
            codes.push(i === 0 ? booking.ticket_code! : generateTicketCode());
          }

          const inserts = await Promise.all(
            codes.map(async (code) => {
              const verifyUrl = `${VERIFY_BASE}?ticket=${encodeURIComponent(code)}`;
              const qrPayload = JSON.stringify({ ticket: code, verify: verifyUrl });
              const qrDataUrl: string = await QRCode.toDataURL(qrPayload, {
                errorCorrectionLevel: "M",
                margin: 1,
                width: 512,
                color: { dark: "#000000", light: "#FFFFFF" },
              });
              return { booking_id: booking.id, ticket_code: code, qr_code_data_url: qrDataUrl };
            }),
          );

          // Replace any partial set so we end up with exactly `ticketCount` rows
          if (existing && existing.length > 0) {
            await supabase.from("tickets").delete().eq("booking_id", booking.id);
          }
          const { error: insertErr } = await supabase.from("tickets").insert(inserts);
          if (insertErr) {
            console.error("Insert tickets failed", insertErr);
            return new Response(JSON.stringify({ error: "DB insert failed" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          ticketRows = inserts.map((r) => ({
            ticket_code: r.ticket_code,
            qr_code_data_url: r.qr_code_data_url,
          }));
        }

        // Update booking: paid + cache the FIRST QR for back-compat
        const { error: updateErr } = await supabase
          .from("bookings")
          .update({
            payment_status: "paid",
            qr_code_data_url: ticketRows[0]?.qr_code_data_url ?? null,
          })
          .eq("ticket_code", ticketCode);

        if (updateErr) {
          console.error("Failed to update booking", updateErr);
          return new Response(
            JSON.stringify({ error: "DB update failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        if (resendKey) {
          try {
            const html = buildEmailHtml({
              fullName: booking.full_name,
              eventTitle,
              tier: booking.tier,
              guests: booking.number_of_guests,
              ticketCount,
              eventDate: booking.event_date,
              ticketCodes: ticketRows.map((t) => t.ticket_code),
            });

            const attachments = ticketRows.map((t, i) => ({
              filename: `ticket-${t.ticket_code}.png`,
              content: t.qr_code_data_url.split(",")[1] ?? "",
              content_id: `ticket-qr-${i}`,
            }));

            const subject = ticketCount > 1
              ? `Your ${ticketCount} tickets for ${eventTitle} 🎟️`
              : `Your ticket for ${eventTitle} 🎟️`;

            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "NoCTRL <noreply@noctrlcy.com>",
                to: [booking.email],
                subject,
                html,
                attachments,
              }),
            });

            if (!emailRes.ok) {
              const errText = await emailRes.text();
              console.error("Resend send failed", emailRes.status, errText);
            } else {
              console.log("Confirmation email sent to", booking.email);
            }
          } catch (mailErr) {
            console.error("Email send error", mailErr);
          }
        } else {
          console.warn("RESEND_API_KEY not set; skipping confirmation email");
        }
      }
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const ticketCode = session.metadata?.ticket_code;
      if (ticketCode) {
        await supabase
          .from("bookings")
          .update({ payment_status: "cancelled" })
          .eq("ticket_code", ticketCode);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook handler error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
