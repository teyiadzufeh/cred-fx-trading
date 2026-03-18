# FX Rates & Currency Conversion — Assumptions & Design Decisions

This document captures the assumptions, constraints, and design decisions behind
the FX rate integration and currency conversion system. It is intended for developers
maintaining or extending this codebase.

I had to do a little research about FX Trading and Conversion before carrying out this project, in order to accurately depict conversion vis-a-vis trading

---

## 1. Rate Provider

### Source
Rates are fetched from **exchangerate-api.com** (`v6` API) using the free tier as SUGGESTED IN THE DOCUMENT GIVEN.

- Free tier: 1,500 requests/month
- Endpoint: `GET https://v6.exchangerate-api.com/v6/{apiKey}/latest/USD`
- Set `EXCHANGE_RATE_API_KEY` in `.env` to enable live rates

### Base Currency
All rates are fetched and stored internally with **USD as the base currency**.
This means every rate in the cache represents "how many units of currency X equal 1 USD".

For example:
```
{ USD: 1, NGN: 1580, GBP: 0.79, EUR: 0.92 }
```

### Cross-Rate Formula
When a user converts between two non-USD currencies (e.g. NGN → GBP), the rate
is derived via a cross-rate calculation:

```
rate(A → B) = rates[B] / rates[A]
```

Example — NGN → GBP:
```
rate = 0.79 / 1580 = 0.000500
```

This means 1 NGN = 0.0005 GBP, or 1,580 NGN ≈ 0.79 GBP (≈ 1 USD).

**Assumption**: The cross-rate derived through USD is treated as the true market rate.
No spread, markup, or fee is applied at the rate level. If you need to add a conversion
fee or spread, do it explicitly before dispatching `ConvertCurrencyCommand` — not
inside `FxRateService`.

---

## 2. In-Memory Cache

### TTL
Rates are cached in-memory for **5 minutes** (`CACHE_TTL_MS = 5 * 60 * 1000`).

This means:
- At most 288 API calls per day if traffic is constant
- A user may see a rate that is up to 5 minutes old when calling `GET /fx/rates`
- The rate used in a conversion is the cached rate at the moment the command is dispatched

### Cache Scope
The cache lives on the `FxRateService` singleton instance. It is **per-process and
in-memory** — it is not shared across multiple instances or persisted to a database.

**Assumption**: This app runs as a **single process**. If you scale horizontally
(multiple Node.js instances behind a load balancer), each instance maintains its own
cache. Rates may differ slightly between instances for up to 5 minutes.

**To fix for multi-instance deployments**: Replace the in-memory cache with a
shared cache (e.g. Redis via `@nestjs/cache-manager` with a Redis store). The
`FxRateService` interface does not need to change — only `fetchAndCache()` and
`isCacheValid()` need to be adapted.

### Stale Cache Fallback
If a live API fetch fails (network error, API downtime, rate limit exceeded), the
service falls back to the most recently cached rates regardless of their age.
This means rates could be older than 5 minutes during an outage.

If no cache exists at all and the API fails, the service falls back to
**hardcoded mock rates**. This prevents the app from crashing but means
conversions will proceed at static rates. A warning is logged in both cases.

---

## 3. Rate Locking

### When the Rate is Locked
The FX rate for a conversion is fetched **before the database transaction is opened**.

```
rate = await fxRateService.getRate(from, to)   // ← outside queryRunner
queryRunner.startTransaction()                  // ← DB transaction starts after
```

**Why**: Making an HTTP call to an external API while holding a pessimistic DB lock
would keep the wallet rows locked for the duration of the network round-trip. This
increases contention and the risk of deadlocks under load.

### Rate Validity Window
Between the moment the rate is fetched and the moment the DB commits, up to a few
milliseconds may pass. The rate used is the one fetched at dispatch time — the user
gets the rate they were shown, not one that shifted mid-write.

**Assumption**: The rate quoted to the user and the rate used in the transaction
are the same. There is no re-validation of the rate inside the DB transaction.
This is acceptable because the cache TTL is 5 minutes — rates do not change
between fetching and committing in that window.

### Rate Storage
The rate used in every conversion is stored immutably in `rate_used` on both the
debit and credit `Transaction` records. This is the audit anchor — it records
exactly what rate was applied at the time of the transaction and cannot be changed
after the fact.

---

## 4. Supported Currencies

The supported currencies are defined in `src/common/enums/index.ts`:

```typescript
export enum Currency {
  NGN = 'NGN',
  USD = 'USD',
  GBP = 'GBP',
  EUR = 'EUR',
}
```

Only currencies in this enum can be used in wallets or conversions. When rates are
fetched from the API, only these currencies are extracted from the response — all
others are discarded.

**To add a new currency**: Add it to the `Currency` enum. The FX service will
automatically include it in the next cache refresh. No other changes are needed
unless the new currency requires special handling.

