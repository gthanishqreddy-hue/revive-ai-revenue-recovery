# REVIVE — Judges Q&A

> 50+ technical questions and concise answers covering every major aspect of the system.
> All answers describe the ACTUAL implementation in this codebase.

---

## Architecture & System Design

**Q1: What is the overall architecture of REVIVE?**

A: REVIVE is a Next.js full-stack application with a layered architecture:
- Frontend: React/TypeScript dashboard with Recharts visualizations
- API layer: Next.js App Router API routes (server-side only)
- Recovery engine: 6 pure TypeScript modules (diagnosis → intent → strategy → policy → executor → outcome)
- Database: SQLite via @libsql/client (schema-identical to PostgreSQL for Supabase migration)
- Payment provider: Abstracted behind PaymentProvider interface (DemoPaymentProvider | RazorpayProvider)
- AI: Deterministic engine (always works) + optional Gemini enhancement

**Q2: Why not microservices?**

A: The hackathon scope doesn't benefit from microservice complexity. The codebase is organized as clear modules with well-defined interfaces. The architecture documentation shows exactly how each module would become an independent service in production (queues, workers, separate DB connections).

**Q3: How does the database scale to 1M+ transactions/day?**

A: Four changes needed: (1) SQLite → Supabase PostgreSQL — only the driver changes, schema is identical. (2) Synchronous inline processing → BullMQ message queue with worker pool. (3) Redis for idempotency key caching and rate limiting. (4) Read replicas for analytics queries. The architecture documentation covers this in detail.

**Q4: What is the data flow from a failed payment to recovery?**

A: Razorpay webhook → signature verification → idempotency check → persist event → create recovery_case → diagnosis → intent scoring → strategy selection → policy validation → action execution → outcome update → audit log. Every step persists structured data before proceeding.

---

## AI Agents & LLMs

**Q5: Is this just an LLM wrapper?**

A: No. The AI is one component in a 6-stage deterministic pipeline. The diagnosis engine uses deterministic failure code mapping. The intent engine uses pure mathematical weighted scoring. The strategy engine uses the ERV formula: (P_success × Amount) − ActionCost − FrictionPenalty. The LLM enhances reasoning quality but the system functions completely without it via the deterministic fallback.

**Q6: What happens if the Gemini API is unavailable?**

A: The `deterministic-erv-optimizer` runs instead. It uses the same ERV formula and produces the same quality of recovery decision — just without natural language reasoning. The system never fails because an LLM is unavailable.

**Q7: How do you prevent the LLM from doing something dangerous?**

A: Three layers: (1) LLM output is validated against a Zod schema — malformed output is rejected. (2) Business rules prevent illogical decisions (e.g., retrying a fraud-blocked transaction). (3) The Policy Guard enforces merchant-defined limits deterministically. The LLM cannot call any payment API directly.

**Q8: What is the structured output format from the AI?**

A: The strategy engine produces a `StrategySelectionResult` containing the selected action, probability of success, expected recovery value, action cost, friction penalty, and reasoning as an array of bullet points. This is persisted as JSON in `agent_decisions.decision`.

**Q9: Can the AI choose to send money to the wrong person?**

A: No. The AI outputs one of 8 predefined action types (enum). The `executeRecoveryAction` function only executes the specific action type against the specific transaction ID. The LLM has no ability to specify arbitrary payment amounts, destinations, or credentials.

**Q10: What is the intent score and how is it calculated?**

A: The intent score (0–100) is a weighted average of 5 signals: (1) Payment success rate (25% weight), (2) Checkout attempts in 30 days (20%), (3) Transaction amount vs. customer average (15%), (4) Days since last payment (15%), (5) Historical recovery success rate (15%), (6) Failure type modifier (10%). All deterministic math, no ML model.

---

## Recovery Decision Engine

**Q11: What is Expected Recovery Value?**

A: ERV = (P_success × Amount) − ActionCost − FrictionPenalty. For example: WAIT_AND_RETRY on a ₹4,999 UPI timeout: (0.78 × 499,900) − 0 − 1,000 = ₹389,922 ERV. VOICE_CALL on the same transaction: (0.35 × 499,900) − 5,000 − 8,000 = ₹161,465 ERV. WAIT_AND_RETRY wins.

