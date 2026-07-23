# Budget App — Architecture & Entity Documentation

> **Context:** Two repos — `budget_be` (Node/Express/TypeScript backend) and `budget_fe` (React/react-admin frontend). The app is a household budget tracker intended for a couple (seed data has Liborec + Leony, three accounts: Main, Joint, Leony's). Czech locale, Europe/Prague timezone throughout.

---

## Table of Contents

1. [Big Picture](#big-picture)
2. [Backend Stack](#backend-stack)
3. [Frontend Stack](#frontend-stack)
4. [Database Schema & Entities](#database-schema--entities)
5. [Entity Relations](#entity-relations)
6. [API Modules](#api-modules)
7. [Frontend Resources & UI](#frontend-resources--ui)
8. [Contexts (Global State)](#contexts-global-state)
9. [Notification System](#notification-system)
10. [Cron System](#cron-system)
11. [Known Bugs & Incomplete Parts](#known-bugs--incomplete-parts)
12. [Probably Intended But Missing](#probably-intended-but-missing)

---

## Big Picture

A personal finance app where multiple users share multiple accounts. Money moves in two ways:

- **Transaction** — money in or out of a single account, always categorized (income or expense)
- **Transfer** — money moved between two accounts, no category

On top of raw movements there are higher-level concepts:

- **Category limits** — budget caps per category, evaluated on a cron schedule, send notifications when 2/3 is hit and when exceeded
- **Expected transactions / transfers** — cron-scheduled obligations; a cron job fires and checks whether the actual movements happened; if not, notifications go out
- **Prefabs** — saved templates for quickly filling in a transaction or transfer form

Notifications are stored in the DB as rendered HTML and simultaneously pushed via a self-hosted `ntfy.sh` instance at `10.10.10.1:5542` (home server).
For ntfy make own service and for notification as well. In .env, you could select which services you want to use. In notification.factory.service.ts, there will be exported artificial service implementing interface. In each method, there will be loop for array of an services (selected in .env) all implementing some INotificationService interface and calling their methods.
Follow convention
notification.<ntfy | db | mail...>.service.ts
notification.service.ts ← the factory exporting the final service

---

## Frontend Stack

| Thing | What |
|---|---|
| Framework | React 19 |
| Admin framework | react-admin v5 |
| UI components | Material UI v7 |
| Build | Vite |
| Cron display | `cronstrue` (human-readable cron strings), `cron-parser` |
| API base | `VITE_API_URL` env var |

---

## Database Schema & Entities

### `users`

The people using the app.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | auto-increment |
| name | VARCHAR(255) | display name |
| mail | VARCHAR(255) | email address |

---

### `accounts`

A financial account. Can be owned by one or more users.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| name | VARCHAR(255) | |
| start_balance | DECIMAL(15,2) | initial balance; default 0 |

**Computed field (returned by API):**
- `current_balance` = `start_balance` + sum of income transactions + sum of incoming transfers − sum of expense transactions − sum of outgoing transfers

---

### `users_accounts` (join table)

Many-to-many between `users` and `accounts`.

| Column | Type |
|---|---|
| user_id | FK → users |
| account_id | FK → accounts |

---

### `categories`

A hierarchical tree of income/expense categories. Each category may have a `parent_category`. The tree can be arbitrarily deep. Type must match the parent's type (you cannot nest an expense under an income category).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| name | VARCHAR(255) | |
| parent_category | BIGINT UNSIGNED | self-reference; NULL = root |
| income | boolean | |
| icon | TEXT | filename of an SVG served from `/api/icons/` |

The backend enforces:
- `income` must match parent's `income`
- No cycles (recursive check)

---

### `category_limits`

A spending/income cap for a category, evaluated on a cron schedule.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| category_id | FK → categories | |
| amount | DECIMAL(15,2) | the cap |
| note | TEXT | human-readable label |
| notification_msg | TEXT | custom message text |
| schedule | VARCHAR(255) | cron expression (5-field) |

**Fields in enriched model (returned by API):**
- `accumulated` — sum of transactions within the current schedule period across all associated accounts
- `transactions` — list of transaction IDs in the current period (only in `GET /:id`)
- `accounts` — list of account IDs this limit applies to (only in `GET /:id`)

**Trigger logic (on transaction create):**
1. Find all category limits that apply to the transaction's category (walking up the category tree) and to the transaction's account.
2. Check if the transaction falls within the current schedule window (`prev()` → `next()`).
3. If `accumulated + newAmount` crosses **2/3 of limit** (and ```accumulated``` doesnt) → send `categoryLimitCloseExceed` notification.
4. If `accumulated + newAmount` exceeds **limit** (and ```accumulated``` doesnt) → send `categoryLimitExceed` notification.

---

### `category_limits_accounts` (join table)

Which accounts a given category limit monitors.

| Column | Type |
|---|---|
| category_limit_id | FK → category_limits |
| account_id | FK → accounts |

---

### `transactions`

A single money movement in or out of one account. The direction (income vs. expense) is determined by the category's `income`.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| date | DATE | format YYYY-MM-DD |
| account_id | FK → accounts | the account this transaction belongs to |
| amount | DECIMAL(15,2) | always positive |
| category_id | FK → categories | determines income vs expense |
| note | TEXT | optional |

---

### `transfers`

Money moved between two accounts. Has no category — direction is inferred from which account you're looking at.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| account_id_from | FK → accounts | money leaves here |
| account_id_to | FK → accounts | money arrives here |
| amount | DECIMAL(15,2) | always positive |
| date | DATE | |
| note | TEXT | optional |

---

### `movement (artificial)`

This is not an entity in db, it is artificial entity generated by BE.

| Column | Type | Notes |
|---|---|---|
| id + type | PK | id of an entity + transaction if its transaction or transfer if it is tranfer |
| date | DATE | format YYYY-MM-DD |
| account_id | FK → accounts | the account this transaction belongs to |
| amount | DECIMAL(15,2) | always positive |
| category_id | FK → categories | determines income vs expense or is faked if it is a transfer |
| note | TEXT | optional |
| income | BOOLEAN | if its transfer, true if account_id === account_id_to, else false or derived from category if its transaction |

---

### `expected_transactions`

A recurring expectation: "account X should have at least Y amount in category Z per schedule period." If it doesn't, a notification fires.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| amount | DECIMAL(15,2) | minimum expected |
| account_id | FK → accounts | |
| schedule | VARCHAR(255) | cron expression |
| category | FK → categories | may match subcategories too |
| note | TEXT | required |

The cron job checks the *previous full period* (two `prev()` calls back from now). Subcategories of the specified category count toward the sum.

---

### `expected_transfers`

Same concept for transfers: "account A should transfer at least Y to account B per schedule period."

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| amount | DECIMAL(15,2) | minimum expected |
| account_id_from | FK → accounts | |
| account_id_to | FK → accounts | |
| schedule | VARCHAR(255) | cron expression |
| note | TEXT | required |

---

### `transaction_prefabs`

Saved transaction templates for quick entry. No date field — date is filled in at creation time.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| amount | DECIMAL(15,2) | |
| account_id | FK → accounts | nullable |
| category_id | FK → categories | |
| note | TEXT | |

Used in the FE: a "⭐" button on the transaction form opens a picker; selecting a prefab fills in the form fields.

---

### `transfer_prefabs`

Saved transfer templates.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| account_id_from | FK → accounts | |
| account_id_to | FK → accounts | |
| amount | DECIMAL(15,2) | |
| note | TEXT | |

Used in the FE: a "⭐" button on the transfer form opens a picker; selecting a prefab fills in the form fields.

---

### `notifications`

System notifications stored as rendered HTML. Also pushed via ntfy.sh at creation time.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| user_id | FK → users | recipient |
| html | TEXT | rendered Handlebars HTML |
| archived | BOOLEAN | default false |

The FE shows notifications in a list, allows archiving via a custom `PATCH /api/notifications_archive/:id` endpoint (sets `archived=true`), and renders the `html` field inline with `dangerouslySetInnerHTML`.

---

## Entity Relations

```
users ──────────────────────── users_accounts ─────── accounts
  │                                                      │  │  │
  │                                                      │  │  └── category_limits_accounts ── category_limits
  │                                                      │  │                                         │
  │                                                      │  ├── transactions ──────────────── categories
  │                                                      │  │        (from_account)              (self-ref tree)
  │                                                      │  │
  │                                                      │  ├── transfers
  │                                                      │  │   (from_account / to_account)
  │                                                      │  │
  │                                                      │  ├── expected_transactions
  │                                                      │  ├── expected_transfers
  │                                                      │  ├── transaction_prefabs
  │                                                      │  └── transfer_prefabs
  │
  └── notifications
```

**Read this as:**
- A `user` owns many `accounts` via `users_accounts` (many-to-many via `users_accounts`).
- An `account` has many `transactions`, `transfers` (many artificial `movements`), `expected_transactions`, `expected_transfers`, `transaction_prefabs`, `transfer_prefabs`.
- A `category` belongs to a parent `category` (optional), has many child categories, many `transactions`, many `category_limits`.
- A `category_limit` belongs to one `category`, applies to many `accounts` via `category_limits_accounts`.
- A `notification` belongs to one `user`.

---

## Frontend Resources & UI

The FE is entirely built on **react-admin**. Each entity maps to a `Resource`. Most resources expose all four views: List, Show, Edit, Create.

### `movements` — the primary daily-use view

The `Movements` resource is the main screen. It does not map 1:1 to a DB table — it is the unified view of transactions + transfers for the selected account. The `entityType` query param tells the backend which kind of record is being addressed.

- **List**: Shows date, amount, category (with icon) or "Transfer" badge. Rows are colored green (income) / red (expense) in mixed mode. Toolbar has three create buttons: "create income", "create expense", "create transfer". Also shows `income/expense Toggler`, `accountSelector`, and `dateBar`. `dateBar` allws you to either select date from and date to or you can toggle `monthly` and list between months.
- **Show**: Delegates to `TransactionShowLayout` or `TransferShowLayout` depending on `EntityTypeContext`.
- **Create**: Delegates to `TransactionSimpleForm` or `TransferSimpleForm`.
- **Edit**: Same delegation.
- **Delete**: Custom button that calls `deleteMovenent()` with `entityType` as query param.

The `transfers` and `transactions` resources exist in code but are **commented out** in `App.tsx` — movements is the intended entry point.

### `categories` — tree view

- **List**: Uses `Tree` component to display the full category hierarchy. Filtered by `type` (income/expense/mixed). Each node shows the category icon.
- **Show** (`/category-show/:id` — custom route): Displays the category, a subtree of its children, and any `category_limits` linked to it or its ancestors. Limits blink in red if `accumulated >= amount`.
- **Create / Edit**: Use `ReferenceNodeInput` + `TreeInput` for picking `parent_category`. Custom `IconSelectInput` shows a grid of available icons.

### `category_limits`

- **List**: Shows category, amount, schedule (raw + human-readable via `cronstrue`), accumulated. Rows blink if limit exceeded.
- **Show**: Shows all fields plus an `AccumulatedPaper` with the current period's transactions and next reset date. Has a "connect to accounts" button that opens a `Dialog` with chip-selectors for all accounts.
- **Create / Edit**: `TreeInput` for category, raw cron `TextInput` with a live `ScheduleReadable` component that translates the cron to English via `cronstrue`.

### `expected_transactions` / `expected_transfers`

- Standard CRUD. Cron field uses same `ScheduleReadable` live preview.
- `expected_transactions` uses `TreeInput` for category selection with custom `titleRender` showing expense (red border) vs income (green border) root categories.

### `transaction_prefabs` / `transfer_prefabs`

- Standard CRUD.
- `TransactionPrefabForm` uses `TreeInput` for category with the same custom render as expected transactions.

### `accounts`

- **List**: Name + `current_balance`.
- **Show / Create / Edit**: Name, `start_balance`, `users` (via `ReferenceArrayInput`/`ReferenceArrayField`).

### `users`

- Standard CRUD: name + mail.

### `notifications`

- **List**: user_id, created_at, archived_at, archived, html (raw).
- **Show**: Renders the `html` field both as raw text and via `dangerouslySetInnerHTML`. Has an "archive" button.
- **Create / Edit**: Raw form (admin use only).

---

## Contexts (Global State)

Four React contexts wrap the entire app and provide shared state that multiple resources need.

### `AccountContext`

- Holds the currently selected `account` (number id; default `1`).
- Fetches all accounts on mount via `getAccounts()`.
- Provides a MUI `Select` dropdown as `accountSelector` — embedded in the Movements toolbar.
- Provides `setAccount` — called by the transaction form when `from_account` changes, keeping the context in sync.

### `DateContext`

- Holds `dateFrom` / `dateTo` (Date objects).
- Default: first and last day of the current month.
- Provides `dateBar` — a rendered toolbar row with left/right arrows for month navigation and a toggle to switch to a custom `DateTimePicker` range.
- Used by Movements list filter.

### `TypeContext`

- Holds `type`: `'income' | 'expense' | 'mixed'` (default `'mixed'`).
- Provides `typeToggler` — a MUI `ToggleButtonGroup` with three buttons.
- Used by Movements list filter and category tree filter.
- Movements list forces `'mixed'` on mount via `useEffect`.

### `EntityTypeContext`

- Holds `entityType`: `'transaction' | 'transfer'` (default `'transaction'`).
- No UI component — set programmatically when the user clicks "create income", "create expense", or "create transfer" in the Movements list.
- Used by Movements Show/Create/Edit to decide which sub-form/layout to render.

---

## Notification System

### Templates

Four Handlebars HTML templates in `budget_be/src/notificationTemplates/`:

| Template | When fired |
|---|---|
| `categoryLimitExceed.html` | Transaction pushes accumulated > limit |
| `categoryLimitCloseExceed.html` | Transaction pushes accumulated > 2/3 of limit (but still under limit) |
| `expectedTransactionNok.html` | Cron fires and actual transactions < expected amount |
| `expectedTransferNok.html` | Cron fires and actual transfers < expected amount |

Template variables include: `category_name`, `category_icon_url`, `limit_amount`, `accumulated`, `period_from`, `period_to`, `time_left`, `created_at`, `account`, `from_account_name`, `to_account_name`, `amount`.

### Delivery

Every notification is:
1. Rendered via Handlebars and stored in `notifications.html`.
2. POSTed to `http://10.10.10.1:5542/budget-{userId}` (a local ntfy.sh instance) with a custom push text from a `.ntfy.txt` template.

Recipients are determined by looking up which users own the accounts involved in the triggering event.

---

## Cron System

`expectedMovementsCron.ts` manages two arrays of `node-cron` `ScheduledTask` instances.

`resetJobs()` is called:
- On server startup
- After any create/update/delete on `expected_transactions` or `expected_transfers`

It stops all existing jobs, re-reads all expected movements from the DB, and creates a new cron job for each one.

**Cron job logic for expected transfers:**
1. Parse `schedule` to find the previous-previous period boundary (`cronPrev`).
2. Sum all actual transfers between `from_account` and `to_account` in the window `[cronPrev, now]`.
3. If sum < `expected_transfer.amount` → notify all users of both accounts.

**Cron job logic for expected transactions:**
1. Same period detection.
2. Sum all actual transactions from `from_account` in the expected category (including subcategories) in the window.
3. If sum < `expected_transaction.amount` → notify all users of the from_account.

All cron jobs run in the `Europe/Prague` timezone.