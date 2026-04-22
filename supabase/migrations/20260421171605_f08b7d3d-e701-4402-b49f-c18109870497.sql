-- 1. Ticket capacity enforcement
CREATE OR REPLACE FUNCTION public.enforce_booking_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining int;
  guests int := COALESCE(NEW.number_of_guests, 1);
BEGIN
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  IF NEW.tier = 'entrance'::public.booking_tier THEN
    UPDATE public.events
       SET tickets_remaining = tickets_remaining - guests
     WHERE id = NEW.event_id
       AND tickets_remaining >= guests
    RETURNING tickets_remaining INTO remaining;
  ELSE
    UPDATE public.events
       SET reservations_remaining = reservations_remaining - guests
     WHERE id = NEW.event_id
       AND reservations_remaining >= guests
    RETURNING reservations_remaining INTO remaining;
  END IF;

  IF remaining IS NULL THEN
    RAISE EXCEPTION 'Sold out or insufficient capacity for the requested tier';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_booking_capacity_trigger ON public.bookings;
CREATE TRIGGER enforce_booking_capacity_trigger
BEFORE INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_capacity();

-- 2. Lock down user_roles: only admins may insert/update/delete
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Make event-posters bucket private (admins still upload via existing policies; app should use signed URLs)
UPDATE storage.buckets SET public = false WHERE id = 'event-posters';