-- =========================================================================
-- GABSTOCK - SCHÉMA DE BASE DE DONNÉES SUPABASE (MULTITENANT & SAAS)
-- =========================================================================

-- 1. Table des Établissements (Tenants)
CREATE TABLE IF NOT EXISTS establishments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('bar', 'bar-restaurant', 'boutique')),
    phone TEXT NOT NULL,
    setup_fee_paid BOOLEAN DEFAULT FALSE,
    subscription_status TEXT NOT NULL DEFAULT 'pending' CHECK (subscription_status IN ('pending', 'active', 'expired')),
    next_due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Table des Paiements SaaS (Frais d'activation 50k + Abonnements 10k)
CREATE TABLE IF NOT EXISTS saas_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('setup_fee', 'subscription_renewal')),
    reference_number TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Table des Produits / Catalogue par Établissement
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Général',
    price NUMERIC NOT NULL DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    alert_threshold INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Table des Commandes / Ventes (POS)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
    table_or_client TEXT DEFAULT 'Comptoir',
    total_amount NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'Espèces' CHECK (payment_method IN ('Espèces', 'Airtel Money', 'Moov Money')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Table des Décaissements / Retraits de Caisse
CREATE TABLE IF NOT EXISTS cash_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('Cash', 'Mobile Money')),
    responsible TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Désactivation temporaire ou configuration RLS pour le prototype
ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_withdrawals ENABLE ROW LEVEL SECURITY;

-- Politiques permissives publiques pour l'application frontend anonyme
CREATE POLICY "Public establishments" ON establishments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public payments" ON saas_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public withdrawals" ON cash_withdrawals FOR ALL USING (true) WITH CHECK (true);
