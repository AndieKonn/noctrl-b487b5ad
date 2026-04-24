import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  LogOut,
  ScanLine,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Booking = {
  id: string;
  ticket_code: string;
  full_name: string;
  tier: "standard" | "vip" | "entrance";
  number_of_guests: number;
  payment_status: "pending" | "paid" | "cancelled";
  used_at: string | null;
  event_id: string | null;
};

type ScanResult =
  | { kind: "valid"; booking: Booking; eventTitle: string; scannedAt: string }
  | { kind: "used"; booking: Booking; eventTitle: string }
  | { kind: "unpaid"; booking: Booking }
  | { kind: "invalid"; raw: string };

const SCANNER_DIV_ID = "staff-scanner-region";

const tierLabel = (t: Booking["tier"]) =>
  t === "entrance" ? "Entrance" : t === "vip" ? "VIP" : "Standard";

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

/**
 * Extract a ticket code from whatever the QR contains. Tickets may be encoded
 * either as a verification URL (?ticket=ABC123) or as a raw code string.
 */
function extractTicketCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("ticket");
    if (fromQuery) return fromQuery.trim();
  } catch {
    /* not a URL */
  }
  // Allow plain alphanumeric / dash / underscore codes
  if (/^[A-Za-z0-9_-]{4,}$/.test(trimmed)) return trimmed;
  return null;
}

