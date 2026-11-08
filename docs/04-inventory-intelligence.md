# StockWise — 04. Inventory intelligence: formulas and rules

Version 0.1 · Phase 1 design · Implemented in `AnalyticsModule` and `AlertsModule`

This module is what makes StockWise more than a stock CRUD app. Every number here is computed with **transparent, explainable** rules. Every recommendation carries:

- the **inputs** it used (so the UI can show "why"),
- a **confidence** level based on how much history exists,
- wording that presents it as an *estimate*, never a guarantee.

All parameters have business-level defaults (`Business.settings`, see 02-data-model §6). Where a product-level override exists, it takes priority.

## 0. Notation

| Symbol | Meaning | Source |
|---|---|---|
| `OH` | On-hand quantity | `StockLevel.quantityOnHand` |
| `OO` | On order: Σ (ordered − received) for purchases in ORDERED / PARTIALLY_RECEIVED | `PurchaseItem` |
| `IP` | Inventory position = `OH + OO` | — |
| `W` | Sales window in days (default 30) | settings |
| `L` | Lead time in days: `product.leadTimeDaysOverride ?? supplier.leadTimeDays ?? 7` | Product / Supplier |
| `R` | Review period in days, i.e. how often the owner reorders (default 14) | settings |
| `S_d` | Safety-stock days (default 3) | settings |
| `MIN` | `product.minStockLevel` (owner-defined threshold) | Product |

## 1. Low-stock detection (brief H.1)

```
status = OUT_OF_STOCK   if OH ≤ 0
       = LOW_STOCK      if 0 < OH ≤ MIN
       = OK             otherwise
```

- Evaluated after every stock movement and nightly (01-architecture §10).
- Uses the owner's own threshold, so it works from day one, before any sales history exists.
- If `MIN = 0`, only out-of-stock fires. The product screen nudges the owner to set a minimum, and shows the computed reorder point (§3) as a suggestion.

## 2. Sales velocity (brief H.4)

**Net units sold** in a window, from the ledger:

```
netSold(W) = Σ |change| of SALE movements
           − Σ change of SALE_VOID movements
           − Σ change of CUSTOMER_RETURN movements          (all within the last W days)
```

**Average daily sales (ADS):**

```
effectiveDays = min(W, days since the product's first stock movement)   -- don't penalise new products
ADS = netSold(W) / effectiveDays
```

The dashboard and product page also show velocity over 7 / 30 / 90 days, so trends are visible.

**Known limitation (stated in the UI and the mémoire):** days when the product was out of stock count as "zero sales". That underestimates true demand. *v2 refinement:* divide by in-stock days only, reconstructed from the ledger's `quantityAfter` history.

## 3. Reorder point (brief H.2)

As specified in the brief:

```
ROP = ADS × L + SS
```

**Safety stock, v1 (simple and explainable):**

```
SS = ADS × S_d          -- "keep S_d extra days of sales as a buffer"
```

**Safety stock, v2 (optional, Business plan):** the statistical form, once at least 30 days of history exist:

```
SS = Z × σ_d × √L       -- σ_d = std. dev. of daily net sales over W; Z = 1.65 for ~95% service level
```

The UI shows which method was used.

**Reorder trigger:** recommend reordering when `IP ≤ ROP`. Using inventory position, not on-hand, means **pending purchases are taken into account** (brief H.3), so the system won't tell you to reorder something already on its way.

## 4. Reorder quantity (brief H.3)

```
target   = product.targetStockLevel                       -- if the owner set one
           ?? ADS × (L + R) + SS                          -- otherwise: cover lead time + review period + buffer
rawQty   = max(0, target − IP)
qty      = reorderMultiple ? ceil(rawQty / reorderMultiple) × reorderMultiple : ceil(rawQty)
```

Recommendations are grouped by default supplier, so an owner can turn them into a draft purchase in one click (`POST /purchases/from-recommendations`).

## 5. Confidence levels

| Level | Condition | Behaviour |
|---|---|---|
| HIGH | ≥ 30 days of history **and** sales on ≥ 10 distinct days | Full recommendation |
| MEDIUM | 14–29 days of history, or sales on 3–9 days | Recommendation + "limited history" warning |
| LOW | < 14 days or < 3 sale days | No ROP-based recommendation. Fall back to `MIN` and `targetStockLevel` only, and say so |

## 6. Worked example (used in tests and the explanation UI)

*Sugar 1 kg* · supplier lead time 5 days · pack of 25 · settings: W = 30, S_d = 3, R = 14.

| Step | Calculation | Result |
|---|---|---|
| Net sold in 30 days | 252 sold − 12 returned | 240 |
| ADS | 240 / 30 | **8 / day** |
| Safety stock | 8 × 3 | 24 |
| Reorder point | 8 × 5 + 24 | **64** |
| Inventory position | OH 50 + OO 0 | 50 → **50 ≤ 64, reorder** |
| Target | 8 × (5 + 14) + 24 | 176 |
| Raw quantity | 176 − 50 | 126 |
| Rounded to packs of 25 | ceil(126 / 25) × 25 | **150** |

