-- =====================================================================
-- SCHEMA POSTGRESQL PER SUPABASE: CLIMAWELL COMMERCIAL HUB
-- Modulo: Centralizzazione Commerciale, CRM, WhatsApp, Brevo e Marketplace
-- Versione: 2.0 (Corretta con gen_random_uuid, idempotente e policy aperte per anon/authenticated)
-- =====================================================================

-- 1. AZIENDA E UTENTI
CREATE TABLE IF NOT EXISTS hub_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    business_name VARCHAR(150) NOT NULL,
    vat_number VARCHAR(30),
    fiscal_code VARCHAR(30),
    address VARCHAR(200),
    city VARCHAR(100),
    province VARCHAR(10),
    postal_code VARCHAR(10),
    email VARCHAR(100),
    phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hub_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES hub_companies(id) ON DELETE SET NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) DEFAULT 'commerciale', -- 'admin', 'commerciale', 'magazzino', 'marketing'
    plus_agent_code VARCHAR(20),            -- Riferimento agente in PLUS2000 (es. '1136', '217')
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ANAGRAFICHE CLIENTI E CONTATTI (Sincronizzate da PLUS2000 CliFor o OrderSender)
CREATE TABLE IF NOT EXISTS hub_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES hub_companies(id) ON DELETE SET NULL,
    plus_jconto INT UNIQUE,                 -- ID nativo Plus 2000
    customer_code VARCHAR(30) UNIQUE,       -- Codice conto es. '104'
    business_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(100),
    vat_number VARCHAR(30),
    fiscal_code VARCHAR(30),
    address VARCHAR(200),
    city VARCHAR(100),
    province VARCHAR(10),
    postal_code VARCHAR(10),
    email VARCHAR(100),
    phone VARCHAR(50),
    mobile_whatsapp VARCHAR(50),            -- Numero cellulare abilitato WhatsApp
    assigned_agent_code VARCHAR(20),
    payment_terms VARCHAR(100),
    credit_limit NUMERIC(12,2) DEFAULT 0,
    consent_wa VARCHAR(20) DEFAULT 'in_attesa',    -- 'opt_in', 'opt_out', 'in_attesa'
    consent_email VARCHAR(20) DEFAULT 'in_attesa', -- 'opt_in', 'opt_out', 'in_attesa'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_customers_search ON hub_customers(business_name, customer_code, city, vat_number);

-- 3. CONSENSI PRIVACY E MARKETING (GDPR Compliant)
CREATE TABLE IF NOT EXISTS hub_consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES hub_customers(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL,           -- 'whatsapp', 'email', 'marketing_generale'
    status VARCHAR(20) NOT NULL,            -- 'opt_in', 'opt_out', 'in_attesa'
    source VARCHAR(50) DEFAULT 'manuale',   -- 'web', 'agente', 'plus2000', 'modulo_privacy'
    consented_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODOTTI E GIACENZE (Sincronizzati da Articoli e ArticoliContGen)
CREATE TABLE IF NOT EXISTS hub_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES hub_companies(id) ON DELETE SET NULL,
    plus_ca_id INT UNIQUE,                  -- CaId nativo Plus 2000
    product_code VARCHAR(50) UNIQUE NOT NULL,
    brand VARCHAR(100),
    category VARCHAR(100),
    sector VARCHAR(100),
    macro_family VARCHAR(100),
    family VARCHAR(100),
    class_code VARCHAR(100),
    group_code VARCHAR(100),
    discount_family VARCHAR(50),
    max_discount NUMERIC(5,2) DEFAULT 60.00,
    description TEXT NOT NULL,
    um VARCHAR(10) DEFAULT 'NR',
    list_price NUMERIC(12,4) DEFAULT 0,
    net_price NUMERIC(12,4) DEFAULT 0,
    stock_qty NUMERIC(12,2) DEFAULT 0,
    available_qty NUMERIC(12,2) DEFAULT 0,
    primary_location VARCHAR(50),
    barcode_ean VARCHAR(50),
    is_marketplace_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_products_code ON hub_products(product_code, brand, barcode_ean);

-- 5. CRM, OPPORTUNITÀ E FUNNEL DI VENDITA
CREATE TABLE IF NOT EXISTS hub_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,       -- 'nuovo', 'proposta', 'trattativa', 'vinto', 'perso'
    name VARCHAR(50) NOT NULL,
    sort_order INT DEFAULT 0,
    probability INT DEFAULT 10,
    is_won BOOLEAN DEFAULT FALSE,
    is_lost BOOLEAN DEFAULT FALSE
);

