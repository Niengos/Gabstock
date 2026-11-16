-- =========================================================================
-- GABSTOCK - Schéma complet PostgreSQL / Supabase (Production)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Table des établissements (Tenants)
CREATE TABLE establishments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    activity_type VARCHAR(50) CHECK (activity_type IN ('bar', 'bar-restaurant', 'boutique')) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    city VARCHAR(100) DEFAULT 'Libreville',
    setup_fee_paid BOOLEAN DEFAULT FALSE,
    subscription_status VARCHAR(20) DEFAULT 'pending' CHECK (subscription_status IN ('pending', 'active', 'expired')),
    next_due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table des preuves de paiement SaaS (50 000 FCFA & 10 000 FCFA)
CREATE TABLE saas_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    payment_type VARCHAR(30) CHECK (payment_type IN ('setup_fee', 'monthly_subscription')) NOT NULL,
    reference_number VARCHAR(150) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table des produits et stocks
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    stock_quantity INT DEFAULT 0,
    low_stock_alert INT DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table des commandes / tables
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
    table_or_client VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'mobile_money', NULL)),
    total_amount DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table des retraits de caisse
CREATE TABLE cash_withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    reason TEXT NOT NULL,
    source_type VARCHAR(20) CHECK (source_type IN ('cash', 'mobile_money')) DEFAULT 'cash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- POLITIQUES DE SÉCURITÉ (RLS) POUR LE FONCTIONNEMENT IMMÉDIAT DU SAAS
-- =========================================================================
ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Full access establishments" ON establishments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access saas_payments" ON saas_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access cash_withdrawals" ON cash_withdrawals FOR ALL USING (true) WITH CHECK (true);
