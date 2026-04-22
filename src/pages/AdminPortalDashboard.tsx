import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { LogOut, Calendar, Users, Euro, Plus, Pencil, Trash2, Tag, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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

type Booking = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  number_of_guests: number;
  event_id: string | null;
  tier: "standard" | "vip" | "entrance";
  price_eur: number;
  pr_code: string | null;
  ticket_code: string | null;
  payment_status: "pending" | "paid" | "cancelled";
  created_at: string;
};

type Event = {
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
  is_active: boolean;
};

type PrCode = {
  id: string;
  code: string;
  label: string | null;
  is_active: boolean;
};

export default function AdminPortalDashboard() {
  return <Dashboard />;
}

function Dashboard() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [prCodes, setPrCodes] = useState<PrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const load = useCallback(async () => {
    const [b, e, p] = await Promise.all([
      supabase.from("bookings").select("*").order("created_at", { ascending: false }),
      supabase.from("events").select("*").order("created_at", { ascending: false }),
      supabase.from("pr_codes").select("*").order("created_at", { ascending: false }),
    ]);
    if (b.error || e.error || p.error) toast.error("Could not load data");
    setBookings((b.data ?? []) as Booking[]);
    setEvents((e.data ?? []) as Event[]);
    setPrCodes((p.data ?? []) as PrCode[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        navigate("/admin-portal");
        return;
      }
      const { data: isAdminData, error: roleError } = await supabase.rpc("has_role", {
        _user_id: sessionData.session.user.id,
        _role: "admin",
      });
      const isAdmin = isAdminData === true;
      if (roleError || !isAdmin) {
        toast.error("This account is not an admin.");
        await supabase.auth.signOut();
        navigate("/admin-portal");
        return;
      }
      setAuthorized(true);
      await load();
    })();
  }, [navigate, load]);

  const handleDeleteBooking = async (id: string) => {
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    setBookings((prev) => prev.filter((b) => b.id !== id));
    toast.success("Booking deleted");
  };

  const handleStatusChange = async (id: string, status: Booking["payment_status"]) => {
    const { error } = await supabase
      .from("bookings")
      .update({ payment_status: status })
      .eq("id", id);
    if (error) {
      toast.error("Update failed");
      return;
    }
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, payment_status: status } : b))
    );
    toast.success("Updated");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin-portal");
  };

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const totalRevenue = bookings
    .filter((b) => b.payment_status === "paid")
    .reduce((sum, b) => sum + Number(b.price_eur), 0);
  const totalGuests = bookings.reduce((sum, b) => sum + b.number_of_guests, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="font-display text-2xl tracking-wide">Admin Dashboard</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <StatCard icon={<Calendar />} label="Total bookings" value={bookings.length.toString()} />
          <StatCard icon={<Users />} label="Total guests" value={totalGuests.toString()} />
          <StatCard icon={<Euro />} label="Paid revenue" value={`€${totalRevenue.toFixed(2)}`} />
        </div>

        <Tabs defaultValue="events" className="w-full">
          <TabsList>
            <TabsTrigger value="events">Events & Guests</TabsTrigger>
            <TabsTrigger value="prcodes">PR Codes</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-4">
            <EventsManager
              events={events}
              bookings={bookings}
              loading={loading}
              onChange={load}
              onStatus={handleStatusChange}
              onDelete={handleDeleteBooking}
            />
          </TabsContent>

          <TabsContent value="prcodes" className="mt-4">
            <PrCodesManager codes={prCodes} onChange={load} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </div>
    </div>
  );
}

