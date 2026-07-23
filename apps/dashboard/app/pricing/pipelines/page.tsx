"use client";

// Pricing > Pipelines — set up once how a set of items should be priced
// (manually reviewed, or fully automatic) and have it run itself on a
// schedule, instead of returning to Recommendations every time. Carries no
// bounds of its own — those still come from Item Settings, one source of
// truth; a pipeline only narrows scope (branch, optional item subset) and
// decides when to run + whether to auto-apply.

import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { api } from "../../../lib/api";
import { useBusinessUnits } from "../../../lib/businessUnits";
import PricingLocked from "../locked";

type Mode = "manual" | "automatic";
type ScheduleType = "daily" | "weekly" | "every_n_days" | "on_date";

interface Pipeline {
  id: string;
  name: string;
  mode: Mode;
  scheduleType: ScheduleType;
  scheduleIntervalDays: number | null;
  scheduleDate: string | null;
  businessUnitId: string;
  itemIds: string[];
  enabled: boolean;
  lastRunAt: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  category: string;
}

interface PricingConfig {
  applyToAllItems: boolean;
  useBusinessUnitsInPricing?: boolean;
  items: Record<string, { enabled: boolean }>;
}

const SCHEDULE_LABEL: Record<ScheduleType, string> = {
  daily: "Daily",
  weekly: "Every 7 days",
  every_n_days: "Every N days",
  on_date: "Once, on a date",
};

function scheduleSummary(p: Pipeline): string {
  if (p.scheduleType === "every_n_days") return `Every ${p.scheduleIntervalDays ?? 1} day(s)`;
  if (p.scheduleType === "on_date") return `Once, on ${p.scheduleDate ?? "—"}`;
  return SCHEDULE_LABEL[p.scheduleType];
}

