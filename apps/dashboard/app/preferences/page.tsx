"use client";

// Per-campaign-type toggles + weekly frequency cap, in plain English.
// Reads/writes the preferences table; the suppression layer enforces it.

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { api } from "../../lib/api";

interface Pref {
  campaignType: string;
  enabled: boolean;
  maxPerCustomerPerWeek: number;
}

interface CouponTier {
  minAmount: number;
  discountType: "percent" | "flat";
  discountValue: number;
  validityDays: number;
}

interface Engagement {
  receipts: { enabled: boolean; showItems: boolean; footerNote?: string };
  coupons: { enabled: boolean; tiers: CouponTier[]; minDaysBetweenCoupons: number; codePrefix?: string };
  qrCapture: { enabled: boolean; messageTemplate?: string };
}

const PREF_META: Record<string, { label: string; hint: string }> = {
  winback: {
    label: "Win-back messages",
    hint: "A friendly nudge to customers who haven't visited in a couple of months.",
  },
  festival_preorder: {
    label: "Festival pre-orders",
    hint: "Invite festival shoppers to pre-order before the rush, a few days ahead.",
  },
  new_item_alert: {
    label: "New item alerts",
    hint: "Tell customers about fresh items in the categories they already buy.",
  },
  reorder_reminder: {
    label: "Reorder reminders",
    hint: "A reminder when a regular is due to restock their usual order.",
  },
};

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  const [cap, setCap] = useState(1);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [engage, setEngage] = useState<Engagement | null>(null);
  const [engageSaved, setEngageSaved] = useState(false);
  const [engageError, setEngageError] = useState("");

  useEffect(() => {
    api<{ preferences: Pref[] }>("/preferences")
      .then((r) => {
        setPrefs(r.preferences);
        setCap(Math.max(...r.preferences.map((p) => p.maxPerCustomerPerWeek), 1));
      })
      .catch((e) => setError(String(e.message ?? e)));
    api<Engagement>("/settings/engagement")
      .then(setEngage)
      .catch((e) => setEngageError(String(e.message ?? e)));
  }, []);

  async function saveEngagement(next: Engagement) {
    setEngage(next);
    setEngageSaved(false);
    setEngageError("");
    try {
      const saved = await api<Engagement>("/settings/engagement", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setEngage(saved);
      setEngageSaved(true);
      setTimeout(() => setEngageSaved(false), 2000);
    } catch (e) {
      setEngageError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save(next: Pref[], nextCap: number) {
    setSaved(false);
    setError("");
    try {
      const body = next.map((p) => ({ ...p, maxPerCustomerPerWeek: nextCap }));
      const r = await api<{ preferences: Pref[] }>("/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences: body }),
      });
      setPrefs(r.preferences);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <AppShell>
      <div className="page-title">Preferences</div>
      <div className="page-sub">Choose what kinds of messages your customers can receive.</div>
      {error && <div className="error-text">{error}</div>}
      {!prefs ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div className="grid grid-2">
            {prefs.map((p, i) => {
              const meta = PREF_META[p.campaignType] ?? { label: p.campaignType, hint: "" };
              return (
                <div className="card" key={p.campaignType} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => {
                        const next = prefs.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x));
                        setPrefs(next);
                        save(next, cap);
                      }}
                    />
                    <span className="slider" />
                  </label>
                  <div>
                    <div style={{ fontWeight: 650 }}>{meta.label}</div>
                    <div className="muted" style={{ fontSize: "0.9rem" }}>
                      {meta.hint}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ maxWidth: 520 }}>
            <div className="section-title">Don&apos;t overdo it</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Maximum messages any one customer can get per week, across all campaign types.
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="number"
                min={1}
                max={7}
                value={cap}
                style={{ width: 90 }}
                onChange={(e) => setCap(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
              />
              <span className="muted">per week</span>
              <button className="btn btn-primary" onClick={() => save(prefs, cap)}>
                Save
              </button>
              {saved && <span className="good-text">Saved ✓</span>}
            </div>
          </div>

          {engageError && <div className="error-text">{engageError}</div>}
          {engage && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="section-title">Bills &amp; coupons on WhatsApp</div>
              <div className="muted" style={{ marginBottom: 14 }}>
                Right after a billed purchase, the customer gets their bill, loyalty points, and —
                when your rules below match — a personal coupon code tied to their number.
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10 }}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={engage.receipts.enabled}
                    onChange={(e) =>
                      saveEngagement({ ...engage, receipts: { ...engage.receipts, enabled: e.target.checked } })
                    }
                  />
                  <span className="slider" />
                </label>
                <div>
                  <div style={{ fontWeight: 650 }}>Send the bill on WhatsApp</div>
                  <div className="muted" style={{ fontSize: "0.9rem" }}>
                    Total, items, and points earned — sent the moment the purchase is billed.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10 }}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={engage.receipts.showItems}
                    onChange={(e) =>
                      saveEngagement({ ...engage, receipts: { ...engage.receipts, showItems: e.target.checked } })
                    }
                  />
                  <span className="slider" />
                </label>
                <div style={{ fontWeight: 650 }}>Show item lines on the bill</div>
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={engage.coupons.enabled}
                    onChange={(e) =>
                      saveEngagement({ ...engage, coupons: { ...engage.coupons, enabled: e.target.checked } })
                    }
                  />
                  <span className="slider" />
                </label>
                <div>
                  <div style={{ fontWeight: 650 }}>Personal coupons</div>
                  <div className="muted" style={{ fontSize: "0.9rem" }}>
                    Needs at least one reward rule below to switch on.
                  </div>
                </div>
              </div>

              <div className="section-title" style={{ fontSize: "0.95rem" }}>Reward rules</div>
              <div className="muted" style={{ marginBottom: 8, fontSize: "0.9rem" }}>
                Bills at or above the amount earn the reward; the biggest matching amount wins.
              </div>
              <table style={{ marginBottom: 10 }}>
                <thead>
                  <tr>
                    <th>Bill at least (₹)</th>
                    <th>Reward</th>
                    <th>Value</th>
                    <th>Valid for (days)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {engage.coupons.tiers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">No rules yet — add one to start issuing coupons.</td>
                    </tr>
                  )}
                  {engage.coupons.tiers.map((t, i) => {
                    const update = (patch: Partial<CouponTier>) => {
                      const tiers = engage.coupons.tiers.map((x, j) => (j === i ? { ...x, ...patch } : x));
                      setEngage({ ...engage, coupons: { ...engage.coupons, tiers } });
                    };
                    return (
                      <tr key={i}>
                        <td>
                          <input type="number" min={0} value={t.minAmount} style={{ width: 110 }}
                            onChange={(e) => update({ minAmount: Number(e.target.value) || 0 })} />
                        </td>
                        <td>
                          <select value={t.discountType}
                            onChange={(e) => update({ discountType: e.target.value as CouponTier["discountType"] })}>
                            <option value="percent">% off</option>
                            <option value="flat">₹ off</option>
                          </select>
                        </td>
                        <td>
                          <input type="number" min={0} value={t.discountValue} style={{ width: 90 }}
                            onChange={(e) => update({ discountValue: Number(e.target.value) || 0 })} />
                        </td>
                        <td>
                          <input type="number" min={1} max={365} value={t.validityDays} style={{ width: 90 }}
                            onChange={(e) => update({ validityDays: Number(e.target.value) || 30 })} />
                        </td>
                        <td>
                          <button className="btn" onClick={() => {
                            const tiers = engage.coupons.tiers.filter((_, j) => j !== i);
                            setEngage({ ...engage, coupons: { ...engage.coupons, tiers } });
                          }}>
                            remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={() =>
                    setEngage({
                      ...engage,
                      coupons: {
                        ...engage.coupons,
                        tiers: [
                          ...engage.coupons.tiers,
                          { minAmount: 500, discountType: "percent", discountValue: 10, validityDays: 30 },
                        ],
                      },
                    })
                  }
                >
                  + Add rule
                </button>
                <span className="muted">At most one coupon per customer every</span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={engage.coupons.minDaysBetweenCoupons}
                  style={{ width: 80 }}
                  onChange={(e) =>
                    setEngage({
                      ...engage,
                      coupons: { ...engage.coupons, minDaysBetweenCoupons: Number(e.target.value) || 0 },
                    })
                  }
                />
                <span className="muted">days</span>
                <button className="btn btn-primary" onClick={() => saveEngagement(engage)}>
                  Save coupon rules
                </button>
                {engageSaved && <span className="good-text">Saved ✓</span>}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
