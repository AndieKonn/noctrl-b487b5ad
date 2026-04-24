
CREATE TABLE IF NOT EXISTS public.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verifications_email_idx
  ON public.email_verifications(email);
CREATE INDEX IF NOT EXISTS email_verifications_expires_idx
  ON public.email_verifications(expires_at);

ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

-- No client access at all. Only the service role (used by edge functions)
-- can read/write. Service role bypasses RLS, so we need no policies for it.
-- Explicitly deny everything for clients by adding no policies.
