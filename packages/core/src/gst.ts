// GST tax-invoice line computation: deterministic, no LLM. Assumes
// intra-state supply (CGST+SGST split), which fits this product's actual
// shape — a physical counter or QR/aggregator pickup, not shipped
// e-commerce with a customer billing address to derive place-of-supply
// from. See KNOWLEDGE_GRAPH.md for the full list of GST scope limits.

import crypto from "node:crypto";
import { billingProfileConfig, type EventItem, type InvoiceLineItem, type MenuItem, type Tenant } from "@hpas/types";

/** Matches the unguessable-token pattern used by QR orders (generateQrToken). */
export function generateInvoiceToken(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let token = "";
  for (const byte of crypto.randomBytes(10)) token += alphabet[byte % alphabet.length];
  return `I-${token}`;
}

/** A menu item's tax fields, when known — looked up by name at invoice time. */
export interface TaxableMenuItem {
  name: string;
  gstRate: number | null;
  hsnCode: string | null;
}

export function computeInvoiceLines(
  items: EventItem[],
  tenant: Tenant,
  menuByName: Map<string, TaxableMenuItem>
): InvoiceLineItem[] {
  const billing = billingProfileConfig(tenant.config);
  return items.map((item) => {
    const menuItem = menuByName.get(item.name.toLowerCase());
    const gstRate = menuItem?.gstRate ?? billing.defaultGstRate ?? 0;
    const hsnCode = menuItem?.hsnCode ?? billing.defaultHsnCode ?? "";
    const taxableValue = item.qty * item.unitPrice;
    const cgst = (taxableValue * gstRate) / 200;
    const sgst = cgst;
    return {
      name: item.name,
      hsnCode,
      qty: item.qty,
      unitPrice: item.unitPrice,
      gstRate,
      taxableValue,
      cgst,
      sgst,
      lineTotal: taxableValue + cgst + sgst,
    };
  });
}

export function menuItemsByName(items: Pick<MenuItem, "name" | "gstRate" | "hsnCode">[]): Map<string, TaxableMenuItem> {
  return new Map(items.map((it) => [it.name.toLowerCase(), it]));
}
