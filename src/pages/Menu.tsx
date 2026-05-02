import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, QrCode, Wine } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import logo from "@/assets/noctrl-logo.png";

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

export default function Menu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const menuUrl = useMemo(
    () => `${window.location.origin}/menu`,
    []
  );

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: i }] = await Promise.all([
        supabase.from("menu_categories").select("*").order("sort_order"),
        supabase.from("menu_items").select("*").order("sort_order"),
      ]);
      setCategories((c ?? []) as Category[]);
      setItems((i ?? []) as Item[]);
      setLoading(false);
    })();
  }, []);

  const openQr = async () => {
    const dataUrl = await QRCode.toDataURL(menuUrl, {
      width: 720,
      margin: 2,
      color: { dark: "#0d0d08", light: "#f5e98a" },
    });
    setQrUrl(dataUrl);
    setQrOpen(true);
  };

  const downloadQr = async () => {
    // Render a branded printable QR as a canvas
    const canvas = document.createElement("canvas");
    const W = 1200;
    const H = 1500;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    // bg
    ctx.fillStyle = "#1a1a10";
    ctx.fillRect(0, 0, W, H);
    // border
    ctx.strokeStyle = "#f5d24a";
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, W - 40, H - 40);

    ctx.fillStyle = "#f5d24a";
    ctx.font = "bold 110px 'Bebas Neue', Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NOCTRL", W / 2, 180);

    ctx.fillStyle = "#f5e98a";
    ctx.font = "60px 'Bebas Neue', Inter, sans-serif";
    ctx.fillText("DRINKS MENU", W / 2, 270);

    ctx.font = "32px Inter, sans-serif";
    ctx.fillStyle = "#cfcab0";
    ctx.fillText("Scan to view the full menu", W / 2, 330);

    // QR
    const qrDataUrl = await QRCode.toDataURL(menuUrl, {
      width: 800,
      margin: 1,
      color: { dark: "#0d0d08", light: "#f5e98a" },
    });
    const img = new Image();
    img.src = qrDataUrl;
    await new Promise<void>((r) => (img.onload = () => r()));
    const qrSize = 800;
    ctx.drawImage(img, (W - qrSize) / 2, 400, qrSize, qrSize);

    ctx.fillStyle = "#cfcab0";
    ctx.font = "28px Inter, sans-serif";
    ctx.fillText(menuUrl, W / 2, 1280);

    ctx.fillStyle = "#f5d24a";
    ctx.font = "36px 'Bebas Neue', Inter, sans-serif";
    ctx.fillText("LOSE CONTROL.", W / 2, 1400);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "noctrl-menu-qr.png";
    a.click();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        className="relative overflow-hidden border-b border-border"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      >
        <nav className="relative z-10 flex items-center justify-between gap-3 px-4 py-5 md:px-10">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="NoCTRL logo" className="h-8 w-8 object-contain md:h-10 md:w-10" />
            <span className="font-display text-2xl tracking-widest md:text-3xl">NOCTRL</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Link>
          </Button>
        </nav>
        <div className="relative z-10 mx-auto max-w-4xl px-6 pb-12 pt-4 text-center md:pb-16">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
            <Wine className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display text-5xl leading-none tracking-wide md:text-7xl">
            <span className="bg-gradient-to-r from-primary via-accent to-gold bg-clip-text text-transparent">
              Drinks Menu
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
            All prices in EUR.
          </p>
          <div className="mt-6">
            <Button onClick={openQr} variant="outline" className="gap-2">
              <QrCode className="h-4 w-4" /> Show & download QR
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {loading ? (
          <p className="text-center text-muted-foreground">Loading...</p>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <Wine className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-display text-2xl tracking-wide">Menu coming soon</h2>
            <p className="mt-2 text-sm text-muted-foreground">Check back later.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {categories.map((cat) => {
              const list = items.filter((i) => i.category_id === cat.id);
              return (
                <section key={cat.id}>
                  <div className="mb-5 flex items-center gap-4">
                    <h2 className="font-display text-3xl tracking-[0.15em] text-primary md:text-4xl">
                      {cat.title.toUpperCase()}
                    </h2>
                    <div className="h-px flex-1 bg-gradient-to-r from-primary/60 to-transparent" />
                  </div>
                  {list.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">No items yet.</p>
                  ) : (
                    <ul className="space-y-4">
                      {list.map((it) => (
                        <li
                          key={it.id}
                          className="glass rounded-xl px-4 py-3 md:px-6 md:py-4"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-display text-xl tracking-wide md:text-2xl">
                              {it.name}
                            </span>
                            <span className="font-display text-xl text-primary md:text-2xl">
                              €{Number(it.price_eur)}
                            </span>
                          </div>
                          {it.description && (
                            <p className="mt-1 text-sm text-muted-foreground">{it.description}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Menu QR Code</DialogTitle>
            <DialogDescription>
              Scan to open the menu on a phone, or download to print for the event.
            </DialogDescription>
          </DialogHeader>
          {qrUrl && (
            <div className="rounded-xl border border-primary/30 bg-background/50 p-4">
              <img src={qrUrl} alt="Menu QR Code" className="mx-auto h-64 w-64" />
              <p className="mt-3 break-all text-center text-xs text-muted-foreground">{menuUrl}</p>
            </div>
          )}
          <Button onClick={downloadQr} className="w-full gap-2">
            <Download className="h-4 w-4" /> Download printable PNG
          </Button>
          <canvas ref={canvasRef} className="hidden" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
