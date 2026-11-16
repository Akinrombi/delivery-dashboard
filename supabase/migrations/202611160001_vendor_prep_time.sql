-- Adds a vendor-owned, validated way to update preparation time.
-- The function checks the signed-in vendor and only allows active order states.
CREATE OR REPLACE FUNCTION public.vendor_set_order_prep_time(
  p_order_id uuid,
  p_minutes integer
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_order public.orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  IF p_minutes IS NULL OR p_minutes < 5 OR p_minutes > 120 THEN
    RAISE EXCEPTION 'Preparation time must be between 5 and 120 minutes.';
  END IF;

  UPDATE public.orders AS o
     SET est_prep_mins = p_minutes,
         updated_at = now()
    FROM public.vendors AS v
   WHERE o.id = p_order_id
     AND o.vendor_id = v.id
     AND v.owner_id = auth.uid()
     AND o.status IN ('new', 'vendor_accepted')
  RETURNING o.* INTO updated_order;

  IF updated_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found, not owned by you, or no longer editable.';
  END IF;

  RETURN updated_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.vendor_set_order_prep_time(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vendor_set_order_prep_time(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.vendor_set_order_prep_time(uuid, integer) TO authenticated;
