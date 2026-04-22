import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { ticketCode, successUrl, cancelUrl } = body ?? {};

    if (
      typeof ticketCode !== "string" ||
      ticketCode.length < 8 ||
      ticketCode.length > 64 ||
      typeof successUrl !== "string" ||
      typeof cancelUrl !== "string"
    ) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up booking server-side using the service role; never trust client price/email
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("ticket_code, email, price_eur, number_of_guests, tier, payment_status, event_id")
      .eq("ticket_code", ticketCode)
      .maybeSingle();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "Booking already paid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve canonical event title and price from the events table
    let eventTitle = "NoCTRL Event";
    let canonicalPrice = Number(booking.price_eur);
    if (booking.event_id) {
      const { data: ev } = await supabase
        .from("events")
        .select("title, price_entrance, price_standard, price_vip")
        .eq("id", booking.event_id)
        .maybeSingle();
      if (ev) {
        eventTitle = ev.title;
        canonicalPrice = booking.tier === "entrance"
          ? Number(ev.price_entrance)
          : booking.tier === "vip"
          ? Number(ev.price_vip)
          : Number(ev.price_standard);
      }
    }

    if (!Number.isFinite(canonicalPrice) || canonicalPrice <= 0) {
      return new Response(JSON.stringify({ error: "Invalid booking price" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tierName = booking.tier === "entrance"
      ? "Entrance Ticket"
      : booking.tier === "vip"
      ? "VIP Reservation"
      : "Standard Reservation";

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: booking.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: Math.round(canonicalPrice * 100),
            product_data: {
              name: `${eventTitle} — ${tierName} (${booking.number_of_guests} guests)`,
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        ticket_code: ticketCode,
        event_title: eventTitle,
        tier: booking.tier,
      },
    });

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
