import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Wine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Category = {
  id: string;
  title: string;
  sort_order: number;
};

type Item = {
  id: string;
  category_id: string;
  name: string;
  price_eur: number;
  description: string | null;
  sort_order: number;
};

export default function MenuManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState("");
  const [newItemByCat, setNewItemByCat] = useState<Record<string, { name: string; price: string; description: string }>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: i }] = await Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").order("sort_order"),
    ]);
    setCategories((c ?? []) as Category[]);
    setItems((i ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const addCategory = async () => {
    const title = newCat.trim();
    if (!title) return;
    const { error } = await supabase.from("menu_categories").insert({
      title,
      sort_order: categories.length,
    });
    if (error) return toast.error(error.message);
    setNewCat("");
    load();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category and all its drinks?")) return;
    const { error } = await supabase.from("menu_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const updateCategory = async (id: string, title: string) => {
    const { error } = await supabase.from("menu_categories").update({ title }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  };

  const addItem = async (categoryId: string) => {
    const draft = newItemByCat[categoryId];
    if (!draft?.name?.trim()) return;
    const list = items.filter((i) => i.category_id === categoryId);
    const { error } = await supabase.from("menu_items").insert({
      category_id: categoryId,
      name: draft.name.trim(),
      price_eur: Number(draft.price) || 0,
      description: draft.description?.trim() || null,
      sort_order: list.length,
    });
    if (error) return toast.error(error.message);
    setNewItemByCat((s) => ({ ...s, [categoryId]: { name: "", price: "", description: "" } }));
    load();
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const updateItem = async (id: string, patch: Partial<Item>) => {
    const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading menu...</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Wine className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg tracking-wide">Add a category</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          E.g. Vodka, Whiskey, Cocktails. Drinks go under categories.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="Category title"
          />
          <Button onClick={addCategory}>
            <Plus className="mr-1.5 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground">No categories yet. Add one above.</p>
      )}

      {categories.map((cat) => {
        const list = items.filter((i) => i.category_id === cat.id);
        const draft = newItemByCat[cat.id] ?? { name: "", price: "", description: "" };
        return (
          <div key={cat.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Input
                defaultValue={cat.title}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== cat.title) {
                    updateCategory(cat.id, e.target.value.trim());
                  }
                }}
                className="font-display text-lg tracking-wide"
              />
              <Button variant="destructive" size="icon" onClick={() => deleteCategory(cat.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {list.map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-background/40 p-3 md:grid-cols-[1fr_120px_2fr_auto_auto]"
                >
                  <div>
                    <Label className="text-xs">Drink name</Label>
                    <Input defaultValue={it.name} onBlur={(e) => e.target.value !== it.name && updateItem(it.id, { name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Price (€)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      defaultValue={Number(it.price_eur)}
                      onBlur={(e) => Number(e.target.value) !== Number(it.price_eur) && updateItem(it.id, { price_eur: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Description (optional)</Label>
                    <Textarea
                      rows={1}
                      defaultValue={it.description ?? ""}
                      onBlur={(e) => (e.target.value || null) !== it.description && updateItem(it.id, { description: e.target.value || null })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button variant="ghost" size="icon" title="Saved on blur">
                      <Save className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex items-end">
                    <Button variant="destructive" size="icon" onClick={() => deleteItem(it.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-border p-3 md:grid-cols-[1fr_120px_2fr_auto]">
              <div>
                <Label className="text-xs">New drink name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setNewItemByCat((s) => ({ ...s, [cat.id]: { ...draft, name: e.target.value } }))}
                  placeholder="Smirnoff"
                />
              </div>
              <div>
                <Label className="text-xs">Price (€)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={draft.price}
                  onChange={(e) => setNewItemByCat((s) => ({ ...s, [cat.id]: { ...draft, price: e.target.value } }))}
                  placeholder="6"
                />
              </div>
              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Input
                  value={draft.description}
                  onChange={(e) => setNewItemByCat((s) => ({ ...s, [cat.id]: { ...draft, description: e.target.value } }))}
                  placeholder="Served with mixer"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => addItem(cat.id)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
