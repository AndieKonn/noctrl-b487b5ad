
-- 1. Create tickets table (one row per individual QR / scannable entry)
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  ticket_code text NOT NULL UNIQUE,
  qr_code_data_url text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tickets_booking_id_idx ON public.tickets(booking_id);
CREATE INDEX IF NOT EXISTS tickets_ticket_code_idx ON public.tickets(ticket_code);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- RLS: staff & admins can verify by code
CREATE POLICY "Staff and admins can verify ticket by code"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  );

-- RLS: staff & admins can mark a ticket as used (only if currently unused
-- and the parent booking is paid)
CREATE POLICY "Staff and admins can mark ticket used"
  ON public.tickets FOR UPDATE
  TO authenticated
  USING (
    used_at IS NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'staff'::public.app_role)
    )
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = tickets.booking_id
        AND b.payment_status = 'paid'::public.payment_status
    )
  )
  WITH CHECK (true);

-- RLS: admins can do anything
CREATE POLICY "Admins can view all tickets"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update tickets"
  ON public.tickets FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete tickets"
  ON public.tickets FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Service role inserts via webhook; no policy needed since service role bypasses RLS.
-- But add a permissive insert policy so authenticated callers (the booking flow
-- after they create a booking) can also insert child tickets if needed.
CREATE POLICY "Anyone can create tickets for a pending booking"
  ON public.tickets FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = tickets.booking_id
        AND b.payment_status = 'pending'::public.payment_status
    )
  );

-- 2. Backfill: every existing booking with a ticket_code gets one ticket row
INSERT INTO public.tickets (booking_id, ticket_code, qr_code_data_url, used_at, created_at)
SELECT b.id, b.ticket_code, b.qr_code_data_url, b.used_at, b.created_at
FROM public.bookings b
WHERE b.ticket_code IS NOT NULL
ON CONFLICT (ticket_code) DO NOTHING;

-- 3. Make the capacity trigger handle N-guest entrance bookings correctly.
-- It already uses NEW.number_of_guests, so entrance with 5 guests will
-- decrement tickets_remaining by 5. No change needed there — confirmed.
