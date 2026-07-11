// Coupon engine: deterministic issuance rules, no LLM anywhere. The admin
// configures tiers (bill amount → reward) and a frequency guard in tenant
// config; this module evaluates them at receipt/welcome time and writes the
// issued coupon against the customer's profile + phone.

import crypto from "node:crypto";
import { couponConfig, type Coupon, type CouponSource, type CouponTier, type Tenant } from "@hpas/types";
import { insertCoupon, latestCouponIssuedAt } from "@hpas/db";

/** Highest matching tier wins: spend more, get the better reward. */
export function pickCouponTier(tiers: CouponTier[], amount: number): CouponTier | null {
  let best: CouponTier | null = null;
  for (const tier of tiers) {
    if (amount >= tier.minAmount && (!best || tier.minAmount > best.minAmount)) best = tier;
  }
  return best;
}

/**
 * Code shape PREFIX-CP-XXXXXX deliberately matches the redemption-code
 * pattern customers already type back on WhatsApp, so coupons ride the
 * same inbound-webhook and POS redemption paths as campaign codes.
 */
export function generateCouponCode(prefixRaw: string): string {
  const prefix = (prefixRaw.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6) || "HP").padEnd(
    2,
    "X"
  );
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — cashiers type these
  let suffix = "";
  for (const byte of crypto.randomBytes(6)) suffix += alphabet[byte % alphabet.length];
  return `${prefix}-CP-${suffix}`;
}

/** "10% off" / "₹100 off" — one wording everywhere (receipt, dashboard, till). */
export function describeCouponValue(c: Pick<Coupon, "discountType" | "discountValue">): string {
  return c.discountType === "percent" ? `${c.discountValue}% off` : `₹${c.discountValue} off`;
}

/**
 * Issue a coupon for this purchase if the tenant's rules say so:
 * coupons enabled, a tier matches the bill amount, and the customer
 * hasn't received one inside the frequency window.
 */
export async function maybeIssueCoupon(
  tenant: Tenant,
  profileId: string,
  phone: string,
  amount: number,
  source: CouponSource
): Promise<Coupon | null> {
  const cfg = couponConfig(tenant.config);
  if (!cfg.enabled || cfg.tiers.length === 0) return null;

  const tier = pickCouponTier(cfg.tiers, amount);
  if (!tier) return null;

  const lastIssued = await latestCouponIssuedAt(tenant.id, profileId);
  if (lastIssued) {
    const daysSince = (Date.now() - new Date(lastIssued).getTime()) / 86_400_000;
    if (daysSince < cfg.minDaysBetweenCoupons) return null;
  }

  return insertCoupon({
    tenantId: tenant.id,
    profileId,
    phone,
    code: generateCouponCode(cfg.codePrefix ?? tenant.config.slug),
    discountType: tier.discountType,
    discountValue: tier.discountValue,
    issuedForAmount: amount,
    source,
    expiresAt: new Date(Date.now() + tier.validityDays * 86_400_000),
  });
}

/** Unguessable per-order QR token; the token itself is the claim credential. */
export function generateQrToken(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let token = "";
  for (const byte of crypto.randomBytes(10)) token += alphabet[byte % alphabet.length];
  return `Q-${token}`;
}

/** Matches tokens pre-drafted into the customer's WhatsApp message. */
export const QR_TOKEN_REGEX = /\bQ-[A-Z0-9]{10}\b/;
