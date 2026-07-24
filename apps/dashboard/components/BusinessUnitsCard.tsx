"use client";

// Business Units (branches/regions) — a tag/filter dimension shared by
// Personalization and Pricing. Managed from either area's Settings page;
// both hit the same GET/PUT /settings/business-units so either place
// stays in sync. The master toggle lets a tenant configure branches and
// still keep the whole feature switched off everywhere (Customers,
// Billing, Menu, Pricing Recommendations all gate on it via
// lib/businessUnits.ts's `active` flag).

import { useEffect, useState } from "react";
import { api } from "../lib/api";

export interface BusinessUnit {
  id: string;
  name: string;
}

interface MenuItemRef {
  id: string;
  name: string;
  category: string;
  businessUnitIds: string[];
}

export default function BusinessUnitsCard() {
  const [units, setUnits] = useState<BusinessUnit[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const [expandedUnitId, setExpandedUnitId] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItemRef[] | null>(null);
  const [itemBusy, setItemBusy] = useState("");

  useEffect(() => {
    api<{ enabled: boolean; units: BusinessUnit[] }>("/settings/business-units")
      .then((r) => {
        setUnits(r.units);
        setEnabled(r.enabled);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  function toggleManageItems(unitId: string) {
    if (expandedUnitId === unitId) {
      setExpandedUnitId("");
      return;
    }
    setExpandedUnitId(unitId);
    if (!menuItems) {
      api<{ items: MenuItemRef[] }>("/menu")
        .then((r) => setMenuItems(r.items))
        .catch((e) => setError(String(e.message ?? e)));
    }
  }

  async function toggleItemInUnit(item: MenuItemRef, unitId: string) {
    setItemBusy(item.id);
    setError("");
    const has = item.businessUnitIds.includes(unitId);
    const nextIds = has ? item.businessUnitIds.filter((id) => id !== unitId) : [...item.businessUnitIds, unitId];
    try {
      await api(`/menu/${item.id}`, { method: "PATCH", body: JSON.stringify({ businessUnitIds: nextIds }) });
      setMenuItems((list) => list?.map((i) => (i.id === item.id ? { ...i, businessUnitIds: nextIds } : i)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setItemBusy("");
    }
  }

  async function save(nextEnabled: boolean, nextUnits: BusinessUnit[]) {
    setBusy("save");
    setError("");
    try {
      const r = await api<{ enabled: boolean; units: BusinessUnit[] }>("/settings/business-units", {
        method: "PUT",
        body: JSON.stringify({ enabled: nextEnabled, units: nextUnits }),
      });
      setUnits(r.units);
      setEnabled(r.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  function toggleEnabled() {
    if (!units) return;
    save(!enabled, units);
  }

  function add() {
    if (!newName.trim() || !units) return;
    save(enabled, [...units, { id: `bu-${Math.random().toString(36).slice(2, 10)}`, name: newName.trim() }]);
    setNewName("");
  }

  function rename(id: string, name: string) {
    if (!units) return;
    setUnits(units.map((u) => (u.id === id ? { ...u, name } : u)));
  }

  function commitRename(id: string) {
    if (!units) return;
    save(enabled, units);
  }

  function remove(id: string) {
    if (!units) return;
    save(enabled, units.filter((u) => u.id !== id));
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Business Units</div>
        <label className="toggle">
          <input type="checkbox" checked={enabled} disabled={!units || busy === "save"} onChange={toggleEnabled} />
          <span className="slider" />
        </label>
      </div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Branches, counters, or regions — tag customers and menu items with one, then filter by it. Off by
        default: switch this on to use it anywhere in the app, and off again any time without losing your list.
      </div>
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

      {!units ? (
        <div className="muted">Loading…</div>
      ) : (
        <div style={{ opacity: enabled ? 1 : 0.5 }}>
          {units.length === 0 ? (
            <div className="muted" style={{ marginBottom: 14 }}>No business units yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {units.map((u) => (
                <div key={u.id}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      value={u.name}
                      onChange={(e) => rename(u.id, e.target.value)}
                      onBlur={() => commitRename(u.id)}
                      style={{ maxWidth: 220 }}
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                      disabled={!enabled}
                      onClick={() => toggleManageItems(u.id)}
                    >
                      {expandedUnitId === u.id ? "Hide items" : "Manage items"}
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                      disabled={busy === "save"}
                      onClick={() => remove(u.id)}
                    >
                      Remove
                    </button>
                  </div>
                  {expandedUnitId === u.id && (
                    <div
                      style={{
                        marginTop: 8,
                        marginLeft: 4,
                        padding: 10,
                        border: "1px solid var(--border, #e2e2e2)",
                        borderRadius: 8,
                        maxHeight: 220,
                        overflowY: "auto",
                      }}
                    >
                      <div className="muted" style={{ fontSize: "0.82rem", marginBottom: 8 }}>
                        Every item on your menu — tick the ones sold at <strong>{u.name}</strong>. Unticking
                        one here does the same thing as unchecking it on Master Data for this branch.
                      </div>
                      {!menuItems ? (
                        <div className="muted" style={{ fontSize: "0.85rem" }}>Loading items…</div>
                      ) : menuItems.length === 0 ? (
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          No items on your menu yet — add some on Master Data first.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {menuItems.map((item) => (
                            <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
                              <input
                                type="checkbox"
                                checked={item.businessUnitIds.includes(u.id)}
                                disabled={itemBusy === item.id}
                                onChange={() => toggleItemInUnit(item, u.id)}
                              />
                              {item.name} <span className="muted">({item.category})</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New business unit name"
              style={{ maxWidth: 220 }}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button className="btn btn-primary" disabled={busy === "save" || !newName.trim()} onClick={add}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