---

## 5. NGN Constraint

### Rule
**Every conversion must involve NGN on one side.**

- ✅ NGN → USD
- ✅ GBP → NGN
- ❌ USD → GBP (rejected with 400)
- ❌ EUR → GBP (rejected with 400)

This constraint is enforced in `ConvertCurrencyHandler` before any DB or rate
operations begin.

### Rationale
This is a deliberate product constraint, not a technical limitation. The system
is designed as a NGN-anchored wallet product — NGN is the base liquidity currency.
All foreign currency holdings are acquired via NGN and liquidated back to NGN.

This also simplifies the rate model: since NGN is always on one side, the cross-rate
through USD is always well-defined for supported currency pairs.

### `/wallets/convert` vs `/wallets/trade`

Both endpoints dispatch `ConvertCurrencyCommand` and enforce the NGN constraint.
They differ in their interface:

| | `/wallets/convert` | `/wallets/trade` |
|---|---|---|
| Interface | Caller specifies `fromCurrency` and `toCurrency` explicitly | Caller specifies `direction` (buy/sell) and a foreign `currency` |
| NGN position | Explicit — caller must ensure NGN is on one side | Implicit — direction model always places NGN on one side |
| Use case | Direct programmatic swap | User-facing trading UI |

For `/wallets/trade`:
- `BUY` means "spend NGN to acquire the foreign currency" → `fromCurrency = NGN`
- `SELL` means "sell the foreign currency to receive NGN" → `toCurrency = NGN`

---

## 6. Decimal Precision

### Storage
All monetary amounts are stored as `DECIMAL(20, 4)` in PostgreSQL — 4 decimal
places for balances and transaction amounts.

FX rates are stored as `DECIMAL(20, 6)` — 6 decimal places to preserve precision
for small-value pairs (e.g. NGN → USD where the rate is ~0.000633).

### Computation
All balance arithmetic uses `Number.parseFloat(...toFixed(4))` to round to 4 decimal
places after each operation. This prevents floating-point drift from accumulating
across many transactions.

**Assumption**: 4 decimal places is sufficient for all supported currencies.
Sub-kobo precision is not required for NGN; sub-cent precision is not required
for USD/GBP/EUR at the amounts this system handles.

### TypeORM Decimal Transformer
PostgreSQL returns `DECIMAL` columns as strings. All `balance` and `rate_used`
columns use a TypeORM column transformer to parse them back to `number`:

```typescript
transformer: {
  to: (value: number) => value,
  from: (value: string) => Number.parseFloat(value),
}
```

Without this, balance comparisons like `wallet.balance < amount` would silently
compare a string to a number and always pass.

---

## 7. Transaction Records

Every conversion produces **two transaction records** linked by a shared reference:

| Record | `type` | `walletId` | `amount` | `reference` |
|---|---|---|---|---|
| Debit | `DEBIT` | source wallet | original amount in `fromCurrency` | `CONV-XXXX-DEBIT` |
| Credit | `CREDIT` | destination wallet | converted amount in `toCurrency` | `CONV-XXXX-CREDIT` |

Both records share:
- `action: CONVERSION`
- `status: COMPLETED` (set immediately — conversions are synchronous and internal)
- `rateUsed` — the locked rate
- `sourceCurrency` and `destinationCurrency`
- `metadata.conversionReference` — the shared `CONV-XXXX` reference for cross-lookup

**Assumption**: Conversions are treated as immediately completed. There is no
`PENDING` state for internal conversions because there is no external payment
provider involved — the entire operation is atomic within a single DB transaction.

---

## 8. Wallet design
To support the multi-currency system, a user is allowed to have multiple entries on the wallets table but not more than one for each currency, using strict checks all-round.

## 9. What This System Does Not Handle

The following are out of scope and would need to be added explicitly:

- **Conversion fees / spread**: No fee is currently deducted from conversions.
  To add a fee, calculate it before dispatching the command and either deduct it
  from the source amount or add it as a separate transaction record.

- **Rate slippage protection**: There is no maximum acceptable slippage check.
  If the rate shifts between when it is shown to the user and when the command
  is dispatched, the new rate is used silently. To protect against this, accept
  an optional `expectedRate` and `slippageTolerance` in the DTO and reject the
  conversion if `Math.abs(rate - expectedRate) / expectedRate > slippageTolerance`.

- **Multi-instance cache consistency**: See Section 2. Use Redis for horizontal scaling.

- **Regulatory / CBN compliance**: No checks are performed against CBN FX
  transaction limits or reporting requirements. These must be added as a separate
  compliance layer.

- **Reversal of conversions**: The `ReverseTransactionCommand` operates on a single
  transaction record. Reversing a conversion requires reversing both the debit and
  credit records and restoring both wallet balances. This is not currently implemented.