**Q12: What are the 8 available recovery actions?**

A: RETRY_PAYMENT (immediate retry), WAIT_AND_RETRY (retry after recommended interval), GENERATE_PAYMENT_LINK (fresh link via any method), SEND_WHATSAPP (personalized message with link), SEND_EMAIL (email notification), VOICE_CALL (outbound call), NO_ACTION (permanently failed cases), ESCALATE_TO_HUMAN (high-value or complex cases).

**Q13: How does the diagnosis engine determine failure category?**

A: A deterministic lookup table maps 10 failure codes (UPI_TIMEOUT, BANK_TIMEOUT, CARD_DECLINED, etc.) to `FailureCategory`, `isPermanent` flag, and `recommendedWaitMinutes`. The base recoverability score for each category is calibrated from heuristic fintech knowledge. Customer history adjusts the score up or down by up to ±15%.

**Q14: Can a fraud-blocked transaction be retried?**

A: No. The diagnosis engine marks `is_permanent = true` for FRAUD_BLOCKED failures. The policy guard blocks RETRY_PAYMENT and WAIT_AND_RETRY actions when `isPermanentFailure = true`. The system selects NO_ACTION automatically and closes the case.

**Q15: How does the system handle a customer with no transaction history?**

A: Missing signals default to neutral scores (50/100 for intent). The recoverability score uses only the failure category baseline without the customer history adjustment. The system still runs and selects an action — it just has lower confidence.

---

## Policy Guard

**Q16: What are the 8 policy guard rules?**

A: (1) No retry of permanently failed transactions, (2) Maximum retry attempts per case, (3) Minimum retry interval, (4) Maximum notifications per customer per day, (5) Minimum transaction value for recovery, (6) Action must be in allowed channels list, (7) High-value transactions require human approval, (8) Voice call warning for friction tracking.

**Q17: What happens when a policy rule is violated?**

A: The violation is logged to audit_logs. The `findFallbackAction` function iterates through alternative actions in priority order until it finds one that passes all policy rules. The UI shows which action was originally proposed and which fallback was used.

**Q18: Can a merchant set max_retries to 0?**

A: Yes — this effectively disables automated retries. The system will still generate payment links and send notifications as allowed by other policy settings.

**Q19: How does the daily notification limit work?**

A: The policy guard queries: `SELECT COUNT(*) FROM recovery_attempts WHERE merchant_id = ? AND strategy IN ('SEND_WHATSAPP','SEND_EMAIL','VOICE_CALL','GENERATE_PAYMENT_LINK') AND started_at > datetime('now', '-1 day')`. If count ≥ max_notifications_per_day, any notification action is blocked.

---

## Database & Idempotency

**Q20: Why SQLite for a payment system?**

A: For the hackathon: zero setup, works everywhere, schema identical to PostgreSQL. In production: Supabase PostgreSQL with the exact same schema — only the client driver changes. The architecture document explains this explicitly.

**Q21: How does idempotency work?**

A: Every recovery action generates a key: `{transaction_id}_{action_type}_{attempt_number}`. This has a UNIQUE constraint in `recovery_actions`. Before executing: query for existing record. If found and not pending: return cached result. This means the same action can never execute twice even with duplicate webhooks or network retries.

**Q22: What happens if a webhook arrives twice?**

A: The webhook handler checks `payment_events WHERE idempotency_key = ?` before inserting. If found: returns `200 OK, idempotent: true` immediately. No duplicate event processing, no duplicate recovery case creation.

**Q23: Why 14 database tables? Is that over-engineered?**

A: Each table has a specific, documented purpose. The schema was designed by asking: "what data do I need to answer these business questions?" — recovered revenue, recovery rates, agent decision audit trail, customer behavioral features, and compliance logs all require separate concerns.

**Q24: How are recovery cases related to transactions?**

A: One-to-one: each failed transaction gets at most one recovery_case. The case tracks the complete recovery lifecycle. Multiple recovery_attempts can exist per case (up to policy max_retries). Each attempt has exactly one recovery_action.

---

## Webhooks & Razorpay

**Q25: How is the Razorpay webhook verified?**