function BookingRows({
  list,
  onStatus,
  onDelete,
}: {
  list: Booking[];
  onStatus: (id: string, status: Booking["payment_status"]) => void;
  onDelete: (b: Booking) => void;
}) {
  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        No bookings in this category yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border glass">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Guests</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Ticket ID</TableHead>
            <TableHead>PR Code</TableHead>
            <TableHead>Booked</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.full_name}</TableCell>
              <TableCell className="text-sm">
                <div>{b.email}</div>
                <div className="text-muted-foreground">{b.phone}</div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="capitalize">
                  {b.tier}
                </Badge>
              </TableCell>
              <TableCell>{b.tier === "entrance" ? "—" : b.number_of_guests}</TableCell>
              <TableCell>€{Number(b.price_eur).toFixed(2)}</TableCell>
              <TableCell className="font-mono text-xs">
                {b.ticket_code ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-sm">
                {b.pr_code ? <Badge variant="outline">{b.pr_code}</Badge> : "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {format(new Date(b.created_at), "PP")}
              </TableCell>
              <TableCell>
                <Select
                  value={b.payment_status}
                  onValueChange={(v) => onStatus(b.id, v as Booking["payment_status"])}
                >
                  <SelectTrigger className="h-8 w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Button size="sm" variant="outline" onClick={() => onDelete(b)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function copyAttendeeList(list: Booking[]) {
  const header = [
    "Name",
    "Email",
    "Phone",
    "Tier",
    "Guests",
    "Price (EUR)",
    "Ticket ID",
    "PR Code",
    "Status",
    "Booked",
  ].join("\t");
  const rows = list.map((b) =>
    [
      b.full_name,
      b.email,
      b.phone,
      b.tier,
      b.tier === "entrance" ? 1 : b.number_of_guests,
      Number(b.price_eur).toFixed(2),
      b.ticket_code ?? "",
      b.pr_code ?? "",
      b.payment_status,
      format(new Date(b.created_at), "yyyy-MM-dd"),
    ].join("\t")
  );
  const text = [header, ...rows].join("\n");
  navigator.clipboard.writeText(text).then(
    () => toast.success("Attendee list copied to clipboard"),
    () => toast.error("Could not copy to clipboard")
  );
}

// ============= EVENTS MANAGER =============

const emptyEventForm = {
  title: "",
  description: "",
  event_date: "",
  price_entrance: 10,
  price_standard: 100,
  price_vip: 250,
  perks_entrance: "",
  perks_standard: "",
  perks_vip: "",
  ticket_limit: 100,
  reservation_limit: 20,
  tickets_remaining: 100,
  reservations_remaining: 20,
  is_active: true,
  poster_url: "" as string | null,
};

function EventsManager({
  events,
  bookings,
  loading,
  onChange,
  onStatus,
  onDelete,
}: {
  events: Event[];
  bookings: Booking[];
  loading: boolean;
  onChange: () => void;
  onStatus: (id: string, status: Booking["payment_status"]) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [form, setForm] = useState({ ...emptyEventForm });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewingEventId, setViewingEventId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Booking | null>(null);

  const viewingEvent = events.find((e) => e.id === viewingEventId) ?? null;
  const eventBookings = viewingEventId
    ? bookings.filter((b) => b.event_id === viewingEventId)
    : [];
  const reservations = eventBookings.filter((b) => b.tier === "standard" || b.tier === "vip");
  const entrance = eventBookings.filter((b) => b.tier === "entrance");

  const startCreate = () => {
    setEditing(null);
    setForm({ ...emptyEventForm });
    setOpen(true);
  };

  const startEdit = (e: Event) => {
    setEditing(e);
    setForm({
      title: e.title,
      description: e.description,
      event_date: e.event_date ?? "",
      price_entrance: Number(e.price_entrance),
      price_standard: Number(e.price_standard),
      price_vip: Number(e.price_vip),
      perks_entrance: e.perks_entrance ?? "",
      perks_standard: e.perks_standard ?? "",
      perks_vip: e.perks_vip ?? "",
      ticket_limit: e.ticket_limit,
      reservation_limit: e.reservation_limit,
      tickets_remaining: e.tickets_remaining,
      reservations_remaining: e.reservations_remaining,
      is_active: e.is_active,
      poster_url: e.poster_url,
    });
    setOpen(true);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("event-posters").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    setUploading(false);
    if (error) {
      toast.error("Upload failed: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("event-posters").getPublicUrl(path);
    setForm((f) => ({ ...f, poster_url: data.publicUrl }));
    toast.success("Poster uploaded");
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("events")
        .update({
          title: form.title,
          description: form.description,
          event_date: form.event_date || null,
          price_entrance: form.price_entrance,
          price_standard: form.price_standard,
          price_vip: form.price_vip,
          perks_entrance: form.perks_entrance,
          perks_standard: form.perks_standard,
          perks_vip: form.perks_vip,
          ticket_limit: form.ticket_limit,
          reservation_limit: form.reservation_limit,
          tickets_remaining: form.tickets_remaining,
          reservations_remaining: form.reservations_remaining,
          is_active: form.is_active,
          poster_url: form.poster_url || null,
        })
        .eq("id", editing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Event updated");
    } else {
      const { error } = await supabase.from("events").insert({
        title: form.title,
        description: form.description,
        event_date: form.event_date || null,
        price_entrance: form.price_entrance,
        price_standard: form.price_standard,
        price_vip: form.price_vip,
        perks_entrance: form.perks_entrance,
        perks_standard: form.perks_standard,
        perks_vip: form.perks_vip,
        ticket_limit: form.ticket_limit,
        reservation_limit: form.reservation_limit,
        tickets_remaining: form.ticket_limit,
        reservations_remaining: form.reservation_limit,
        is_active: form.is_active,
        poster_url: form.poster_url || null,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Event created");
    }
    setOpen(false);
    onChange();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Event deleted");
    onChange();
  };

  if (viewingEvent) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewingEventId(null)}>
            ← Back to events
          </Button>
          <h2 className="font-display text-2xl tracking-wide">{viewingEvent.title}</h2>
          <Button size="sm" variant="outline" onClick={() => startEdit(viewingEvent)}>
            <Pencil className="mr-1 h-3 w-3" /> Edit event
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs uppercase text-muted-foreground">Total guests</div>
            <div className="text-xl font-bold">{eventBookings.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs uppercase text-muted-foreground">Reservations</div>
            <div className="text-xl font-bold">{reservations.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs uppercase text-muted-foreground">Entrance</div>
            <div className="text-xl font-bold">{entrance.length}</div>
          </div>
        </div>

        <Tabs defaultValue="reservations">
          <TabsList>
            <TabsTrigger value="reservations">
              Reservations ({reservations.length})
            </TabsTrigger>
            <TabsTrigger value="entrance">Entrance Tickets ({entrance.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="reservations" className="mt-3 space-y-2">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={reservations.length === 0}
                onClick={() => copyAttendeeList(reservations)}
              >
                <Copy className="mr-1 h-3 w-3" /> Copy List
              </Button>
            </div>
            <BookingRows list={reservations} onStatus={onStatus} onDelete={setConfirmDelete} />
          </TabsContent>

          <TabsContent value="entrance" className="mt-3 space-y-2">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={entrance.length === 0}
                onClick={() => copyAttendeeList(entrance)}
              >
                <Copy className="mr-1 h-3 w-3" /> Copy List
              </Button>
            </div>
            <BookingRows list={entrance} onStatus={onStatus} onDelete={setConfirmDelete} />
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDelete &&
                  `This will permanently delete the booking for ${confirmDelete.full_name} (${confirmDelete.email}).`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmDelete) onDelete(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit dialog reused */}
        <EventFormDialog
          open={open}
          setOpen={setOpen}
          editing={editing}
          form={form}
          setForm={setForm}
          saving={saving}
          uploading={uploading}
          onUpload={handleUpload}
          onSave={handleSave}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={startCreate}>
          <Plus className="mr-2 h-4 w-4" /> New Event
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="col-span-full rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            No events yet. Create one to make the booking page live.
          </div>
        ) : (
          events.map((e) => {
            const evBookings = bookings.filter((b) => b.event_id === e.id);
            const count = evBookings.length;
            const revenue = evBookings
              .filter((b) => b.payment_status === "paid")
              .reduce((s, b) => s + Number(b.price_eur), 0);
            const pending = evBookings
              .filter((b) => b.payment_status === "pending")
              .reduce((s, b) => s + Number(b.price_eur), 0);
            return (
              <div key={e.id} className="overflow-hidden rounded-xl border border-border bg-card">
                {e.poster_url ? (
                  <img src={e.poster_url} alt={e.title} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-muted text-xs uppercase tracking-widest text-muted-foreground">
                    No poster
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-lg">{e.title}</h3>
                    {e.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Hidden</Badge>}
                  </div>
                  {e.event_date && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(new Date(e.event_date), "PPP")}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      Tickets: {e.tickets_remaining}/{e.ticket_limit}
                    </div>
                    <div>
                      Reservations: {e.reservations_remaining}/{e.reservation_limit}
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-border bg-background/40 p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Paid revenue</span>
                      <span className="font-semibold text-primary">€{revenue.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Pending</span>
                      <span>€{pending.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {count} guest{count !== 1 ? "s" : ""} booked
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setViewingEventId(e.id)}>
                      <Users className="mr-1 h-3 w-3" /> View Guests
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEdit(e)}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(e.id)}>
                      <Trash2 className="mr-1 h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <EventFormDialog
        open={open}
        setOpen={setOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        saving={saving}
        uploading={uploading}
        onUpload={handleUpload}
        onSave={handleSave}
      />
    </div>
  );
}

type EventFormState = typeof emptyEventForm;

function EventFormDialog({
  open,
  setOpen,
  editing,
  form,
  setForm,
  saving,
  uploading,
  onUpload,
  onSave,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  editing: Event | null;
  form: EventFormState;
  setForm: React.Dispatch<React.SetStateAction<EventFormState>>;
  saving: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label>Event date</Label>
            <Input
              type="date"
              value={form.event_date}
              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
            />
          </div>
          <div>
            <Label>Poster image</Label>
            {form.poster_url && (
              <img
                src={form.poster_url}
                alt="poster preview"
                className="mb-2 h-40 w-full rounded object-cover"
              />
            )}
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
              disabled={uploading}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>€ Entrance</Label>
              <Input
                type="number"
                value={form.price_entrance}
                onChange={(e) => setForm({ ...form, price_entrance: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>€ Standard</Label>
              <Input
                type="number"
                value={form.price_standard}
                onChange={(e) => setForm({ ...form, price_standard: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>€ VIP</Label>
              <Input
                type="number"
                value={form.price_vip}
                onChange={(e) => setForm({ ...form, price_vip: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">
              Perks / description per tier. Use new lines or commas to separate items
              (e.g. "Includes 1 bottle, 5 guests max").
            </p>
            <div>
              <Label>Entrance perks</Label>
              <Textarea
                rows={2}
                value={form.perks_entrance}
                onChange={(e) => setForm({ ...form, perks_entrance: e.target.value })}
                placeholder="General admission, Access to main floor"
              />
            </div>
            <div>
              <Label>Standard reservation perks</Label>
              <Textarea
                rows={2}
                value={form.perks_standard}
                onChange={(e) => setForm({ ...form, perks_standard: e.target.value })}
                placeholder="Reserved table, Priority entry, Dedicated host"
              />
            </div>
            <div>
              <Label>VIP reservation perks</Label>
              <Textarea
                rows={2}
                value={form.perks_vip}
                onChange={(e) => setForm({ ...form, perks_vip: e.target.value })}
                placeholder="Premium VIP table, Bottle service, Skip-the-line"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ticket limit</Label>
              <Input
                type="number"
                value={form.ticket_limit}
                onChange={(e) => setForm({ ...form, ticket_limit: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Reservation limit</Label>
              <Input
                type="number"
                value={form.reservation_limit}
                onChange={(e) => setForm({ ...form, reservation_limit: Number(e.target.value) })}
              />
            </div>
          </div>
          {editing && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div>
                <Label>Tickets remaining (override)</Label>
                <Input
                  type="number"
                  value={form.tickets_remaining}
                  onChange={(e) =>
                    setForm({ ...form, tickets_remaining: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Reservations remaining (override)</Label>
                <Input
                  type="number"
                  value={form.reservations_remaining}
                  onChange={(e) =>
                    setForm({ ...form, reservations_remaining: Number(e.target.value) })
                  }
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Manually adjust the live remaining counters. Useful for offline bookings.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label>Active (visible to public)</Label>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(c) => setForm({ ...form, is_active: c })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || uploading}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= PR CODES MANAGER =============

function PrCodesManager({ codes, onChange }: { codes: PrCode[]; onChange: () => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return toast.error("Enter a code");
    setAdding(true);
    const { error } = await supabase
      .from("pr_codes")
      .insert({ code: trimmed, label: label.trim() || null });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success("PR code added");
    setCode("");
    setLabel("");
    onChange();
  };

  const handleToggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("pr_codes").update({ is_active: active }).eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this PR code?")) return;
    const { error } = await supabase.from("pr_codes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Tag className="h-4 w-4" /> Add PR Code
        </h3>
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="CODE (e.g. JOHN24)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Input
            placeholder="Label / promoter name (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button onClick={handleAdd} disabled={adding}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {codes.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No PR codes yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>{c.label ?? "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={(v) => handleToggle(c.id, v)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
