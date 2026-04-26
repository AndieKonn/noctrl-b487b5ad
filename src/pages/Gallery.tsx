import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import logo from "@/assets/noctrl-logo.png";

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

const PUBLIC_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/event-photos/`;
const photoUrl = (path: string) => `${PUBLIC_BASE}${path}`;

export default function Gallery() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photosByAlbum, setPhotosByAlbum] = useState<Record<string, Photo[]>>({});
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase
        .from("event_albums")
        .select("*")
        .order("created_at", { ascending: false });
      const albumList = (a ?? []) as Album[];
      setAlbums(albumList);

      if (albumList.length > 0) {
        const { data: p } = await supabase
          .from("album_photos")
          .select("*")
          .in("album_id", albumList.map((al) => al.id))
          .order("sort_order", { ascending: true });
        const grouped: Record<string, Photo[]> = {};
        for (const ph of (p ?? []) as Photo[]) {
          (grouped[ph.album_id] ??= []).push(ph);
        }
        setPhotosByAlbum(grouped);
      }
      setLoading(false);
    })();
  }, []);

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
          <h1 className="font-display text-5xl leading-none tracking-wide md:text-7xl">
            <span className="bg-gradient-to-r from-primary via-accent to-gold bg-clip-text text-transparent">
              Gallery
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
            Moments from past NoCTRL nights.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {loading ? (
          <p className="text-center text-muted-foreground">Loading...</p>
        ) : albums.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <ImageIcon className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-display text-2xl tracking-wide">No albums yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Photos from past events will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-16">
            {albums.map((album) => {
              const photos = photosByAlbum[album.id] ?? [];
              return (
                <section key={album.id}>
                  <div className="mb-6">
                    <h2 className="font-display text-3xl tracking-wide md:text-4xl">{album.title}</h2>
                    {album.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{album.description}</p>
                    )}
                  </div>
                  {photos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No photos in this album yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
                      {photos.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setLightbox(photoUrl(p.storage_path))}
                          className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted transition-all hover:shadow-[var(--shadow-glow)]"
                        >
                          <img
                            src={photoUrl(p.storage_path)}
                            alt={p.caption ?? album.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl border-primary/40 bg-background/95 p-2">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {lightbox && (
            <img src={lightbox} alt="Enlarged" className="h-auto max-h-[85vh] w-full rounded object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
