// AI Pricing's deterministic core: a bounded, explainable demand-trend
// heuristic, not an econometric elasticity model — a small shop's
// transaction volume can't support one. Rising 90-day sales vs the prior
// 90 days nudges price up (capture willingness to pay); falling nudges it
// down (stimulate volume); magnitude always clamped by the tenant's
// configured max %-change and min/max price. No LLM anywhere here.

import type { PricingRoundingRule } from "@hpas/types";

export interface ItemPricingSignal {
  menuItemId: string;
  name: string;
  currentPrice: number;
  unitsSold90d: number;
  unitsSoldPrior90d: number;
}

export interface PricingBounds {
  minPrice?: number;
  maxPrice?: number;
  maxChangePercent: number;
  /** Item's category matches an active festival window — small extra upward nudge. */
  festivalBoost?: boolean;
  roundingRule?: PricingRoundingRule;
  /** When false, recommendations never need review regardless of confidence/bounds. */
  safetyNetEnabled?: boolean;
}

export interface PriceRecommendationResult {
  menuItemId: string;
  name: string;
  currentPrice: number;
  suggestedPrice: number;
  changePercent: number;
  demandTrend: "rising" | "falling" | "flat";
  confidence: "low" | "medium" | "high";
  needsReview: boolean;
}

const TREND_THRESHOLD = 0.2;
const TREND_TO_PERCENT_SCALE = 25;
const FESTIVAL_BOOST_PERCENT = 5;

/** Charm-pricing, applied as the very last step before re-clamping to bounds. */
export function applyRounding(price: number, rule: PricingRoundingRule | undefined): number {
  switch (rule) {
    case "nearest_5":
      return Math.round(price / 5) * 5;
    case "nearest_10":
      return Math.round(price / 10) * 10;
    case "end_99":
      return Math.max(0, Math.floor(price / 10) * 10 - 1 + 0.99);
    case "end_95":
      return Math.max(0, Math.floor(price / 10) * 10 - 1 + 0.95);
    case "none":
    default:
      return price;
  }
}

function clamp(price: number, bounds: Pick<PricingBounds, "minPrice" | "maxPrice">): number {
  let clamped = price;
  if (bounds.minPrice != null) clamped = Math.max(bounds.minPrice, clamped);
  if (bounds.maxPrice != null) clamped = Math.min(bounds.maxPrice, clamped);
  return clamped;
}

export function computePriceRecommendation(
  signal: ItemPricingSignal,
  bounds: PricingBounds
): PriceRecommendationResult {
  const { menuItemId, name, currentPrice, unitsSold90d, unitsSoldPrior90d } = signal;

  const trendPct =
    unitsSoldPrior90d > 0
      ? (unitsSold90d - unitsSoldPrior90d) / unitsSoldPrior90d
      : unitsSold90d > 0
        ? 1
        : 0;

  let demandTrend: "rising" | "falling" | "flat" = "flat";
  if (trendPct > TREND_THRESHOLD) demandTrend = "rising";
  else if (trendPct < -TREND_THRESHOLD) demandTrend = "falling";

  let changePercent = 0;
  if (demandTrend === "rising") {
    changePercent = Math.min(bounds.maxChangePercent, Math.abs(trendPct) * TREND_TO_PERCENT_SCALE);
  } else if (demandTrend === "falling") {
    changePercent = -Math.min(bounds.maxChangePercent, Math.abs(trendPct) * TREND_TO_PERCENT_SCALE);
  }
  if (bounds.festivalBoost && demandTrend !== "falling") {
    changePercent = Math.min(bounds.maxChangePercent, changePercent + FESTIVAL_BOOST_PERCENT);
  }

  const preClampPrice = currentPrice * (1 + changePercent / 100);
  const clampedPrice = clamp(preClampPrice, bounds);
  const roundedPrice = clamp(applyRounding(clampedPrice, bounds.roundingRule), bounds);
  const suggestedPrice = Math.round(roundedPrice * 100) / 100;

  // Recompute the reported % against the final price, not the pre-clamp estimate.
  const finalChangePercent =
    currentPrice > 0 ? Math.round(((suggestedPrice - currentPrice) / currentPrice) * 10000) / 100 : 0;

  const dataVolume = unitsSold90d + unitsSoldPrior90d;
  const confidence: "low" | "medium" | "high" = dataVolume >= 30 ? "high" : dataVolume >= 8 ? "medium" : "low";

  const hitBound = Math.abs(preClampPrice - clampedPrice) > 0.005;
  const needsReview = bounds.safetyNetEnabled !== false && (confidence === "low" || hitBound);

  return {
    menuItemId,
    name,
    currentPrice,
    suggestedPrice,
    changePercent: finalChangePercent,
    demandTrend,
    confidence,
    needsReview,
  };
}
