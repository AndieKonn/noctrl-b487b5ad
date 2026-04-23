import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type Staff = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

export default function StaffManager() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Staff | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "list" },
    });
    if (error) {
      toast.error(error.message ?? "Could not load staff");
    } else {
      setStaff(((data as { staff?: Staff[] })?.staff ?? []) as Staff[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = () => {
    setForm({ full_name: "", email: "", password: "" });
    setOpen(true);
  };

  const handleCreate = async () => {
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    const full_name = form.full_name.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "create", email, password, full_name },
    });
    setSaving(false);

    if (error) {
      const msg =
        (data as { error?: string })?.error ?? error.message ?? "Could not create staff";
      toast.error(msg);
      return;
    }
    if ((data as { error?: string })?.error) {
      toast.error((data as { error: string }).error);
      return;
    }
    toast.success("Staff account created");
    setOpen(false);
    await load();
  };

  const handleDelete = async (s: Staff) => {
    setDeletingId(s.user_id);
    const { data, error } = await supabase.functions.invoke("manage-staff", {
      body: { action: "delete", user_id: s.user_id },
    });
    setDeletingId(null);
    setConfirmDelete(null);

    if (error || (data as { error?: string })?.error) {
      toast.error(
        (data as { error?: string })?.error ?? error?.message ?? "Delete failed",
      );
      return;
    }
    toast.success("Staff account removed");
    setStaff((prev) => prev.filter((x) => x.user_id !== s.user_id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl tracking-wide flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Door Crew
          </h2>
          <p className="text-sm text-muted-foreground">
            Staff scanner accounts. They can only sign in to /staff/scan.
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="mr-2 h-4 w-4" /> New staff
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-10 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : staff.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          No staff accounts yet. Create one to start scanning at the door.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border glass">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.user_id}>
                  <TableCell className="font-medium">
                    {s.full_name || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.email ?? "—"}{" "}
                    <Badge variant="secondary" className="ml-2">
                      staff
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(s.created_at), "PP")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.last_sign_in_at
                      ? format(new Date(s.last_sign_in_at), "PP p")
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDelete(s)}
                      disabled={deletingId === s.user_id}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create staff scanner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="staff-name">Full name</Label>
              <Input
                id="staff-name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="e.g. Alex Door"
                className="mt-1.5"
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="alex@example.com"
                className="mt-1.5"
                maxLength={254}
              />
            </div>
            <div>
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="At least 8 characters"
                className="mt-1.5 font-mono"
                minLength={8}
                maxLength={72}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Share this password with the staff member directly. They cannot reset
                it themselves.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this staff account?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.email} will no longer be able to scan tickets. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              disabled={!!deletingId}
            >
              {deletingId ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
