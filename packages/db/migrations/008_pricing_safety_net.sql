-- Pricing safety net: a recommendation gets flagged for explicit review
-- before it can be applied when it's built on thin data (low confidence)
-- or hit its configured min/max bound. See KNOWLEDGE_GRAPH.md's ai-pricing
-- node for the full rationale.

ALTER TABLE price_recommendations ADD COLUMN needs_review BOOLEAN NOT NULL DEFAULT false;
