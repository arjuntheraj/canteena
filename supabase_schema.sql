-- Supabase Schema for Canteena
-- Please copy and run this in the Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create menu_items table
CREATE TABLE public.menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create companies table
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    daily_coupon_limit INTEGER DEFAULT 0,
    is_eligible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create coupons table
CREATE TABLE public.coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create orders table
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'gpay', 'coupon')),
    coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create order_items table
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_time NUMERIC(10, 2) NOT NULL
);

-- Set up basic Row Level Security (RLS)
-- We will allow authenticated users to perform all operations.
-- For development/testing with the anon key, you might need to enable anon access or handle auth first.

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Create policies allowing all operations for anon (for ease of development; adjust for production)
CREATE POLICY "Allow all for anon on menu_items" ON public.menu_items FOR ALL TO anon USING (true);
CREATE POLICY "Allow all for anon on companies" ON public.companies FOR ALL TO anon USING (true);
CREATE POLICY "Allow all for anon on coupons" ON public.coupons FOR ALL TO anon USING (true);
CREATE POLICY "Allow all for anon on orders" ON public.orders FOR ALL TO anon USING (true);
CREATE POLICY "Allow all for anon on order_items" ON public.order_items FOR ALL TO anon USING (true);
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
