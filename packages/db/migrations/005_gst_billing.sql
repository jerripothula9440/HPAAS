-- GST e-billing: tenants fill in their own business/GST details once
-- (tenants.config->billingProfile), then generate a proper GST tax invoice
-- for a sale — itemized lines with CGST/SGST breakup, sequential per-tenant
-- invoice numbers, delivered via a printable public page + WhatsApp + email.
--
-- Deliberate scope limits (see KNOWLEDGE_GRAPH.md): intra-state (CGST+SGST)
-- only, no IGST/place-of-supply modeling; no GSTN e-invoice IRN integration;
-- invoice numbers are a continuous per-tenant sequence, no financial-year
-- reset.

ALTER TABLE menu_items ADD COLUMN hsn_code TEXT;
ALTER TABLE menu_items ADD COLUMN gst_rate NUMERIC(5,2);

-- Atomic per-tenant invoice-number counter — avoids a racy
-- SELECT COUNT(*)+1 under concurrent invoice creation.
CREATE TABLE invoice_counters (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id),
  next_number INT NOT NULL DEFAULT 1
);

CREATE TABLE invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  token          TEXT NOT NULL UNIQUE,
  invoice_number TEXT NOT NULL,
  profile_id     UUID REFERENCES profiles(id),
  customer_name  TEXT,
  customer_phone TEXT,
  line_items     JSONB NOT NULL DEFAULT '[]',
  taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX idx_invoices_tenant ON invoices (tenant_id, created_at DESC);

-- Invoices are also delivered as a transactional message (WhatsApp link).
ALTER TABLE transactional_messages DROP CONSTRAINT transactional_messages_kind_check;
ALTER TABLE transactional_messages ADD CONSTRAINT transactional_messages_kind_check
  CHECK (kind IN ('receipt','qr_welcome','invoice'));
