-- Fix RLS policy for settlements
DROP POLICY IF EXISTS "Allow all for anon on settlements" ON public.settlements;

-- Create policy allowing all operations for ALL roles (anon and authenticated)
CREATE POLICY "Allow all on settlements" ON public.settlements FOR ALL USING (true) WITH CHECK (true);

-- Also ensure orders table allows authenticated updates
DROP POLICY IF EXISTS "Allow all for anon on orders" ON public.orders;
CREATE POLICY "Allow all on orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
