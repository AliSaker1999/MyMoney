const timestamp = (column: string) =>
  `CHECK (strftime('%Y-%m-%dT%H:%M:%fZ', ${column}) IS ${column})`;

export const schemaV1Sql = {
  createRateSources: `
    CREATE TABLE rate_sources (
      id INTEGER PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT,
      is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0,1)),
      archived_at TEXT ${timestamp('archived_at')},
      created_at TEXT NOT NULL ${timestamp('created_at')},
      CHECK (code IS NOT NULL OR name IS NOT NULL)
    )
  `,
  createExchangeRates: `
    CREATE TABLE exchange_rates (
      id INTEGER PRIMARY KEY,
      source_id INTEGER NOT NULL REFERENCES rate_sources(id) ON DELETE RESTRICT,
      effective_date TEXT NOT NULL CHECK (date(effective_date) IS effective_date),
      effective_seq INTEGER NOT NULL DEFAULT 0
        CHECK (typeof(effective_seq) = 'integer' AND effective_seq >= 0),
      lbp_per_usd_e4 INTEGER NOT NULL CHECK (
        typeof(lbp_per_usd_e4) = 'integer'
        AND lbp_per_usd_e4 BETWEEN 1 AND 1000000000000
      ),
      note TEXT,
      created_at TEXT NOT NULL ${timestamp('created_at')},
      UNIQUE (source_id, effective_date, effective_seq)
    )
  `,
  indexRatesLookup: `
    CREATE INDEX ix_rates_lookup
    ON exchange_rates(source_id, effective_date DESC, effective_seq DESC)
  `,
  createAccounts: `
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      type TEXT NOT NULL CHECK (type IN ('cash','bank','card','wallet','savings','other')),
      currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
      include_in_net_worth INTEGER NOT NULL DEFAULT 1 CHECK (include_in_net_worth IN (0,1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT ${timestamp('archived_at')},
      created_at TEXT NOT NULL ${timestamp('created_at')},
      updated_at TEXT NOT NULL ${timestamp('updated_at')}
    )
  `,
  indexAccountsActiveName: `
    CREATE UNIQUE INDEX ux_accounts_name_active
    ON accounts(name COLLATE NOCASE) WHERE archived_at IS NULL
  `,
  createCategories: `
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY,
      name TEXT,
      builtin_key TEXT UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
      parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
      icon TEXT,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT ${timestamp('archived_at')},
      created_at TEXT NOT NULL ${timestamp('created_at')},
      updated_at TEXT NOT NULL ${timestamp('updated_at')},
      CHECK (name IS NOT NULL OR builtin_key IS NOT NULL)
    )
  `,
  indexCategoriesParent: 'CREATE INDEX ix_categories_parent ON categories(parent_id)',
  createTransactions: `
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN
        ('income','expense','refund','transfer','opening_balance','adjustment','debt')),
      date TEXT NOT NULL CHECK (date(date) IS date),
      lbp_per_usd_e4 INTEGER NOT NULL CHECK (
        typeof(lbp_per_usd_e4) = 'integer'
        AND lbp_per_usd_e4 BETWEEN 1 AND 1000000000000
      ),
      rate_origin TEXT NOT NULL CHECK (rate_origin IN ('source','manual','implied','inherited')),
      rate_source_id INTEGER REFERENCES rate_sources(id) ON DELETE RESTRICT,
      rate_source_label TEXT,
      rate_id INTEGER REFERENCES exchange_rates(id) ON DELETE SET NULL,
      rate_date TEXT CHECK (rate_date IS NULL OR date(rate_date) IS rate_date),
      parent_transaction_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT,
      link_type TEXT CHECK (link_type IN ('transfer_fee','debt_interest')),
      payee TEXT,
      note TEXT,
      created_at TEXT NOT NULL ${timestamp('created_at')},
      updated_at TEXT NOT NULL ${timestamp('updated_at')},
      CHECK ((parent_transaction_id IS NULL) = (link_type IS NULL)),
      CHECK (rate_origin <> 'source' OR rate_source_id IS NOT NULL),
      CHECK (rate_origin <> 'implied' OR kind IN ('transfer','debt')),
      CHECK (rate_origin <> 'inherited' OR parent_transaction_id IS NOT NULL)
    )
  `,
  indexTransactionsDate: 'CREATE INDEX ix_tx_date ON transactions(date, id)',
  indexTransactionsLink: `
    CREATE UNIQUE INDEX ux_tx_one_link
    ON transactions(parent_transaction_id, link_type)
    WHERE parent_transaction_id IS NOT NULL
  `,
  createEntries: `
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
      currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
      amount_minor INTEGER NOT NULL CHECK (
        typeof(amount_minor) = 'integer'
        AND amount_minor <> 0
        AND amount_minor BETWEEN -100000000000000 AND 100000000000000
      ),
      usd_minor INTEGER NOT NULL CHECK (typeof(usd_minor) = 'integer'),
      lbp_minor INTEGER NOT NULL CHECK (typeof(lbp_minor) = 'integer'),
      memo TEXT,
      CHECK (
        (currency = 'USD' AND usd_minor = amount_minor) OR
        (currency = 'LBP' AND lbp_minor = amount_minor)
      ),
      CHECK (
        (amount_minor > 0 AND usd_minor >= 0 AND lbp_minor >= 0) OR
        (amount_minor < 0 AND usd_minor <= 0 AND lbp_minor <= 0)
      )
    )
  `,
  indexEntriesTransaction: 'CREATE INDEX ix_entries_txn ON entries(transaction_id)',
  indexEntriesAccount: 'CREATE INDEX ix_entries_account ON entries(account_id, transaction_id)',
  indexEntriesCategory: `
    CREATE INDEX ix_entries_category ON entries(category_id) WHERE category_id IS NOT NULL
  `,
  createBudgets: `
    CREATE TABLE budgets (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
      amount_minor INTEGER NOT NULL CHECK (
        typeof(amount_minor) = 'integer' AND amount_minor > 0
      ),
      period TEXT NOT NULL DEFAULT 'monthly' CHECK (period = 'monthly'),
      start_month TEXT NOT NULL CHECK (date(start_month || '-01') IS start_month || '-01'),
      end_month TEXT CHECK (
        end_month IS NULL OR date(end_month || '-01') IS end_month || '-01'
      ),
      created_at TEXT NOT NULL ${timestamp('created_at')},
      updated_at TEXT NOT NULL ${timestamp('updated_at')}
    )
  `,
  indexBudgetsCategory: 'CREATE INDEX ix_budgets_category ON budgets(category_id, start_month)',
  createGoals: `
    CREATE TABLE goals (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
      target_minor INTEGER NOT NULL CHECK (typeof(target_minor) = 'integer' AND target_minor > 0),
      target_date TEXT CHECK (target_date IS NULL OR date(target_date) IS target_date),
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      achieved_at TEXT ${timestamp('achieved_at')},
      archived_at TEXT ${timestamp('archived_at')},
      created_at TEXT NOT NULL ${timestamp('created_at')},
      updated_at TEXT NOT NULL ${timestamp('updated_at')}
    )
  `,
  createGoalContributions: `
    CREATE TABLE goal_contributions (
      id INTEGER PRIMARY KEY,
      goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      date TEXT NOT NULL CHECK (date(date) IS date),
      amount_minor INTEGER NOT NULL CHECK (
        typeof(amount_minor) = 'integer' AND amount_minor <> 0
      ),
      note TEXT,
      created_at TEXT NOT NULL ${timestamp('created_at')}
    )
  `,
  indexGoalContributions: 'CREATE INDEX ix_goal_contrib ON goal_contributions(goal_id, date)',
  createDebts: `
    CREATE TABLE debts (
      id INTEGER PRIMARY KEY,
      counterparty TEXT NOT NULL CHECK (length(trim(counterparty)) > 0),
      direction TEXT NOT NULL CHECK (direction IN ('i_owe','owed_to_me')),
      currency TEXT NOT NULL CHECK (currency IN ('USD','LBP')),
      start_date TEXT NOT NULL CHECK (date(start_date) IS start_date),
      due_date TEXT CHECK (due_date IS NULL OR date(due_date) IS due_date),
      note TEXT,
      settled_at TEXT ${timestamp('settled_at')},
      created_at TEXT NOT NULL ${timestamp('created_at')},
      updated_at TEXT NOT NULL ${timestamp('updated_at')}
    )
  `,
  createDebtMovements: `
    CREATE TABLE debt_movements (
      id INTEGER PRIMARY KEY,
      debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE RESTRICT,
      transaction_id INTEGER UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      date TEXT NOT NULL CHECK (date(date) IS date),
      amount_minor INTEGER NOT NULL CHECK (
        typeof(amount_minor) = 'integer' AND amount_minor <> 0
      ),
      note TEXT,
      created_at TEXT NOT NULL ${timestamp('created_at')}
    )
  `,
  indexDebtMovements: 'CREATE INDEX ix_debt_mov_debt ON debt_movements(debt_id, date)',
  createSettings: 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  createMigrationLog: `
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL ${timestamp('applied_at')}
    )
  `,
  lockAccountCurrency: `
    CREATE TRIGGER trg_accounts_currency_lock
    BEFORE UPDATE OF currency ON accounts
    WHEN NEW.currency <> OLD.currency
      AND EXISTS (SELECT 1 FROM entries WHERE account_id = OLD.id)
    BEGIN
      SELECT RAISE(ABORT, 'account currency cannot change after entries exist');
    END
  `,
  validateCategoryParent: `
    CREATE TRIGGER trg_categories_parent_kind_insert
    BEFORE INSERT ON categories
    WHEN NEW.parent_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM categories parent
        WHERE parent.id = NEW.parent_id AND parent.kind = NEW.kind
      )
    BEGIN
      SELECT RAISE(ABORT, 'subcategory kind must match its parent');
    END
  `,
  validateCategoryParentUpdate: `
    CREATE TRIGGER trg_categories_parent_kind_update
    BEFORE UPDATE OF parent_id, kind ON categories
    WHEN NEW.parent_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM categories parent
        WHERE parent.id = NEW.parent_id AND parent.kind = NEW.kind
      )
    BEGIN
      SELECT RAISE(ABORT, 'subcategory kind must match its parent');
    END
  `,
  lockTransactionKind: `
    CREATE TRIGGER trg_tx_kind_immutable
    BEFORE UPDATE OF kind ON transactions
    WHEN NEW.kind <> OLD.kind
    BEGIN
      SELECT RAISE(ABORT, 'transaction kind is immutable');
    END
  `,
  validateLinkedTransaction: `
    CREATE TRIGGER trg_linked_transaction_insert
    BEFORE INSERT ON transactions
    WHEN NEW.parent_transaction_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM transactions parent
        WHERE parent.id = NEW.parent_transaction_id
          AND (
            (NEW.link_type = 'transfer_fee'
              AND parent.kind = 'transfer'
              AND NEW.kind = 'expense'
              AND NEW.date = parent.date
              AND NEW.rate_origin = 'inherited')
            OR
            (NEW.link_type = 'debt_interest'
              AND parent.kind = 'debt'
              AND NEW.kind = 'expense'
              AND NEW.rate_origin = 'inherited')
          )
      )
    BEGIN
      SELECT RAISE(ABORT, 'invalid linked transaction');
    END
  `,
  validateEntryInsert: `
    CREATE TRIGGER trg_entries_validate_insert
    BEFORE INSERT ON entries
    BEGIN
      SELECT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM accounts a
          WHERE a.id = NEW.account_id
            AND a.currency = NEW.currency
            AND a.archived_at IS NULL
        ) THEN RAISE(ABORT, 'entry account currency mismatch or account archived')
        WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (
          SELECT 1
          FROM categories c
          JOIN transactions t ON t.id = NEW.transaction_id
          WHERE c.id = NEW.category_id
            AND (
              (t.kind = 'income' AND c.kind = 'income' AND NEW.amount_minor > 0) OR
              (t.kind = 'expense' AND c.kind = 'expense' AND NEW.amount_minor < 0) OR
              (t.kind = 'refund' AND c.kind = 'expense' AND NEW.amount_minor > 0)
            )
        ) THEN RAISE(ABORT, 'entry category kind or sign mismatch')
        WHEN EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.id = NEW.transaction_id AND t.kind NOT IN ('income','expense','refund')
        ) AND NEW.category_id IS NOT NULL
          THEN RAISE(ABORT, 'this transaction kind cannot have a category')
        WHEN EXISTS (
          SELECT 1
          FROM transactions child
          JOIN transactions parent ON parent.id = child.parent_transaction_id
          WHERE child.id = NEW.transaction_id
            AND child.link_type = 'transfer_fee'
            AND NOT EXISTS (
              SELECT 1 FROM entries transfer_entry
              WHERE transfer_entry.transaction_id = parent.id
                AND transfer_entry.account_id = NEW.account_id
            )
        ) THEN RAISE(ABORT, 'transfer fee account must be one of the transfer accounts')
      END;
    END
  `,
  validateEntryUpdate: `
    CREATE TRIGGER trg_entries_validate_update
    BEFORE UPDATE OF account_id, category_id, currency, amount_minor, transaction_id ON entries
    BEGIN
      SELECT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM accounts a
          WHERE a.id = NEW.account_id
            AND a.currency = NEW.currency
            AND (a.archived_at IS NULL OR NEW.account_id = OLD.account_id)
        ) THEN RAISE(ABORT, 'entry account currency mismatch or account archived')
        WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (
          SELECT 1
          FROM categories c
          JOIN transactions t ON t.id = NEW.transaction_id
          WHERE c.id = NEW.category_id
            AND (
              (t.kind = 'income' AND c.kind = 'income' AND NEW.amount_minor > 0) OR
              (t.kind = 'expense' AND c.kind = 'expense' AND NEW.amount_minor < 0) OR
              (t.kind = 'refund' AND c.kind = 'expense' AND NEW.amount_minor > 0)
            )
        ) THEN RAISE(ABORT, 'entry category kind or sign mismatch')
        WHEN EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.id = NEW.transaction_id AND t.kind NOT IN ('income','expense','refund')
        ) AND NEW.category_id IS NOT NULL
          THEN RAISE(ABORT, 'this transaction kind cannot have a category')
        WHEN EXISTS (
          SELECT 1
          FROM transactions child
          JOIN transactions parent ON parent.id = child.parent_transaction_id
          WHERE child.id = NEW.transaction_id
            AND child.link_type = 'transfer_fee'
            AND NOT EXISTS (
              SELECT 1 FROM entries transfer_entry
              WHERE transfer_entry.transaction_id = parent.id
                AND transfer_entry.account_id = NEW.account_id
            )
        ) THEN RAISE(ABORT, 'transfer fee account must be one of the transfer accounts')
      END;
    END
  `,
  validateBudgetCategory: `
    CREATE TRIGGER trg_budget_category_kind_insert
    BEFORE INSERT ON budgets
    WHEN NOT EXISTS (
      SELECT 1 FROM categories
      WHERE id = NEW.category_id AND kind = 'expense' AND archived_at IS NULL
    )
    BEGIN
      SELECT RAISE(ABORT, 'budget category must be an active expense category');
    END
  `,
  validateBudgetCategoryUpdate: `
    CREATE TRIGGER trg_budget_category_kind_update
    BEFORE UPDATE OF category_id ON budgets
    WHEN NOT EXISTS (
      SELECT 1 FROM categories
      WHERE id = NEW.category_id AND kind = 'expense' AND archived_at IS NULL
    )
    BEGIN
      SELECT RAISE(ABORT, 'budget category must be an active expense category');
    END
  `,
  validateDebtMovement: `
    CREATE TRIGGER trg_debt_movement_transaction
    BEFORE INSERT ON debt_movements
    WHEN NEW.transaction_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM transactions WHERE id = NEW.transaction_id AND kind = 'debt'
      )
    BEGIN
      SELECT RAISE(ABORT, 'debt movement must link to a debt transaction');
    END
  `,
  createAccountBalancesView: `
    CREATE VIEW v_account_balances AS
    SELECT
      a.id AS account_id,
      a.currency,
      CAST(COALESCE(SUM(e.amount_minor), 0) AS TEXT) AS balance_minor
    FROM accounts a
    LEFT JOIN entries e ON e.account_id = a.id
    GROUP BY a.id, a.currency
  `,
  createCategorizedFlowsView: `
    CREATE VIEW v_categorized_flows AS
    SELECT
      t.id AS transaction_id,
      t.date,
      t.kind,
      e.account_id,
      e.category_id,
      e.currency,
      e.amount_minor,
      e.usd_minor,
      e.lbp_minor
    FROM transactions t
    JOIN entries e ON e.transaction_id = t.id
    WHERE t.kind IN ('income','expense','refund')
  `,
  createDebtOutstandingView: `
    CREATE VIEW v_debt_outstanding AS
    SELECT
      d.id AS debt_id,
      d.currency,
      CAST(COALESCE(SUM(m.amount_minor), 0) AS TEXT) AS outstanding_minor
    FROM debts d
    LEFT JOIN debt_movements m ON m.debt_id = d.id
    GROUP BY d.id, d.currency
  `,
  createLedgerViolationsView: `
    CREATE VIEW v_ledger_violations AS
    SELECT t.id AS transaction_id, 'flow_entry_rules' AS rule
    FROM transactions t
    LEFT JOIN entries e ON e.transaction_id = t.id
    WHERE t.kind IN ('income','expense','refund')
    GROUP BY t.id
    HAVING COUNT(e.id) < 1
      OR COUNT(DISTINCT e.account_id) <> 1
      OR SUM(CASE WHEN e.category_id IS NULL THEN 1 ELSE 0 END) > 0
    UNION ALL
    SELECT t.id, 'transfer_entry_rules'
    FROM transactions t
    LEFT JOIN entries e ON e.transaction_id = t.id
    WHERE t.kind = 'transfer'
    GROUP BY t.id
    HAVING COUNT(e.id) <> 2
      OR COUNT(DISTINCT e.account_id) <> 2
      OR SUM(CASE WHEN e.amount_minor < 0 THEN 1 ELSE 0 END) <> 1
      OR SUM(CASE WHEN e.amount_minor > 0 THEN 1 ELSE 0 END) <> 1
      OR SUM(CASE WHEN e.category_id IS NOT NULL THEN 1 ELSE 0 END) > 0
      OR SUM(e.usd_minor) <> 0
      OR SUM(e.lbp_minor) <> 0
    UNION ALL
    SELECT t.id, 'single_entry_rules'
    FROM transactions t
    LEFT JOIN entries e ON e.transaction_id = t.id
    WHERE t.kind IN ('opening_balance','adjustment')
    GROUP BY t.id
    HAVING COUNT(e.id) <> 1
      OR SUM(CASE WHEN e.category_id IS NOT NULL THEN 1 ELSE 0 END) > 0
    UNION ALL
    SELECT t.id, 'debt_entry_rules'
    FROM transactions t
    LEFT JOIN entries e ON e.transaction_id = t.id
    LEFT JOIN debt_movements m ON m.transaction_id = t.id
    WHERE t.kind = 'debt'
    GROUP BY t.id
    HAVING COUNT(DISTINCT e.id) <> 1
      OR COUNT(DISTINCT m.id) <> 1
      OR SUM(CASE WHEN e.category_id IS NOT NULL THEN 1 ELSE 0 END) > 0
      OR SUM(CASE WHEN
        (SELECT d.direction FROM debts d WHERE d.id = m.debt_id) = 'i_owe'
        AND ((m.amount_minor > 0) <> (e.amount_minor > 0))
        THEN 1 ELSE 0 END) > 0
      OR SUM(CASE WHEN
        (SELECT d.direction FROM debts d WHERE d.id = m.debt_id) = 'owed_to_me'
        AND ((m.amount_minor > 0) = (e.amount_minor > 0))
        THEN 1 ELSE 0 END) > 0
    UNION ALL
    SELECT t.id, 'linked_fee_rules'
    FROM transactions t
    LEFT JOIN entries e ON e.transaction_id = t.id
    LEFT JOIN transactions p ON p.id = t.parent_transaction_id
    WHERE t.link_type = 'transfer_fee'
    GROUP BY t.id
    HAVING t.kind <> 'expense'
      OR t.rate_origin <> 'inherited'
      OR p.kind <> 'transfer'
      OR t.date <> p.date
      OR COUNT(e.id) <> 1
      OR SUM(CASE WHEN e.amount_minor >= 0 OR e.category_id IS NULL THEN 1 ELSE 0 END) > 0
      OR SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM entries transfer_entry
        WHERE transfer_entry.transaction_id = p.id
          AND transfer_entry.account_id = e.account_id
      ) THEN 1 ELSE 0 END) > 0
    UNION ALL
    SELECT t.id, 'linked_interest_rules'
    FROM transactions t
    LEFT JOIN entries e ON e.transaction_id = t.id
    LEFT JOIN transactions p ON p.id = t.parent_transaction_id
    WHERE t.link_type = 'debt_interest'
    GROUP BY t.id
    HAVING t.kind <> 'expense'
      OR t.rate_origin <> 'inherited'
      OR p.kind <> 'debt'
      OR COUNT(e.id) <> 1
      OR SUM(CASE WHEN e.amount_minor >= 0 OR e.category_id IS NULL THEN 1 ELSE 0 END) > 0
    UNION ALL
    SELECT t.id, 'debt_movement_link'
    FROM transactions t
    JOIN debt_movements m ON m.transaction_id = t.id
    WHERE t.kind <> 'debt'
  `,
  setUserVersion1: 'PRAGMA user_version = 1',
} as const;

