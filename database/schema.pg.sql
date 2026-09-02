-- REVIVE Database Schema (PostgreSQL / Neon)
-- Migrated from SQLite for Vercel production deployment
-- Each table has a clear purpose documented inline

-- ============================================================
-- MERCHANTS
-- The top-level account. All data is scoped to a merchant.
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  api_key     TEXT NOT NULL,
  is_demo     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS
-- Individual payers for a merchant.
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id                TEXT PRIMARY KEY,
  merchant_id       TEXT NOT NULL REFERENCES merchants(id),
  external_id       TEXT,
  name              TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  total_payments    INTEGER NOT NULL DEFAULT 0,
  successful_payments INTEGER NOT NULL DEFAULT 0,
  failed_payments   INTEGER NOT NULL DEFAULT 0,
  total_spent       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_merchant ON customers(merchant_id);

-- ============================================================
-- TRANSACTIONS
-- Individual payment transaction records.
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  merchant_id     TEXT NOT NULL REFERENCES merchants(id),
  customer_id     TEXT REFERENCES customers(id),
  external_id     TEXT,
  amount          INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'INR',
  payment_method  TEXT NOT NULL,
  status          TEXT NOT NULL,
  failure_code    TEXT,
  failure_reason  TEXT,
  gateway_error   TEXT,
  metadata        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ============================================================
-- PAYMENT_EVENTS
-- Raw events received (webhooks or synthesized in demo mode).
-- Immutable audit trail. Idempotency key prevents duplicates.
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_events (
  id              TEXT PRIMARY KEY,
  merchant_id     TEXT NOT NULL REFERENCES merchants(id),
  transaction_id  TEXT REFERENCES transactions(id),
  event_type      TEXT NOT NULL,
  payload         TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  processed       BOOLEAN NOT NULL DEFAULT FALSE,
  source          TEXT NOT NULL DEFAULT 'webhook',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_merchant ON payment_events(merchant_id);
CREATE INDEX IF NOT EXISTS idx_events_idempotency ON payment_events(idempotency_key);

-- ============================================================
-- RECOVERY_CASES
-- One case per failed/at-risk transaction.
-- Tracks the full lifecycle of a recovery attempt.
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_cases (
  id                    TEXT PRIMARY KEY,
  merchant_id           TEXT NOT NULL REFERENCES merchants(id),
  transaction_id        TEXT NOT NULL REFERENCES transactions(id),
  customer_id           TEXT REFERENCES customers(id),
  status                TEXT NOT NULL DEFAULT 'open',
  failure_category      TEXT,
  severity              TEXT,
  recoverability_score  REAL,
  intent_score          REAL,
  expected_recovery     INTEGER,
  actual_recovery       INTEGER,
  selected_strategy     TEXT,
  diagnosis_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cases_merchant ON recovery_cases(merchant_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON recovery_cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_transaction ON recovery_cases(transaction_id);

-- ============================================================
-- RECOVERY_ATTEMPTS
-- Each time the engine tries to recover a case.
-- Multiple attempts possible per case (up to policy max).
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_attempts (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES recovery_cases(id),
  attempt_number  INTEGER NOT NULL DEFAULT 1,
  strategy        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  result_code     TEXT,
  result_message  TEXT,
  amount_recovered INTEGER,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_attempts_case ON recovery_attempts(case_id);

-- ============================================================
-- RECOVERY_ACTIONS
-- Log of every action actually executed (the controlled tool calls).
-- Granular record for audit and debugging.
-- ============================================================
CREATE TABLE IF NOT EXISTS recovery_actions (
  id              TEXT PRIMARY KEY,
  attempt_id      TEXT NOT NULL REFERENCES recovery_attempts(id),
  action_type     TEXT NOT NULL,
  payload         TEXT,
  response        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  executed_at     TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_actions_attempt ON recovery_actions(attempt_id);

-- ============================================================
-- AGENT_DECISIONS
-- Structured output from the AI for every decision made.
-- Critical for explainability. Never contains raw LLM text dumps.
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_decisions (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES recovery_cases(id),
  agent_type      TEXT NOT NULL,
  input_summary   TEXT NOT NULL,
  decision        TEXT NOT NULL,
  confidence      REAL,
  reasoning       TEXT,
  model_used      TEXT,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decisions_case ON agent_decisions(case_id);

-- ============================================================
-- AGENT_RUNS
-- High-level log of engine pipeline execution per case.
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES recovery_cases(id),
  stage           TEXT NOT NULL,
  status          TEXT NOT NULL,
  duration_ms     INTEGER,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_runs_case ON agent_runs(case_id);

-- ============================================================
-- CUSTOMER_FEATURES
-- Pre-computed features used for intent scoring.
-- Refreshed after each transaction.
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_features (
  customer_id               TEXT PRIMARY KEY REFERENCES customers(id),
  avg_transaction_amount    INTEGER,
  preferred_payment_method  TEXT,
  checkout_attempts_30d     INTEGER NOT NULL DEFAULT 0,
  recovery_success_rate     REAL,
  days_since_last_payment   INTEGER,
  payment_frequency_score   REAL,
  high_value_customer       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- POLICIES
-- Merchant-defined limits and rules for the AI to operate within.
-- The Policy Guard reads this before allowing any action.
-- ============================================================
CREATE TABLE IF NOT EXISTS policies (
  id                        TEXT PRIMARY KEY,
  merchant_id               TEXT NOT NULL REFERENCES merchants(id) UNIQUE,
  max_retries               INTEGER NOT NULL DEFAULT 2,
  min_retry_interval_mins   INTEGER NOT NULL DEFAULT 15,
  max_notifications_per_day INTEGER NOT NULL DEFAULT 2,
  min_recovery_amount_paise INTEGER NOT NULL DEFAULT 10000,
  allowed_channels          TEXT NOT NULL DEFAULT '["RETRY_PAYMENT","SEND_EMAIL","GENERATE_PAYMENT_LINK"]',
  human_approval_threshold  INTEGER NOT NULL DEFAULT 1000000,
  max_recovery_cost_paise   INTEGER NOT NULL DEFAULT 5000,
  auto_abandon_after_hours  INTEGER NOT NULL DEFAULT 48,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT_LOGS
-- Immutable event log for compliance and debugging.
-- Every significant action writes here.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id),
  actor       TEXT NOT NULL,
  event       TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  details     TEXT,
  severity    TEXT NOT NULL DEFAULT 'info',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_merchant ON audit_logs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
