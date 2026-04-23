-- Replace the public ticket-verification policies with staff/admin-only versions
DROP POLICY IF EXISTS "Public can verify ticket by code" ON public.bookings;
DROP POLICY IF EXISTS "Public can mark paid ticket as used" ON public.bookings;

CREATE POLICY "Staff and admins can verify ticket by code"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  ticket_code IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  )
);

CREATE POLICY "Staff and admins can mark paid ticket as used"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  ticket_code IS NOT NULL
  AND payment_status = 'paid'::public.payment_status
  AND used_at IS NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  )
)
WITH CHECK (
  ticket_code IS NOT NULL
  AND payment_status = 'paid'::public.payment_status
);
