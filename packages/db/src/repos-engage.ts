// Tenant-scoped repos for order engagement: personalized coupons,
// per-order QR capture of online customers, and the transactional
// (receipt / QR-welcome) message log.

import type {
  Coupon,
  CouponSource,
  EventItem,
  QrOrder,
  TenantConfig,
  TransactionalKind,
} from "@hpas/types";
import { query, queryOne } from "./client.js";

// ---------- coupons ----------

const mapCoupon = (r: any): Coupon => ({
  id: r.id,
  tenantId: r.tenant_id,
  profileId: r.profile_id,
  phone: r.phone,
  code: r.code,
  discountType: r.discount_type,
  discountValue: Number(r.discount_value),
  issuedForAmount: Number(r.issued_for_amount),
  source: r.source,
  expiresAt: r.expires_at,
  redeemedAt: r.redeemed_at,
  createdAt: r.created_at,
});

export async function insertCoupon(c: {
  tenantId: string;
  profileId: string;
  phone: string;
  code: string;
  discountType: "percent" | "flat";
  discountValue: number;
  issuedForAmount: number;
  source: CouponSource;
  expiresAt: Date;
}): Promise<Coupon> {
  const row = await queryOne(
    `INSERT INTO coupons (tenant_id, profile_id, phone, code, discount_type,
                          discount_value, issued_for_amount, source, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      c.tenantId,
      c.profileId,
      c.phone,
      c.code,
      c.discountType,
      c.discountValue,
      c.issuedForAmount,
      c.source,
      c.expiresAt,
    ]
  );
  return mapCoupon(row);
}

/** When this customer last got a coupon — the issuance frequency guard. */
export async function latestCouponIssuedAt(
  tenantId: string,
  profileId: string
): Promise<Date | null> {
  const row = await queryOne<{ created_at: Date }>(
    `SELECT created_at FROM coupons WHERE tenant_id = $1 AND profile_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, profileId]
  );
  return row?.created_at ?? null;
}

export async function getCouponByCode(tenantId: string, code: string): Promise<Coupon | null> {
  const row = await queryOne(`SELECT * FROM coupons WHERE tenant_id = $1 AND code = $2`, [
    tenantId,
    code,
  ]);
  return row ? mapCoupon(row) : null;
}

/** Mark redeemed; returns false if already redeemed (idempotent double-scan guard). */
export async function redeemCoupon(tenantId: string, couponId: string): Promise<boolean> {
  const row = await queryOne(
    `UPDATE coupons SET redeemed_at = now()
     WHERE tenant_id = $1 AND id = $2 AND redeemed_at IS NULL RETURNING id`,
    [tenantId, couponId]
  );
  return row !== null;
}

export async function couponsForProfile(
  tenantId: string,
  profileId: string,
  limit = 10
): Promise<Coupon[]> {
  const rows = await query(
    `SELECT * FROM coupons WHERE tenant_id = $1 AND profile_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [tenantId, profileId, limit]
  );
  return rows.map(mapCoupon);
}

// ---------- QR orders ----------

const mapQrOrder = (r: any): QrOrder => ({
  id: r.id,
  tenantId: r.tenant_id,
  token: r.token,
  orderRef: r.order_ref,
  source: r.source,
  amount: Number(r.amount),
  items: r.items ?? [],
  status: r.status,
  claimedProfileId: r.claimed_profile_id,
  claimedAt: r.claimed_at,
  createdAt: r.created_at,
});

export async function createQrOrder(q: {
  tenantId: string;
  token: string;
  orderRef: string;
  source: string;
  amount: number;
  items: EventItem[];
}): Promise<QrOrder> {
  const row = await queryOne(
    `INSERT INTO qr_orders (tenant_id, token, order_ref, source, amount, items)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [q.tenantId, q.token, q.orderRef, q.source, q.amount, JSON.stringify(q.items)]
  );
  return mapQrOrder(row!);
}

/**
 * Global token lookup — the ONLY tenant-unscoped read in the repos, used by
 * the public claim redirect where the unguessable token itself is the
 * credential that resolves the tenant.
 */
export async function getQrOrderByToken(token: string): Promise<QrOrder | null> {
  const row = await queryOne(`SELECT * FROM qr_orders WHERE token = $1`, [token]);
  return row ? mapQrOrder(row) : null;
}

export async function getQrOrderForTenant(
  tenantId: string,
  token: string
): Promise<QrOrder | null> {
  const row = await queryOne(
    `SELECT * FROM qr_orders WHERE tenant_id = $1 AND token = $2`,
    [tenantId, token]
  );
  return row ? mapQrOrder(row) : null;
}

/** Claim atomically; returns false if already claimed (webhook retry guard). */
export async function claimQrOrder(
  tenantId: string,
  qrOrderId: string,
  profileId: string
): Promise<boolean> {
  const row = await queryOne(
    `UPDATE qr_orders SET status = 'claimed', claimed_profile_id = $3, claimed_at = now()
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending' RETURNING id`,
    [tenantId, qrOrderId, profileId]
  );
  return row !== null;
}

export async function listQrOrders(tenantId: string, limit = 50): Promise<QrOrder[]> {
  const rows = await query(
    `SELECT * FROM qr_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return rows.map(mapQrOrder);
}

// ---------- transactional messages ----------

export async function insertTransactionalMessage(m: {
  tenantId: string;
  profileId: string;
  kind: TransactionalKind;
  body: string;
  status: "sent" | "failed";
}): Promise<void> {
  await query(
    `INSERT INTO transactional_messages (tenant_id, profile_id, kind, body, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [m.tenantId, m.profileId, m.kind, m.body, m.status]
  );
}

// ---------- tenant config patch ----------

/**
 * Shallow top-level merge into tenants.config — how the dashboard persists
 * admin-editable config sections (receipts, coupons, qrCapture) without
 * touching the tenant's config.json on disk.
 */
export async function patchTenantConfig(
  tenantId: string,
  patch: Partial<TenantConfig>
): Promise<void> {
  await query(`UPDATE tenants SET config = config || $2::jsonb WHERE id = $1`, [
    tenantId,
    JSON.stringify(patch),
  ]);
}
