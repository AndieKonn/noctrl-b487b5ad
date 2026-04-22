
-- EVENTS TABLE
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  poster_url text,
  event_date date,
  price_entrance numeric NOT NULL DEFAULT 10,
  price_standard numeric NOT NULL DEFAULT 100,
  price_vip numeric NOT NULL DEFAULT 250,
  ticket_limit integer NOT NULL DEFAULT 0,
  reservation_limit integer NOT NULL DEFAULT 0,
  tickets_remaining integer NOT NULL DEFAULT 0,
  reservations_remaining integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active events"
  ON public.events FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update events"
  ON public.events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete events"
  ON public.events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PR CODES TABLE
CREATE TABLE public.pr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pr_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active PR codes"
  ON public.pr_codes FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage PR codes insert"
  ON public.pr_codes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage PR codes update"
  ON public.pr_codes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage PR codes delete"
  ON public.pr_codes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- BOOKINGS UPDATES
ALTER TABLE public.bookings
  ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN pr_code text;

-- STORAGE BUCKET FOR POSTERS
INSERT INTO storage.buckets (id, name, public)
  VALUES ('event-posters', 'event-posters', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view event posters"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-posters');

CREATE POLICY "Admins can upload event posters"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-posters' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update event posters"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'event-posters' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete event posters"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-posters' AND public.has_role(auth.uid(), 'admin'));

-- SELF-HEALING ADMIN ROLE
CREATE OR REPLACE FUNCTION public.ensure_admin_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email = 'noctrlcy@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;
