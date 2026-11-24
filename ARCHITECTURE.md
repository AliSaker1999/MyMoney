# My Money: Architecture (v2, approved)

Offline-only personal finance app for Android. USD and LBP, multiple accounts,
reports, budgets, savings goals, debts, encrypted manual backup and restore.

**Status:** v2 approved with amendments 1–4 and the M0 review notes (see [Decisions](#decisions)).
**M0 validation was formally accepted on 2026-11-18. M1–M4 were completed on
2026-11-18.** See [STATUS.md](STATUS.md) for current progress and
`docs/m0-compatibility-report.md` for M0 validation results.

M0 tested a Xiaomi 13 Pro physical device on Android API 36 and a Google Play x86_64 emulator on
API 34. The API 36.1 system image was installed, but its AVD was unstable, with System UI crashes
and `surfaceflinger` aborts, and did not complete app-level validation. These are tested
configurations, not a formally defined Android minimum or supported API range; no such support
policy has been decided.

Hard constraints: no backend, hosting, cloud database, Firebase, Supabase, paid APIs or
analytics. Financial data never leaves the device except in a user-initiated, password-encrypted
backup file.

---

## 1. Stack (pinned to Expo SDK 58)

| Layer | Choice |
|---|---|
| Runtime | Expo SDK 58, React Native 0.88 (New Architecture), React 19.3, Hermes |
| Language | TypeScript 6 in strict mode, plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noImplicitOverride` |
| Navigation | Expo Router (file routes in `src/app/`) |
| Storage | `expo-sqlite` with **SQLCipher** (`useSQLCipher: true`) |
| State | Redux Toolkit, limited to **RTK Query** (with `queryFn` calling repositories) and the `session` and `settings` slices |
| UI | React Native Paper (MD3) with a custom theme |
| Charts | `react-native-gifted-charts` (built on `react-native-svg`) |
| Crypto | `expo-crypto` (random bytes, native AES-256-GCM), `@noble/hashes` (production scrypt); QuickCrypto is the preferred replacement candidate for evaluation, pending production acceptance |
| Secrets | `expo-secure-store` (Android Keystore, iOS Keychain) |
| App lock | `expo-local-authentication` (biometrics with device-passcode fallback), `expo-screen-capture` (FLAG_SECURE) |
| i18n | `expo-localization`, `intl-pluralrules`, `i18next`, `react-i18next` |
| Validation | `zod` (backup files and form input at the boundaries) |
| Builds | Development builds (`expo-dev-client`). Expo Go is not supported because SQLCipher is native code. |

There is no ORM, `expo-updates`, analytics, crash reporting or network library. The allowlist
test in `tests/policy/dependencies.node.test.ts` enforces this.

## 2. Layers

```
src/app/            Expo Router route files only (thin)
src/features/*      per-feature components and hooks
src/store           RTK Query api (queryFn → repositories, cache tags) + session/settings slices
src/services        use cases: ledgerService, backupService, restoreService (validation + atomic writes)
src/db              DbDriver, SQLCipher open/key, migrations, named SQL registry, repositories
src/domain/money    pure TS: integer money, rates, rounding, parse/format (no React, no DB)
src/i18n            resources, formatters, direction handling
src/security        key lifecycle, app lock, backup crypto
```

- **SQLite is the single source of truth.** Redux never holds a copy of the ledger. Writes
  invalidate RTK Query tags (`Account`, `Transaction`, `Report`, …).
- **`DbDriver`** (`run`, `all`, `get`, `exec`, `exclusiveTransaction`) is the one deliberate
  abstraction. It lets the same repositories and migrations run on `better-sqlite3` in Jest.
  Expo SDK 58's `withExclusiveTransactionAsync` opens a new connection and starts `BEGIN` before
  its callback; that connection has no SQLCipher key, and foreign keys cannot be enabled inside an
  active transaction. The Expo adapter therefore opens a separate connection, applies/verifies
  SQLCipher, enables foreign keys and WAL, and then runs `BEGIN EXCLUSIVE`. A driver mutex
  serializes all operations through the app's connection. This preserves the required keyed,
  foreign-key-enforced exclusive writes without using that SDK helper.
- **SQL registry (D1):** all SQL lives in `src/db/sql/*.sql.ts` as named, parameterized
  statements. Values are always bound. Business invariants live in SQL **views and triggers**.
  The **only** exception is `PRAGMA key` / `PRAGMA rekey` (`src/db/sqlcipherKey.ts`), which is
  built only from 32 bytes the app generated itself.

## 3. Folder structure

```
mymoney/
├─ src/
│  ├─ app/                         # routes only
│  │  ├─ _layout.tsx               # providers, DB bootstrap, lock gate
│  │  ├─ lock.tsx  recovery.tsx
│  │  ├─ onboarding/…
│  │  ├─ (tabs)/ _layout, index (Dashboard), transactions, reports, planning, more
│  │  ├─ transaction/ new.tsx, [id].tsx
│  │  ├─ accounts/ categories/ rates/ budgets/ goals/ debts/ backup/ settings/
│  │  └─ spike.tsx                 # M0 compatibility spike (dev, or EXPO_PUBLIC_SPIKE=1)
│  ├─ domain/money/  domain/ledger/
│  ├─ db/ driver.ts expoDriver.ts client.ts sqlcipherKey.ts migrations/ sql/ repositories/
│  ├─ services/  security/  store/  features/  i18n/  ui/  utils/
│  └─ spike/                       # M0 spike code and shared test vectors
├─ tests/                          # *.node.test.ts (better-sqlite3, crypto, policy)
├─ plugins/withAndroidPrivacy.js   # backup and device-transfer exclusion
├─ scripts/ build-android-release.ps1 verify-release.mjs
├─ e2e/maestro/
├─ docs/
└─ app.config.ts eslint.config.js jest.config.js tsconfig.json
```

## 4. Database schema (`0001_init`, written in M2)

Conventions:
- Money is `INTEGER` minor units, signed (positive means into the account).
- Every connection runs `PRAGMA foreign_keys=ON` and `journal_mode=WAL`.
- **Date columns** (`YYYY-MM-DD`) use `CHECK (date(col) IS col)`, so only real calendar dates are
  accepted (amendment 4). Verified on both engines in M0. The TypeScript layer validates as well.
- **Month columns** (`YYYY-MM`) use `CHECK (date(col || '-01') IS col || '-01')`.
- **Timestamps** are UTC ISO-8601 from `toISOString()` and use
  `CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', col) IS col)`. To be verified on both engines in M2.
- Balances are **never stored**. They are always derived from entries.

```sql
CREATE TABLE rate_sources (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,                          -- 'market','official','custom' (built-in); NULL = user-made
  name TEXT,                                 -- user-made only; built-ins use i18n keys
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0,1)),
  archived_at TEXT, created_at TEXT NOT NULL,
  CHECK (code IS NOT NULL OR name IS NOT NULL)
);

CREATE TABLE exchange_rates (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES rate_sources(id) ON DELETE RESTRICT,
  effective_date TEXT NOT NULL CHECK (date(effective_date) IS effective_date),
  effective_seq INTEGER NOT NULL DEFAULT 0,  -- several quotes per source per day
  lbp_per_usd_e4 INTEGER NOT NULL CHECK (lbp_per_usd_e4 BETWEEN 1 AND 1000000000000),
  note TEXT, created_at TEXT NOT NULL,
  UNIQUE (source_id, effective_date, effective_seq)
);
CREATE INDEX ix_rates_lookup ON exchange_rates(source_id, effective_date DESC, effective_seq DESC);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','bank','card','wallet','savings','other')),
  currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
  include_in_net_worth INTEGER NOT NULL DEFAULT 1 CHECK (include_in_net_worth IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0, archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_accounts_name_active ON accounts(name COLLATE NOCASE) WHERE archived_at IS NULL;
-- trg_accounts_currency_lock: currency is immutable once the account has entries

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT,                                 -- user-created
  builtin_key TEXT UNIQUE,                   -- seeded: i18n key, translates on language switch
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  icon TEXT, color TEXT, sort_order INTEGER NOT NULL DEFAULT 0, archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (name IS NOT NULL OR builtin_key IS NOT NULL)
);
CREATE INDEX ix_categories_parent ON categories(parent_id);
-- trigger: a subcategory has the same kind as its parent

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN
    ('income','expense','refund','transfer','opening_balance','adjustment','debt')),
  date TEXT NOT NULL CHECK (date(date) IS date),
  -- rate snapshot: immutable unless the user explicitly edits it
  lbp_per_usd_e4 INTEGER NOT NULL CHECK (lbp_per_usd_e4 BETWEEN 1 AND 1000000000000),
  rate_origin TEXT NOT NULL CHECK (rate_origin IN ('source','manual','implied','inherited')),
  rate_source_id INTEGER REFERENCES rate_sources(id) ON DELETE RESTRICT,
  rate_source_label TEXT,                    -- label as shown at save time
  rate_id INTEGER REFERENCES exchange_rates(id) ON DELETE SET NULL,   -- provenance only
  rate_date TEXT CHECK (rate_date IS NULL OR date(rate_date) IS rate_date),
  parent_transaction_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT,
  link_type TEXT CHECK (link_type IN ('transfer_fee','debt_interest')),
  payee TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK ((parent_transaction_id IS NULL) = (link_type IS NULL)),
  CHECK (rate_origin <> 'source'    OR rate_source_id IS NOT NULL),
  CHECK (rate_origin <> 'implied'   OR kind IN ('transfer','debt')),
  CHECK (rate_origin <> 'inherited' OR parent_transaction_id IS NOT NULL)
);
CREATE INDEX ix_tx_date ON transactions(date, id);
CREATE UNIQUE INDEX ux_tx_one_link ON transactions(parent_transaction_id, link_type)
  WHERE parent_transaction_id IS NOT NULL;
-- trg_tx_kind_immutable

CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0
    AND amount_minor BETWEEN -100000000000000 AND 100000000000000),
  usd_minor INTEGER NOT NULL,                -- equivalent at the snapshot rate, computed with BigInt
  lbp_minor INTEGER NOT NULL,
  memo TEXT,
  CHECK ((currency='USD' AND usd_minor = amount_minor) OR (currency='LBP' AND lbp_minor = amount_minor)),
  CHECK ((amount_minor > 0 AND usd_minor >= 0 AND lbp_minor >= 0) OR
         (amount_minor < 0 AND usd_minor <= 0 AND lbp_minor <= 0))
);
CREATE INDEX ix_entries_txn      ON entries(transaction_id);
CREATE INDEX ix_entries_account  ON entries(account_id, transaction_id);
CREATE INDEX ix_entries_category ON entries(category_id) WHERE category_id IS NOT NULL;
-- entry triggers (insert+update): currency = account currency; category kind and sign match the transaction kind

CREATE TABLE budgets (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period = 'monthly'),
  start_month TEXT NOT NULL CHECK (date(start_month || '-01') IS start_month || '-01'),
  end_month TEXT CHECK (end_month IS NULL OR date(end_month || '-01') IS end_month || '-01'),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ix_budgets_category ON budgets(category_id, start_month);

CREATE TABLE goals (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
  target_minor INTEGER NOT NULL CHECK (target_minor > 0),
  target_date TEXT CHECK (target_date IS NULL OR date(target_date) IS target_date),
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  achieved_at TEXT, archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE goal_contributions (            -- earmarks, NOT money movements
  id INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (date(date) IS date),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  note TEXT, created_at TEXT NOT NULL
);
CREATE INDEX ix_goal_contrib ON goal_contributions(goal_id, date);

CREATE TABLE debts (
  id INTEGER PRIMARY KEY, counterparty TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('i_owe','owed_to_me')),
  currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
  start_date TEXT NOT NULL CHECK (date(start_date) IS start_date),
  due_date TEXT CHECK (due_date IS NULL OR date(due_date) IS due_date),
  note TEXT, settled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE debt_movements (                -- outstanding = SUM(amount_minor)
  id INTEGER PRIMARY KEY,
  debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE RESTRICT,
  transaction_id INTEGER UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (date(date) IS date),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),   -- debt currency; + = owed more
  note TEXT, created_at TEXT NOT NULL
);
CREATE INDEX ix_debt_mov_debt ON debt_movements(debt_id, date);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);   -- data settings (in backups)
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,
                                checksum TEXT NOT NULL, applied_at TEXT NOT NULL);

-- views: v_account_balances, v_categorized_flows (the ONLY source for income/expense/budget
-- reports), v_debt_outstanding, v_ledger_violations (transaction_id, rule)
```

**Settings are split in two:**
- **Data settings** live in `settings` and are restored from backups: preferred rate source,
  staleness threshold, display currency.
- **Device settings** live in SecureStore and are never in a backup: app lock, auto-lock timeout,
  UI language, digit style.

**Migrations** are forward-only TypeScript modules `{version, name, statements[]}`. Each runs
in its own transaction and updates `PRAGMA user_version` and `schema_migrations` (with a checksum).
Before migrating an existing database, the app copies the encrypted file to `safety/`.

## 5. Ledger rules

| Kind | Entries | Category | Sign | In income/expense? |
|---|---|---|---|---|
| income | ≥1, one account | income | + | yes |
| expense | ≥1, one account (splits) | expense | − | yes |
| refund | ≥1, one account | expense | + | yes (negative spending) |
| transfer | exactly 2, two different accounts, one − and one + | none | ± | **no** |
| opening_balance | exactly 1 | none | ± | no |
| adjustment | exactly 1 | none | ± | no (shown as "Balance adjustments") |
| debt | exactly 1, plus exactly 1 debt_movement | none | ± | no |

| # | Invariant | Enforced by |
|---|---|---|
| I1 | Atomic save (header + entries + links + debt movement) | `ledgerService`, `withExclusiveTransactionAsync` |
| I2 | Valid account and category references; no new entries to archived accounts | FK `RESTRICT`, service |
| I3 | Entry currency = account currency; account currency locked once used | triggers |
| I4 | Category kind and sign match transaction kind | triggers |
| I5 | Native equivalent = amount; equivalents never flip sign | row CHECKs |
| I6 | Entry counts and account rules per kind | `v_ledger_violations`, checked before commit |
| I7 | Transfer: `SUM(usd_minor)=0 AND SUM(lbp_minor)=0` | construction (§7.4) + before-commit check |
| I8 | Fee link: expense child with 1 entry, transfer parent, same date, fee account ∈ transfer accounts, at most one | trigger + unique index + check |
| I9 | Debt txn has exactly 1 movement; movement direction matches the entry sign for the debt direction | before-commit check |
| I10 | Balances match the ledger | derived only; Data Health runs `integrity_check`, `foreign_key_check`, `v_ledger_violations` |

**Before commit:** inside the same exclusive transaction the service runs
`ledger.violationsForTransaction(:id)` and throws if anything is returned, which rolls back
everything.

**Edit** is one exclusive transaction: update the header, delete and re-insert entries (same id),
recompute equivalents, update links, run the check. **Kind is immutable.**

**Delete** is one exclusive transaction. For a transfer with a fee the user is asked "delete the
fee too?" (default yes). "Keep" explicitly unlinks the fee first.

**Debts:** cross-currency repayment is allowed (Q3). The user enters both amounts, and the
transaction uses `rate_origin='implied'`. Interest is a linked expense (`link_type='debt_interest'`).

## 6. Exchange rates

- Built-in sources **Market, Official, Custom**, plus user-created sources. **No rate values are
  seeded.**
- Several sources per date, and several quotes per source per date (`effective_seq`).
- The preferred source is the `preferred_rate_source_id` data setting.
- **Lookup** for date D and source S: the latest quote from S with `effective_date ≤ D`, highest
  `seq`. The form shows source, quote date and value. If the quote is more than **7 days** older
  than D, a staleness warning appears and must be acknowledged (Q4).
- **No silent substitution:** if S has no quote on or before D, saving is blocked until the user
  picks another source, a specific quote, or a manual rate.
- **Snapshot** on every transaction: value, origin, source, label, quote id and quote date.
  Editing or deleting a quote never changes existing transactions. Changing a transaction's date
  asks "keep rate / select rate for new date".

## 7. Money

### 7.1 Representation
- USD has 2 decimals (scale 100). LBP has 0 decimals (scale 1).
- `R = lbp_per_usd_e4`, in the range [1, 10¹²].
- `MAX_ENTRY = 10¹⁴` minor units.

### 7.2 Conversion (BigInt)
```
LBP → USD cents:  usd = roundHalfEven(lbp × 10⁶ / R)
USD → LBP:        lbp = roundHalfEven(usd × R / 10⁶)
Implied rate:     R   = roundHalfEven(lbp × 10⁶ / usd)       (display/provenance only)
```
`roundHalfEven(n, d)` with `d > 0`:
1. `q = n / d` (truncated), `r = n % d`.
2. If `2|r| > d`, move one step away from zero.
3. If `2|r| == d` and `q` is odd, move one step away from zero.

The result must be within ±MAX_ENTRY, otherwise `ConversionOverflowError`.

### 7.3 Rounding policy
- Half-to-even, applied **once per entry at write time**. Totals are sums of the stored
  equivalents.
- A split's converted total may differ by a few minor units from converting the gross amount.
  This is expected and documented.
- Display never rounds.

### 7.4 Transfers
- Same currency: the legs are ±a.
- Cross currency: the USD leg sets both legs' `usd_minor`, and the LBP leg sets both legs'
  `lbp_minor`. Both currencies balance to exactly zero without any rounding.

### 7.5 Overflow
- Input: string → BigInt → range check.
- Conversion: BigInt intermediates, then a result range check.
- Every SQL `SUM` is returned as `CAST(SUM(x) AS TEXT)` and parsed to BigInt, so JavaScript's
  2⁵³ limit never applies to totals.
- SQLite int64 overflow raises an error, which is surfaced rather than hidden.
- ESLint bans `parseFloat`, `Number()`, `toFixed` and `Math.round` in money code (added in M1).

### 7.6 Edits and rates
Any edit recomputes the equivalents from native amount × snapshot rate. The snapshot rate changes
only through an explicit user action. There is no bulk re-rate in v1.

### 7.7 Historical vs current valuation
- **Flows** (income, expense, budgets, cash flow) use the stored equivalents, i.e. the rate at the
  time of each transaction.
- **Net worth today** uses native balances × the latest quote of the preferred source. The source,
  date and value are always shown.
- **Net worth at date D** uses the quote of the selected source on or before D. If there is no
  quote, the point is a **gap**, not a substitute.
- Native per-currency totals are always available.

### 7.8 Required tests (M1)
- **Boundaries:** 0 rejected, ±1, ±MAX accepted, ±(MAX+1) rejected; R = 1 and R = 10¹²; overflow
  at MAX with R = 10⁴.
- **Exact conversions:**
  - 895,000 LBP ↔ 1,000 cents at R = 895,000,000
  - a rate of 1507.5 round-trips exactly
- **Half-even ties at R = 2·10⁶:**
  - lbp 1 → 0, lbp 3 → 2, lbp 5 → 2
  - lbp −1 → 0, lbp −3 → −2
  - values just below and above .5
- **Tiny amounts:** 1 LBP at 89,500 → 0 cents.
- **Parsing:**
  - accepted: `"1,234.56"`, `"١٬٢٣٤٫٥٦"`
  - rejected: `"0.005"` (USD), `"1.5"` (LBP), `"1e3"`, `"--1"`, empty
  - rates: 4 decimals accepted, 5 rejected
- **Properties:**
  - `parse(format(x)) = x`
  - round trip within ±1
  - exact BigInt sums
  - transfers sum to 0 in both currencies
  - a model-based random create/edit/delete sequence keeps balances equal to an in-memory model,
    with zero violations

## 8. Transfer fees (v1)

- A fee is a **separate expense transaction**: `parent_transaction_id` points to the transfer,
  `link_type='transfer_fee'` and `rate_origin='inherited'`.
- The transfer stays exactly two balanced legs. The user chooses "Fee charged to:
  source/destination", and it must be one of the transfer's two accounts.
- Both are created, edited (date and rate stay in sync) and deleted in one exclusive transaction.
- The UI loads them together with `transactions.withLinkedFee(:id)`.
- Tests:
  - the source balance changes by −(amount + fee) exactly once
  - spending reports include the fee and exclude the transfer
  - a second fee on the same transfer is rejected

## 9. Security

### 9.1 SQLCipher key lifecycle (amendment 1)

The key is 32 bytes from `expo-crypto` `getRandomBytesAsync`, stored in SecureStore `mm.dbkey.v1`
with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and `requireAuthentication: false`. The key is **not** tied
to biometrics, because biometric re-enrolment would destroy it. It is applied with
`PRAGMA key = "x'<hex>'"` and verified with `SELECT count(*) FROM sqlite_master`.

**Rules:**

- **K1.** If `mm.dbkey.v1` exists, the app **never generates a new key and never writes to that
  entry.** The only code path that may replace it is **Reset** after a typed confirmation.
- **K2.** The app generates a key only when SecureStore returns `null`. It writes, reads back and
  compares before creating any database. A single-flight guard prevents two bootstraps from
  racing.
- **K3.** Startup states:

| Key | Main DB | Action |
|---|---|---|
| present | present, opens | normal |
| present | **missing** | Look for `safety/*.db`, `quarantine/*.db` and `replaced-*.db`. If any exist, offer **recovery** from them (each is tried with the existing key and listed with date and row counts). If none exist, or the user declines, create a **fresh DB with the existing key**. The key is never regenerated. |
| present | present, won't open (wrong key or corrupt) | Move the file to `quarantine/`, then show the recovery screen: restore from `safety/`/`quarantine/`/`replaced-*`, restore from a backup file, or Reset |
| absent | present | "Data can't be unlocked on this device." Move the file to `quarantine/`, then: restore from a backup file, or Reset |
| absent | absent | first run: K2 |

- **K4. Reset** (typed confirmation) is the only operation allowed to delete the key. It
  generates a new key and creates an empty DB. Quarantined files are kept until the user deletes
  them explicitly.
- **Tests (M4):**
  - a pre-existing key is never overwritten in any state
  - the "key present, DB missing" path lists candidates from safety/quarantine/replaced
  - recovery opens a candidate with the existing key
  - declining recovery creates a fresh DB with the **same** key
  - only Reset changes the key
  - concurrent bootstrap creates one key

### 9.2 App lock (D6, Q1)
- Optional, **on by default**. Uses biometrics, falling back to the device passcode.
- If the device has no lock at all, the app lock can't be enabled and a notice explains why.
- Auto-lock after 1 minute in the background by default (also: immediately, 5 or 15 minutes).
- A privacy overlay is shown when the app is `inactive`.
- **FLAG_SECURE follows the app-lock setting.**

### 9.3 OS backups and device migration
- Android: `allowBackup=false`, and `plugins/withAndroidPrivacy.js` writes `fullBackupContent`
  and `dataExtractionRules` excluding every domain for **cloud-backup and device-transfer**.
  `expo-secure-store`'s own backup rules are disabled.
- iOS device backups may contain the SQLCipher file **as ciphertext**. The key is device-only, so
  that file is unreadable on another device.
- The only migration path is an encrypted backup file. Onboarding offers "Restore from backup"
  first.

## 10. Backup and restore

### 10.1 File format v1 (`*.mymoney`)
```json
{ "format": "mymoney-backup", "formatVersion": 1, "createdAt": "…", "appVersion": "…",
  "schemaVersion": 1,
  "kdf":    { "alg": "scrypt", "N": 65536, "r": 8, "p": 1, "salt": "<b64 16 bytes>" },
  "cipher": { "alg": "AES-256-GCM", "iv": "<b64 12 bytes>", "tagLength": 16 },
  "ciphertext": "<b64>" }
```
- **AAD** is the canonical JSON of every header field except `ciphertext`.
- **Plaintext** is UTF-8 JSON `{ manifest: {schemaVersion, rowCounts, accountBalances,
  tableDigests}, tables }`.
- Encryption protects bytes. The manifest protects against an incomplete or inconsistent dump.

### 10.2 KDF (amendment 2)
- **Writing:** r = 8, p = 1. The approved conditional future target is **N = 131,072 (2¹⁷)**
  with QuickCrypto, but only if its production acceptance gates pass and the owner approves the
  production migration. This target does not approve QuickCrypto for production or select a
  production write N today. Noble remains the active production implementation; its measured
  timings do not meet the budget-phone performance target. Do not silently lower N as a workaround:
  if QuickCrypto is not accepted, the owner must decide how to resolve the timing requirement.
  The Xiaomi 13 Pro is a flagship, so its timings are a **best case**; the roughly **4× slower**
  budget-phone estimate is not a substitute for testing representative budget devices.
- **Reading:** accept only a power-of-two N with **2¹⁴ ≤ N ≤ 2¹⁷**, **r ≤ 8**, **p ≤ 1**,
  dkLen = 32 and a 16-byte salt. Anything else is rejected before any key derivation (this blocks
  a header crafted to exhaust memory).
- **Password:** at least **12 characters** (Q4), entered twice, with a strength hint and a
  warning that a lost password cannot be recovered.

### 10.3 Export
1. Take a consistent read snapshot and build the manifest.
2. Run scrypt, then AES-GCM. The plaintext stays in memory only.
3. Write `.part`, then rename.
4. **Read the file back, decrypt and compare the manifest.**
5. Open the share sheet, then delete the cached file.
6. `last_backup_at` is set only after verification. Leftover `.part` files are removed on
   startup.

### 10.4 Restore (journaled)
1. Pick the file. Check free space (≥ 3× the file size). Check the header (format, version, KDF
   bounds).
2. Password → scrypt → AES-GCM. Failure shows **"Wrong password or damaged file"**.
3. zod validation; manifest counts and digests must match.
4. **Explicit confirmation** with a typed word.
5. **Automatic safety copy:** WAL checkpoint, then copy the encrypted file to
   `safety/pre-restore-<ts>.db` (the last 3 are kept).
6. Journal `building`. Build `restore-<ts>.db` with the **same device key**: migrate to the
   backup's schema, insert all rows in one exclusive transaction, migrate to current, then run
   integrity, FK, ledger-violation and balance-vs-manifest checks. On any failure, delete the
   target; the current DB is untouched.
7. Journal `swapping`. Close, rename current → `replaced-<ts>.db`, rename target →
   `mymoney.db`, reopen and verify. On failure, rename back.
8. Clear the journal. Reset the RTK Query cache. Device settings are kept.

**Startup recovery:**
- `building` → delete the target.
- `swapping` → if the main DB opens, finish; else if the target exists, complete the rename; else
  restore `replaced-*` or `safety/`.

**Tests:**
- golden backup files in both directions (device ↔ Node WebCrypto)
- truncated files; flipped bits in ciphertext, tag, IV, salt and every AAD field
- invalid JSON or magic; future format or schema version
- KDF parameters out of bounds (N = 2¹⁸, r = 9, p = 2, N not a power of two)
- zod-invalid content, manifest mismatch, FK-violating rows
- killing the process at every journal state

## 11. Localization (English + Arabic)

- `expo-localization` + `i18next` + `react-i18next`. `en.json` and `ar.json` have typed keys,
  and a test checks that keys and placeholders match. Seeded categories and sources use
  `builtin_key`.
- `intl-pluralrules` is imported before i18next initialization. Its bundled locale rules are
  available offline, including Arabic cardinal categories.
- The language defaults to the device language and is a device setting.
- **RTL:** `I18nManager.allowRTL(true)` + `forceRTL(lang === 'ar')`, then `reloadAppAsync()` from
  `expo`. No `expo-updates`.
- **Layout:**
  - use only `start`/`end` (lint bans `left`/`right` margins and padding in `src/`)
  - directional icons are mirrored
  - chart time axes stay left to right
- **Money formatting:**
  - our own BigInt formatter, independent of the UI language
  - decimal places come from the currency
  - digit style is a device setting with **Western digits by default** (Q2)
  - currency labels follow the language
  - amounts are wrapped in Unicode FSI…PDI so they aren't reordered inside RTL text
  - `Intl` is not used for money
- **Input:** accepts Western, Arabic-Indic and Persian digits and both separator sets.
- **Dates:** stored as ISO Gregorian. Displayed by our own formatter using month names from the
  translation files (including Levantine Arabic names), so Jest output matches Hermes.
- **Tests:**
  - key parity
  - formatter snapshots for every currency × digit style × sign
  - RNTL renders in LTR and RTL
  - Maestro flows and screenshots in both languages
  - `react/jsx-no-literals`

## 12. Privacy and release verification

- **Code:** ESLint bans `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
  `navigator.sendBeacon` and network or telemetry packages in `src/`.
- **Dependencies:** an allowlist test, plus a list of never-allowed packages.
- **Android release** (`APP_VARIANT=production`): `blockedPermissions` removes `INTERNET`,
  `ACCESS_NETWORK_STATE`, `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`, `VIBRATE`, and
  `expo-screen-capture`'s `READ_MEDIA_IMAGES`. `DETECT_SCREEN_CAPTURE` remains because the
  Android screen-capture callback requires it, and expo-screen-capture registers that callback
  when its native module loads. It is an install-time permission; Android may show its screenshot
  notice when a screenshot is detected. Decision M0-4.
- **`scripts/verify-release.mjs`** (amendment 3) checks the built APK with `aapt2`:
  - The only permissions allowed are `USE_BIOMETRIC`, `USE_FINGERPRINT`,
    `DETECT_SCREEN_CAPTURE` and
    `<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
  - **Any other permission fails, and the report names the dependency that added it** (from
    Gradle's manifest-merger blame report).
  - It also checks: `allowBackup=false`, `dataExtractionRules` and `fullBackupContent` present, no
    cleartext traffic, no `networkSecurityConfig`, not debuggable.
- **iOS:** Info.plist contains only `NSFaceIDUsageDescription`, with no App Transport Security
  exceptions in release builds.
- **Tooling:** `EXPO_NO_TELEMETRY=1`.

## 13. Navigation

- **Root stack:** providers, DB bootstrap (key state machine), recovery, onboarding, lock.
- **Tabs:**
  - Dashboard
  - Transactions
  - Reports
  - Planning (Budgets | Goals | Debts)
  - More: accounts, categories, rates, backup, security, preferences, privacy, data health
- **Modals:** `transaction/new?kind=…`, `transaction/[id]`.
- **Onboarding:** language → security → restore-or-new → preferred source + first real rate →
  first account → default categories.

## 14. Testing strategy

| Layer | Tooling |
|---|---|
| Money and ledger rules | Jest (node) + fast-check |
| DB, migrations, triggers, views | Jest (node) + better-sqlite3 through `DbDriver`; an on-device migration smoke test for each release candidate |
| Crypto and backup | Jest (node) WebCrypto + golden vectors shared with the device |
| Components | Jest (rn, jest-expo) + React Native Testing Library, LTR and RTL |
| End-to-end | Maestro on the Android emulator, both languages |
| Static | `tsc --noEmit`, ESLint (privacy bans; money and RTL bans from M1/M3) |
| Release | `scripts/verify-release.mjs` |

`npm run verify` runs typecheck, lint and all Jest projects.

## 15. Milestones

| # | Milestone |
|---|---|
| M0 | Scaffold + compatibility spike. **Complete and formally accepted 2026-11-18**: see [STATUS.md](STATUS.md) |
| M1 | `domain/money` and the §7.8 tests — complete |
| M2 | DbDriver, migration runner, `0001`, SQL registry, triggers, views, migration tests — complete |
| M3 | i18n foundation (en/ar, RTL, formatters, lint rules) — complete |
| M4 | Security: key lifecycle K1–K4, recovery screen, app lock, FLAG_SECURE, overlay, privacy plugin, verify-release — complete |
| M5 | Onboarding — complete; encrypted-backup restore integration is deferred to M12 |
| M6 | Rate sources and rates — complete |
| M7 | Accounts, categories, opening balances — complete |
| M8 | Income, expense, refund, edit and delete — complete |
| M9 | Transfers + linked fees — complete |
| M10 | Dashboard, account ledger, Data Health — complete |
| M11 | Backup export — complete |
| M12 | Restore (journal and recovery) — complete |
| M13 | Reports and charts — complete |
| M14 | Budgets |
| M15 | Goals |
| M16 | Debts |
| M17 | Hardening, Maestro in both directions, performance with 100k entries, accessibility, signed Android release |

## 16. Known risks and limitations

1. iOS is outside the Android-only first-release scope; no iOS build, dependencies, or release
   validation are part of this assignment.
2. Any future iOS release requires a separate owner decision and platform-specific security,
   backup, and device validation.
3. Unrecoverable by design: a lost backup password, or a lost or reset device without a backup.
   Mitigations: reminders, a "last backup" indicator, safety copies.
4. better-sqlite3 (SQLite 3.54.1) differs from the device (SQLite 3.53.3 via SQLCipher). An
   on-device migration smoke test runs for each release candidate.
5. Restore decrypts the whole backup in memory. Fine up to about 50 MB of JSON; streaming would be
   format v2.
6. A split's converted total can differ by a few minor units from converting the gross amount.
7. Switching between LTR and RTL requires an app reload.
8. Arabic strings need review by a native speaker.
9. Expo SDK churn: versions are pinned and upgraded only through `npx expo install --fix` plus the
   full test suite.
10. The Android application id is `com.alisaker.mymoney` (owner-confirmed 2026-11-24). It must never
    change: installs and their encrypted data are tied to it. Release builds are signed by
    `plugins/withReleaseSigning.js` with the owner's upload key, kept outside the repo.
11. The only physical test phone is a flagship (Xiaomi 13 Pro, Snapdragon 8 Gen 2). Performance
    figures from it are best case. Budget-phone behaviour is estimated with the 4× rule, not
    measured.
12. Builds on the development PC go through a TLS-inspecting proxy. Node and Java must use the
    Windows certificate store, per command (README → Corporate network). Verification is never
    disabled.

---

## Decisions

Approved 2026-11-16.

| ID | Decision |
|---|---|
| D1 | SQL lives only in `src/db/sql/` as named, parameterized statements; logic goes in views and triggers. `PRAGMA key`/`rekey` is the only documented interpolation exception. (This replaces stored procedures, which SQLite doesn't have.) |
| D2 | Project lives at `C:\dev\mymoney` (no spaces). |
| D3 | LBP has 0 decimals, USD has 2. Rates are stored as LBP per USD × 10⁴. |
| D4 | Keep react-native-gifted-charts, `@noble/hashes` (active production scrypt), `expo-crypto` AES-GCM, and SQLCipher. QuickCrypto remains unapproved for production until budget-device memory testing, release verification for every Android ABI to be distributed, APK distribution-size review, and explicit owner approval are complete. Before any future iOS release, complete iOS config/plugin, deployment-target, release, vector, and backup-interoperability checks. iOS is outside the Android-only first-release scope. `@noble/ciphers` was dropped. |
| D5 | Redux Toolkit is limited to RTK Query and the session/settings slices. |
| D6 | App lock is optional and on by default; biometrics with passcode fallback. |
| D7 | The first release is Android-only; iOS is outside its scope. Any future iOS release requires a separate owner decision and iOS validation before release. |
| D8 | Default categories are seeded as `builtin_key` i18n keys. |
| D9 | English and Arabic with RTL from the start. |
| D10 | Restore is full replacement only in v1, with explicit confirmation and an automatic safety copy. |
| Q1 | FLAG_SECURE follows the app-lock setting (on by default). |
| Q2 | Western digits by default in both languages. |
| Q3 | Cross-currency debt repayment is allowed, using the implied rate. |
| Q4 | Rate staleness warning at 7 days; backup password at least 12 characters. |
| A1 | Key lifecycle: never generate or overwrite an existing key; check safety/quarantine/replaced-* before creating a fresh DB; only typed-confirmation Reset replaces the key; tested (§9.1). |
| A2 | Restore accepts only N ≤ 2¹⁷, r ≤ 8, p ≤ 1 (§10.2). |
| A3 | verify-release allowlists `<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, fails on anything unexpected and names the dependency that added it. |
| A4 | **Complete:** Date columns use `CHECK (date(col) IS col)` in addition to TypeScript validation. All 19 cases passed on better-sqlite3 and on the Xiaomi 13 Pro (API 36) and API 34 emulator. `'now'` is rejected with "non-deterministic use of date() in a CHECK constraint" rather than "CHECK constraint failed"; both count as rejection. |
| M0-1 | Folder layout follows SDK 58's template: routes are in `src/app/` (not `app/`). |
| M0-2 | Template packages removed as unneeded: `@expo/ui`, `expo-symbols`, `expo-glass-effect`, `expo-image`, `expo-web-browser`, `expo-device`, `react-dom`, `react-native-web`, `react-native-reanimated`, `react-native-worklets`. `@expo/vector-icons` was added (Paper's icon source). |
| M0-3 | The `expo-sharing` config plugin (share-extension receiver) is **not** used; sending files through the share sheet doesn't need it. |
| M0-4 | `expo-screen-capture`: only FLAG_SECURE is used. `READ_MEDIA_IMAGES` stays blocked; `DETECT_SCREEN_CAPTURE` is allowed because the Android callback is registered on module load and requires it. This may cause Android's screenshot notice when capture is detected. |
| M0-5 | Corporate TLS: Node uses `--use-system-ca`; Java (Gradle client and daemon) uses `-Djavax.net.ssl.trustStoreType=Windows-ROOT`, per command or per script, never globally and never in committed Gradle files. Certificate verification is never disabled. npm `strict-ssl` must stay `true`, and `npm ci` is run only after `npm config get strict-ssl` prints `true`. |
| M0-6 | **Deferred pending production acceptance:** the approved conditional future write target is N = 131,072 (2¹⁷) with QuickCrypto, subject to all production gates and owner approval. Noble remains active in production; its timings do not meet the budget-phone goal. No production write N or KDF migration is approved by M0 completion. |
| M0-7 | NDK: React Native 0.88 pins `ndkVersion = 27.1.12297006` (= NDK r27b). It is installed manually at `%LOCALAPPDATA%\Android\Sdk\ndk\27.1.12297006` (from `android-ndk-r27b-windows.zip`) instead of letting Gradle download it. |
| M0-8 | **Benchmark complete; production acceptance pending:** QuickCrypto 1.1.9, Nitro Modules 0.33.2, and Quick Base64 3.0.0 were used for the Phase 1 benchmark only. They do not replace Noble in production; QuickCrypto remains a candidate pending the gates in D4 and owner approval. |
