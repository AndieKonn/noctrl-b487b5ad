
-- 1) Harden ensure_admin_role: only trusted email may bootstrap admin
CREATE OR REPLACE FUNCTION public.ensure_admin_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_email text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  IF v_email IS DISTINCT FROM 'noctrlcy@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized to bootstrap admin role';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;

-- 2) Restrict pr_codes SELECT to admins only; add a safe lookup function
DROP POLICY IF EXISTS "Anyone can view active PR codes" ON public.pr_codes;

CREATE POLICY "Admins can view PR codes"
ON public.pr_codes
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Validation function callable by anon/authenticated to verify a single code
CREATE OR REPLACE FUNCTION public.validate_pr_code(_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT code
  FROM public.pr_codes
  WHERE code = upper(_code)
    AND is_active = true
  LIMIT 1
$function$;

GRANT EXECUTE ON FUNCTION public.validate_pr_code(text) TO anon, authenticated;
