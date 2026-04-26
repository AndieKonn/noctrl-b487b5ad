-- =====================================================================
-- 1. EVENT TIERS
-- =====================================================================
CREATE TYPE public.tier_category AS ENUM ('entrance', 'reservation');

CREATE TABLE public.event_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category public.tier_category NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_eur numeric NOT NULL DEFAULT 0,
  perks text NOT NULL DEFAULT '',
  capacity integer NOT NULL DEFAULT 0,
  remaining integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_tiers_event ON public.event_tiers(event_id, sort_order);

ALTER TABLE public.event_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view event tiers"
  ON public.event_tiers FOR SELECT
  USING (true);

CREATE POLICY "Admins manage tiers insert"
  ON public.event_tiers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage tiers update"
  ON public.event_tiers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage tiers delete"
  ON public.event_tiers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_event_tiers_updated_at
  BEFORE UPDATE ON public.event_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default tiers from existing events
INSERT INTO public.event_tiers (event_id, category, name, description, price_eur, perks, capacity, remaining, sort_order)
SELECT id, 'entrance'::public.tier_category, 'Entrance Ticket', 'Get in the door and enjoy the night.',
       price_entrance, perks_entrance, ticket_limit, tickets_remaining, 0
FROM public.events;

INSERT INTO public.event_tiers (event_id, category, name, description, price_eur, perks, capacity, remaining, sort_order)
SELECT id, 'reservation'::public.tier_category, 'Standard Reservation', 'Reserved table for the full experience.',
       price_standard, perks_standard, reservation_limit, reservations_remaining, 1
FROM public.events;

INSERT INTO public.event_tiers (event_id, category, name, description, price_eur, perks, capacity, remaining, sort_order)
SELECT id, 'reservation'::public.tier_category, 'VIP Reservation', 'The full VIP treatment for you and your guests.',
       price_vip, perks_vip, reservation_limit, 0, 2
FROM public.events;

-- =====================================================================
-- 2. BOOKINGS — add tier_id link
-- =====================================================================
ALTER TABLE public.bookings
  ADD COLUMN tier_id uuid REFERENCES public.event_tiers(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_tier ON public.bookings(tier_id);

-- =====================================================================
-- 3. Updated triggers — capacity & price use event_tiers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_booking_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev public.events%ROWTYPE;
  t public.event_tiers%ROWTYPE;
BEGIN
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required for bookings';
  END IF;

  -- New path: tier_id provided
  IF NEW.tier_id IS NOT NULL THEN
    SELECT * INTO t FROM public.event_tiers WHERE id = NEW.tier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tier % does not exist', NEW.tier_id;
    END IF;

    -- For entrance tiers, charge price * number_of_guests; for reservations, flat price.
    IF t.category = 'entrance'::public.tier_category THEN
      NEW.price_eur := t.price_eur * GREATEST(1, NEW.number_of_guests);
    ELSE
      NEW.price_eur := t.price_eur;
    END IF;
  ELSE
    -- Legacy path
    SELECT * INTO ev FROM public.events WHERE id = NEW.event_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Event % does not exist', NEW.event_id;
    END IF;

    NEW.price_eur := CASE NEW.tier
      WHEN 'entrance'::public.booking_tier THEN ev.price_entrance
      WHEN 'standard'::public.booking_tier THEN ev.price_standard
      WHEN 'vip'::public.booking_tier      THEN ev.price_vip
    END;
  END IF;

  NEW.payment_status := 'pending'::public.payment_status;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_booking_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining int;
  guests int := COALESCE(NEW.number_of_guests, 1);
  t public.event_tiers%ROWTYPE;
  decrement_by int;
BEGIN
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  -- New path: tier_id provided → decrement event_tiers.remaining
  IF NEW.tier_id IS NOT NULL THEN
    SELECT * INTO t FROM public.event_tiers WHERE id = NEW.tier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tier % does not exist', NEW.tier_id;
    END IF;

    -- Reservations: 1 slot per booking regardless of party size.
    -- Entrance: one slot per ticket.
    decrement_by := CASE WHEN t.category = 'entrance'::public.tier_category THEN guests ELSE 1 END;

    UPDATE public.event_tiers
       SET remaining = remaining - decrement_by
     WHERE id = NEW.tier_id
       AND remaining >= decrement_by
    RETURNING remaining INTO remaining;

    IF remaining IS NULL THEN
      RAISE EXCEPTION 'Sold out or insufficient capacity for the requested tier';
    END IF;

    -- Mirror to legacy events counters when the tier is one of the seeded ones (best-effort)
    IF t.category = 'entrance'::public.tier_category THEN
      UPDATE public.events
         SET tickets_remaining = GREATEST(0, tickets_remaining - decrement_by)
       WHERE id = NEW.event_id;
    ELSE
      UPDATE public.events
         SET reservations_remaining = GREATEST(0, reservations_remaining - decrement_by)
       WHERE id = NEW.event_id;
    END IF;

    RETURN NEW;
  END IF;

  -- Legacy path (no tier_id)
  IF NEW.tier = 'entrance'::public.booking_tier THEN
    UPDATE public.events
       SET tickets_remaining = tickets_remaining - guests
     WHERE id = NEW.event_id
       AND tickets_remaining >= guests
    RETURNING tickets_remaining INTO remaining;
  ELSE
    -- Legacy reservation: decrement by 1 (new rule)
    UPDATE public.events
       SET reservations_remaining = reservations_remaining - 1
     WHERE id = NEW.event_id
       AND reservations_remaining >= 1
    RETURNING reservations_remaining INTO remaining;
  END IF;

  IF remaining IS NULL THEN
    RAISE EXCEPTION 'Sold out or insufficient capacity for the requested tier';
  END IF;

  RETURN NEW;
END;
$$;

-- Make sure triggers exist (re-create for safety)
DROP TRIGGER IF EXISTS trg_enforce_booking_price ON public.bookings;
CREATE TRIGGER trg_enforce_booking_price
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_price();

DROP TRIGGER IF EXISTS trg_enforce_booking_capacity ON public.bookings;
CREATE TRIGGER trg_enforce_booking_capacity
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_capacity();

-- =====================================================================
-- 4. EVENT ALBUMS + PHOTOS
-- =====================================================================
CREATE TABLE public.event_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view albums"
  ON public.event_albums FOR SELECT USING (true);

CREATE POLICY "Admins can insert albums"
  ON public.event_albums FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update albums"
  ON public.event_albums FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete albums"
  ON public.event_albums FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_event_albums_updated_at
  BEFORE UPDATE ON public.event_albums
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.album_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.event_albums(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_album_photos_album ON public.album_photos(album_id, sort_order);

ALTER TABLE public.album_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view photos"
  ON public.album_photos FOR SELECT USING (true);

CREATE POLICY "Admins can insert photos"
  ON public.album_photos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update photos"
  ON public.album_photos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete photos"
  ON public.album_photos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- 5. STORAGE BUCKET — public event photos
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view event photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-photos');

CREATE POLICY "Admins can upload event photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete event photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-photos' AND public.has_role(auth.uid(), 'admin'));
