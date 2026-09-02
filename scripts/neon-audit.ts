import { query } from '../src/lib/db/client'
import { DEMO_MERCHANT_ID } from '../src/lib/db/seed'

async function audit() {
  const mId = DEMO_MERCHANT_ID
  console.log('=== NEON DATABASE FORENSIC AUDIT ===\n')
  console.log('Merchant ID:', mId)

  const totalCases = await query<{ c: string }>('SELECT COUNT(*) as c FROM recovery_cases WHERE merchant_id = ?', [mId])
  console.log('Total recovery_cases:', totalCases[0]?.c)

  const totalTx = await query<{ c: string }>('SELECT COUNT(*) as c FROM transactions WHERE merchant_id = ?', [mId])
  console.log('Total transactions:', totalTx[0]?.c)

  const totalFailedTx = await query<{ c: string }>("SELECT COUNT(*) as c FROM transactions WHERE merchant_id = ? AND status = 'failed'", [mId])
  console.log('Total failed transactions:', totalFailedTx[0]?.c)

  const caseStatuses = await query<{ status: string; c: string }>('SELECT status, COUNT(*) as c FROM recovery_cases WHERE merchant_id = ? GROUP BY status ORDER BY c DESC', [mId])
  console.log('\nCase Status Distribution in DB:')
  for (const s of caseStatuses) {
    console.log(`  - ${s.status}: ${s.c}`)
  }

  const txStatuses = await query<{ status: string; c: string }>('SELECT status, COUNT(*) as c FROM transactions WHERE merchant_id = ? GROUP BY status ORDER BY c DESC', [mId])
  console.log('\nTransaction Status Distribution in DB:')
  for (const s of txStatuses) {
    console.log(`  - ${s.status}: ${s.c}`)
  }

  // Canonical bucket breakdown
  const recovered = await query<{ c: string }>("SELECT COUNT(*) as c FROM recovery_cases WHERE merchant_id = ? AND status = 'recovered'", [mId])
  const inProgress = await query<{ c: string }>("SELECT COUNT(*) as c FROM recovery_cases WHERE merchant_id = ? AND status IN ('open', 'diagnosing', 'strategy_selected', 'executing', 'recovering')", [mId])
  const failed = await query<{ c: string }>("SELECT COUNT(*) as c FROM recovery_cases WHERE merchant_id = ? AND status IN ('failed', 'abandoned', 'no_action')", [mId])

  console.log('\nCanonical Bucket Breakdown:')
  console.log(`  - Recovered: ${recovered[0]?.c}`)
  console.log(`  - In Progress: ${inProgress[0]?.c}`)
  console.log(`  - Failed: ${failed[0]?.c}`)
  const sum = Number(recovered[0]?.c) + Number(inProgress[0]?.c) + Number(failed[0]?.c)
  console.log(`  - Total (sum of buckets): ${sum}`)
  console.log(`  - Conservation holds: ${sum === Number(totalCases[0]?.c)}`)
}

audit().catch(console.error)