**Explanation shown to the user (FR/EN template filled with `params`):**

> You've sold about **8 units a day** over the last 30 days. Your supplier usually delivers in **5 days**, so you need about **40 units** to cover the wait, plus **24** as a safety buffer (3 days of sales). You have **50** in stock and none on order, which is below the reorder point of **64**. **Suggested order: 150** (6 packs of 25). That would bring you to about 200 units, roughly 25 days of sales. *This is an estimate based on past sales, not a guarantee.*

The API returns the numbers (`ads`, `leadTime`, `safetyStock`, `rop`, `ip`, `target`, `qty`, `method`, `confidence`). The sentence is assembled in the frontend from translation templates.

## 7. Slow-moving and dead stock (brief H.5)

For each product with `OH > 0`:

```
daysOfCover = OH / ADS(90)          (∞ if ADS = 0)
DEAD        if no SALE movement in the last deadStockDays (default 90)
SLOW        if netSold(slowMovingDays = 60) > 0 and daysOfCover > 120
OK          otherwise
capitalTiedUp = OH × averageCost
```

The list is sorted by `capitalTiedUp`, because the owner's question is "where is my money stuck?". Products created less than `slowMovingDays` ago are excluded.

## 8. Unusual adjustment detection (brief H.6)

Applied to every `ADJUSTMENT` and `WRITE_OFF` movement. Each rule that fires adds a reason code. If any rule fires, the movement gets `isFlagged = true` and an `UNUSUAL_ADJUSTMENT` alert goes to users with `alerts.manage`. **v1 flags and doesn't block.** The adjustment is saved, and a manager reviews it (acknowledge + note).

| Rule | Fires when | Default | Reason code |
|---|---|---|---|
| R1 Size vs sales | `|q| > maxDaysOfSales × ADS(30)` (only if ADS > 0) | 7 days | `LARGE_VS_SALES` |
| R2 Value | `|q| × averageCost ≥ valueThreshold` | 100,000 BIF | `HIGH_VALUE` |
| R3 Share of stock | negative adjustment and `|q| / quantityBefore ≥ shareOfStock` | 20 % | `LARGE_SHARE_OF_STOCK` |
| R4 Statistical outlier | modified z-score of `|q| × averageCost` vs this business's last 90 days of adjustments `> 3.5` (only with ≥ 10 past adjustments) | 3.5 | `STATISTICAL_OUTLIER` |
| R5 Repeated by one user | same user made `≥ N` negative adjustments today (business time) | 5 | `REPEATED_BY_USER` |

**Modified z-score (Iglewicz & Hoaglin):** `M = 0.6745 × (x − median) / MAD`, where MAD is the median absolute deviation. It's robust to the outliers we're trying to find, unlike mean/std-dev, and easy to explain.

*Later:* adjustments outside business hours, and adjustments made shortly after the same product was sold by the same user.

## 9. Inventory valuation (brief H.7): weighted average cost

**On each incoming movement** (01-architecture §7.2):

```
newAvg = (before ≤ 0) ? inCost : (before × oldAvg + q × inCost) / (before + q)
```

Outgoing movements leave the average unchanged and are costed at the current average.

**Valuation now:** `Σ OH × averageCost` over all stock levels.
**Valuation at past date D:** for each product, take the last movement with `occurredAt ≤ D` and use `quantityAfter × averageCostAfter`. That's why `averageCostAfter` is stored on every movement.
**COGS and gross margin:** `Σ SaleItem.quantity × SaleItem.unitCost` (net of returns). Margin = net revenue − COGS. Margin is only visible to roles with `products.view_cost`.

*Example:* 40 units at average 1,000 BIF, receive 60 at 1,250 → `(40×1000 + 60×1250)/100 = 1,150 BIF`. Selling 30 leaves 70 units at 1,150, valued at 80,500 BIF.

## 10. Dashboard metrics: exact definitions

| Metric | Definition |
|---|---|
| Total products | Non-archived products |
| Total inventory quantity | Σ OH (shown per unit type where mixed) |
| Estimated inventory value | §9, labelled "at average cost" |
| Today's / monthly sales | Σ `Sale.total` for COMPLETED + PARTIALLY_RETURNED sales in business-local day/month, minus returned amounts; count of sales |
| Low / out-of-stock | §1 counts with links to filtered lists |
| Best-selling | Top 10 by net units and by net revenue in the selected range |
| Slow-moving | §7 top 10 by capital tied up |
| Recent movements | Last 20 ledger rows |
| Pending purchases | Count and value of ORDERED + PARTIALLY_RECEIVED |
| Inventory trend | `InventorySnapshot.totalValue` per day for the selected range |

Every number comes from a real query. **No hard-coded or placeholder statistics** (brief §12). Empty states explain what to do ("Record your first sale to see trends").