export const schemaV1Statements = [
  schemaV1Sql.createMigrationLog,
  schemaV1Sql.createRateSources,
  schemaV1Sql.createExchangeRates,
  schemaV1Sql.indexRatesLookup,
  schemaV1Sql.createAccounts,
  schemaV1Sql.indexAccountsActiveName,
  schemaV1Sql.createCategories,
  schemaV1Sql.indexCategoriesParent,
  schemaV1Sql.createTransactions,
  schemaV1Sql.indexTransactionsDate,
  schemaV1Sql.indexTransactionsLink,
  schemaV1Sql.createEntries,
  schemaV1Sql.indexEntriesTransaction,
  schemaV1Sql.indexEntriesAccount,
  schemaV1Sql.indexEntriesCategory,
  schemaV1Sql.createBudgets,
  schemaV1Sql.indexBudgetsCategory,
  schemaV1Sql.createGoals,
  schemaV1Sql.createGoalContributions,
  schemaV1Sql.indexGoalContributions,
  schemaV1Sql.createDebts,
  schemaV1Sql.createDebtMovements,
  schemaV1Sql.indexDebtMovements,
  schemaV1Sql.createSettings,
  schemaV1Sql.lockAccountCurrency,
  schemaV1Sql.validateCategoryParent,
  schemaV1Sql.validateCategoryParentUpdate,
  schemaV1Sql.lockTransactionKind,
  schemaV1Sql.validateLinkedTransaction,
  schemaV1Sql.validateEntryInsert,
  schemaV1Sql.validateEntryUpdate,
  schemaV1Sql.validateBudgetCategory,
  schemaV1Sql.validateBudgetCategoryUpdate,
  schemaV1Sql.validateDebtMovement,
  schemaV1Sql.createAccountBalancesView,
  schemaV1Sql.createCategorizedFlowsView,
  schemaV1Sql.createDebtOutstandingView,
  schemaV1Sql.createLedgerViolationsView,
  schemaV1Sql.setUserVersion1,
] as const;
