# REVIVE — Developer Guide

> Quickstart, Environment Setup, Testing, and Extension Guide

---

## 1. Environment Configuration

Copy `.env.example` to `.env.local` to configure optional production credentials. REVIVE operates in **Demo Mode with full Deterministic Safety Floor** if no keys are provided.

```bash
# Optional: Google Gemini AI (Enables real LLM reasoning in Strategy Selection)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Optional: Razorpay Credentials (for live gateway integration)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here

# Optional: Turso / LibSQL Cloud URL (Defaults to local SQLite)
DATABASE_URL=
DATABASE_AUTH_TOKEN=
```

---

## 2. Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run TypeScript checks & build
npm run build

# Run AI & Financial Safety test suite
npm test
```

---

## 3. Key Directory Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing Page (cinematic reveal)
│   ├── dashboard/                  # Merchant Operations Console
│   │   ├── command-center/         # Live 7-stage interactive pipeline
│   │   ├── cases/                  # Case management & audit timelines
│   │   ├── analytics/              # Recovery metrics by method & action
│   │   └── policies/               # Merchant recovery guardrails
│   └── api/
│       ├── ai-status/              # Real-time AI runtime status check
│       ├── simulation/             # Batch & single-case simulation
│       ├── webhooks/razorpay/      # HMAC-verified webhook ingestion
│       ├── dashboard/              # Aggregated SQL KPIs
│       └── cases/[caseId]/         # Timeline & agent decisions API
├── lib/
│   ├── ai/
│   │   ├── provider.ts             # AIProvider abstraction interface
│   │   ├── gemini.ts               # Google Gemini provider with Zod validation
│   │   ├── types.ts                # AI Context & Zod response schemas
│   │   └── index.ts                # Hybrid AI / Deterministic Strategy Engine
│   ├── engine/
│   │   ├── orchestrator.ts         # 7-Stage Main Recovery Orchestrator
│   │   ├── diagnosis.ts            # Failure classification & recoverability
│   │   ├── intent.ts               # 6-signal behavioral intent scoring
│   │   ├── strategy.ts             # Deterministic Expected Recovery Value
│   │   ├── policy-guard.ts         # 8 deterministic safety rules
│   │   └── executor.ts             # Idempotent tool execution boundary
│   └── payment/
│       └── demo.ts                 # Deterministic Demo Payment Provider
└── database/
    └── schema.sql                  # 12-table SQLite production schema
```

---

## 4. Testing the AI Safety Boundaries

Run the automated test suite:

```bash
npm test
```

This verifies:
1. **Zod Schema Validation**: Strict parsing of structured AI decisions and confidence clamping.
2. **Deterministic Safety Floor**: Automatic fallback when Gemini is offline or rate-limited.
3. **Financial Safety Enforcement**: Immediate rejection if AI proposes an action disabled by merchant policy.
4. **Mathematical Verification**: Enforcing deterministic Expected Recovery Value (ERV) numbers on AI recommendations.
