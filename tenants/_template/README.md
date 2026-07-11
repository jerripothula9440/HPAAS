# Onboarding a new shop

Copy this folder to `tenants/<your-shop-slug>/`, fill in `config.json`, add a
`seed-data.csv` (or skip it and upload CSVs from the dashboard), then run:

```
pnpm db:seed --tenant <your-shop-slug>
```

That inserts the tenant row, default preferences, the four standard segments,
and (if `seed-data.csv` exists) ingests it and computes features. **No code
changes are ever required to onboard a shop.**

## Field-by-field guide to config.json

### `slug`
URL-safe unique identifier. Used as login tenant id and folder name.

### `branding`
- `shopName` — displayed in the dashboard header and used by the AI copywriter.
- `logoUrl` — path or URL to the shop logo (shown in dashboard).
- `colors.primary` / `accent` / `background` — hex colors; the dashboard is
  themed entirely from these via CSS variables.

### `modules`
Which dashboard pages this tenant sees and in what nav order. Disable a module
(`"enabled": false`) and its page and nav entry disappear — components never
check the tenant name, only this config. Available modules: `insights`,
`segments` (AI segment builder), `campaigns`, `loyalty` (the Counter page:
phone lookup, points, recommendations, 1:1 messages), `menu` (catalog that
powers recommendations), `preferences`, `data`, `settings`.

### `loyalty`
Points program (optional — sensible defaults apply if omitted):
- `enabled` — turn the program on/off for this tenant.
- `pointsPerRupee` — earn rate; `0.1` = 1 point per ₹10 spent. Points are
  awarded automatically on every ingested purchase, and backfilled once
  from purchase history on first seed.
- `pointValueRupees` — display value of one point when redeeming.

### `receipts`
The WhatsApp bill sent right after a *live* (streaming `POST /v1/events`)
purchase — CSV uploads are history backfills and never trigger sends
(optional — defaults to enabled):
- `enabled` — send the bill (total, points earned, coupon if issued).
- `showItems` — include itemized lines, not just the total.
- `footerNote` — optional closing line in the shop's voice.

### `coupons`
Personalized coupon codes issued alongside the receipt, stored against the
customer's number (optional — defaults to off). Also editable at runtime
from the dashboard Preferences page:
- `enabled` — master switch; needs at least one tier.
- `tiers[]` — `minAmount` (bill ₹ at or above), `discountType`
  (`percent`|`flat`), `discountValue`, `validityDays`. The highest matching
  `minAmount` wins.
- `minDaysBetweenCoupons` — frequency guard: no customer gets two coupons
  inside this window, however often they shop.
- `codePrefix` — 2-6 letters on generated codes, e.g. `DADU` → `DADU-CP-X7K2M9`.
  Customers redeem by showing the code (POS calls `POST /v1/redemptions`) or
  replying with it on WhatsApp.

### `qrCapture`
Per-order QR codes that capture online (Swiggy/Zomato/ONDC) customers whose
numbers the aggregators won't share (optional — defaults to enabled):
- `enabled` — allow creating QR orders (`POST /v1/qr-orders` or the Data page).
- `messageTemplate` — the pre-drafted WhatsApp message the customer sends;
  must contain `{{token}}` (the order link) and may use `{{shop_name}}`.

### `brandVoice`
Fed verbatim to the AI copy generator (`packages/ai`):
- `tone` — one sentence describing how the shop talks.
- `language` — BCP-47 code, e.g. `en-IN`, `hi-IN`.
- `samplePhrases` — real phrases the shop uses; the model imitates them.
- `avoid` — hard "don't say this" list.

### `festivals`
Drives the festival campaign trigger window and the `festival_buyer` feature:
- `date` — the festival's date **this year** (update annually or add future years).
- `preWindowDays` — festival campaigns may only trigger within this many days
  before `date`; purchases within this window (or on the day) mark a customer
  as a festival buyer.
- `categories` — item categories the festival drives (used in AI copy context).

### `posColumnMapping`
Adapts *your POS's CSV export* to HPAS's internal event shape — this is the
whole point: different POS formats are config, not code.
- `phone` (required) — column holding the customer mobile number. Any format
  is fine (spaces, dashes, leading 0, +91); normalization is centralized.
- `name`, `email`, `locationId` — optional columns; delete the key if your
  export lacks them.
- `amount` (required) — bill total column.
- `items` (required) + `itemsDelimiter` + `itemFormat` + `itemPartsDelimiter` —
  how line items are packed into the items cell. Example cell with the default
  settings: `Kaju Katli|sweets|2|275; Samosa|namkeen|10|20`.
- `timestamp` (required) + `dateFormat` — bill date column and its format
  (dayjs tokens, e.g. `DD/MM/YYYY HH:mm`).

### `channels`
- `whatsapp.number` — the shop's WhatsApp Business number (E.164).
- `email.fromAddress` — used by the email fallback adapter.
- `callList.minLtvThreshold` — lapsed customers with lifetime value above this
  (in ₹) go to the human call list instead of WhatsApp.
