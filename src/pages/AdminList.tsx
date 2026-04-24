import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Search, Loader2, Users, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EventRow = {
  id: string;
  title: string;
  event_date: string | null;
  is_active: boolean;
};

type BookingRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  tier: "standard" | "vip" | "entrance";
  number_of_guests: number;
  payment_status: "pending" | "paid" | "cancelled";
  event_id: string | null;
};

type TicketRow = {
  id: string;
  booking_id: string;
  ticket_code: string;
  used_at: string | null;
};

type GuestEntry = {
  bookingId: string;
  ticketId: string; // for entrance tickets, individual; for reservations, the single ticket
  fullName: string;
  email: string;
  phone: string;
  tier: BookingRow["tier"];
  guests: number; // for reservations: party size; for entrance: 1
  paymentStatus: BookingRow["payment_status"];
  arrived: boolean;
  arrivedAt: string | null;
  ticketIndex?: number; // for multi-ticket entrance bookings
  ticketTotal?: number;
};

const tierLabel = (t: BookingRow["tier"]) =>
  t === "entrance" ? "Entrance" : t === "vip" ? "VIP" : "Standard";

export default function AdminList() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Auth gate — admin only
  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate("/admin-portal", { replace: true });
        return;
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: sess.session.user.id,
        _role: "admin",
      });
      if (isAdmin !== true) {
        toast.error("Admins only.");
        navigate("/admin-portal", { replace: true });
        return;
      }
      setAuthorized(true);
    })();
  }, [navigate]);

  // Load events
  useEffect(() => {
    if (!authorized) return;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, event_date, is_active")
        .order("event_date", { ascending: false, nullsFirst: false });
      const list = (data ?? []) as EventRow[];
      setEvents(list);
      // default to active event, else newest
      const active = list.find((e) => e.is_active);
      setSelectedEventId(active?.id ?? list[0]?.id ?? "");
    })();
  }, [authorized]);

  // Load bookings + tickets for selected event
  useEffect(() => {
    if (!authorized || !selectedEventId) return;
    setLoading(true);
    (async () => {
      const { data: bs } = await supabase
        .from("bookings")
        .select("id, full_name, email, phone, tier, number_of_guests, payment_status, event_id")
        .eq("event_id", selectedEventId);
      const bookingList = (bs ?? []) as BookingRow[];
      setBookings(bookingList);

      if (bookingList.length > 0) {
        const ids = bookingList.map((b) => b.id);
        const { data: ts } = await supabase
          .from("tickets")
          .select("id, booking_id, ticket_code, used_at")
          .in("booking_id", ids)
          .order("created_at", { ascending: true });
        setTickets((ts ?? []) as TicketRow[]);
      } else {
        setTickets([]);
      }
      setLoading(false);
    })();
  }, [authorized, selectedEventId]);

  const guestEntries = useMemo<GuestEntry[]>(() => {
    const ticketsByBooking = new Map<string, TicketRow[]>();
    for (const t of tickets) {
      const arr = ticketsByBooking.get(t.booking_id) ?? [];
      arr.push(t);
      ticketsByBooking.set(t.booking_id, arr);
    }

    const entries: GuestEntry[] = [];
    for (const b of bookings) {
      const tks = ticketsByBooking.get(b.id) ?? [];
      if (b.tier === "entrance" && tks.length > 1) {
        // One row per individual entrance ticket
        tks.forEach((t, i) => {
          entries.push({
            bookingId: b.id,
            ticketId: t.id,
            fullName: b.full_name,
            email: b.email,
            phone: b.phone,
            tier: b.tier,
            guests: 1,
            paymentStatus: b.payment_status,
            arrived: !!t.used_at,
            arrivedAt: t.used_at,
            ticketIndex: i + 1,
            ticketTotal: tks.length,
          });
        });
      } else {
        // Reservation OR entrance with a single ticket — one row
        const t = tks[0];
        entries.push({
          bookingId: b.id,
          ticketId: t?.id ?? b.id, // fallback
          fullName: b.full_name,
          email: b.email,
          phone: b.phone,
          tier: b.tier,
          guests: b.number_of_guests,
          paymentStatus: b.payment_status,
          arrived: !!t?.used_at,
          arrivedAt: t?.used_at ?? null,
        });
      }
    }
    // Alphabetical by first name (full_name's first token)
    entries.sort((a, b) => {
      const fa = a.fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      const fb = b.fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      return fa.localeCompare(fb);
    });
    return entries;
  }, [bookings, tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guestEntries;
    return guestEntries.filter(
      (g) =>
        g.fullName.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.phone.toLowerCase().includes(q),
    );
  }, [guestEntries, search]);

  const totalArrived = guestEntries.filter((g) => g.arrived).length;
  const totalPaid = guestEntries.filter((g) => g.paymentStatus === "paid").length;

  const toggleArrived = async (entry: GuestEntry) => {
    if (entry.paymentStatus !== "paid") {
      toast.error("Booking is not paid.");
      return;
    }
    setUpdatingId(entry.ticketId);
    const newUsedAt = entry.arrived ? null : new Date().toISOString();
    const { error } = await supabase
      .from("tickets")
      .update({ used_at: newUsedAt })
      .eq("id", entry.ticketId);
    setUpdatingId(null);

    if (error) {
      toast.error("Could not update: " + error.message);
      return;
    }
    setTickets((prev) =>
      prev.map((t) => (t.id === entry.ticketId ? { ...t, used_at: newUsedAt } : t)),
    );
    toast.success(entry.arrived ? "Marked as not arrived" : "Marked as arrived");
  };

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin-portal/dashboard")}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Dashboard
            </Button>
            <h1 className="font-display text-2xl tracking-wide">Guest List</h1>
          </div>
          <div className="text-sm text-muted-foreground">
            {totalArrived} / {totalPaid} arrived
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-full sm:max-w-sm">
                <SelectValue placeholder="Pick an event" />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="flex items-center gap-2">
                      {e.title}
                      {e.is_active && (
                        <Badge variant="secondary" className="text-[10px]">
                          active
                        </Badge>
                      )}
                      {e.event_date && (
                        <span className="text-xs text-muted-foreground">
                          · {format(new Date(e.event_date), "PP")}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, or phone..."
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-border bg-card p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading guests…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
            {search
              ? "No guests match your search."
              : selectedEvent
                ? "No bookings for this event yet."
                : "Pick an event to see guests."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">Arrived</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-center">Guests</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g) => {
                  const disabled =
                    g.paymentStatus !== "paid" || updatingId === g.ticketId;
                  return (
                    <TableRow
                      key={g.ticketId}
                      className={g.arrived ? "bg-primary/5" : ""}
                    >
                      <TableCell className="text-center">
                        <Checkbox
                          checked={g.arrived}
                          disabled={disabled}
                          onCheckedChange={() => toggleArrived(g)}
                          aria-label={`Mark ${g.fullName} as arrived`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {g.fullName}
                          {g.ticketTotal && g.ticketTotal > 1 && (
                            <Badge variant="outline" className="text-[10px]">
                              #{g.ticketIndex}/{g.ticketTotal}
                            </Badge>
                          )}
                          {g.arrived && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                        {g.arrivedAt && (
                          <div className="text-[10px] text-muted-foreground">
                            arrived {format(new Date(g.arrivedAt), "p")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        <div>{g.email}</div>
                        <div className="text-muted-foreground">{g.phone}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {tierLabel(g.tier)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{g.guests}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            g.paymentStatus === "paid"
                              ? "default"
                              : g.paymentStatus === "cancelled"
                                ? "destructive"
                                : "outline"
                          }
                          className="capitalize"
                        >
                          {g.paymentStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
