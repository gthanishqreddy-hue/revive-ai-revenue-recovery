# REVIVE — Architecture Documentation

> Autonomous AI Revenue Recovery Engine

---

## 1. System Overview

REVIVE is a production-quality, AI-assisted revenue recovery engine designed to autonomously identify, diagnose, and recover at-risk payments within strict fintech safety boundaries.

### The Core Architectural Principle
> **"The AI Proposes. The Deterministic Engine Verifies. The Policy Guard Authorizes. The Idempotent Executor Dispatches."**

Under no circumstances can an LLM directly move money, bypass merchant policies, or trigger arbitrary payment actions.

---

## 2. Hybrid AI & Deterministic Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           REVIVE ENGINE PIPELINE                        │
│                                                                         │
│  [1. INGESTION]          [2. DIAGNOSIS]            [3. INTENT]          │
│   Payment Event   ───►    Deterministic     ───►    Behavioral          │
│   (HMAC Webhook)          Failure Matrix            Intent Scoring      │
│                                                          │              │
│  ┌───────────────────────────────────────────────────────▼───────────┐  │
│  │                    [4. STRATEGY EVALUATION]                       │  │
│  │                                                                   │  │
│  │   ┌───────────────────────────────────────────────┐               │  │
│  │   │ Deterministic Safety Floor (ERV Optimizer)    │               │  │
│  │   │ ERV = (P_success × Amount) - Cost - Friction │               │  │
│  │   └──────────────────────┬────────────────────────┘               │  │
│  │                          │ Candidate Strategies & Constraints     │  │
│  │                          ▼                                        │  │
│  │   ┌───────────────────────────────────────────────┐               │  │
│  │   │ Google Gemini AI (gemini-2.5-flash)           │               │  │
│  │   │ - Structured Context (Sanitized, NO PII/Keys) │               │  │
│  │   │ - Zod Schema-Validated JSON Output            │               │  │
│  │   │ - 6s Timeout & Fallback Interceptor           │               │  │
│  │   └──────────────────────┬────────────────────────┘               │  │
│  │                          │ Proposed Strategy                      │  │
│  │                          ▼                                        │  │
│  │   ┌───────────────────────────────────────────────┐               │  │
│  │   │ Mathematical & Channel Verification           │               │  │
│  │   │ (Must match candidate ERV calculations)       │               │  │
│  │   └───────────────────────────────────────────────┘               │  │
│  └──────────────────────────┬────────────────────────────────────────┘  │
│                             │ Verified Strategy                         │
│                             ▼                                           │
│  [5. POLICY GUARD]       [6. EXECUTOR]             [7. OUTCOME]         │
│   8 Deterministic ───►    Idempotent Gate   ───►    DB Update &         │
│   Merchant Rules          Payment Provider          Customer Learning   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Financial Safety & Security Boundaries

### Why the LLM Cannot Control Money Directly
1. **Hallucination Prevention**: LLMs can produce ungrounded numbers or nonsensical recovery paths. REVIVE forces the LLM to choose strictly from candidate strategies pre-evaluated by the deterministic Expected Recovery Value (ERV) engine.
2. **Schema & Value Verification**: Every AI output is parsed and validated using Zod (`AIDecisionSchema`). Malformed responses are immediately rejected.
3. **Channel Guard**: If the AI attempts to suggest an action not enabled by the merchant (e.g., outbound phone call when voice is disabled), the hybrid engine intercepts and rejects the recommendation.
4. **Policy Guard**: Even after AI strategy selection, the 8-rule deterministic Policy Guard evaluates retries, timing intervals, daily limits, and high-value thresholds.
5. **Idempotent Tool Interface**: The action executor enforces a unique idempotency key `{transactionId}_{action}_{attemptNumber}` across all attempts. Double executions are physically blocked by database constraints.

### Sanitized Context & Data Privacy
REVIVE never passes card numbers, CVVs, bank credentials, or sensitive merchant secrets to the LLM. The AI receives only sanitized operational context:
- Transaction amount (in rupees/paise)
- Payment method (UPI, card, netbanking)
- Failure code & category
- Customer historical success rate and recency
- Pre-calculated candidate strategy expected values
- Merchant retry rules

---

## 4. Fallback Architecture

If any of the following occur:
- `GEMINI_API_KEY` is not configured (e.g. offline demo mode)
- Gemini API times out (> 6000ms)
- API rate limits or network failures
- Schema validation failure on AI JSON output
- AI proposes an action disallowed by merchant policy

The pipeline seamlessly falls back to the **Deterministic ERV Optimizer**:
- `model_used` is recorded as `"deterministic-fallback"`.
- The system logs the exact fallback reason in `agent_decisions` for complete auditability.
- No recovery attempt fails because of external AI downtime.

---

## 5. Decision Logging & Observability

Every pipeline run produces an immutable audit trail in SQLite:
- `payment_events`: Raw webhook payload and idempotency key.
- `recovery_cases`: Full case lifecycle status.
- `agent_decisions`: Structured decision log for `diagnosis`, `intent`, `strategy`, and `policy`, complete with confidence scores, exact model used, and reasoning bullets.
- `agent_runs`: Stage-by-stage execution latency.
- `recovery_attempts` & `recovery_actions`: Execution results and idempotency tracking.
- `customer_features`: Continuous learning features updated post-recovery.
