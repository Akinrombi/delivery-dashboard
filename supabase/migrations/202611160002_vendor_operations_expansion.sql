-- Zenzora Vendor Operations expansion. Safe to apply more than once.
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS description text, ADD COLUMN IF NOT EXISTS image_url text;
CREATE TABLE IF NOT EXISTS public.vendor_action_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 action_id uuid NOT NULL, action_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT vendor_action_receipts_user_action_unique UNIQUE(user_id,action_id));
ALTER TABLE public.vendor_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_action_receipts FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.vendor_apply_offline_action(p_action_id uuid,p_action_type text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE actor uuid:=auth.uid(); existing public.vendor_action_receipts; vendor_row public.vendors; order_row public.orders; item_row public.menu_items; output jsonb; requested_status text; prep_minutes integer; stock_value boolean;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'You must be signed in.'; END IF;
 IF p_action_id IS NULL OR p_action_type NOT IN ('order_status','prep_time','stock_toggle') OR p_payload IS NULL THEN RAISE EXCEPTION 'Invalid offline action.'; END IF;
 SELECT * INTO existing FROM public.vendor_action_receipts WHERE user_id=actor AND action_id=p_action_id;
 IF FOUND THEN
  IF existing.action_type<>p_action_type OR existing.payload<>p_payload THEN RAISE EXCEPTION 'This action ID was already used for a different action.'; END IF;
  RETURN COALESCE(existing.result,jsonb_build_object('duplicate',true));
 END IF;
 SELECT * INTO vendor_row FROM public.vendors WHERE owner_id=actor LIMIT 1;
 IF vendor_row.id IS NULL THEN RAISE EXCEPTION 'Vendor profile not found.'; END IF;
 IF p_action_type='order_status' THEN
  requested_status:=p_payload->>'status';
  IF requested_status NOT IN ('vendor_accepted','cancelled','ready_for_pickup') THEN RAISE EXCEPTION 'Invalid order status.'; END IF;
  UPDATE public.orders SET status=requested_status::public.order_status_enum,updated_at=now()
   WHERE id=(p_payload->>'order_id')::uuid AND vendor_id=vendor_row.id
   AND ((status='new' AND requested_status IN ('vendor_accepted','cancelled')) OR (status='vendor_accepted' AND requested_status IN ('ready_for_pickup','cancelled')))
   RETURNING * INTO order_row;
  IF order_row.id IS NULL THEN RAISE EXCEPTION 'Order is no longer available for this action.'; END IF;
  output:=to_jsonb(order_row);
 ELSIF p_action_type='prep_time' THEN
  prep_minutes:=(p_payload->>'minutes')::integer;
  IF prep_minutes<5 OR prep_minutes>120 THEN RAISE EXCEPTION 'Preparation time must be between 5 and 120 minutes.'; END IF;
  UPDATE public.orders SET est_prep_mins=prep_minutes,updated_at=now()
   WHERE id=(p_payload->>'order_id')::uuid AND vendor_id=vendor_row.id AND status IN ('new','vendor_accepted')
   RETURNING * INTO order_row;
  IF order_row.id IS NULL THEN RAISE EXCEPTION 'Order is no longer available for this action.'; END IF;
  output:=to_jsonb(order_row);
 ELSE
  stock_value:=(p_payload->>'in_stock')::boolean;
  UPDATE public.menu_items SET in_stock=stock_value,stock_pause_until=NULL
   WHERE id=(p_payload->>'item_id')::uuid AND vendor_id=vendor_row.id RETURNING * INTO item_row;
  IF item_row.id IS NULL THEN RAISE EXCEPTION 'Menu item not found.'; END IF;
  output:=to_jsonb(item_row);
 END IF;
 INSERT INTO public.vendor_action_receipts(user_id,action_id,action_type,payload,result) VALUES(actor,p_action_id,p_action_type,p_payload,output);
 RETURN output;
END;$function$;
REVOKE ALL ON FUNCTION public.vendor_apply_offline_action(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vendor_apply_offline_action(uuid,text,jsonb) TO authenticated;
CREATE TABLE IF NOT EXISTS public.vendor_support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
 order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL, sender_type text NOT NULL CHECK(sender_type IN ('vendor','customer','support')),
 message text NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 4000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','closed')), created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.vendor_support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Vendor reads own support messages" ON public.vendor_support_messages;
CREATE POLICY "Vendor reads own support messages" ON public.vendor_support_messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.vendors v WHERE v.id=vendor_id AND v.owner_id=auth.uid()));
DROP POLICY IF EXISTS "Vendor sends own support messages" ON public.vendor_support_messages;
CREATE POLICY "Vendor sends own support messages" ON public.vendor_support_messages FOR INSERT TO authenticated WITH CHECK(sender_type='vendor' AND EXISTS(SELECT 1 FROM public.vendors v WHERE v.id=vendor_id AND v.owner_id=auth.uid()));
GRANT SELECT,INSERT ON public.vendor_support_messages TO authenticated;
CREATE TABLE IF NOT EXISTS public.vendor_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
 endpoint text NOT NULL, subscription jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(vendor_id,endpoint));
ALTER TABLE public.vendor_push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Vendor manages own push subscriptions" ON public.vendor_push_subscriptions;
CREATE POLICY "Vendor manages own push subscriptions" ON public.vendor_push_subscriptions FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.vendors v WHERE v.id=vendor_id AND v.owner_id=auth.uid())) WITH CHECK(EXISTS(SELECT 1 FROM public.vendors v WHERE v.id=vendor_id AND v.owner_id=auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_push_subscriptions TO authenticated;
CREATE TABLE IF NOT EXISTS public.menu_item_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
 option_group text NOT NULL, option_name text NOT NULL, price_delta numeric(12,2) NOT NULL DEFAULT 0 CHECK(price_delta>=0),
 is_required boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.menu_item_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Menu options are publicly readable" ON public.menu_item_options;
CREATE POLICY "Menu options are publicly readable" ON public.menu_item_options FOR SELECT TO public USING(true);
DROP POLICY IF EXISTS "Vendors manage options for own menu" ON public.menu_item_options;
CREATE POLICY "Vendors manage options for own menu" ON public.menu_item_options FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.menu_items mi JOIN public.vendors v ON v.id=mi.vendor_id WHERE mi.id=menu_item_id AND v.owner_id=auth.uid())) WITH CHECK(EXISTS(SELECT 1 FROM public.menu_items mi JOIN public.vendors v ON v.id=mi.vendor_id WHERE mi.id=menu_item_id AND v.owner_id=auth.uid()));
GRANT SELECT ON public.menu_item_options TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.menu_item_options TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('vendor-menu-images','vendor-menu-images',true,3145728,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=3145728,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
DROP POLICY IF EXISTS "Vendor menu images are public" ON storage.objects;
CREATE POLICY "Vendor menu images are public" ON storage.objects FOR SELECT TO public USING(bucket_id='vendor-menu-images');
DROP POLICY IF EXISTS "Vendors upload own menu images" ON storage.objects;
CREATE POLICY "Vendors upload own menu images" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='vendor-menu-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.vendors WHERE owner_id=auth.uid()));
DROP POLICY IF EXISTS "Vendors update own menu images" ON storage.objects;
CREATE POLICY "Vendors update own menu images" ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='vendor-menu-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.vendors WHERE owner_id=auth.uid())) WITH CHECK(bucket_id='vendor-menu-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.vendors WHERE owner_id=auth.uid()));
DROP POLICY IF EXISTS "Vendors delete own menu images" ON storage.objects;
CREATE POLICY "Vendors delete own menu images" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='vendor-menu-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.vendors WHERE owner_id=auth.uid()));
