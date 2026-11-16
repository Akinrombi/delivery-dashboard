CREATE OR REPLACE FUNCTION public.vendor_replace_menu_item_options(p_menu_item_id uuid,p_options jsonb)
RETURNS SETOF public.menu_item_options
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE actor uuid:=auth.uid(); option_row jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'You must be signed in.'; END IF;
 IF jsonb_typeof(p_options)<>'array' OR jsonb_array_length(p_options)>30 THEN RAISE EXCEPTION 'Add up to 30 menu options.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.menu_items mi JOIN public.vendors v ON v.id=mi.vendor_id WHERE mi.id=p_menu_item_id AND v.owner_id=actor) THEN RAISE EXCEPTION 'Menu item not found or not owned by you.'; END IF;
 FOR option_row IN SELECT * FROM jsonb_array_elements(p_options) LOOP
  IF length(trim(coalesce(option_row->>'option_group','')))=0 OR length(trim(coalesce(option_row->>'option_name','')))=0 OR length(option_row->>'option_group')>60 OR length(option_row->>'option_name')>100 OR coalesce((option_row->>'price_delta')::numeric,-1)<0 THEN RAISE EXCEPTION 'Each option needs a group, name and non-negative price.'; END IF;
 END LOOP;
 DELETE FROM public.menu_item_options WHERE menu_item_id=p_menu_item_id;
 RETURN QUERY INSERT INTO public.menu_item_options(menu_item_id,option_group,option_name,price_delta,is_required,sort_order)
 SELECT p_menu_item_id,trim(item->>'option_group'),trim(item->>'option_name'),coalesce((item->>'price_delta')::numeric,0),coalesce((item->>'is_required')::boolean,false),ordinality::integer
 FROM jsonb_array_elements(p_options) WITH ORDINALITY AS rows(item,ordinality) RETURNING *;
END;$function$;
REVOKE ALL ON FUNCTION public.vendor_replace_menu_item_options(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vendor_replace_menu_item_options(uuid,jsonb) TO authenticated;