export default function StaffScan() {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scannerStarted, setScannerStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const lastHandledRef = useRef<{ code: string; at: number } | null>(null);

  const handleSignOut = useCallback(async () => {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    navigate("/staff/login", { replace: true });
  }, [navigate]);

  const verifyTicket = useCallback(async (raw: string) => {
    const code = extractTicketCode(raw);
    if (!code) {
      setResult({ kind: "invalid", raw });
      return;
    }

    setProcessing(true);
    try {
      // Look up the ticket row
      const { data: tk, error: tkErr } = await supabase
        .from("tickets")
        .select("id, ticket_code, used_at, booking_id")
        .eq("ticket_code", code)
        .maybeSingle();

      if (tkErr || !tk) {
        setResult({ kind: "invalid", raw: code });
        return;
      }

      const { data: booking } = await supabase
        .from("bookings")
        .select(
          "id, ticket_code, full_name, tier, number_of_guests, payment_status, used_at, event_id",
        )
        .eq("id", tk.booking_id)
        .maybeSingle();

      if (!booking) {
        setResult({ kind: "invalid", raw: code });
        return;
      }

      // Use the ticket's code (the one actually scanned) so the result card
      // shows the right code in multi-ticket bookings.
      const bookingForResult: Booking = { ...booking, ticket_code: tk.ticket_code, used_at: tk.used_at };

      let eventTitle = "NoCTRL Event";
      if (booking.event_id) {
        const { data: ev } = await supabase
          .from("events")
          .select("title")
          .eq("id", booking.event_id)
          .maybeSingle();
        if (ev?.title) eventTitle = ev.title;
      }

      if (booking.payment_status !== "paid") {
        setResult({ kind: "unpaid", booking: bookingForResult });
        return;
      }
      if (tk.used_at) {
        setResult({ kind: "used", booking: bookingForResult, eventTitle });
        return;
      }

      const nowIso = new Date().toISOString();
      const { data: updated, error: updErr } = await supabase
        .from("tickets")
        .update({ used_at: nowIso })
        .eq("id", tk.id)
        .is("used_at", null)
        .select("used_at")
        .maybeSingle();

      if (updErr || !updated) {
        // Lost a race — re-fetch to show "already scanned"
        const { data: re } = await supabase
          .from("tickets")
          .select("id, ticket_code, used_at, booking_id")
          .eq("id", tk.id)
          .maybeSingle();
        if (re?.used_at) {
          setResult({
            kind: "used",
            booking: { ...bookingForResult, used_at: re.used_at },
            eventTitle,
          });
        } else {
          setResult({ kind: "invalid", raw: code });
        }
        return;
      }

      setResult({
        kind: "valid",
        booking: { ...bookingForResult, used_at: updated.used_at },
        eventTitle,
        scannedAt: updated.used_at ?? nowIso,
      });
    } finally {
      setProcessing(false);
    }
  }, []);

  // Camera lifecycle. Pause scanning when a result is shown; resume on "Scan next".
  useEffect(() => {
    if (result) return; // don't run scanner while showing a result

    let cancelled = false;
    setCameraError(null);
    const h5q = new Html5Qrcode(SCANNER_DIV_ID, { verbose: false });
    scannerRef.current = h5q;

    const onScanSuccess = (decoded: string) => {
      const now = Date.now();
      const last = lastHandledRef.current;
      if (last && last.code === decoded && now - last.at < 3000) return;
      lastHandledRef.current = { code: decoded, at: now };
      // Stop the camera while processing
      h5q
        .stop()
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) void verifyTicket(decoded);
        });
    };

    h5q
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        onScanSuccess,
        () => {
          /* per-frame decode failures: ignore */
        },
      )
      .then(() => {
        if (cancelled) {
          void h5q.stop().catch(() => undefined);
          return;
        }
        setScannerStarted(true);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setCameraError(msg);
        setScannerStarted(false);
      });

    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      if (inst) {
        inst
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              inst.clear();
            } catch {
              /* ignore */
            }
          });
      }
      scannerRef.current = null;
      setScannerStarted(false);
    };
  }, [result, verifyTicket]);

  const handleScanNext = () => {
    setResult(null);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 glass">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-primary">
            <ScanLine className="h-4 w-4" />
            <span className="font-display tracking-[0.25em] text-xs uppercase">
              Door Scanner
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-md px-4 py-5">
        {!result && (
          <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md overflow-hidden">
            <div
              id={SCANNER_DIV_ID}
              className="aspect-square w-full bg-black/60 [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
            />
            <div className="p-4 text-center">
              {cameraError ? (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">
                    Camera error: {cameraError}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Allow camera access in your browser, then reload this page.
                  </p>
                </div>
              ) : !scannerStarted ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting camera…
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Point the camera at the ticket QR code.
                </p>
              )}
            </div>
          </div>
        )}

        {processing && (
          <div className="mt-6 rounded-2xl border border-border/40 bg-card/80 p-6 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-2 text-sm">Verifying…</p>
          </div>
        )}

        {result && !processing && (
          <div className="mt-2 space-y-4">
            <ResultCard result={result} />
            <Button
              size="lg"
              className="w-full"
              onClick={handleScanNext}
              autoFocus
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Scan next ticket
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}

function ResultCard({ result }: { result: ScanResult }) {
  if (result.kind === "valid") {
    return (
      <Banner
        tone="success"
        icon={<CheckCircle2 className="h-12 w-12" />}
        title="Valid — Admit"
        subtitle={`Stamped ${formatTime(result.scannedAt)}`}
      >
        <DetailGrid
          rows={[
            ["Event", result.eventTitle],
            ["Name", result.booking.full_name],
            ["Tier", tierLabel(result.booking.tier)],
            [
              "Guests",
              result.booking.tier === "entrance"
                ? "1"
                : String(result.booking.number_of_guests),
            ],
            ["Code", result.booking.ticket_code],
          ]}
        />
      </Banner>
    );
  }
  if (result.kind === "used") {
    return (
      <Banner
        tone="error"
        icon={<XCircle className="h-12 w-12" />}
        title="Already Scanned"
        subtitle={
          result.booking.used_at
            ? `Used ${formatTime(result.booking.used_at)}`
            : "This ticket was already used."
        }
      >
        <DetailGrid
          rows={[
            ["Event", result.eventTitle],
            ["Name", result.booking.full_name],
            ["Tier", tierLabel(result.booking.tier)],
            ["Code", result.booking.ticket_code],
          ]}
        />
      </Banner>
    );
  }
  if (result.kind === "unpaid") {
    return (
      <Banner
        tone="error"
        icon={<XCircle className="h-12 w-12" />}
        title="Payment Not Completed"
        subtitle={`Status: ${result.booking.payment_status}. Do not admit.`}
      >
        <DetailGrid
          rows={[
            ["Name", result.booking.full_name],
            ["Tier", tierLabel(result.booking.tier)],
            ["Code", result.booking.ticket_code],
          ]}
        />
      </Banner>
    );
  }
  return (
    <Banner
      tone="warn"
      icon={<AlertTriangle className="h-12 w-12" />}
      title="Invalid Ticket"
      subtitle={`Code "${result.raw}" was not found.`}
    />
  );
}

function Banner({
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
    <div className={`rounded-2xl border ${ring} bg-card/85 backdrop-blur-md p-6`}>
      <div className="flex flex-col items-center text-center gap-3">
        <div className={`rounded-full p-3 ${iconBg}`}>{icon}</div>
        <h2
          className={`font-display text-3xl uppercase tracking-wide ${titleColor}`}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground max-w-xs">{subtitle}</p>
        )}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="rounded-xl border border-border/40 bg-background/40 divide-y divide-border/30 overflow-hidden">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 px-4 py-2.5"
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
