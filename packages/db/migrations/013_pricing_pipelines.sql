-- Pricing Pipelines: scheduled, scoped refresh (+ optional auto-apply) of
-- price recommendations, so a tenant doesn't have to manually return to
-- Recommendations every time. Deliberately carries no bounds/rounding of
-- its own — those still come from PricingConfig, one source of truth.
CREATE TABLE pricing_pipelines (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id),
  name                   TEXT NOT NULL,
  mode                   TEXT NOT NULL CHECK (mode IN ('manual', 'automatic')),
  schedule_type          TEXT NOT NULL CHECK (schedule_type IN ('daily', 'weekly', 'every_n_days', 'on_date')),
  schedule_interval_days INT,
  schedule_date          DATE,
  business_unit_id       TEXT NOT NULL DEFAULT '',
  item_ids               JSONB NOT NULL DEFAULT '[]',
  enabled                BOOLEAN NOT NULL DEFAULT true,
  last_run_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pricing_pipelines_tenant ON pricing_pipelines (tenant_id);
