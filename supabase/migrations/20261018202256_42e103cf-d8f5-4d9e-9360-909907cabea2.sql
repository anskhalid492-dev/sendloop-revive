DO $$ DECLARE definition text; BEGIN SELECT pg_get_functiondef('public.process_affiliate_payment(jsonb)'::regprocedure) INTO definition;
definition:=replace(definition,'WHERE attribution_id=a.id AND purchase_kind=', 'WHERE attribution_id=a.id AND environment=_input->>''environment'' AND purchase_kind=');
EXECUTE definition; END $$;
REVOKE EXECUTE ON FUNCTION public.process_affiliate_payment(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_affiliate_payment(jsonb) TO service_role;