A: HMAC-SHA256 signature verification using `crypto.timingSafeEqual` (prevents timing attacks). The raw request body is hashed with the webhook secret and compared to the `x-razorpay-signature` header. In demo mode (no real secret configured), verification is skipped and logged as a bypass.

**Q26: Why is `timingSafeEqual` important?**

A: String comparison (`===`) short-circuits at the first different character, making it vulnerable to timing attacks that can gradually determine the valid signature. `crypto.timingSafeEqual` always compares all bytes in constant time.

**Q27: What Razorpay events does REVIVE handle?**

A: Currently: `payment.failed`. The webhook handler is designed to handle additional events (payment.captured, payment.refunded) by adding cases to the event type handler. The adapter pattern means adding a new event type is a small code change.

**Q28: How would you integrate real Razorpay APIs?**

A: Create `RazorpayProvider` implementing the same interface as `DemoPaymentProvider`. For payment retries: use Razorpay Payment Links API. For UPI: use Razorpay UPI API. Switch providers by changing `new DemoPaymentProvider()` to `new RazorpayProvider(key, secret)`. The rest of the engine is unchanged.

---

## Security

**Q29: Where are API secrets stored?**

A: Environment variables only. `.env.example` shows the required variables. No secrets in source code, no secrets in the frontend bundle, no secrets in Git.

**Q30: Can a customer see another customer's data?**

A: Not in this demo (single merchant mode). In production: all queries include `merchant_id = ?` scoping. The merchant_id comes from the authenticated session, not from user input.

**Q31: Is payment credential data ever sent to the LLM?**

A: Never. The AI receives only: failure category, severity, recoverability score, intent score, amount (not credentials), and merchant policy constraints. No card numbers, bank credentials, or UPI VPAs are in AI prompts.

**Q32: What is the audit log used for?**

A: Every significant action writes to `audit_logs`: webhook received, AI decision made, policy blocked, action executed, outcome recorded. The log is immutable (insert-only) and includes actor, event type, entity references, and JSON details. A compliance officer can reconstruct every recovery event from this log.

---

## Product & Business

**Q33: What makes REVIVE different from "payment retry tools"?**

A: Three things: (1) Multi-strategy optimization — we compare all 8 action types quantitatively and pick the highest ERV, not just retry. (2) Customer intent scoring — we don't chase customers who aren't going to pay. (3) Closed-loop measurement — we track actual recovered ₹, not just whether an action was sent.

**Q34: What is the business model?**

A: SaaS on recovered revenue — percentage of recovered amount (e.g., 5-10% of recovered ₹). Merchants only pay when REVIVE actually recovers money. Aligned incentives.

**Q35: What is the merchant's control mechanism?**

A: The Policies page allows merchants to configure: max retries, retry interval, daily notification limits, minimum recovery amount, allowed channels, human approval threshold, and max recovery cost. All changes persist immediately and affect the next recovery decision.

**Q36: How is "recovery rate" calculated?**

A: `(recovered cases / total failed cases) × 100`. In the demo data: ~45% of cases are recovered, which is realistic for Indian UPI and card failures where temporary errors are common.

---

## Demo & Simulation

**Q37: Is the simulation using real application logic?**

A: Yes. The "Run Simulation" button calls `POST /api/simulation` which calls `runRecoveryPipeline()` for each pending case. This runs the same diagnosis → intent → strategy → policy → execution pipeline that would run on a real event. The results are stored in the database and reflected in the dashboard.

**Q38: How can I verify the dashboard numbers aren't hardcoded?**

A: Run the simulation, then refresh the dashboard — numbers update. Look at the dashboard API (`/api/dashboard`) — all values come from SQL aggregate queries against the `recovery_cases`, `transactions`, and `recovery_attempts` tables.

**Q39: What does "DEMO / SANDBOX" mean?**

A: All transactions are synthetic, generated by `src/lib/db/seed.ts`. No real Razorpay customer data. No real payments. The label appears in the UI, the API responses, and the code comments. This is transparent — we are not claiming real Razorpay transaction results.

**Q40: Can the demo be run without internet?**

