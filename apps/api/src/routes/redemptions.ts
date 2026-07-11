// Redemption entry point for POS: the cashier types the customer's code
// at checkout, the POS (or a thin script) calls this. Ties the redemption
// back to the exact message and campaign that drove the visit.

import { Router } from "express";
import {
  getCampaign,
  getCouponByCode,
  getMessageByRedemptionCode,
  insertEvent,
  redeemCoupon,
} from "@hpas/db";

export const redemptionsRouter: import("express").Router = Router();

redemptionsRouter.post("/redemptions", async (req, res) => {
  const tenant = req.tenant!;
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  const amount = Number(req.body?.amount) || 0;
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  const message = await getMessageByRedemptionCode(code);
  if (!message) {
    // Not a campaign code — maybe a personalized coupon issued with a receipt.
    const coupon = await getCouponByCode(tenant.id, code);
    if (!coupon) {
      res.status(404).json({ error: "unknown code" });
      return;
    }
    if (new Date(coupon.expiresAt).getTime() <= Date.now()) {
      res.status(409).json({ error: "coupon expired" });
      return;
    }
    if (!(await redeemCoupon(tenant.id, coupon.id))) {
      res.status(409).json({ error: "coupon already redeemed" });
      return;
    }
    await insertEvent(tenant.id, coupon.profileId, {
      eventType: "redemption",
      items: [{ name: coupon.code, category: "coupon", qty: 1, unitPrice: 0 }],
      amount,
      ts: new Date(),
      locationId: req.body?.location_id ? String(req.body.location_id) : undefined,
    });
    res.json({ ok: true, coupon: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue }, profileId: coupon.profileId });
    return;
  }
  // Tenant scope check: the code's campaign must belong to the caller.
  const campaign = await getCampaign(tenant.id, message.campaignId);
  if (!campaign) {
    res.status(404).json({ error: "unknown code" });
    return;
  }

  await insertEvent(tenant.id, message.profileId, {
    eventType: "redemption",
    items: [{ name: code, category: "redemption", qty: 1, unitPrice: 0 }],
    amount,
    ts: new Date(),
    locationId: req.body?.location_id ? String(req.body.location_id) : undefined,
  });
  res.json({ ok: true, campaignId: campaign.id, profileId: message.profileId });
});
