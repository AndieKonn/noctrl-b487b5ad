import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  Search,
  Loader2,
  Users,
  CheckCircle2,
  Copy,
  Trash2,
  Ticket,
  CalendarCheck,
  Euro,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type EventRow = {
  id: string;
  title: string;
  event_date: string | null;
  is_active: boolean;
  tickets_remaining: number;
  reservations_remaining: number;
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
  price_eur: number;
  pr_code: string | null;
  created_at: string;
};

type TicketRow = {
  id: string;
  booking_id: string;
  used_at: string | null;
};

type GuestEntry = {
  bookingId: string;
  ticketId: string | null;
  fullName: string;
  email: string;
  phone: string;
  tier: BookingRow["tier"];
  guests: number;
  prCode: string | null;
  createdAt: string;
  arrived: boolean;
  arrivedAt: string | null;
  ticketIndex?: number;
  ticketTotal?: number;
};

const tierLabel = (t: BookingRow["tier"]) =>
  t === "entrance" ? "Entrance" : t === "vip" ? "VIP" : "Standard";

export default function AdminList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GuestEntry | null>(null);

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
        .select("id, title, event_date, is_active, tickets_remaining, reservations_remaining")
        .order("event_date", { ascending: false, nullsFirst: false });
      const list = (data ?? []) as EventRow[];
      setEvents(list);
      const queryEventId = searchParams.get("event");
      const initial =
        (queryEventId && list.find((e) => e.id === queryEventId)?.id) ||
        list.find((e) => e.is_active)?.id ||
        list[0]?.id ||
        "";
      setSelectedEventId(initial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  // Keep URL in sync with selection
  useEffect(() => {
    if (!selectedEventId) return;
    if (searchParams.get("event") !== selectedEventId) {
      setSearchParams({ event: selectedEventId }, { replace: true });
    }
  }, [selectedEventId, searchParams, setSearchParams]);

  // Load bookings + tickets for selected event (paid only)
  const loadList = async (eventId: string) => {
    setLoading(true);
    const { data: bs } = await supabase
      .from("bookings")
      .select(
        "id, full_name, email, phone, tier, number_of_guests, payment_status, event_id, price_eur, pr_code, created_at",
      )
      .eq("event_id", eventId)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false });
    const bookingList = (bs ?? []) as BookingRow[];
    setBookings(bookingList);

    if (bookingList.length > 0) {
      const ids = bookingList.map((b) => b.id);
      const { data: ts } = await supabase
        .from("tickets")
        .select("id, booking_id, used_at")
        .in("booking_id", ids)
        .order("created_at", { ascending: true });
      setTickets((ts ?? []) as TicketRow[]);
    } else {
      setTickets([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authorized || !selectedEventId) return;
    loadList(selectedEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            prCode: b.pr_code,
            createdAt: b.created_at,
            arrived: !!t.used_at,
            arrivedAt: t.used_at,
            ticketIndex: i + 1,
            ticketTotal: tks.length,
          });
        });
      } else {
        const t = tks[0];
        entries.push({
          bookingId: b.id,
          ticketId: t?.id ?? null,
          fullName: b.full_name,
          email: b.email,
          phone: b.phone,
          tier: b.tier,
          guests: b.number_of_guests,
          prCode: b.pr_code,
          createdAt: b.created_at,
          arrived: !!t?.used_at,
          arrivedAt: t?.used_at ?? null,
        });
      }
    }
    // Alphabetical by first name
    entries.sort((a, b) => {
      const fa = a.fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      const fb = b.fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      return fa.localeCompare(fb);
    });
    return entries;
  }, [bookings, tickets]);

  const reservationsList = useMemo(
    () => guestEntries.filter((g) => g.tier === "standard" || g.tier === "vip"),
    [guestEntries],
  );
  const entranceList = useMemo(
    () => guestEntries.filter((g) => g.tier === "entrance"),
    [guestEntries],
  );

  const applySearch = (list: GuestEntry[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (g) =>
        g.fullName.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.phone.toLowerCase().includes(q),
    );
  };

  // Stats (based on paid bookings only)
  const totalReservationGuests = bookings
    .filter((b) => b.tier === "standard" || b.tier === "vip")
    .reduce((s, b) => s + b.number_of_guests, 0);
  const totalEntranceTickets = bookings
    .filter((b) => b.tier === "entrance")
    .reduce((s, b) => s + b.number_of_guests, 0);
  const totalGuests = totalReservationGuests + totalEntranceTickets;
  const totalRevenue = bookings.reduce((s, b) => s + Number(b.price_eur), 0);
  const reservationsArrived = reservationsList.filter((g) => g.arrived).length;
  const entranceArrived = entranceList.filter((g) => g.arrived).length;

  const toggleArrived = async (entry: GuestEntry) => {
    if (!entry.ticketId) {
      toast.error("No ticket linked to this booking yet.");
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

  const handleDelete = async (entry: GuestEntry) => {
    const booking = bookings.find((b) => b.id === entry.bookingId);
    if (!booking) return;

    // Delete the booking (tickets cascade or are deleted via separate call)
    // First delete tickets for this booking
    await supabase.from("tickets").delete().eq("booking_id", booking.id);
    const { error } = await supabase.from("bookings").delete().eq("id", booking.id);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }

    // Increment capacity back on the event
    const ev = events.find((e) => e.id === booking.event_id);
    if (ev) {
      const update =
        booking.tier === "entrance"
          ? { tickets_remaining: ev.tickets_remaining + booking.number_of_guests }
          : { reservations_remaining: ev.reservations_remaining + booking.number_of_guests };
      await supabase.from("events").update(update).eq("id", ev.id);
      setEvents((prev) =>
        prev.map((e) => (e.id === ev.id ? ({ ...e, ...update } as EventRow) : e)),
      );
    }

    setBookings((prev) => prev.filter((b) => b.id !== booking.id));
    setTickets((prev) => prev.filter((t) => t.booking_id !== booking.id));
    toast.success(
      booking.tier === "entrance"
        ? `Removed — ${booking.number_of_guests} entrance ticket${booking.number_of_guests === 1 ? "" : "s"} returned to availability.`
        : `Removed — ${booking.number_of_guests} reservation spot${booking.number_of_guests === 1 ? "" : "s"} returned to availability.`,
    );
  };

  const copyList = (list: GuestEntry[], kind: "reservations" | "entrance") => {
    const header =
      kind === "reservations"
        ? ["Name", "Email", "Phone", "Tier", "Guests", "PR Code", "Arrived", "Booked"].join("\t")
        : ["Name", "Email", "Phone", "Ticket #", "PR Code", "Arrived", "Booked"].join("\t");

    const rows = list.map((g) => {
      if (kind === "reservations") {
        return [
          g.fullName,
          g.email,
          g.phone,
          tierLabel(g.tier),
          g.guests,
          g.prCode ?? "",
          g.arrived ? "Yes" : "No",
          format(new Date(g.createdAt), "yyyy-MM-dd"),
        ].join("\t");
      }
      return [
        g.fullName,
        g.email,
        g.phone,
        g.ticketTotal ? `${g.ticketIndex}/${g.ticketTotal}` : "1/1",
        g.prCode ?? "",
        g.arrived ? "Yes" : "No",
        format(new Date(g.createdAt), "yyyy-MM-dd"),
      ].join("\t");
    });
    const text = [header, ...rows].join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("List copied to clipboard"),
      () => toast.error("Could not copy to clipboard"),
    );
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

        {/* Per-event stats */}
        {selectedEvent && (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={<Ticket className="h-4 w-4" />}
              label="Entrance tickets"
              value={`${totalEntranceTickets}`}
              sub={`${entranceArrived} scanned in`}
            />
            <StatTile
              icon={<CalendarCheck className="h-4 w-4" />}
              label="Reservations"
              value={`${reservationsList.length}`}
              sub={`${reservationsArrived} arrived`}
            />
            <StatTile
              icon={<Users className="h-4 w-4" />}
              label="Total guests"
              value={`${totalGuests}`}
              sub={`${totalReservationGuests} via reservations`}
            />
            <StatTile
              icon={<Euro className="h-4 w-4" />}
              label="Revenue"
              value={`€${totalRevenue.toFixed(2)}`}
              sub="Paid bookings only"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-border bg-card p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading guests…
          </div>
        ) : !selectedEvent ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
            Pick an event to see guests.
          </div>
        ) : (
          <Tabs defaultValue="reservations" className="space-y-3">
            <TabsList>
              <TabsTrigger value="reservations">
                Reservations ({reservationsList.length})
              </TabsTrigger>
              <TabsTrigger value="entrance">
                Entrance Tickets ({entranceList.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reservations" className="space-y-2">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reservationsList.length === 0}
                  onClick={() => copyList(applySearch(reservationsList), "reservations")}
                >
                  <Copy className="mr-1 h-3 w-3" /> Copy List
                </Button>
              </div>
              <GuestTable
                entries={applySearch(reservationsList)}
                kind="reservations"
                updatingId={updatingId}
                onToggle={toggleArrived}
                onDelete={(g) => setConfirmDelete(g)}
                emptyMessage={
                  search
                    ? "No reservations match your search."
                    : "No reservations for this event yet."
                }
              />
            </TabsContent>

            <TabsContent value="entrance" className="space-y-2">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={entranceList.length === 0}
                  onClick={() => copyList(applySearch(entranceList), "entrance")}
                >
                  <Copy className="mr-1 h-3 w-3" /> Copy List
                </Button>
              </div>
              <GuestTable
                entries={applySearch(entranceList)}
                kind="entrance"
                updatingId={updatingId}
                onToggle={toggleArrived}
                onDelete={(g) => setConfirmDelete(g)}
                emptyMessage={
                  search
                    ? "No entrance tickets match your search."
                    : "No entrance tickets for this event yet."
                }
              />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  This permanently deletes the booking for{" "}
                  <strong>{confirmDelete.fullName}</strong> ({confirmDelete.email}).
                  {confirmDelete.tier === "entrance"
                    ? ` ${confirmDelete.guests} entrance ticket${confirmDelete.guests === 1 ? "" : "s"} will be returned to availability.`
                    : ` ${confirmDelete.guests} reservation spot${confirmDelete.guests === 1 ? "" : "s"} will be returned to availability.`}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) handleDelete(confirmDelete);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function GuestTable({
  entries,
  kind,
  updatingId,
  onToggle,
  onDelete,
  emptyMessage,
}: {
  entries: GuestEntry[];
  kind: "reservations" | "entrance";
  updatingId: string | null;
  onToggle: (g: GuestEntry) => void;
  onDelete: (g: GuestEntry) => void;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border glass">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 text-center">Arrived</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Contact</TableHead>
            {kind === "reservations" ? (
              <>
                <TableHead>Tier</TableHead>
                <TableHead className="text-center">Guests</TableHead>
              </>
            ) : (
              <TableHead className="text-center">Ticket</TableHead>
            )}
            <TableHead className="hidden lg:table-cell">PR Code</TableHead>
            <TableHead className="hidden lg:table-cell">Booked</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((g) => {
            const disabled = !g.ticketId || updatingId === g.ticketId;
            return (
              <TableRow
                key={g.ticketId ?? g.bookingId}
                className={g.arrived ? "bg-primary/5" : ""}
              >
                <TableCell className="text-center">
                  <Checkbox
                    checked={g.arrived}
                    disabled={disabled}
                    onCheckedChange={() => onToggle(g)}
                    aria-label={`Mark ${g.fullName} as arrived`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {g.fullName}
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
                {kind === "reservations" ? (
                  <>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {tierLabel(g.tier)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{g.guests}</TableCell>
                  </>
                ) : (
                  <TableCell className="text-center">
                    {g.ticketTotal && g.ticketTotal > 1 ? (
                      <Badge variant="outline" className="text-[10px]">
                        #{g.ticketIndex}/{g.ticketTotal}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">1/1</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="hidden lg:table-cell text-sm">
                  {g.prCode ? (
                    <Badge variant="outline">{g.prCode}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                  {format(new Date(g.createdAt), "PP")}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(g)}
                    aria-label={`Remove ${g.fullName}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
