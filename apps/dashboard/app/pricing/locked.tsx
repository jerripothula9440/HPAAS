// Shared upsell/demo body for every Pricing sub-page when the tenant hasn't
// purchased the module — shown instead of a raw 403. Deliberately shows an
// illustrative (static, non-interactive) preview of Recommendations rather
// than a bare "contact admin" line, so a prospective buyer can see what
// they'd get.

const DEMO_ROWS = [
  { name: "Kaju Katli", current: 450, suggested: 475, change: "+5.5%", trend: "▲", reason: "Demand rising 22% over the last 90 days." },
  { name: "Motichoor Ladoo", current: 320, suggested: 305, change: "−4.7%", trend: "▼", reason: "Demand softened — a small cut helps move stock." },
  { name: "Fruit Cake", current: 150, suggested: 150, change: "0%", trend: "—", reason: "Steady demand — no change suggested." },
];

export default function PricingLocked() {
  return (
    <>
      <div className="page-title">Pricing 🔒 — Demo</div>
      <div className="page-sub">Turn your own sales history into smart, bounded price suggestions.</div>

      <div className="notice" style={{ marginBottom: 20 }}>
        This is a premium add-on, not enabled on your account yet — contact your HPAS admin to
        purchase and unlock it. Everything below is a preview using example data, not yours.
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">What you&apos;d see on Recommendations</div>
        <p className="muted" style={{ marginBottom: 14 }}>
          AI Pricing looks at what&apos;s actually selling (and what isn&apos;t) and suggests
          bounded, explainable price changes per item. Nothing changes automatically — you review
          and apply, one item or all at once — and pipelines can even run this on a schedule for you.
        </p>
        <div style={{ opacity: 0.55, pointerEvents: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Current</th>
                <th className="num">Suggested</th>
                <th className="num">Change</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ROWS.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">₹{r.current.toFixed(2)}</td>
                  <td className="num">₹{r.suggested.toFixed(2)}</td>
                  <td className="num">
                    {r.trend} {r.change}
                  </td>
                  <td className="muted" style={{ maxWidth: 260 }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
