import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import {
  LogOut, Calendar, Users, Euro, Plus, Pencil, Trash2, Tag, ShieldCheck,
  ListChecks, Image as ImageIcon, Sparkles, Layers, X,
} from "lucide-react";
import StaffManager from "@/components/admin/StaffManager";
import MenuManager from "@/components/admin/MenuManager";
import { Wine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Booking = {
  id: string;
  event_id: string | null;
  tier: "standard" | "vip" | "entrance";
  tier_id: string | null;
  number_of_guests: number;
  price_eur: number;
  payment_status: "pending" | "paid" | "cancelled";
  created_at: string;
};

type Event = {
  id: string;
  title: string;
  description: string;
  poster_url: string | null;
  event_date: string | null;
  is_active: boolean;
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

type PrCode = {
  id: string;
  code: string;
  label: string | null;
  is_active: boolean;
};

type Album = {
  id: string;
  event_id: string | null;
  title: string;
  description: string;
  cover_url: string | null;
  created_at: string;
};

type Photo = {
  id: string;
  album_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
};

const PUBLIC_PHOTOS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/event-photos/`;
const photoUrl = (path: string) => `${PUBLIC_PHOTOS_BASE}${path}`;

export default function AdminPortalDashboard() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [tiers, setTiers] = useState<EventTier[]>([]);
  const [prCodes, setPrCodes] = useState<PrCode[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const load = useCallback(async () => {
    const [b, e, t, p, a] = await Promise.all([
      supabase.from("bookings").select("id, event_id, tier, tier_id, number_of_guests, price_eur, payment_status, created_at").order("created_at", { ascending: false }),
      supabase.from("events").select("id, title, description, poster_url, event_date, is_active").order("created_at", { ascending: false }),
      supabase.from("event_tiers").select("*").order("sort_order", { ascending: true }),
      supabase.from("pr_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("event_albums").select("*").order("created_at", { ascending: false }),
    ]);
    if (b.error || e.error || t.error || p.error || a.error) toast.error("Could not load data");
    setBookings((b.data ?? []) as Booking[]);
    setEvents((e.data ?? []) as Event[]);
    setTiers((t.data ?? []) as EventTier[]);
    setPrCodes((p.data ?? []) as PrCode[]);
    setAlbums((a.data ?? []) as Album[]);
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
      if (roleError || isAdminData !== true) {
        toast.error("This account is not an admin.");
        await supabase.auth.signOut();
        navigate("/admin-portal");
        return;
      }
      setAuthorized(true);
      await load();
    })();
  }, [navigate, load]);

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

  const paidBookings = bookings.filter((b) => b.payment_status === "paid");
  const totalRevenue = paidBookings.reduce((sum, b) => sum + Number(b.price_eur), 0);
  const totalGuests = paidBookings.reduce((sum, b) => sum + b.number_of_guests, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="font-display text-2xl tracking-wide">Admin Dashboard</h1>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={() => navigate("/list")}>
              <ListChecks className="mr-2 h-4 w-4" /> Guest List
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <StatCard icon={<Calendar />} label="Paid bookings" value={paidBookings.length.toString()} />
          <StatCard icon={<Users />} label="Confirmed guests" value={totalGuests.toString()} />
          <StatCard icon={<Euro />} label="Paid revenue" value={`€${totalRevenue.toFixed(2)}`} />
        </div>

        <Tabs defaultValue="events" className="w-full">
          <TabsList>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="gallery"><ImageIcon className="mr-1.5 h-3.5 w-3.5" />Gallery</TabsTrigger>
            <TabsTrigger value="menu"><Wine className="mr-1.5 h-3.5 w-3.5" />Menu</TabsTrigger>
            <TabsTrigger value="prcodes">PR Codes</TabsTrigger>
            <TabsTrigger value="staff">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Door Crew
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-4">
            <EventsManager
              events={events}
              tiers={tiers}
              bookings={paidBookings}
              loading={loading}
              onChange={load}
              onOpenList={(eventId) => navigate(`/list?event=${eventId}`)}
            />
          </TabsContent>

          <TabsContent value="gallery" className="mt-4">
            <GalleryManager albums={albums} events={events} onChange={load} />
          </TabsContent>

          <TabsContent value="menu" className="mt-4">
            <MenuManager />
          </TabsContent>

          <TabsContent value="prcodes" className="mt-4">
            <PrCodesManager codes={prCodes} onChange={load} />
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <StaffManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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

// ============= EVENTS MANAGER =============

const emptyEventForm = {
  title: "",
  description: "",
  event_date: "",
  is_active: true,
  poster_url: "" as string | null,
};

function EventsManager({
  events, tiers, bookings, loading, onChange, onOpenList,
}: {
  events: Event[];
  tiers: EventTier[];
  bookings: Booking[];
  loading: boolean;
  onChange: () => void;
  onOpenList: (eventId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [form, setForm] = useState({ ...emptyEventForm });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [tierEditor, setTierEditor] = useState<Event | null>(null);

  useEffect(() => {
    const missing = events
      .map((e) => e.poster_url)
      .filter((p): p is string => !!p && !p.startsWith("http") && !(p in previewUrls));
    if (missing.length === 0) return;
    (async () => {
      const entries: [string, string][] = [];
      for (const path of missing) {
        const { data } = await supabase.storage.from("event-posters").createSignedUrl(path, 3600);
        if (data?.signedUrl) entries.push([path, data.signedUrl]);
      }
      if (entries.length > 0) setPreviewUrls((p) => ({ ...p, ...Object.fromEntries(entries) }));
    })();
  }, [events, previewUrls]);

  const posterSrc = (val: string | null | undefined) => {
    if (!val) return "";
    if (val.startsWith("http")) return val;
    return previewUrls[val] ?? "";
  };

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
      cacheControl: "3600", upsert: false,
    });
    if (error) {
      setUploading(false);
      toast.error("Upload failed: " + error.message);
      return;
    }
    const { data: signed } = await supabase.storage.from("event-posters").createSignedUrl(path, 3600);
    setForm((f) => ({ ...f, poster_url: path }));
    setPreviewUrls((p) => ({ ...p, [path]: signed?.signedUrl ?? "" }));
    setUploading(false);
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
          is_active: form.is_active,
          poster_url: form.poster_url || null,
        })
        .eq("id", editing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Event updated");
      setOpen(false);
      onChange();
    } else {
      const { data, error } = await supabase.from("events").insert({
        title: form.title,
        description: form.description,
        event_date: form.event_date || null,
        is_active: form.is_active,
        poster_url: form.poster_url || null,
      }).select("id, title, description, poster_url, event_date, is_active").single();
      setSaving(false);
      if (error || !data) return toast.error(error?.message ?? "Failed");
      toast.success("Event created — now add ticket / reservation tiers.");
      setOpen(false);
      onChange();
      // Auto-open tier editor for the new event
      setTierEditor(data as Event);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Event deleted");
    onChange();
  };

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
            const revenue = evBookings.reduce((s, b) => s + Number(b.price_eur), 0);
            const evTiers = tiers.filter((t) => t.event_id === e.id);
            const totalRemaining = evTiers.reduce((s, t) => s + t.remaining, 0);
            const totalCapacity = evTiers.reduce((s, t) => s + t.capacity, 0);
            return (
              <div key={e.id} className="overflow-hidden rounded-xl border border-border bg-card">
                {e.poster_url ? (
                  <img src={posterSrc(e.poster_url)} alt={e.title} className="h-40 w-full object-cover" />
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
                  <div className="mt-3 text-xs">
                    <div className="text-muted-foreground">Tiers: {evTiers.length}</div>
                    <div className="text-muted-foreground">
                      Capacity: {totalRemaining}/{totalCapacity} remaining
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-border bg-background/40 p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Paid revenue</span>
                      <span className="font-semibold text-primary">€{revenue.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {count} booking{count !== 1 ? "s" : ""}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onOpenList(e.id)}>
                      <Users className="mr-1 h-3 w-3" /> Guests
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setTierEditor(e)}>
                      <Layers className="mr-1 h-3 w-3" /> Tiers
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEdit(e)}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(e.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Event create/edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Event date</Label>
              <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </div>
            <div>
              <Label>Poster image</Label>
              {form.poster_url && posterSrc(form.poster_url) && (
                <img src={posterSrc(form.poster_url)} alt="poster preview" className="mb-2 h-40 w-full rounded object-cover" />
              )}
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
                disabled={uploading}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label>Active (visible to public)</Label>
              <Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} />
            </div>
            {!editing && (
              <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                After saving, you'll be able to add ticket and reservation tiers.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tier editor */}
      {tierEditor && (
        <TierEditorDialog
          event={tierEditor}
          tiers={tiers.filter((t) => t.event_id === tierEditor.id)}
          onClose={() => setTierEditor(null)}
          onChange={onChange}
        />
      )}
    </div>
  );
}

// ============= TIER EDITOR =============

function TierEditorDialog({
  event, tiers, onClose, onChange,
}: {
  event: Event;
  tiers: EventTier[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTier, setNewTier] = useState({
    category: "reservation" as "entrance" | "reservation",
    name: "",
    description: "",
    price_eur: 0,
    perks: "",
    capacity: 0,
  });

  const handleAdd = async () => {
    if (!newTier.name.trim()) return toast.error("Tier name is required");
    if (newTier.capacity <= 0) return toast.error("Capacity must be greater than 0");
    setAdding(true);
    const sortOrder = tiers.length;
    const { error } = await supabase.from("event_tiers").insert({
      event_id: event.id,
      category: newTier.category,
      name: newTier.name.trim(),
      description: newTier.description,
      price_eur: newTier.price_eur,
      perks: newTier.perks,
      capacity: newTier.capacity,
      remaining: newTier.capacity,
      sort_order: sortOrder,
      is_active: true,
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success("Tier added");
    setNewTier({ category: "reservation", name: "", description: "", price_eur: 0, perks: "", capacity: 0 });
    onChange();
  };

  const handleUpdate = async (id: string, patch: Partial<EventTier>) => {
    const { error } = await supabase.from("event_tiers").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tier? Bookings using it will lose the link but stay in the system.")) return;
    const { error } = await supabase.from("event_tiers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tier removed");
    onChange();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tiers — {event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {tiers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No tiers yet. Add at least one entrance ticket or reservation type below.
            </div>
          ) : (
            tiers.map((t) => (
              <TierRow key={t.id} tier={t} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))
          )}
        </div>

        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Plus className="h-4 w-4" /> Add new tier
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select
                value={newTier.category}
                onValueChange={(v) => setNewTier({ ...newTier, category: v as "entrance" | "reservation" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrance">Entrance Ticket</SelectItem>
                  <SelectItem value="reservation">Reservation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tier name</Label>
              <Input
                placeholder={newTier.category === "entrance" ? "e.g. Early Bird" : "e.g. VIP Booth"}
                value={newTier.name}
                onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Price (€)</Label>
              <Input
                type="number"
                value={newTier.price_eur}
                onChange={(e) => setNewTier({ ...newTier, price_eur: Number(e.target.value) })}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {newTier.category === "entrance" ? "Per ticket" : "Per reservation (whole party)"}
              </p>
            </div>
            <div>
              <Label>Capacity</Label>
              <Input
                type="number"
                value={newTier.capacity}
                onChange={(e) => setNewTier({ ...newTier, capacity: Number(e.target.value) })}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {newTier.category === "entrance" ? "Total tickets available" : "Total reservation slots"}
              </p>
            </div>
            <div className="md:col-span-2">
              <Label>Short description</Label>
              <Input
                value={newTier.description}
                onChange={(e) => setNewTier({ ...newTier, description: e.target.value })}
                placeholder="One-line summary shown under the tier name"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Perks (one per line, or comma-separated)</Label>
              <Textarea
                rows={2}
                value={newTier.perks}
                onChange={(e) => setNewTier({ ...newTier, perks: e.target.value })}
                placeholder="Bottle service, Skip-the-line, Reserved table"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? "Adding..." : "Add tier"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TierRow({
  tier, onUpdate, onDelete,
}: {
  tier: EventTier;
  onUpdate: (id: string, patch: Partial<EventTier>) => void;
  onDelete: (id: string) => void;
}) {
  const [local, setLocal] = useState(tier);
  useEffect(() => setLocal(tier), [tier]);

  const dirty =
    local.name !== tier.name ||
    local.description !== tier.description ||
    Number(local.price_eur) !== Number(tier.price_eur) ||
    local.perks !== tier.perks ||
    local.capacity !== tier.capacity ||
    local.remaining !== tier.remaining ||
    local.is_active !== tier.is_active;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Badge variant={tier.category === "entrance" ? "default" : "secondary"}>
          {tier.category === "entrance" ? "Entrance" : "Reservation"}
        </Badge>
        <div className="flex items-center gap-2">
          <Switch
            checked={local.is_active}
            onCheckedChange={(c) => setLocal({ ...local, is_active: c })}
          />
          <span className="text-xs text-muted-foreground">Active</span>
          <Button size="sm" variant="ghost" onClick={() => onDelete(tier.id)}>
            <X className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <Label className="text-[10px] uppercase">Name</Label>
          <Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Price (€)</Label>
          <Input type="number" value={local.price_eur} onChange={(e) => setLocal({ ...local, price_eur: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Capacity</Label>
          <Input type="number" value={local.capacity} onChange={(e) => setLocal({ ...local, capacity: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Remaining</Label>
          <Input type="number" value={local.remaining} onChange={(e) => setLocal({ ...local, remaining: Number(e.target.value) })} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px] uppercase">Description</Label>
          <Input value={local.description} onChange={(e) => setLocal({ ...local, description: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-[10px] uppercase">Perks</Label>
          <Textarea rows={2} value={local.perks} onChange={(e) => setLocal({ ...local, perks: e.target.value })} />
        </div>
      </div>
      {dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setLocal(tier)}>
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onUpdate(tier.id, {
                name: local.name,
                description: local.description,
                price_eur: local.price_eur,
                perks: local.perks,
                capacity: local.capacity,
                remaining: local.remaining,
                is_active: local.is_active,
              })
            }
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ============= GALLERY MANAGER =============

function GalleryManager({
  albums, events, onChange,
}: {
  albums: Album[];
  events: Event[];
  onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newAlbum, setNewAlbum] = useState({ title: "", description: "", event_id: "" });
  const [openAlbum, setOpenAlbum] = useState<Album | null>(null);

  const handleCreate = async () => {
    if (!newAlbum.title.trim()) return toast.error("Title is required");
    setCreating(true);
    const { error } = await supabase.from("event_albums").insert({
      title: newAlbum.title.trim(),
      description: newAlbum.description,
      event_id: newAlbum.event_id || null,
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success("Album created");
    setNewAlbum({ title: "", description: "", event_id: "" });
    onChange();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this album and all its photos?")) return;
    const { error } = await supabase.from("event_albums").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Album deleted");
    onChange();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Plus className="h-4 w-4" /> New album
        </h3>
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_200px_auto]">
          <Input
            placeholder="Album title"
            value={newAlbum.title}
            onChange={(e) => setNewAlbum({ ...newAlbum, title: e.target.value })}
          />
          <Input
            placeholder="Description (optional)"
            value={newAlbum.description}
            onChange={(e) => setNewAlbum({ ...newAlbum, description: e.target.value })}
          />
          <Select
            value={newAlbum.event_id || "none"}
            onValueChange={(v) => setNewAlbum({ ...newAlbum, event_id: v === "none" ? "" : v })}
          >
            <SelectTrigger><SelectValue placeholder="Linked event (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No linked event</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={creating}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>
      </div>

      {albums.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          No albums yet. Create one above to start uploading photos.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {albums.map((a) => {
            const linkedEvent = events.find((e) => e.id === a.event_id);
            return (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg">{a.title}</h3>
                    {linkedEvent && (
                      <p className="mt-1 text-xs text-muted-foreground">For {linkedEvent.title}</p>
                    )}
                    {a.description && (
                      <p className="mt-2 text-xs text-muted-foreground">{a.description}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setOpenAlbum(a)}>
                    <ImageIcon className="mr-1 h-3 w-3" /> Manage photos
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openAlbum && (
        <AlbumPhotosDialog album={openAlbum} onClose={() => setOpenAlbum(null)} />
      )}
    </div>
  );
}

function AlbumPhotosDialog({ album, onClose }: { album: Album; onClose: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("album_photos")
      .select("*")
      .eq("album_id", album.id)
      .order("sort_order", { ascending: true });
    setPhotos((data ?? []) as Photo[]);
    setLoading(false);
  }, [album.id]);

  useEffect(() => { reload(); }, [reload]);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    const inserts: { album_id: string; storage_path: string; sort_order: number }[] = [];
    let i = photos.length;
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${album.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("event-photos").upload(path, file, {
        cacheControl: "3600", upsert: false,
      });
      if (error) {
        toast.error(`Failed: ${file.name} — ${error.message}`);
        continue;
      }
      inserts.push({ album_id: album.id, storage_path: path, sort_order: i++ });
    }
    if (inserts.length > 0) {
      const { error } = await supabase.from("album_photos").insert(inserts);
      if (error) toast.error(error.message);
      else toast.success(`Uploaded ${inserts.length} photo${inserts.length === 1 ? "" : "s"}`);
    }
    setUploading(false);
    reload();
  };

  const handleDeletePhoto = async (p: Photo) => {
    if (!confirm("Delete this photo?")) return;
    await supabase.storage.from("event-photos").remove([p.storage_path]);
    const { error } = await supabase.from("album_photos").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    toast.success("Photo deleted");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{album.title} — Photos</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <Label className="mb-2 block text-sm">Upload photos (multiple)</Label>
          <Input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
          {uploading && <p className="mt-2 text-xs text-muted-foreground">Uploading…</p>}
        </div>

        {loading ? (
          <p className="py-6 text-center text-muted-foreground">Loading…</p>
        ) : photos.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                <img src={photoUrl(p.storage_path)} alt={p.caption ?? "photo"} className="h-full w-full object-cover" loading="lazy" />
                <button
                  type="button"
                  onClick={() => handleDeletePhoto(p)}
                  className="absolute right-1 top-1 rounded-full bg-destructive/90 p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
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
    const { error } = await supabase.from("pr_codes").insert({ code: trimmed, label: label.trim() || null });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success("PR code added");
    setCode(""); setLabel("");
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
          <Input placeholder="CODE (e.g. JOHN24)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Input placeholder="Label / promoter name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
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
                    <Switch checked={c.is_active} onCheckedChange={(v) => handleToggle(c.id, v)} />
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
