import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { query, execute } from '../src/lib/db/client'
import { DEMO_MERCHANT_ID } from '../src/lib/db/seed'
import { runRecoveryPipeline } from '../src/lib/engine/orchestrator'

async function runLiveVerification() {
  console.log('====================================================')
  console.log('🔍 LIVE NEON POSTGRESQL VERIFICATION')
  console.log('====================================================\n')

  // 1. Inspect demo cases before consolidation
  console.log('--- STEP 1: Query tx_demo_00042 in recovery_cases ---')
  const demoCasesBefore = await query<{
    id: string
    merchant_id: string
    transaction_id: string
    status: string
    actual_recovery: number
    created_at: string
  }>(
    'SELECT id, merchant_id, transaction_id, status, actual_recovery, created_at FROM recovery_cases WHERE transaction_id = ? ORDER BY created_at ASC',
    ['tx_demo_00042']
  )
  console.log(`Found ${demoCasesBefore.length} row(s) for tx_demo_00042:`)
  for (const c of demoCasesBefore) {
    console.log(`  • ID: ${c.id}, status: ${c.status}, created_at: ${c.created_at}`)
  }

  // 2. Check all duplicate transaction_ids
  console.log('\n--- STEP 2: Check all duplicate transaction_ids in recovery_cases ---')
  const duplicates = await query<{
    merchant_id: string
    transaction_id: string
    count: string
  }>(
    'SELECT merchant_id, transaction_id, COUNT(*) as count FROM recovery_cases GROUP BY merchant_id, transaction_id HAVING COUNT(*) > 1'
  )
  console.log(`Duplicate groups found: ${duplicates.length}`)
  for (const d of duplicates) {
    console.log(`  • Transaction ${d.transaction_id}: ${d.count} duplicate cases`)
  }

  // 3. Consolidate duplicates if any exist
  let canonicalId = 'case_demo_0042'
  if (demoCasesBefore.length > 1) {
    console.log('\n--- STEP 3: Consolidating duplicate recovery_cases safely ---')
    // Find canonical case (case_demo_0042 or the earliest)
    const canonical = demoCasesBefore.find(c => c.id === 'case_demo_0042') ?? demoCasesBefore[0]
    canonicalId = canonical.id
    console.log(`Selected canonical case ID: ${canonicalId}`)

    const duplicateIds = demoCasesBefore.filter(c => c.id !== canonicalId).map(c => c.id)

    for (const dupId of duplicateIds) {
      console.log(`  Reassigning child foreign keys from duplicate case ${dupId} to canonical ${canonicalId}...`)
      await execute('UPDATE recovery_attempts SET case_id = ? WHERE case_id = ?', [canonicalId, dupId])
      await execute('UPDATE agent_decisions SET case_id = ? WHERE case_id = ?', [canonicalId, dupId])
      await execute('UPDATE agent_runs SET case_id = ? WHERE case_id = ?', [canonicalId, dupId])
      await execute('DELETE FROM recovery_cases WHERE id = ?', [dupId])
      console.log(`  Deleted duplicate case ${dupId}`)
    }
  }

  // Handle any other duplicate transaction groups if found
  for (const dup of duplicates) {
    if (dup.transaction_id === 'tx_demo_00042') continue
    const rows = await query<{ id: string }>(
      'SELECT id FROM recovery_cases WHERE merchant_id = ? AND transaction_id = ? ORDER BY created_at ASC',
      [dup.merchant_id, dup.transaction_id]
    )
    const primaryId = rows[0].id
    const extraIds = rows.slice(1).map(r => r.id)
    for (const extraId of extraIds) {
      await execute('UPDATE recovery_attempts SET case_id = ? WHERE case_id = ?', [primaryId, extraId])
      await execute('UPDATE agent_decisions SET case_id = ? WHERE case_id = ?', [primaryId, extraId])
      await execute('UPDATE agent_runs SET case_id = ? WHERE case_id = ?', [primaryId, extraId])
      await execute('DELETE FROM recovery_cases WHERE id = ?', [extraId])
    }
  }

  // 4. Ensure Unique Index on live Neon database
  console.log('\n--- STEP 4: Enforce UNIQUE index on live Neon database ---')
  await execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_cases_merchant_tx ON recovery_cases(merchant_id, transaction_id)'
  )

  const indexes = await query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'recovery_cases'`
  )
  const uniqueIdx = indexes.find(i => i.indexname === 'idx_recovery_cases_merchant_tx')
  console.log('Unique index status on Neon:', uniqueIdx ? 'EXISTS & ACTIVE' : 'MISSING')
  if (uniqueIdx) {
    console.log(`  Index definition: ${uniqueIdx.indexdef}`)
  }

  // 5. Query counts after consolidation
  console.log('\n--- STEP 5: Live database counts after consolidation ---')
  const demoCasesAfter = await query<{ id: string }>(
    'SELECT id FROM recovery_cases WHERE transaction_id = ?',
    ['tx_demo_00042']
  )
  console.log(`tx_demo_00042 cases count: ${demoCasesAfter.length}`)

  const totalCasesRes = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM recovery_cases WHERE merchant_id = ?',
    [DEMO_MERCHANT_ID]
  )
  const recoveredRes = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM recovery_cases WHERE merchant_id = ? AND status = 'recovered'",
    [DEMO_MERCHANT_ID]
  )
  const inProgressRes = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM recovery_cases WHERE merchant_id = ? AND status IN ('open', 'diagnosing', 'strategy_selected', 'executing', 'recovering')",
    [DEMO_MERCHANT_ID]
  )
  const failedRes = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM recovery_cases WHERE merchant_id = ? AND status IN ('failed', 'abandoned', 'no_action')",
    [DEMO_MERCHANT_ID]
  )
  const failedTxRes = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM transactions WHERE merchant_id = ? AND status = 'failed'",
    [DEMO_MERCHANT_ID]
  )

  const totalCases = Number(totalCasesRes[0].count)
  const recovered = Number(recoveredRes[0].count)
  const inProgress = Number(inProgressRes[0].count)
  const failed = Number(failedRes[0].count)
  const failedTx = Number(failedTxRes[0].count)
  const sum = recovered + inProgress + failed

  console.log({
    total_cases: totalCases,
    recovered,
    in_progress: inProgress,
    failed,
    sum_check: sum,
    conservation_law_valid: sum === totalCases,
    failed_transactions: failedTx,
    cardinality_1_to_1_valid: totalCases === failedTx,
  })

  // 6. Test Idempotent Repeated Execution on live Neon database
  console.log('\n--- STEP 6: Run repeated live executions of tx_demo_00042 ---')
  const txRow = await query<{ id: string; amount: number; merchant_id: string }>(
    'SELECT id, amount, merchant_id FROM transactions WHERE id = ?',
    ['tx_demo_00042']
  )

  if (txRow.length > 0) {
    const attemptsBefore = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM recovery_attempts ra JOIN recovery_cases rc ON ra.case_id = rc.id WHERE rc.transaction_id = ?',
      ['tx_demo_00042']
    )
    console.log(`Attempts for tx_demo_00042 before test: ${attemptsBefore[0].count}`)

    // Run pipeline 3 times
    console.log('Executing live recovery pipeline run 1...')
    await runRecoveryPipeline(txRow[0].id, DEMO_MERCHANT_ID, true)

    console.log('Executing live recovery pipeline run 2...')
    await runRecoveryPipeline(txRow[0].id, DEMO_MERCHANT_ID, true)

    console.log('Executing live recovery pipeline run 3...')
    await runRecoveryPipeline(txRow[0].id, DEMO_MERCHANT_ID, true)

    const demoCasesRepeated = await query<{ id: string }>(
      'SELECT id FROM recovery_cases WHERE transaction_id = ?',
      ['tx_demo_00042']
    )
    const attemptsAfter = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM recovery_attempts ra JOIN recovery_cases rc ON ra.case_id = rc.id WHERE rc.transaction_id = ?',
      ['tx_demo_00042']
    )

    console.log(`tx_demo_00042 cases count after 3 runs: ${demoCasesRepeated.length} (MUST BE 1)`)
    console.log(`Attempts for tx_demo_00042 after 3 runs: ${attemptsAfter[0].count}`)
  }

  console.log('\n====================================================')
  console.log('✅ LIVE NEON VERIFICATION COMPLETE')
  console.log('====================================================\n')
}

runLiveVerification().catch(err => {
  console.error('Verification error:', err)
  process.exit(1)
})
