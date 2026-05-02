import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Check, Sparkles, AlertTriangle, Mail, Image as ImageIcon, Wine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import logo from "@/assets/noctrl-logo.png";

type ActiveEvent = {
  id: string;
  title: string;
  description: string;
  poster_url: string | null;
  event_date: string | null;
};

type EventTier = {
  id: string;
  event_id: string;
  category: "entrance" | "reservation";
  name: string;
  description: string;
  price_eur: number;
  perks: string;
  capacity: number;
  remaining: number;
  sort_order: number;
  is_active: boolean;
};

const LOW_STOCK_PCT = 0.25;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^\+?[0-9\s().-]{7,20}$/;

const generateTicketCode = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 10).toString()).join("");
};

const splitPerks = (s: string) =>
  s.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);

export default function Index() {
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [tiers, setTiers] = useState<EventTier[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [posterUrls, setPosterUrls] = useState<Record<string, string>>({});
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState("2");
  const [prCode, setPrCode] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; phone?: string; age?: string }>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifySending, setVerifySending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success") {
      setPaymentSuccessOpen(true);
      toast.success("Payment successful! Your booking is confirmed.");
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("ticket");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } else if (payment === "cancelled") {
      toast.error("Payment cancelled. You can try again anytime.");
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: evData } = await supabase
        .from("events")
        .select("id, title, description, poster_url, event_date")
        .eq("is_active", true)
        .order("event_date", { ascending: true, nullsFirst: false });
      const list = (evData ?? []) as ActiveEvent[];
      setEvents(list);
      if (list.length > 0) setSelectedEventId(list[0].id);

      if (list.length > 0) {
        const { data: tierData } = await supabase
          .from("event_tiers")
          .select("*")
          .in("event_id", list.map((e) => e.id))
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        setTiers((tierData ?? []) as EventTier[]);
      }

      setLoading(false);

      const paths = list
        .map((e) => e.poster_url)
        .filter((p): p is string => !!p && !p.startsWith("http"));
      if (paths.length > 0) {
        const entries: [string, string][] = [];
        for (const path of paths) {
          const { data: signed } = await supabase.storage
            .from("event-posters")
            .createSignedUrl(path, 3600);
          if (signed?.signedUrl) entries.push([path, signed.signedUrl]);
        }
        if (entries.length > 0) {
          setPosterUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        }
      }
    })();
  }, []);

  const posterFor = (val: string | null) => {
    if (!val) return "";
    if (val.startsWith("http")) return val;
    return posterUrls[val] ?? "";
  };

  const event = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const eventTiers = useMemo(
    () => tiers.filter((t) => t.event_id === selectedEventId),
    [tiers, selectedEventId]
  );

  // Auto-select first available tier when event changes
  useEffect(() => {
    if (!eventTiers.length) {
      setSelectedTierId(null);
      return;
    }
    const stillValid = eventTiers.find((t) => t.id === selectedTierId);
    if (!stillValid) {
      const firstAvailable = eventTiers.find((t) => t.remaining > 0) ?? eventTiers[0];
      setSelectedTierId(firstAvailable.id);
    }
  }, [eventTiers, selectedTierId]);

  const selected = eventTiers.find((t) => t.id === selectedTierId) ?? null;
  const isEntrance = selected?.category === "entrance";
  const remainingForTier = selected?.remaining ?? 0;

  // Fully sold out across the entire event (every tier exhausted)
  const eventSoldOut = useMemo(() => {
    if (!eventTiers.length) return false;
    return eventTiers.every((t) => t.remaining <= 0);
  }, [eventTiers]);

  const tierSoldOut = !!selected && selected.remaining <= 0;
  const lowStock = !!selected && selected.capacity > 0 &&
    selected.remaining / selected.capacity <= LOW_STOCK_PCT &&
    selected.remaining > 0;

  const validate = () => {
    const next: typeof errors = {};
    if (!EMAIL_REGEX.test(email.trim())) next.email = "Please enter a valid email address.";
    if (!PHONE_REGEX.test(phone.trim())) next.phone = "Please enter a valid phone number (digits only, optional + prefix).";
    if (!ageConfirmed) next.age = "You must confirm you are 17 or older.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !selected) return;
    if (tierSoldOut) {
      toast.error("Sorry, this option is sold out.");
      return;
    }
    if (isEntrance) {
      const requested = Math.max(1, parseInt(guests, 10) || 1);
      if (requested > remainingForTier) {
        toast.error(`Only ${remainingForTier} ticket${remainingForTier === 1 ? "" : "s"} left.`);
        return;
      }
    }
    if (!validate()) return;

    const cleanEmail = email.trim().toLowerCase();
    if (verifiedEmail !== cleanEmail) {
      setVerifySending(true);
      const { error: sendErr } = await supabase.functions.invoke("send-email-verification", {
        body: { email: cleanEmail },
      });
      setVerifySending(false);
      if (sendErr) {
        toast.error("Couldn't send verification email. Please try again.");
        return;
      }
      setVerifyCode("");
      setVerifyOpen(true);
      toast.success("We sent a 6-digit code to your email.");
      return;
    }

    setConfirmOpen(true);
  };

  const handleVerifyCode = async () => {
    if (!/^\d{6}$/.test(verifyCode.trim())) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    setVerifying(true);
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.functions.invoke("verify-email-code", {
      body: { email: cleanEmail, code: verifyCode.trim() },
    });
    setVerifying(false);
    const errMsg = (data as { error?: string })?.error;
    if (error || errMsg) {
      toast.error(errMsg ?? error?.message ?? "Verification failed");
      return;
    }
    setVerifiedEmail(cleanEmail);
    setVerifyOpen(false);
    toast.success("Email verified — review and confirm your booking.");
    setConfirmOpen(true);
  };

  const handleResendCode = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setVerifySending(true);
    const { error: sendErr } = await supabase.functions.invoke("send-email-verification", {
      body: { email: cleanEmail },
    });
    setVerifySending(false);
    if (sendErr) toast.error("Couldn't resend code.");
    else toast.success("New code sent.");
  };

  const handleConfirmedBooking = async () => {
    if (!event || !selected) return;
    setConfirmOpen(false);
    setSubmitting(true);

    let validatedCode: string | null = null;
    if (prCode.trim()) {
      const code = prCode.trim().toUpperCase();
      const { data: validCode } = await supabase.rpc("validate_pr_code", { _code: code });
      if (!validCode) {
        setSubmitting(false);
        toast.error("Invalid PR code. Leave blank or check the code.");
        return;
      }
      validatedCode = validCode;
    }

    const ticketCode = generateTicketCode();
    const quantity = isEntrance ? Math.max(1, parseInt(guests, 10)) : parseInt(guests, 10);

    // Map dynamic category back to legacy enum (db trigger requires NOT NULL).
    const legacyTier: "entrance" | "standard" | "vip" =
      selected.category === "entrance" ? "entrance" : "standard";

    const { error } = await supabase.from("bookings").insert({
      full_name: fullName,
      phone,
      email,
      number_of_guests: quantity,
      event_date: event.event_date ?? new Date().toISOString().slice(0, 10),
      event_id: event.id,
      tier: legacyTier,
      tier_id: selected.id,
      price_eur: selected.price_eur * (isEntrance ? quantity : 1),
      pr_code: validatedCode,
      ticket_code: ticketCode,
      payment_status: "pending",
    });

    if (error) {
      setSubmitting(false);
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("sold out") || msg.includes("insufficient capacity")) {
        toast.error(
          isEntrance
            ? "Not enough tickets left for that quantity."
            : "Not enough reservation spots left.",
        );
      } else {
        toast.error("Could not save your booking. Please try again.");
      }
      return;
    }

    // Reflect remaining decrement locally (entrance: -quantity, reservation: -1)
    const dec = isEntrance ? quantity : 1;
    setTiers((prev) =>
      prev.map((t) => (t.id === selected.id ? { ...t, remaining: Math.max(0, t.remaining - dec) } : t))
    );

    const origin = window.location.origin;
    const { data: checkout, error: fnError } = await supabase.functions.invoke("create-checkout", {
      body: {
        ticketCode,
        successUrl: `${origin}/?payment=success&ticket=${ticketCode}`,
        cancelUrl: `${origin}/?payment=cancelled`,
      },
    });

    if (fnError || !checkout?.url) {
      setSubmitting(false);
      toast.error("Could not start checkout. Please try again.");
      return;
    }

    toast.success("Redirecting to secure payment...");
    window.location.href = checkout.url;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className="relative overflow-hidden border-b border-border"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      >
        <nav className="relative z-10 flex items-center justify-between gap-3 px-4 py-5 md:px-10">
          <div className="flex items-center gap-2">
            <img src={logo} alt="NoCTRL logo" className="h-8 w-8 object-contain md:h-10 md:w-10" />
            <span className="font-display text-2xl tracking-widest md:text-3xl">NOCTRL</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/gallery"
              aria-label="Gallery"
              title="Event Gallery"
              className="group inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-primary transition-all duration-300 hover:scale-105 hover:text-accent hover:shadow-[var(--shadow-glow)]"
            >
              <ImageIcon className="h-7 w-7 md:h-9 md:w-9" strokeWidth={2.25} />
              <span className="hidden sm:inline font-display text-sm tracking-[0.2em] uppercase">Gallery</span>
            </Link>
            <a
              href="mailto:noctrlcy@gmail.com"
              aria-label="Email NoCTRL"
              title="noctrlcy@gmail.com"
              className="group inline-flex items-center justify-center rounded-xl p-1 text-primary transition-all duration-300 hover:scale-110 hover:text-accent hover:shadow-[var(--shadow-glow)]"
            >
              <Mail className="h-8 w-8 md:h-10 md:w-10" strokeWidth={2.25} />
            </a>
            <a
              href="https://www.instagram.com/no.ctrl_events/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NoCTRL on Instagram"
              className="group inline-flex items-center justify-center rounded-xl p-1 transition-all duration-300 hover:scale-110 hover:shadow-[var(--shadow-glow)]"
            >
              <Instagram className="h-8 w-8 md:h-10 md:w-10 text-primary" strokeWidth={2.25} />
            </a>
          </div>
        </nav>

        <div className="relative z-10 mx-auto max-w-4xl px-6 pb-20 pt-12 text-center md:pb-32 md:pt-16">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            {loading ? "Loading..." : events.length > 0 ? "Reservations open" : "Coming soon"}
          </span>
          <h1 className="mt-6 font-display text-6xl leading-none tracking-wide md:text-8xl">
            Lose Control.
            <br />
            <span className="bg-gradient-to-r from-primary via-accent to-gold bg-clip-text text-transparent">
              Reserve Your Night.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
            NoCTRL is the night you remember and forget at the same time.
          </p>
        </div>
      </header>

      {!loading && events.length === 0 && (
        <section className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="font-display text-4xl tracking-wide md:text-5xl">Events coming soon.</h2>
          <p className="mt-4 text-muted-foreground">
            Check back shortly to reserve your spot for the next NoCTRL night.
          </p>
        </section>
      )}

      {events.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pt-12">
          <h2 className="mb-4 font-display text-2xl tracking-wide">Pick an event</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {events.map((ev) => {
              const active = ev.id === selectedEventId;
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setSelectedEventId(ev.id)}
                  className={cn(
                    "glass rounded-xl p-4 text-left transition-all",
                    active ? "border-primary shadow-[var(--shadow-glow)]" : "hover:border-primary/50"
                  )}
                >
                  <div className="font-display text-lg tracking-wide">{ev.title}</div>
                  {ev.event_date && (
                    <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                      {format(new Date(ev.event_date), "PPP")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {event && (
            <div className="mt-8 space-y-4 text-center">
              {event.poster_url && posterFor(event.poster_url) && (
                <div className="mx-auto max-w-4xl">
                  <img
                    src={posterFor(event.poster_url)}
                    alt={event.title}
                    className="mx-auto max-h-[600px] w-full rounded-2xl object-contain shadow-[var(--shadow-glow)]"
                  />
                </div>
              )}
              <h3 className="font-display text-4xl tracking-wide md:text-5xl">{event.title}</h3>
              {event.event_date && (
                <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                  {format(new Date(event.event_date), "EEEE, MMMM d, yyyy")}
                </p>
              )}
              {event.description && (
                <p className="mx-auto max-w-2xl text-muted-foreground">{event.description}</p>
              )}
            </div>
          )}
        </section>
      )}

      {event && eventTiers.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24" id="book">
          <div className="mb-10 text-center">
            <h2 className="font-display text-4xl tracking-wide md:text-5xl">Choose your tier</h2>
            <p className="mt-2 text-muted-foreground">
              All prices in EUR. Payment confirmation sent after booking.
            </p>
          </div>

          {eventSoldOut ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
              <h3 className="mt-4 font-display text-3xl tracking-wide text-destructive">Sold Out</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This event is fully booked. Follow us on Instagram for the next drop.
              </p>
            </div>
          ) : (
            <>
              <div className={cn(
                "grid gap-5",
                eventTiers.length >= 3 ? "md:grid-cols-3" : eventTiers.length === 2 ? "md:grid-cols-2" : "md:grid-cols-1 max-w-md mx-auto"
              )}>
                {eventTiers.map((t) => {
                  const active = selectedTierId === t.id;
                  const out = t.remaining <= 0;
                  const perks = splitPerks(t.perks);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => !out && setSelectedTierId(t.id)}
                      disabled={out}
                      className={cn(
                        "group relative rounded-2xl glass p-6 text-left transition-all",
                        out && "opacity-50 cursor-not-allowed",
                        active && !out
                          ? "border-primary shadow-[0_0_40px_-5px_hsl(var(--primary)/0.7),0_0_80px_-20px_hsl(var(--primary)/0.5)] ring-2 ring-primary/60"
                          : !out && "hover:border-primary/50 hover:shadow-[0_0_25px_-10px_hsl(var(--primary)/0.4)]"
                      )}
                    >
                      {active && !out && (
                        <span className="absolute right-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                      {out && (
                        <span className="absolute right-4 top-4 rounded-full border border-destructive/50 bg-destructive/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-destructive">
                          Sold Out
                        </span>
                      )}
                      <h3 className="font-display text-2xl tracking-wide">{t.name}</h3>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {t.category === "entrance" ? "Entrance Ticket" : "Reservation"}
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-4xl font-bold">€{Number(t.price_eur)}</span>
                      </div>
                      {t.description && (
                        <p className="mt-3 text-sm text-muted-foreground">{t.description}</p>
                      )}
                      {perks.length > 0 && (
                        <ul className="mt-5 space-y-2 text-sm">
                          {perks.map((p) => (
                            <li key={p} className="flex items-start gap-2">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>

              <form
                onSubmit={handleFormSubmit}
                className="mx-auto mt-12 max-w-2xl rounded-2xl glass-strong p-6 md:p-10"
              >
                <h3 className="font-display text-3xl tracking-wide">Your details</h3>
                {selected && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    You selected <span className="text-foreground">{selected.name}</span> — €
                    {isEntrance
                      ? Number(selected.price_eur) * Math.max(1, parseInt(guests, 10) || 1)
                      : Number(selected.price_eur)}
                    {isEntrance && parseInt(guests, 10) > 1 && (
                      <span className="text-xs"> ({guests} × €{Number(selected.price_eur)})</span>
                    )}
                  </p>
                )}

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label htmlFor="fullName">Full name <span className="text-destructive">*</span></Label>
                    <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone number <span className="text-destructive">*</span></Label>
                    <Input
                      id="phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (errors.phone) setErrors({ ...errors, phone: undefined });
                      }}
                      placeholder="+357 99 123 456"
                      className="mt-1.5"
                      aria-invalid={!!errors.phone}
                    />
                    {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
                  </div>
                  <div>
                    <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (verifiedEmail && e.target.value.trim().toLowerCase() !== verifiedEmail) {
                          setVerifiedEmail(null);
                        }
                        if (errors.email) setErrors({ ...errors, email: undefined });
                      }}
                      placeholder="you@example.com"
                      className="mt-1.5"
                      aria-invalid={!!errors.email}
                    />
                    {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <div>
                    <Label htmlFor="guests">
                      {isEntrance ? "Number of tickets" : "Number of people"}{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="guests"
                      type="number"
                      min={1}
                      max={isEntrance ? Math.max(1, remainingForTier || 50) : 50}
                      required
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                      className="mt-1.5"
                    />
                    {isEntrance ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        You'll receive one QR code per ticket. {remainingForTier} left.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        One reservation covers your whole party. {remainingForTier} spot{remainingForTier === 1 ? "" : "s"} left.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="prCode">PR Code (optional)</Label>
                    <Input
                      id="prCode"
                      value={prCode}
                      onChange={(e) => setPrCode(e.target.value.toUpperCase())}
                      placeholder="Referral code"
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-background/30 p-3">
                  <Checkbox
                    id="age"
                    checked={ageConfirmed}
                    onCheckedChange={(c) => {
                      setAgeConfirmed(!!c);
                      if (errors.age && c) setErrors({ ...errors, age: undefined });
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label htmlFor="age" className="cursor-pointer text-sm font-normal leading-snug">
                      I confirm that I am 17 years old or older.{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    {errors.age && <p className="mt-1 text-xs text-destructive">{errors.age}</p>}
                  </div>
                </div>

                {(lowStock || tierSoldOut) && (
                  <div
                    className={cn(
                      "mt-6 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      tierSoldOut
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-gold/40 bg-gold/10 text-gold"
                    )}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {tierSoldOut ? "Sold out for this option." : "Almost Sold Out!"}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting || verifySending || tierSoldOut || !selected}
                  className="mt-6 w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
                >
                  {submitting
                    ? "Redirecting to payment..."
                    : verifySending
                      ? "Sending verification email..."
                      : tierSoldOut
                        ? "Sold out"
                        : verifiedEmail === email.trim().toLowerCase()
                          ? `Book & Pay — €${selected ? (isEntrance ? Number(selected.price_eur) * Math.max(1, parseInt(guests, 10) || 1) : Number(selected.price_eur)) : 0}`
                          : "Verify email & continue"}
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  {verifiedEmail === email.trim().toLowerCase()
                    ? "You'll be redirected to Stripe to complete payment securely."
                    : "We'll send a 6-digit code to your email to confirm it before payment."}
                </p>
              </form>
            </>
          )}
        </section>
      )}

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} NoCTRL. All rights reserved.
      </footer>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to proceed with this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected && event && (
                <>
                  <strong className="text-foreground">{selected.name}</strong> for{" "}
                  <strong className="text-foreground">{event.title}</strong> — €
                  {isEntrance
                    ? Number(selected.price_eur) * Math.max(1, parseInt(guests, 10) || 1)
                    : Number(selected.price_eur)}
                  {isEntrance
                    ? ` · ${guests} ticket${guests === "1" ? "" : "s"}`
                    : ` · ${guests} guest${guests === "1" ? "" : "s"}`}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedBooking}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> Verify your email
            </DialogTitle>
            <DialogDescription>
              We sent a 6-digit code to{" "}
              <span className="text-foreground">{email.trim().toLowerCase()}</span>. Enter it below to continue. The code expires in 10 minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="verify-code">Verification code</Label>
            <Input
              id="verify-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="text-center font-mono text-2xl tracking-[0.5em]"
            />
            <button
              type="button"
              onClick={handleResendCode}
              disabled={verifySending}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
            >
              {verifySending ? "Sending..." : "Resend code"}
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyOpen(false)} disabled={verifying}>
              Cancel
            </Button>
            <Button onClick={handleVerifyCode} disabled={verifying || verifyCode.length !== 6}>
              {verifying ? "Verifying..." : "Verify & continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentSuccessOpen} onOpenChange={setPaymentSuccessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Check className="h-6 w-6 text-primary" /> Payment Completed
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 to-accent/10 p-6 text-center">
            <div className="font-display text-xl tracking-wide">See you on the dancefloor 🎉</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You should have received an email with your QR code(s).
              <br />
              If you haven't, please give us a call.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setPaymentSuccessOpen(false)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