A: Yes. The database is local SQLite. The recovery engine is deterministic. The only internet dependency is Google Fonts (UI loads without it, just uses system fonts) and the optional Gemini API (fallback runs without it).

---

## Failure Handling & Edge Cases

**Q41: What if the database is unavailable?**

A: API routes catch all database errors and return structured 500 responses with error messages. No silent failures. No partial writes. The error is logged before the exception is thrown.

**Q42: What if a recovery action partially completes?**

A: The action is logged as `pending` before execution. If the process crashes mid-execution, the next run finds the `pending` action and re-executes (the idempotency key prevents double-charging on the payment side).

**Q43: What if an AI-selected strategy fails?**

A: The executor catches the error, marks the attempt as `failed`, updates the case status, and logs the error. The case remains open for the next scheduled retry (or is marked abandoned after the policy timeout).

**Q44: What if a customer has already paid when the retry executes?**

A: In production with real Razorpay: the retry would fail with `ALREADY_PAID` and the payment provider returns this code. The system marks the attempt as `failed`, queries the transaction status, and marks the case as resolved if the original payment was captured.

---

## Code Quality

**Q45: How large is the codebase?**

A: ~15 TypeScript files for the core engine and API, ~8 page components for the UI. Each file is focused on a single responsibility. No file is unmaintainable. The largest file is the orchestrator at ~200 lines.

**Q46: Is TypeScript strict mode enabled?**

A: Yes. `"strict": true` in tsconfig.json. All types are explicit. No `any` types in production code.

**Q47: How would you add a new recovery action?**

A: (1) Add to `RecoveryAction` union type in `types.ts`, (2) Add success probability to `ACTION_SUCCESS_PROBS` in `strategy.ts`, (3) Add cost to `ACTION_COSTS`, (4) Add friction to `ACTION_FRICTION`, (5) Add display label to `ACTION_LABELS` in `utils.ts`, (6) Add execution logic to `DemoPaymentProvider`. The policy guard and orchestrator require no changes.

---

## Performance

**Q48: How long does a single recovery pipeline run take?**

A: In demo mode: 1–3 seconds total (simulated provider latency is 300–1500ms per the DEMO_LATENCY table). In production: diagnosis and intent are <1ms each (pure computation). Strategy selection is <1ms. Policy guard is <10ms (DB query). The bottleneck is the payment provider API call (500–2000ms depending on action type).

**Q49: Can REVIVE process 1000 cases simultaneously?**

A: With the current synchronous implementation: no (it processes sequentially). With a BullMQ worker pool of 20 workers: yes, 1000 cases in ~60 seconds. With 100 workers and Supabase connection pooling: 1000 cases in ~15 seconds. The architecture documentation covers the production scaling path.

**Q50: Are database queries optimized?**

A: Yes. All foreign keys have indexes (`CREATE INDEX`). The dashboard query uses GROUP BY aggregates rather than fetching all rows. The transactions query uses a JOIN instead of N+1 queries. The idempotency check is an indexed lookup.

---

## Technical Deep-Dives

**Q51: Walk me through the exact code path for a failed UPI payment.**

A: (1) `POST /api/webhooks/razorpay` receives event → verifies signature → checks idempotency key in `payment_events` → inserts event → returns 200. (2) `runRecoveryPipeline(transactionId, merchantId)` is called → loads transaction from DB → calls `diagnoseTransaction()` which maps `UPI_TIMEOUT` to `{category: 'temporary_upi_failure', recoverability: 0.78}` → calls `calculateCustomerIntent()` which computes weighted score → calls `selectRecoveryStrategy()` which evaluates ERV for all allowed actions → calls `validateAgainstPolicy()` which checks 8 rules → calls `executeRecoveryAction()` which writes to DB, checks idempotency, calls `DemoPaymentProvider.executeAction()`, returns result → updates recovery_case status → updates audit_log.

**Q52: What would you build next if you had 3 more days?**

A: (1) Real Razorpay Payment Links API integration for `GENERATE_PAYMENT_LINK`. (2) Learning loop: after each outcome, update success probability weights based on actual results. (3) Customer communication templates with personalization. (4) Multi-merchant support with separate policy configurations. (5) Razorpay Subscriptions native integration.
