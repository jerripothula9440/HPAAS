// Pricing Pipelines: scheduled, scoped refresh (+ optional auto-apply) of
// price recommendations, so a tenant doesn't have to manually return to
// Recommendations every time. Carries no bounds/rounding of its own — those
// still come from PricingConfig, one source of truth. The Safety Net always
// still holds back needsReview items, even in "automatic" mode.

import {
  getPricingPipeline,
  getTenantById,
  listAllEnabledPricingPipelines,
  markPricingPipelineRun,
} from "@hpas/db";
import { pricingConfig, type PriceRecommendation, type PricingPipeline, type Tenant } from "@hpas/types";
import { applyPriceRecommendations, refreshPricingRecommendations } from "./pricing.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Pure so it's easy to reason about/test independent of the DB or clock source. */
export function isPipelineDue(pipeline: PricingPipeline, now: Date): boolean {
  if (!pipeline.enabled) return false;

  if (pipeline.scheduleType === "on_date") {
    if (pipeline.lastRunAt) return false; // one-time, already ran
    if (!pipeline.scheduleDate) return false;
    return new Date(pipeline.scheduleDate) <= now;
  }

  if (!pipeline.lastRunAt) return true; // never run yet — always due

  const daysSinceLastRun = (now.getTime() - pipeline.lastRunAt.getTime()) / MS_PER_DAY;
  if (pipeline.scheduleType === "daily") return daysSinceLastRun >= 1;
  if (pipeline.scheduleType === "weekly") return daysSinceLastRun >= 7;
  if (pipeline.scheduleType === "every_n_days") return daysSinceLastRun >= (pipeline.scheduleIntervalDays ?? 1);
  return false;
}

async function executePipeline(tenant: Tenant, pipeline: PricingPipeline): Promise<{
  refreshed: number;
  applied: number;
  skippedNeedsReview: number;
}> {
  const businessUnitId = pipeline.businessUnitId || undefined;
  const all = await refreshPricingRecommendations(tenant, { businessUnitId });
  const scoped: PriceRecommendation[] =
    pipeline.itemIds.length > 0 ? all.filter((r) => pipeline.itemIds.includes(r.menuItemId)) : all;

  if (pipeline.mode !== "automatic") {
    return { refreshed: scoped.length, applied: 0, skippedNeedsReview: 0 };
  }

  const applicable = scoped.filter((r) => !r.needsReview);
  const applied = await applyPriceRecommendations(tenant.id, applicable, pipeline.businessUnitId);
  return { refreshed: scoped.length, applied, skippedNeedsReview: scoped.length - applicable.length };
}

/** Nightly sweep: called from cron/nightly.ts alongside compute-features/evaluate-triggers. */
export async function runDuePricingPipelines(): Promise<void> {
  const now = new Date();
  const pipelines = await listAllEnabledPricingPipelines();
  if (pipelines.length === 0) return;

  const tenantCache = new Map<string, Tenant | null>();
  for (const pipeline of pipelines) {
    if (!isPipelineDue(pipeline, now)) continue;

    let tenant = tenantCache.get(pipeline.tenantId);
    if (tenant === undefined) {
      tenant = await getTenantById(pipeline.tenantId);
      tenantCache.set(pipeline.tenantId, tenant);
    }
    if (!tenant || !tenant.config.modules.pricing?.enabled) continue;

    try {
      const result = await executePipeline(tenant, pipeline);
      console.log(
        `[pricing-pipeline] ${tenant.name} / "${pipeline.name}": refreshed ${result.refreshed}` +
          (pipeline.mode === "automatic"
            ? `, applied ${result.applied}, skipped ${result.skippedNeedsReview} (needs review)`
            : "")
      );
    } catch (err) {
      console.error(`[pricing-pipeline] ${pipeline.name} (tenant ${pipeline.tenantId}) failed:`, err);
    }
    await markPricingPipelineRun(pipeline.id, { disable: pipeline.scheduleType === "on_date" });
  }
}

/** Manual "Run now" trigger for one pipeline — same logic, outside the schedule. */
export async function runPricingPipelineNow(
  tenant: Tenant,
  pipelineId: string
): Promise<{ refreshed: number; applied: number; skippedNeedsReview: number } | null> {
  const pipeline = await getPricingPipeline(tenant.id, pipelineId);
  if (!pipeline) return null;

  const result = await executePipeline(tenant, pipeline);
  await markPricingPipelineRun(pipeline.id, { disable: pipeline.scheduleType === "on_date" });
  return result;
}
