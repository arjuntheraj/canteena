-- Migration to add Coupon Settlements

-- 1. Create settlements table
CREATE TABLE IF NOT EXISTS public.settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    coupon_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'settled' CHECK (status IN ('pending', 'settled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add settlement tracking to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_settled BOOLEAN DEFAULT false;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES public.settlements(id) ON DELETE SET NULL;

-- 3. Enable RLS on settlements
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- 4. Create policy allowing all operations for anon (for development)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'settlements' AND policyname = 'Allow all for anon on settlements'
    ) THEN
        CREATE POLICY "Allow all for anon on settlements" ON public.settlements FOR ALL TO anon USING (true);
    END IF;
END $$;
