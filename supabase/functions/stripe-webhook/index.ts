import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import QRCode from "https://esm.sh/qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

function buildEmailHtml(opts: {
  fullName: string;
  eventTitle: string;
  tier: string;
  guests: number;
  ticketCode: string;
  eventDate: string | null;
  qrDataUrl: string;
}) {
  const tierLabel = opts.tier === "entrance"
    ? "Entrance Ticket"
    : opts.tier === "vip"
    ? "VIP Reservation"
    : "Standard Reservation";
  const dateLine = opts.eventDate
    ? `<tr><td style="padding:6px 0;color:#bbbbbb;">Date</td><td style="padding:6px 0;color:#ffffff;text-align:right;font-weight:600;">${opts.eventDate}</td></tr>`
    : "";
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0a0a0a;border:1px solid #1f1f1f;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px 28px;border-bottom:2px solid #e11d2a;">
          <div style="font-size:12px;letter-spacing:4px;color:#e11d2a;font-weight:700;text-transform:uppercase;">NoCTRL</div>
          <h1 style="margin:8px 0 0 0;font-size:26px;color:#ffffff;font-weight:800;letter-spacing:-0.5px;">Payment Confirmed</h1>
        </td></tr>
        <tr><td style="padding:24px 28px 8px 28px;">
          <p style="margin:0 0 16px 0;font-size:16px;color:#ffffff;line-height:1.5;">Hey ${opts.fullName},</p>
          <p style="margin:0 0 20px 0;font-size:15px;color:#cccccc;line-height:1.6;">
            Your booking for <span style="color:#ffffff;font-weight:700;">${opts.eventTitle}</span> is confirmed.
            Show the QR code below at the door for entry.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #1f1f1f;border-radius:10px;padding:16px;margin:0 0 20px 0;">
            <tr><td style="padding:6px 0;color:#bbbbbb;">Tier</td><td style="padding:6px 0;color:#ffffff;text-align:right;font-weight:600;">${tierLabel}</td></tr>
            <tr><td style="padding:6px 0;color:#bbbbbb;">Guests</td><td style="padding:6px 0;color:#ffffff;text-align:right;font-weight:600;">${opts.guests}</td></tr>
            ${dateLine}
            <tr><td style="padding:6px 0;color:#bbbbbb;">Ticket Code</td><td style="padding:6px 0;color:#e11d2a;text-align:right;font-weight:700;font-family:monospace;">${opts.ticketCode}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:8px 28px 28px 28px;">
          <div style="background:#ffffff;display:inline-block;padding:14px;border-radius:10px;">
            <img src="cid:ticket-qr" alt="Ticket QR Code" width="220" height="220" style="display:block;width:220px;height:220px;" />
          </div>
          <p style="margin:14px 0 0 0;font-size:12px;color:#888888;">Scan at the door</p>
        </td></tr>
        <tr><td style="padding:18px 28px 28px 28px;border-top:1px solid #1f1f1f;text-align:center;">
          <p style="margin:0;font-size:12px;color:#666666;">NoCTRL Events · See you on the dancefloor</p>
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
        // Load booking + event details
        const { data: booking, error: fetchErr } = await supabase
          .from("bookings")
          .select("id, ticket_code, full_name, email, tier, number_of_guests, event_date, event_id, payment_status")
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

        // Generate QR code (encodes ticket code + verification URL)
        const origin = new URL(req.url).origin;
        const verifyUrl = `https://noctrl.lovable.app/verify?ticket=${encodeURIComponent(ticketCode)}`;
        const qrPayload = JSON.stringify({ ticket: ticketCode, verify: verifyUrl });

        const qrDataUrl: string = await QRCode.toDataURL(qrPayload, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 512,
          color: { dark: "#000000", light: "#FFFFFF" },
        });

        // Update booking: paid + store QR
        const { error: updateErr } = await supabase
          .from("bookings")
          .update({
            payment_status: "paid",
            qr_code_data_url: qrDataUrl,
          })
          .eq("ticket_code", ticketCode);

        if (updateErr) {
          console.error("Failed to update booking", updateErr);
          return new Response(
            JSON.stringify({ error: "DB update failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Send confirmation email via Resend
        if (resendKey) {
          try {
            const base64Png = qrDataUrl.split(",")[1] ?? "";
            const html = buildEmailHtml({
              fullName: booking.full_name,
              eventTitle,
              tier: booking.tier,
              guests: booking.number_of_guests,
              ticketCode,
              eventDate: booking.event_date,
              qrDataUrl,
            });

            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "NoCTRL <onboarding@resend.dev>",
                to: [booking.email],
                subject: `Your ticket for ${eventTitle} 🎟️`,
                html,
                attachments: [
                  {
                    filename: `ticket-${ticketCode}.png`,
                    content: base64Png,
                    content_id: "ticket-qr",
                  },
                ],
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
