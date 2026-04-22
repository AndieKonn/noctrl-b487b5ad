
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS perks_entrance text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS perks_standard text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS perks_vip text NOT NULL DEFAULT '';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ticket_code text;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_ticket_code_unique
  ON public.bookings (ticket_code)
  WHERE ticket_code IS NOT NULL;
