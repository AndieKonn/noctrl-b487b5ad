import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Booking = {
  id: string;
  ticket_code: string;
  full_name: string;
  email: string;
  tier: "standard" | "vip" | "entrance";
  number_of_guests: number;
  event_date: string;
  event_id: string | null;
  payment_status: "pending" | "paid" | "cancelled";
  used_at: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "unpaid"; booking: Booking }
  | { kind: "valid"; booking: Booking; eventTitle: string; scannedNow: boolean }
  | { kind: "used"; booking: Booking; eventTitle: string };

const tierLabel = (tier: Booking["tier"]) =>
  tier === "entrance" ? "Entrance" : tier === "vip" ? "VIP" : "Standard";

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

export default function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ticket = params.get("ticket")?.trim() ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!ticket) {
        setState({ kind: "missing" });
        return;
      }

      // Door scanning is staff-only — bounce to staff login if not signed in
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate(`/staff/login?next=${encodeURIComponent(`/verify?ticket=${ticket}`)}`, {
          replace: true,
        });
        return;
      }

      const { data: booking, error } = await supabase
        .from("bookings")
        .select(
          "id, ticket_code, full_name, email, tier, number_of_guests, event_date, event_id, payment_status, used_at",
        )
        .eq("ticket_code", ticket)
        .maybeSingle();

      if (cancelled) return;

      if (error || !booking) {
        setState({ kind: "invalid" });
        return;
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
      if (cancelled) return;

      if (booking.payment_status !== "paid") {
        setState({ kind: "unpaid", booking });
        return;
      }

      if (booking.used_at) {
        setState({ kind: "used", booking, eventTitle });
        return;
      }

      // Mark as used — RLS enforces "only when used_at is null"
      const nowIso = new Date().toISOString();
      const { data: updated, error: updateErr } = await supabase
        .from("bookings")
        .update({ used_at: nowIso })
        .eq("ticket_code", ticket)
        .is("used_at", null)
        .select("used_at")
        .maybeSingle();

      if (cancelled) return;

      if (updateErr || !updated) {
        // Race: someone else stamped it just now — re-fetch to show the used state
        const { data: refetched } = await supabase
          .from("bookings")
          .select(
            "id, ticket_code, full_name, email, tier, number_of_guests, event_date, event_id, payment_status, used_at",
          )
          .eq("ticket_code", ticket)
          .maybeSingle();
        if (cancelled) return;
        if (refetched?.used_at) {
          setState({ kind: "used", booking: refetched, eventTitle });
        } else {
          setState({ kind: "invalid" });
        }
        return;
      }

      setState({
        kind: "valid",
        booking: { ...booking, used_at: updated.used_at },
        eventTitle,
        scannedNow: true,
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [ticket, navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-8 flex items-start sm:items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <Ticket className="h-5 w-5" />
          <span className="font-display tracking-[0.3em] text-sm uppercase">
            NoCTRL · Door
          </span>
        </div>

        {state.kind === "loading" && (
          <Card>
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Verifying ticket…</p>
            </div>
          </Card>
        )}

        {state.kind === "missing" && (
          <StatusCard
            tone="warn"
            icon={<AlertTriangle className="h-10 w-10" />}
            title="No ticket code"
            subtitle="Scan a QR code or open a link that includes a ticket parameter."
          />
        )}

        {state.kind === "invalid" && (
          <StatusCard
            tone="error"
            icon={<XCircle className="h-10 w-10" />}
            title="Invalid ticket"
            subtitle={
              ticket
                ? `We couldn't find ticket "${ticket}". Double-check the QR code.`
                : "Ticket not found."
            }
          />
        )}

        {state.kind === "unpaid" && (
          <StatusCard
            tone="error"
            icon={<XCircle className="h-10 w-10" />}
            title="Payment not completed"
            subtitle={`This ticket is marked as ${state.booking.payment_status}. Do not allow entry.`}
          >
            <DetailGrid
              rows={[
                ["Name", state.booking.full_name],
                ["Tier", tierLabel(state.booking.tier)],
                ["Guests", String(state.booking.number_of_guests)],
                ["Code", state.booking.ticket_code],
              ]}
            />
          </StatusCard>
        )}

        {state.kind === "used" && (
          <StatusCard
            tone="error"
            icon={<XCircle className="h-10 w-10" />}
            title="Already scanned"
            subtitle={`This ticket was used on ${formatDateTime(state.booking.used_at!)}.`}
          >
            <DetailGrid
              rows={[
                ["Event", state.eventTitle],
                ["Name", state.booking.full_name],
                ["Tier", tierLabel(state.booking.tier)],
                ["Guests", String(state.booking.number_of_guests)],
                ["Code", state.booking.ticket_code],
              ]}
            />
          </StatusCard>
        )}

        {state.kind === "valid" && (
          <StatusCard
            tone="success"
            icon={<CheckCircle2 className="h-10 w-10" />}
            title="Valid ticket — admit"
            subtitle={`Scanned ${formatDateTime(state.booking.used_at!)}`}
          >
            <DetailGrid
              rows={[
                ["Event", state.eventTitle],
                ["Name", state.booking.full_name],
                ["Tier", tierLabel(state.booking.tier)],
                ["Guests", String(state.booking.number_of_guests)],
                ["Code", state.booking.ticket_code],
              ]}
            />
          </StatusCard>
        )}

        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to site</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-md shadow-2xl p-6">
      {children}
    </div>
  );
}

function StatusCard({
  tone,
  icon,
  title,
  subtitle,
  children,
}: {
  tone: "success" | "error" | "warn";
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const ring =
    tone === "success"
      ? "border-primary/60 shadow-[0_0_60px_-15px_hsl(var(--primary)/0.6)]"
      : tone === "error"
      ? "border-destructive/70 shadow-[0_0_60px_-15px_hsl(var(--destructive)/0.6)]"
      : "border-yellow-500/50";
  const iconBg =
    tone === "success"
      ? "bg-primary/15 text-primary"
      : tone === "error"
      ? "bg-destructive/15 text-destructive"
      : "bg-yellow-500/15 text-yellow-500";
  const titleColor =
    tone === "success"
      ? "text-primary"
      : tone === "error"
      ? "text-destructive"
      : "text-yellow-500";

  return (
    <div
      className={`rounded-2xl border ${ring} bg-card/80 backdrop-blur-md p-6 sm:p-8`}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className={`rounded-full p-3 ${iconBg}`}>{icon}</div>
        <h1
          className={`font-display text-3xl sm:text-4xl uppercase tracking-wide ${titleColor}`}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground max-w-xs">{subtitle}</p>
        )}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="rounded-xl border border-border/40 bg-background/40 divide-y divide-border/30 overflow-hidden">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <dt className="text-xs uppercase tracking-widest text-muted-foreground">
            {label}
          </dt>
          <dd className="text-sm font-semibold text-foreground text-right break-all">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
