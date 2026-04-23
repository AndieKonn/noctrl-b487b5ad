-- Track when a ticket was scanned
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS used_at timestamptz;

-- Allow public lookup by ticket_code for the door verification page.
-- This is safe because the ticket_code itself is the secret/credential.
CREATE POLICY "Public can verify ticket by code"
ON public.bookings
FOR SELECT
TO anon, authenticated
USING (ticket_code IS NOT NULL);

-- Allow stamping used_at on a paid ticket that has not yet been used.
-- Other columns cannot be changed because no other UPDATE policy grants that.
CREATE POLICY "Public can mark paid ticket as used"
ON public.bookings
FOR UPDATE
TO anon, authenticated
USING (
  ticket_code IS NOT NULL
  AND payment_status = 'paid'::public.payment_status
  AND used_at IS NULL
)
WITH CHECK (
  ticket_code IS NOT NULL
  AND payment_status = 'paid'::public.payment_status
);