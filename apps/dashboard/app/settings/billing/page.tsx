"use client";

// The tenant fills in their own GST/business details here, once — everything
// a GST tax invoice legally needs beyond the line items themselves. Saved to
// tenants.config->billingProfile; used by every invoice generated from
// /billing.

import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { api } from "../../../lib/api";

interface BillingProfile {
  legalName?: string;
  gstin?: string;
  pan?: string;
  addressLines?: string[];
  state?: string;
  invoicePrefix?: string;
  defaultGstRate?: number;
  defaultHsnCode?: string;
}

export default function BillingSettingsPage() {
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [addressText, setAddressText] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ billingProfile: BillingProfile }>("/settings/billing")
      .then((r) => {
        setProfile(r.billingProfile);
        setAddressText((r.billingProfile.addressLines ?? []).join("\n"));
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  async function save() {
    if (!profile) return;
    setSaved(false);
    setError("");
    const next: BillingProfile = {
      ...profile,
      addressLines: addressText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    try {
      await api("/settings/billing", {
        method: "PUT",
        body: JSON.stringify({ billingProfile: next }),
      });
      setProfile(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <AppShell>
      <div className="page-title">Billing details</div>
      <div className="page-sub">
        Your business&apos;s GST details — filled in once, used on every invoice you generate.
      </div>
      {error && <div className="error-text">{error}</div>}
      {!profile ? (
        <div className="muted">Loading…</div>
      ) : (
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ marginBottom: 12 }}>
            <label className="stat-label">Legal business name</label>
            <input
              type="text"
              value={profile.legalName ?? ""}
              onChange={(e) => setProfile({ ...profile, legalName: e.target.value })}
              placeholder="e.g. Dadu's Sweets Pvt Ltd"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="stat-label">GSTIN</label>
            <input
              type="text"
              value={profile.gstin ?? ""}
              onChange={(e) => setProfile({ ...profile, gstin: e.target.value.toUpperCase() })}
              placeholder="15-character GSTIN"
              maxLength={15}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="stat-label">PAN (optional)</label>
            <input
              type="text"
              value={profile.pan ?? ""}
              onChange={(e) => setProfile({ ...profile, pan: e.target.value.toUpperCase() })}
              maxLength={10}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="stat-label">Address</label>
            <textarea
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              placeholder={"Shop no. 12, Main Bazaar\nOld Delhi"}
              rows={3}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="stat-label">State</label>
            <input
              type="text"
              value={profile.state ?? ""}
              onChange={(e) => setProfile({ ...profile, state: e.target.value })}
              placeholder="e.g. Delhi"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="stat-label">Invoice number prefix</label>
            <input
              type="text"
              value={profile.invoicePrefix ?? ""}
              onChange={(e) => setProfile({ ...profile, invoicePrefix: e.target.value.toUpperCase() })}
              placeholder="e.g. DADU (→ DADU-0001)"
              maxLength={10}
            />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label className="stat-label">Default GST rate (%)</label>
              <input
                type="number"
                min={0}
                max={28}
                value={profile.defaultGstRate ?? ""}
                onChange={(e) => setProfile({ ...profile, defaultGstRate: Number(e.target.value) || 0 })}
                placeholder="Used when an item has no GST rate of its own"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="stat-label">Default HSN code</label>
              <input
                type="text"
                value={profile.defaultHsnCode ?? ""}
                onChange={(e) => setProfile({ ...profile, defaultHsnCode: e.target.value })}
                placeholder="Used when an item has no HSN of its own"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" onClick={save}>
              Save
            </button>
            {saved && <span className="good-text">Saved ✓</span>}
          </div>
        </div>
      )}
    </AppShell>
  );
}
