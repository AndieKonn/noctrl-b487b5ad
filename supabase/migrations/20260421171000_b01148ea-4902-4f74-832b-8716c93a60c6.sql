-- 1. Replace the permissive INSERT policy with one that forces payment_status = 'pending'
DROP POLICY IF EXISTS "Anyone can create a booking" ON public.bookings;

CREATE POLICY "Anyone can create a booking"
  ON public.bookings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (payment_status = 'pending'::public.payment_status);

-- 2. Server-side enforcement of price_eur based on event + tier
CREATE OR REPLACE FUNCTION public.enforce_booking_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev public.events%ROWTYPE;
BEGIN
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required for bookings';
  END IF;

  SELECT * INTO ev FROM public.events WHERE id = NEW.event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event % does not exist', NEW.event_id;
  END IF;

  NEW.price_eur := CASE NEW.tier
    WHEN 'entrance'::public.booking_tier THEN ev.price_entrance
    WHEN 'standard'::public.booking_tier THEN ev.price_standard
    WHEN 'vip'::public.booking_tier      THEN ev.price_vip
  END;

  -- Always start as pending; admins can update later
  NEW.payment_status := 'pending'::public.payment_status;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_booking_price_trigger ON public.bookings;

CREATE TRIGGER enforce_booking_price_trigger
BEFORE INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_price();