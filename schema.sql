-- =============================================================
-- Tenant Property Manager — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- =============================================================

-- Enable UUID extension (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── TENANTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name               TEXT NOT NULL,
  unit               TEXT,
  move_in            DATE,
  move_out           DATE,
  deposit_amount     DECIMAL(10,2) DEFAULT 0,
  late_fee_default   DECIMAL(10,2) DEFAULT 0,
  admin_fee_default  DECIMAL(10,2) DEFAULT 0,
  status             TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DAMAGES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS damages (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  description    TEXT NOT NULL,
  location       TEXT,
  cost           DECIMAL(10,2) DEFAULT 0,
  notes          TEXT,
  pre_image_url  TEXT,
  after_image_url TEXT,
  recorded_at    DATE DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SERVICE REQUESTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_requests (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date            DATE,
  category        TEXT,
  description     TEXT NOT NULL,
  priority        TEXT DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Emergency')),
  status          TEXT DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Completed','Cancelled')),
  tech_name       TEXT,
  tech_company    TEXT,
  tech_cost       DECIMAL(10,2) DEFAULT 0,
  completed_date  DATE,
  notes           TEXT,
  doc_image_url   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RENT PAYMENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rent_payments (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period_month          INTEGER CHECK (period_month BETWEEN 1 AND 12),
  period_year           INTEGER,
  due_date              DATE,
  rent_due              DECIMAL(10,2) DEFAULT 0,
  amount_paid           DECIMAL(10,2) DEFAULT 0,
  paid_date             DATE,
  days_late             INTEGER DEFAULT 0,
  days_late_after_grace INTEGER DEFAULT 0,
  late_fee              DECIMAL(10,2) DEFAULT 0,
  admin_fee             DECIMAL(10,2) DEFAULT 0,
  method                TEXT DEFAULT 'Check',
  status                TEXT DEFAULT 'On Time',
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── HOA CHARGES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hoa_charges (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        DATE,
  type        TEXT,
  description TEXT NOT NULL,
  amount      DECIMAL(10,2) DEFAULT 0,
  status      TEXT DEFAULT 'Outstanding' CHECK (status IN ('Outstanding','Paid','Disputed','Waived')),
  paid_date   DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CHECKLIST ITEMS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  area        TEXT NOT NULL,
  item        TEXT NOT NULL,
  condition   TEXT DEFAULT 'good' CHECK (condition IN ('good','fair','wear','damaged')),
  count_ded   BOOLEAN DEFAULT FALSE,
  cost        DECIMAL(10,2) DEFAULT 0,
  company     TEXT,
  invoice     TEXT,
  notes       TEXT,
  image_url   TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DEPOSIT RETURN INFO ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS deposit_returns (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL UNIQUE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  return_date         DATE,
  return_method       TEXT,
  return_payable_to   TEXT,
  return_notes        TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- ROW LEVEL SECURITY (users only see their own data)
-- =============================================================

ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE damages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_charges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_returns ENABLE ROW LEVEL SECURITY;

-- Tenants
CREATE POLICY "Users manage own tenants" ON tenants
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Damages
CREATE POLICY "Users manage own damages" ON damages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Service Requests
CREATE POLICY "Users manage own service requests" ON service_requests
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Rent Payments
CREATE POLICY "Users manage own rent payments" ON rent_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- HOA Charges
CREATE POLICY "Users manage own hoa charges" ON hoa_charges
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Checklist Items
CREATE POLICY "Users manage own checklist items" ON checklist_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Deposit Returns
CREATE POLICY "Users manage own deposit returns" ON deposit_returns
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================
-- DEFAULT CHECKLIST ITEMS (inserted when a tenant is created)
-- Call this function from the frontend after creating a tenant
-- =============================================================

CREATE OR REPLACE FUNCTION insert_default_checklist(p_tenant_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  defaults TEXT[][] := ARRAY[
    ARRAY['Living Room', 'Walls & paint'],
    ARRAY['Living Room', 'Carpet / flooring'],
    ARRAY['Living Room', 'Windows & blinds'],
    ARRAY['Living Room', 'Light fixtures'],
    ARRAY['Kitchen', 'Refrigerator – interior & exterior'],
    ARRAY['Kitchen', 'Stove / oven / range'],
    ARRAY['Kitchen', 'Dishwasher'],
    ARRAY['Kitchen', 'Microwave'],
    ARRAY['Kitchen', 'Countertops & backsplash'],
    ARRAY['Kitchen', 'Cabinets'],
    ARRAY['Kitchen', 'Sink & faucet'],
    ARRAY['Kitchen', 'Floor'],
    ARRAY['Bathroom', 'Toilet'],
    ARRAY['Bathroom', 'Tub / shower & surround'],
    ARRAY['Bathroom', 'Sink & vanity'],
    ARRAY['Bathroom', 'Mirror & medicine cabinet'],
    ARRAY['Bathroom', 'Floor'],
    ARRAY['Bedroom', 'Walls & paint'],
    ARRAY['Bedroom', 'Carpet / flooring'],
    ARRAY['Bedroom', 'Closet – doors & interior'],
    ARRAY['Bedroom', 'Windows & blinds'],
    ARRAY['General', 'Interior doors & hardware'],
    ARRAY['General', 'Entry / hallway'],
    ARRAY['General', 'Smoke & CO detectors'],
    ARRAY['General', 'HVAC filters'],
    ARRAY['General', 'Garage / parking area'],
    ARRAY['General', 'Keys returned (all sets)'],
    ARRAY['General', 'Garage door remotes returned'],
    ARRAY['General', 'Mailbox key returned'],
    ARRAY['General', 'Trash & debris fully removed']
  ];
  i INTEGER;
BEGIN
  FOR i IN 1..array_length(defaults, 1) LOOP
    INSERT INTO checklist_items (tenant_id, user_id, area, item, sort_order)
    VALUES (p_tenant_id, p_user_id, defaults[i][1], defaults[i][2], i);
  END LOOP;
END;
$$;