-- Inserimento Stadi Predefiniti della Pipeline (se non presenti)
INSERT INTO hub_pipeline_stages (code, name, sort_order, probability, is_won, is_lost)
VALUES
    ('nuovo', '1. Nuovo Contatto', 10, 20, FALSE, FALSE),
    ('proposta', '2. Offerta Inviata', 20, 40, FALSE, FALSE),
    ('trattativa', '3. In Trattativa', 30, 70, FALSE, FALSE),
    ('vinto', '4. Chiuso Vinto 🎉', 40, 100, TRUE, FALSE),
    ('perso', '5. Chiuso Perso', 50, 0, FALSE, TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    probability = EXCLUDED.probability;

CREATE TABLE IF NOT EXISTS hub_commercial_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES hub_customers(id) ON DELETE CASCADE,
    assigned_user_id UUID REFERENCES hub_users(id) ON DELETE SET NULL,
    stage_id UUID REFERENCES hub_pipeline_stages(id) ON DELETE SET NULL,
    stage_code VARCHAR(30) DEFAULT 'nuovo',
    title VARCHAR(200) NOT NULL,
    customer_name VARCHAR(200),             -- Copia ridondante comoda per display immediato
    estimated_value NUMERIC(12,2) DEFAULT 0,
    expected_close_date DATE,
    status VARCHAR(20) DEFAULT 'aperta',    -- 'aperta', 'vinta', 'persa'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hub_customer_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES hub_customers(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES hub_commercial_opportunities(id) ON DELETE SET NULL,
    user_id UUID REFERENCES hub_users(id) ON DELETE SET NULL,
    activity_type VARCHAR(30) NOT NULL,     -- 'chiamata', 'visita', 'email', 'whatsapp', 'preventivo'
    summary VARCHAR(250) NOT NULL,
    details TEXT,
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. COMUNICAZIONI: WHATSAPP BUSINESS & BREVO EMAIL
CREATE TABLE IF NOT EXISTS hub_whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES hub_customers(id) ON DELETE SET NULL,
    recipient_phone VARCHAR(50) NOT NULL,
    template_name VARCHAR(100),
    message_text TEXT NOT NULL,
    media_url TEXT,
    status VARCHAR(30) DEFAULT 'inviato',   -- 'inviato', 'consegnato', 'letto', 'fallito'
    meta_message_id VARCHAR(100),
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hub_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel VARCHAR(30) NOT NULL,           -- 'brevo_email', 'meta_whatsapp'
    title VARCHAR(150) NOT NULL,
    subject VARCHAR(200),
    body_content TEXT,
    status VARCHAR(20) DEFAULT 'bozza',     -- 'bozza', 'pianificata', 'inviata'
    target_filter JSONB,
    recipients_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MARKETPLACE (EBAY & AMAZON)
CREATE TABLE IF NOT EXISTS hub_marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES hub_products(id) ON DELETE CASCADE,
    platform VARCHAR(30) NOT NULL,          -- 'ebay', 'amazon'
    external_item_id VARCHAR(100),
    listing_title VARCHAR(250) NOT NULL,
    listing_price NUMERIC(12,2) NOT NULL,
    stock_allocated INT DEFAULT 0,
    status VARCHAR(30) DEFAULT 'bozza',     -- 'bozza', 'in_attesa_approvazione', 'pubblicata', 'sospesa'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. REGISTRO SINCRONIZZAZIONE PLUS2000
CREATE TABLE IF NOT EXISTS hub_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system VARCHAR(50) DEFAULT 'PLUS2000',
    entity_name VARCHAR(50) NOT NULL,       -- 'customers', 'products', 'orders'
    records_read INT DEFAULT 0,
    records_upserted INT DEFAULT 0,
    errors_count INT DEFAULT 0,
    duration_ms INT DEFAULT 0,
    status VARCHAR(20) NOT NULL,            -- 'success', 'warning', 'error'
    log_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 9. ABILITAZIONE ROW LEVEL SECURITY (RLS) & POLICY ACCESSIBILI
-- =====================================================================

ALTER TABLE hub_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_commercial_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_customer_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_sync_logs ENABLE ROW LEVEL SECURITY;

-- Pulizia e creazione Policy aperte per Client Anonimo & Autenticato (OrderSender & Hub)
DROP POLICY IF EXISTS "Accesso completo hub_companies" ON hub_companies;
CREATE POLICY "Accesso completo hub_companies" ON hub_companies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_users" ON hub_users;
CREATE POLICY "Accesso completo hub_users" ON hub_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_customers" ON hub_customers;
CREATE POLICY "Accesso completo hub_customers" ON hub_customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_consent_records" ON hub_consent_records;
CREATE POLICY "Accesso completo hub_consent_records" ON hub_consent_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_products" ON hub_products;
CREATE POLICY "Accesso completo hub_products" ON hub_products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_pipeline_stages" ON hub_pipeline_stages;
CREATE POLICY "Accesso completo hub_pipeline_stages" ON hub_pipeline_stages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_commercial_opportunities" ON hub_commercial_opportunities;
CREATE POLICY "Accesso completo hub_commercial_opportunities" ON hub_commercial_opportunities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_customer_activities" ON hub_customer_activities;
CREATE POLICY "Accesso completo hub_customer_activities" ON hub_customer_activities FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_whatsapp_messages" ON hub_whatsapp_messages;
CREATE POLICY "Accesso completo hub_whatsapp_messages" ON hub_whatsapp_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_campaigns" ON hub_campaigns;
CREATE POLICY "Accesso completo hub_campaigns" ON hub_campaigns FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_marketplace_listings" ON hub_marketplace_listings;
CREATE POLICY "Accesso completo hub_marketplace_listings" ON hub_marketplace_listings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Accesso completo hub_sync_logs" ON hub_sync_logs;
CREATE POLICY "Accesso completo hub_sync_logs" ON hub_sync_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =====================================================================
-- 10. SINCRONIZZAZIONE AUTOMATICA DA CLIENTI ORDERSENDER ESISTENTI (Opzionale)
-- Popola hub_customers con i clienti già presenti nella tabella customers
-- =====================================================================
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
        INSERT INTO hub_customers (customer_code, business_name, city, province, address, postal_code, phone, mobile_whatsapp, email, vat_number, fiscal_code, assigned_agent_code)
        SELECT 
            c.code,
            c.name,
            c.city,
            c.province,
            c.address,
            c.postal_code,
            c.phone,
            COALESCE(c.mobile, c.phone),
            c.email,
            c.vat_number,
            c.tax_code,
            c.agent_code
        FROM public.customers c
        ON CONFLICT (customer_code) DO NOTHING;
    END IF;
END $$;
