-- Offline + online order engagement: personalized coupons issued with
-- WhatsApp bills, per-order QR codes that pull aggregator (Swiggy/Zomato)
-- customers into the system, and the transactional (non-campaign) message
-- log that keeps receipts/welcomes out of campaign attribution.

-- Personalized coupon codes, one row per issued coupon, tied to the
-- customer (profile + phone) it was issued to. Redemption is recorded
-- here AND as a redemption event for attribution/insights.
CREATE TABLE coupons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  profile_id    UUID NOT NULL REFERENCES profiles(id),
  phone         TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','flat')),
  discount_value NUMERIC(12,2) NOT NULL,
  -- The bill amount that earned this coupon (which tier matched).
  issued_for_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'receipt' CHECK (source IN ('receipt','qr_welcome','manual')),
  expires_at    TIMESTAMPTZ NOT NULL,
  redeemed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupons_tenant_profile ON coupons (tenant_id, profile_id, created_at DESC);
CREATE INDEX idx_coupons_tenant_phone ON coupons (tenant_id, phone);

-- One QR per online (aggregator) order. The QR resolves to a wa.me deep
-- link with the token pre-drafted; the customer sending it is the moment
-- their phone number enters the system and the order becomes attributable.
CREATE TABLE qr_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  token        TEXT NOT NULL UNIQUE,
  order_ref    TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'other',
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  items        JSONB NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed')),
  claimed_profile_id UUID REFERENCES profiles(id),
  claimed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qr_orders_tenant ON qr_orders (tenant_id, created_at DESC);

-- System-sent transactional messages (purchase receipts, QR welcomes).
-- Deliberately NOT in campaign messages or direct_messages: transactional
-- sends must never pollute campaign attribution, hold-out accounting, or
-- the owner's 1:1 note history.
CREATE TABLE transactional_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  kind       TEXT NOT NULL CHECK (kind IN ('receipt','qr_welcome')),
  channel    TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','call')),
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactional_tenant_profile ON transactional_messages (tenant_id, profile_id, sent_at DESC);
