import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, Sparkles, AlertTriangle, Ticket, Instagram } from "lucide-react";
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

type TierId = "entrance" | "standard" | "vip";

type ActiveEvent = {
  id: string;
  title: string;
  description: string;
  poster_url: string | null;
  event_date: string | null;
  price_entrance: number;
  price_standard: number;
  price_vip: number;
  perks_entrance: string;
  perks_standard: string;
  perks_vip: string;
  ticket_limit: number;
  reservation_limit: number;
  tickets_remaining: number;
  reservations_remaining: number;
};

const LOW_STOCK_PCT = 0.1;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^\+?[0-9\s().-]{7,20}$/;

const generateTicketCode = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 10).toString()).join("");
};

const splitPerks = (s: string) =>
  s
    .split(/\r?\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);

export default function Index() {
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [posterUrls, setPosterUrls] = useState<Record<string, string>>({});
  const [tier, setTier] = useState<TierId>("standard");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState("2");
  const [prCode, setPrCode] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; phone?: string; age?: string }>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<{
    code: string;
    eventTitle: string;
    tierName: string;
    fullName: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .order("event_date", { ascending: true, nullsFirst: false });
      const list = (data ?? []) as ActiveEvent[];
      setEvents(list);
      if (list.length > 0) setSelectedEventId(list[0].id);
      setLoading(false);

      // Resolve signed URLs for any poster paths (private bucket).
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

  const tiers = useMemo(() => {
    if (!event) return [];
    return [
      {
        id: "entrance" as const,
        name: "Entrance Ticket",
        price: Number(event.price_entrance),
        description: "Get in the door and enjoy the night.",
        perks: splitPerks(event.perks_entrance) ?? [],
      },
      {
        id: "standard" as const,
        name: "Standard Reservation",
        price: Number(event.price_standard),
        description: "Reserved table for the full experience.",
        perks: splitPerks(event.perks_standard) ?? [],
      },
      {
        id: "vip" as const,
        name: "VIP Reservation",
        price: Number(event.price_vip),
        description: "The full VIP treatment for you and your guests.",
        perks: splitPerks(event.perks_vip) ?? [],
      },
    ];
  }, [event]);

  const selected = tiers.find((t) => t.id === tier);

  const isEntrance = tier === "entrance";
  const lowStock = useMemo(() => {
    if (!event) return false;
    if (isEntrance) {
      return (
        event.ticket_limit > 0 &&
        event.tickets_remaining / event.ticket_limit <= LOW_STOCK_PCT
      );
    }
    return (
      event.reservation_limit > 0 &&
      event.reservations_remaining / event.reservation_limit <= LOW_STOCK_PCT
    );
  }, [event, isEntrance]);

  const soldOut = useMemo(() => {
    if (!event) return false;
    return isEntrance ? event.tickets_remaining <= 0 : event.reservations_remaining <= 0;
  }, [event, isEntrance]);

  const validate = () => {
    const next: typeof errors = {};
    if (!EMAIL_REGEX.test(email.trim())) {
      next.email = "Please enter a valid email address.";
    }
    if (!PHONE_REGEX.test(phone.trim())) {
      next.phone = "Please enter a valid phone number (digits only, optional + prefix).";
    }
    if (!ageConfirmed) {
      next.age = "You must confirm you are 17 or older.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !selected) return;
    if (soldOut) {
      toast.error("Sorry, this option is sold out.");
      return;
    }
    if (!validate()) return;
    setConfirmOpen(true);
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

    const { error } = await supabase.from("bookings").insert({
      full_name: fullName,
      phone,
      email,
      number_of_guests: isEntrance ? 1 : parseInt(guests, 10),
      event_date: event.event_date ?? new Date().toISOString().slice(0, 10),
      event_id: event.id,
      tier,
      price_eur: selected.price,
      pr_code: validatedCode,
      ticket_code: ticketCode,
      payment_status: "pending",
    });

    if (error) {
      setSubmitting(false);
      toast.error("Could not save your booking. Please try again.");
      return;
    }

    const update = isEntrance
      ? { tickets_remaining: Math.max(0, event.tickets_remaining - 1) }
      : { reservations_remaining: Math.max(0, event.reservations_remaining - 1) };
    await supabase.from("events").update(update).eq("id", event.id);
    setEvents((prev) =>
      prev.map((ev) => (ev.id === event.id ? ({ ...ev, ...update } as ActiveEvent) : ev))
    );

    const quantity = isEntrance ? 1 : parseInt(guests, 10);
    const origin = window.location.origin;

    const { data: checkout, error: fnError } = await supabase.functions.invoke(
      "create-checkout",
      {
        body: {
          ticketCode,
          successUrl: `${origin}/?payment=success&ticket=${ticketCode}`,
          cancelUrl: `${origin}/?payment=cancelled`,
        },
      }
    );

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
            <img
              src={logo}
              alt="NoCTRL logo"
              className="h-8 w-8 object-contain md:h-10 md:w-10"
            />
            <span className="font-display text-2xl tracking-widest md:text-3xl">NOCTRL</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href="mailto:noctrlcy@gmail.com"
              className="hidden sm:inline-block bg-gradient-to-r from-primary via-accent to-gold bg-clip-text font-bold text-transparent text-sm md:text-base tracking-wide hover:opacity-80 transition-opacity"
            >
              noctrlcy@gmail.com
            </a>
            <a
              href="mailto:noctrlcy@gmail.com"
              aria-label="Email NoCTRL"
              className="sm:hidden inline-flex items-center justify-center rounded-full border border-primary/40 bg-primary/10 p-2 text-primary transition-all hover:bg-primary/20"
            >
              <span className="font-bold text-xs">@</span>
            </a>
            <a
              href="https://www.instagram.com/no.ctrl_events/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NoCTRL on Instagram"
              className="group inline-flex items-center justify-center rounded-full border border-primary/40 bg-primary/10 p-2 md:p-2.5 text-primary transition-all duration-300 hover:scale-110 hover:bg-primary/20 hover:text-accent hover:shadow-[var(--shadow-glow)]"
            >
              <Instagram className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.5} />
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
                    active
                      ? "border-primary shadow-[var(--shadow-glow)]"
                      : "hover:border-primary/50"
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

      {event && (
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24" id="book">
          <div className="mb-10 text-center">
            <h2 className="font-display text-4xl tracking-wide md:text-5xl">Choose your tier</h2>
            <p className="mt-2 text-muted-foreground">
              All prices in EUR. Payment confirmation sent after booking.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {tiers.map((t) => {
              const active = tier === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={cn(
                    "group relative rounded-2xl glass p-6 text-left transition-all",
                    active
                      ? "border-primary shadow-[var(--shadow-glow)]"
                      : "hover:border-primary/50"
                  )}
                >
                  {active && (
                    <span className="absolute right-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  <h3 className="font-display text-2xl tracking-wide">{t.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">€{t.price}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{t.description}</p>
                  {t.perks.length > 0 && (
                    <ul className="mt-5 space-y-2 text-sm">
                      {t.perks.map((p) => (
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
            <p className="mt-1 text-sm text-muted-foreground">
              You selected <span className="text-foreground">{selected?.name}</span> — €
              {selected?.price}
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone number</Label>
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
                {errors.phone && (
                  <p className="mt-1 text-xs text-destructive">{errors.phone}</p>
                )}
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  placeholder="you@example.com"
                  className="mt-1.5"
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-destructive">{errors.email}</p>
                )}
              </div>
              {!isEntrance && (
                <div>
                  <Label htmlFor="guests">Number of people</Label>
                  <Input
                    id="guests"
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              )}
              <div className={isEntrance ? "md:col-span-2" : ""}>
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
                  I confirm that I am 17 years old or older.
                </Label>
                {errors.age && (
                  <p className="mt-1 text-xs text-destructive">{errors.age}</p>
                )}
              </div>
            </div>

            {(lowStock || soldOut) && (
              <div
                className={cn(
                  "mt-6 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  soldOut
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-gold/40 bg-gold/10 text-gold"
                )}
              >
                <AlertTriangle className="h-4 w-4" />
                {soldOut ? "Sold out for this option." : "Almost Sold Out!"}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={submitting || soldOut}
              className="mt-6 w-full bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
            >
              {submitting
                ? "Redirecting to payment..."
                : soldOut
                  ? "Sold out"
                  : `Book & Pay — €${selected?.price}`}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              You'll be redirected to Stripe to complete payment securely.
            </p>
          </form>
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
                  <strong className="text-foreground">{event.title}</strong> — €{selected.price}
                  {!isEntrance && ` · ${guests} guest${guests === "1" ? "" : "s"}`}
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

      <Dialog open={!!issuedTicket} onOpenChange={(o) => !o && setIssuedTicket(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" /> Your Ticket
            </DialogTitle>
            <DialogDescription>
              Save this ID. We'll use it to verify entry on the night.
            </DialogDescription>
          </DialogHeader>
          {issuedTicket && (
            <div className="space-y-4 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 to-accent/10 p-6 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {issuedTicket.eventTitle}
              </div>
              <div className="font-display text-xl tracking-wide">{issuedTicket.tierName}</div>
              <div className="text-sm text-muted-foreground">{issuedTicket.fullName}</div>
              <div className="rounded-lg border border-border bg-background/50 p-3 font-mono text-lg tracking-[0.2em]">
                {issuedTicket.code.match(/.{1,4}/g)?.join(" ")}
              </div>
              <p className="text-xs text-muted-foreground">
                Ticket ID — keep this for entry
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIssuedTicket(null)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