export default function PricingPipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const { units: businessUnits } = useBusinessUnits();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("manual");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("daily");
  const [intervalDays, setIntervalDays] = useState("7");
  const [scheduleDate, setScheduleDate] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [itemIds, setItemIds] = useState<Set<string>>(new Set());

  function load() {
    api<{ pipelines: Pipeline[] }>("/pricing/pipelines")
      .then((r) => setPipelines(r.pipelines))
      .catch((e: Error & { status?: number }) => {
        if (e.status === 403) setLocked(true);
        else setPipelines([]);
      });
  }

  useEffect(() => {
    load();
    api<{ items: MenuItem[] }>("/menu")
      .then((r) => setMenuItems(r.items))
      .catch(() => setMenuItems([]));
    api<{ pricing: PricingConfig }>("/settings/pricing")
      .then((r) => setPricingConfig(r.pricing))
      .catch(() => {});
  }, []);

  const eligibleItems = pricingConfig?.applyToAllItems
    ? menuItems
    : menuItems.filter((it) => pricingConfig?.items[it.id]?.enabled);

  function toggleItem(id: string) {
    setItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetForm() {
    setName("");
    setMode("manual");
    setScheduleType("daily");
    setIntervalDays("7");
    setScheduleDate("");
    setBusinessUnitId("");
    setItemIds(new Set());
    setFormOpen(false);
  }

  async function create() {
    if (!name.trim()) return;
    setBusy("create");
    setError("");
    try {
      await api("/pricing/pipelines", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          mode,
          scheduleType,
          scheduleIntervalDays: scheduleType === "every_n_days" ? Number(intervalDays) || 1 : undefined,
          scheduleDate: scheduleType === "on_date" ? scheduleDate : undefined,
          businessUnitId: businessUnitId || undefined,
          itemIds: [...itemIds],
        }),
      });
      resetForm();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function toggleEnabled(p: Pipeline) {
    setBusy(p.id);
    try {
      await api(`/pricing/pipelines/${p.id}`, { method: "PUT", body: JSON.stringify({ enabled: !p.enabled }) });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function runNow(p: Pipeline) {
    setBusy(p.id);
    setNotice("");
    setError("");
    try {
      const r = await api<{ refreshed: number; applied: number; skippedNeedsReview: number }>(
        `/pricing/pipelines/${p.id}/run`,
        { method: "POST" }
      );
      setNotice(
        p.mode === "automatic"
          ? `"${p.name}": refreshed ${r.refreshed}, applied ${r.applied}${r.skippedNeedsReview ? `, ${r.skippedNeedsReview} need review` : ""}.`
          : `"${p.name}": refreshed ${r.refreshed} — review on Recommendations.`
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function remove(p: Pipeline) {
    setBusy(p.id);
    try {
      await api(`/pricing/pipelines/${p.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (locked) {
    return (
      <AppShell>
        <PricingLocked />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="page-title">Pricing Pipelines</div>
          <div className="page-sub">
            Set up how a set of items should be priced once, and let it run itself — manual (just
            refresh, you review) or automatic (refresh and apply, minus anything the Safety Net flags).
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? "Close" : "+ New Pipeline"}
        </button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {formOpen && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">New pipeline</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pipeline name" style={{ maxWidth: 220 }} />
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} style={{ width: 160 }}>
              <option value="manual">Manual (review first)</option>
              <option value="automatic">Automatic (auto-apply)</option>
            </select>
            <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as ScheduleType)} style={{ width: 170 }}>
              <option value="daily">Daily</option>
              <option value="weekly">Every 7 days</option>
              <option value="every_n_days">Every N days</option>
              <option value="on_date">Once, on a date</option>
            </select>
            {scheduleType === "every_n_days" && (
              <input
                type="number"
                min={1}
                max={365}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                placeholder="N days"
                style={{ width: 90 }}
              />
            )}
            {scheduleType === "on_date" && (
              <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} style={{ width: 160 }} />
            )}
            {businessUnits.length > 0 && (
              <select value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value)} style={{ width: 170 }}>
                <option value="">All branches</option>
                {businessUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
            Items (leave none checked to run for every item Item Settings already targets):
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              maxHeight: 140,
              overflowY: "auto",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 10,
              marginBottom: 14,
            }}
          >
            {eligibleItems.length === 0 && <span className="muted">No items enabled under Item Settings yet.</span>}
            {eligibleItems.map((it) => (
              <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.85rem" }}>
                <input type="checkbox" checked={itemIds.has(it.id)} onChange={() => toggleItem(it.id)} />
                {it.name}
              </label>
            ))}
          </div>

          {mode === "automatic" && (
            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: 14 }}>
              The Safety Net still applies: any recommendation flagged as needing review is held back
              even in automatic mode — it waits on Recommendations for you.
            </div>
          )}

          <button className="btn btn-primary" disabled={busy === "create" || !name.trim()} onClick={create}>
            {busy === "create" ? "Creating…" : "Create pipeline"}
          </button>
        </div>
      )}

      {!pipelines ? (
        <div className="muted">Loading…</div>
      ) : pipelines.length === 0 ? (
        <div className="card">
          <span className="muted">No pipelines yet — create one above, or keep using Recommendations manually.</span>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Mode</th>
                <th>Schedule</th>
                <th>Scope</th>
                <th>Last run</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((p) => (
                <tr key={p.id} style={{ opacity: p.enabled ? 1 : 0.5 }}>
                  <td>{p.name}</td>
                  <td>
                    <span className={`badge ${p.mode === "automatic" ? "badge-sent" : "badge-type"}`}>{p.mode}</span>
                  </td>
                  <td className="muted">{scheduleSummary(p)}</td>
                  <td className="muted" style={{ fontSize: "0.85rem" }}>
                    {(businessUnits.find((u) => u.id === p.businessUnitId)?.name ?? "All branches") +
                      (p.itemIds.length > 0 ? ` · ${p.itemIds.length} item(s)` : " · all eligible items")}
                  </td>
                  <td className="muted">{p.lastRunAt ? new Date(p.lastRunAt).toLocaleString("en-IN") : "never"}</td>
                  <td>
                    <label className="toggle">
                      <input type="checkbox" checked={p.enabled} disabled={busy === p.id} onChange={() => toggleEnabled(p)} />
                      <span className="slider" />
                    </label>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: "0.82rem", marginRight: 6 }} disabled={busy === p.id} onClick={() => runNow(p)}>
                      Run now
                    </button>
                    <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: "0.82rem" }} disabled={busy === p.id} onClick={() => remove(p)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
