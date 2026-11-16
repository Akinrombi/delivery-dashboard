ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS accepting_orders boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.vendor_set_accepting_orders(p_accepting boolean)
RETURNS public.vendors LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE result public.vendors;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in.'; END IF;
 UPDATE public.vendors SET accepting_orders=p_accepting WHERE owner_id=auth.uid() RETURNING * INTO result;
 IF result.id IS NULL THEN RAISE EXCEPTION 'Vendor profile not found.'; END IF;
 RETURN result;
END;$function$;
REVOKE ALL ON FUNCTION public.vendor_set_accepting_orders(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vendor_set_accepting_orders(boolean) TO authenticated;