-- REVIVE Database Schema
-- Compatible with SQLite (hackathon) and PostgreSQL/Supabase (production)
-- Each table has a clear purpose documented inline

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================
-- MERCHANTS
-- The top-level account. All data is scoped to a merchant.
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  api_key     TEXT NOT NULL,              -- Razorpay key (stored encrypted in production)
  is_demo     INTEGER NOT NULL DEFAULT 0, -- 1 = this is a demo/sandbox merchant
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- CUSTOMERS
-- Individual payers for a merchant.
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id                TEXT PRIMARY KEY,
  merchant_id       TEXT NOT NULL REFERENCES merchants(id),
  external_id       TEXT,               -- Razorpay customer ID
  name              TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  total_payments    INTEGER NOT NULL DEFAULT 0,
  successful_payments INTEGER NOT NULL DEFAULT 0,
  failed_payments   INTEGER NOT NULL DEFAULT 0,
  total_spent       INTEGER NOT NULL DEFAULT 0, -- in paise
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
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
  external_id     TEXT,               -- Razorpay payment/order ID
  amount          INTEGER NOT NULL,   -- in paise (₹1 = 100 paise)
  currency        TEXT NOT NULL DEFAULT 'INR',
  payment_method  TEXT NOT NULL,      -- upi, card, netbanking, wallet
  status          TEXT NOT NULL,      -- created, attempted, failed, captured, refunded
  failure_code    TEXT,               -- bank specific code e.g. BAD_REQUEST_ERROR
  failure_reason  TEXT,               -- human readable reason
  gateway_error   TEXT,               -- raw gateway response
  metadata        TEXT,               -- JSON blob for extra fields
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
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
  event_type      TEXT NOT NULL,      -- payment.failed, payment.captured, etc.
  payload         TEXT NOT NULL,      -- raw JSON
  idempotency_key TEXT NOT NULL UNIQUE, -- prevents duplicate event processing
  processed       INTEGER NOT NULL DEFAULT 0,
  source          TEXT NOT NULL DEFAULT 'webhook', -- webhook | demo | simulation
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
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
  -- open, diagnosing, strategy_selected, executing, recovering,
  -- recovered, failed, abandoned, no_action
  failure_category      TEXT,         -- temporary_upi | bank_timeout | card_decline | etc.
  severity              TEXT,         -- low | medium | high | critical
  recoverability_score  REAL,         -- 0.0 - 1.0
  intent_score          REAL,         -- 0.0 - 1.0
  expected_recovery     INTEGER,      -- in paise
  actual_recovery       INTEGER,      -- in paise, set when recovered
  selected_strategy     TEXT,         -- RETRY_PAYMENT | SEND_WHATSAPP | etc.
  diagnosis_reason      TEXT,         -- AI or deterministic explanation
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at           TEXT
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
  -- pending | executing | success | failed | expired | declined | no_response
  result_code     TEXT,
  result_message  TEXT,
  amount_recovered INTEGER,           -- in paise
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT,
  idempotency_key TEXT NOT NULL UNIQUE -- prevents duplicate action execution
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
  action_type     TEXT NOT NULL,      -- RETRY_PAYMENT | SEND_WHATSAPP | etc.
  payload         TEXT,               -- JSON of what was sent
  response        TEXT,               -- JSON of what came back
  status          TEXT NOT NULL DEFAULT 'pending',
  executed_at     TEXT,
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
  agent_type      TEXT NOT NULL,      -- diagnosis | intent | strategy | policy
  input_summary   TEXT NOT NULL,      -- JSON summary of inputs
  decision        TEXT NOT NULL,      -- JSON structured decision output
  confidence      REAL,               -- 0.0 - 1.0
  reasoning       TEXT,               -- bullet-point explanation from AI
  model_used      TEXT,               -- gemini-flash | deterministic-fallback
  latency_ms      INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_decisions_case ON agent_decisions(case_id);

-- ============================================================
-- AGENT_RUNS
-- High-level log of engine pipeline execution per case.
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_runs (
  id              TEXT PRIMARY KEY,
  case_id         TEXT NOT NULL REFERENCES recovery_cases(id),
  stage           TEXT NOT NULL,      -- ingestion | diagnosis | intent | strategy | policy | execution | outcome
  status          TEXT NOT NULL,      -- running | completed | failed | skipped
  duration_ms     INTEGER,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
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
  recovery_success_rate     REAL,         -- historical recovery win rate
  days_since_last_payment   INTEGER,
  payment_frequency_score   REAL,         -- 0-1 based on recency/frequency
  high_value_customer       INTEGER NOT NULL DEFAULT 0, -- boolean
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
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
  min_recovery_amount_paise INTEGER NOT NULL DEFAULT 10000, -- ₹100
  allowed_channels          TEXT NOT NULL DEFAULT '["RETRY_PAYMENT","SEND_EMAIL","GENERATE_PAYMENT_LINK"]',
  human_approval_threshold  INTEGER NOT NULL DEFAULT 1000000, -- ₹10,000 in paise
  max_recovery_cost_paise   INTEGER NOT NULL DEFAULT 5000,    -- ₹50
  auto_abandon_after_hours  INTEGER NOT NULL DEFAULT 48,
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- AUDIT_LOGS
-- Immutable event log for compliance and debugging.
-- Every significant action writes here.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT REFERENCES merchants(id),
  actor       TEXT NOT NULL,          -- system | agent | user | webhook
  event       TEXT NOT NULL,          -- what happened
  entity_type TEXT,                   -- transaction | case | attempt | decision
  entity_id   TEXT,
  details     TEXT,                   -- JSON
  severity    TEXT NOT NULL DEFAULT 'info', -- info | warning | error | critical
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_merchant ON audit_logs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
