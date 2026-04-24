
DROP POLICY IF EXISTS "Staff and admins can mark ticket used" ON public.tickets;

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
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = tickets.booking_id
        AND b.payment_status = 'paid'::public.payment_status
    )
  );
