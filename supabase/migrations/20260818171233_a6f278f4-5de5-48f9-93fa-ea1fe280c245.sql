-- Sendloop manages the sending infrastructure. Customers may never choose or
-- submit a sending provider: the provider columns are assigned server-side.
CREATE OR REPLACE FUNCTION public.enforce_managed_sending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only customer (Data API) writes are constrained; server-side/admin code
  -- runs as service_role and assigns the managed provider itself.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Mailboxes must be connected through Sendloop; direct inserts are not allowed';
  END IF;

  NEW.provider := OLD.provider;
  NEW.provider_id := OLD.provider_id;
  NEW.connection_method := OLD.connection_method;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_managed_sending() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sending_accounts_managed_provider ON public.sending_accounts;
CREATE TRIGGER sending_accounts_managed_provider
BEFORE INSERT OR UPDATE ON public.sending_accounts
FOR EACH ROW EXECUTE FUNCTION public.enforce_managed_sending();

-- Existing mailboxes keep working; they are simply relabelled as managed.
UPDATE public.sending_accounts SET connection_method = 'managed' WHERE connection_method IS DISTINCT FROM 'managed';